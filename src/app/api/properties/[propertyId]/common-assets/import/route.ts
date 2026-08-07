export const runtime = "nodejs";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeAssetKind } from "@/lib/common-assets";

const IS_DEMO = process.env.DEMO_MODE === "true";
// Vercel corta el cuerpo de una función serverless en 4,5 MB — ver la misma
// nota en units/import/route.ts.
const MAX_BYTES = 4 * 1024 * 1024;

interface ExtractedAsset {
  kind: "zona_comun" | "poliza";
  name: string;
  provider: string | null;
  reference: string | null;
  dueDate: string | null; // "YYYY-MM-DD"
  recurrenceMonths: number | null;
}

/**
 * Importación asistida por IA de la bitácora. Acepta una hoja de cálculo, PDF
 * o Word con el listado de zonas comunes y pólizas de la copropiedad, y le
 * pide a Claude que lo organice. Igual que units/import: solo devuelve la
 * lista para que el admin la revise — no crea nada todavía.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { propertyId } = await params;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Adjunta un archivo (Excel, CSV, PDF o Word)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera el límite de 4 MB. Si es un Excel, guárdalo como CSV: pesa mucho menos." },
      { status: 413 }
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  if (IS_DEMO) {
    return NextResponse.json({
      assets: [
        { kind: "poliza", name: "Todo riesgo (área común)", provider: "Ejemplo Seguros", reference: "POL-0001", dueDate: todayIso, recurrenceMonths: 12 },
        { kind: "zona_comun", name: "Ascensor", provider: "Ejemplo Ascensores", reference: null, dueDate: todayIso, recurrenceMonths: 3 },
      ],
      demo: true,
    });
  }

  try {
    const { db } = await import("@/lib/db");
    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const { rateLimit } = await import("@/lib/rate-limit");
    const rl = await rateLimit(`assets-import:${session.user.id}`, { max: 20, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Alcanzaste el límite de importaciones por hora. Intenta más tarde." }, { status: 429 });
    }

    const { parseFile } = await import("@/lib/parsers");
    const { text } = await parseFile(file);
    const content = (text || "").slice(0, 60000);
    if (content.trim().length < 5) {
      return NextResponse.json({ error: "No se pudo leer contenido del archivo." }, { status: 400 });
    }

    const { generateWithClaude } = await import("@/lib/ai-client");
    const system = `Eres un asistente que organiza el registro de zonas comunes y pólizas de una copropiedad (propiedad horizontal en Colombia) a partir de datos crudos (una hoja de cálculo, un PDF, una póliza escaneada, etc.).

Hoy es ${todayIso}. Extrae CADA zona común y CADA póliza mencionada y devuelve EXCLUSIVAMENTE un arreglo JSON válido (sin texto antes ni después, sin markdown, sin \`\`\`), donde cada elemento es:
{"kind": "zona_comun"|"poliza", "name": string, "provider": string|null, "reference": string|null, "dueDate": "YYYY-MM-DD"|null, "recurrenceMonths": number|null}

Reglas:
- "kind": "poliza" si es una póliza de seguro; "zona_comun" para ascensores, piscina, planta eléctrica, parques infantiles, salón comunal, porterías, bombas, cualquier área o equipo común. OBLIGATORIO.
- "name": nombre identificable (ej: "Ascensor Torre A", "Todo riesgo área común", "Piscina"). OBLIGATORIO.
- "provider": aseguradora (pólizas) o contratista de mantenimiento (zonas comunes), si aparece; si no, null.
- "reference": número de póliza o de contrato, si aparece; si no, null.
- "dueDate": la fecha de vencimiento (pólizas) o de próximo mantenimiento/revisión (zonas comunes), en formato YYYY-MM-DD. Si el texto trae una fecha relativa o solo el mes/año, conviértela a una fecha completa razonable. Si no hay ninguna fecha, usa null.
- "recurrenceMonths": cada cuántos meses se repite (pólizas anuales = 12, mantenimientos trimestrales = 3, etc.), si se puede inferir; si no, null.
- No inventes datos: lo que no esté, va como null.
- Si el archivo no contiene zonas comunes ni pólizas, devuelve [].
Devuelve máximo 300 elementos.`;

    const { text: aiText, tokensUsed } = await generateWithClaude(system, `Datos crudos:\n\n${content}`, undefined, {
      timeoutMs: 70_000, // maxDuration = 90
    });

    const { recordUsage } = await import("@/lib/usage");
    await recordUsage(
      session.user.id,
      tokensUsed,
      (tokensUsed / 1_000_000) * 9,
      "import_bitacora"
    ).catch(() => {});

    let parsed: unknown = [];
    try {
      const m = aiText.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(m ? m[0] : aiText);
    } catch {
      return NextResponse.json(
        { error: "La IA no pudo estructurar el archivo. Revisa que contenga zonas comunes o pólizas." },
        { status: 422 }
      );
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const assets: ExtractedAsset[] = (Array.isArray(parsed) ? parsed : [])
      .slice(0, 300)
      .map((r) => {
        const o = (r || {}) as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name.trim().slice(0, 150) : "";
        const dueDate = typeof o.dueDate === "string" && DATE_RE.test(o.dueDate) ? o.dueDate : null;
        const rec = Number(o.recurrenceMonths);
        return {
          kind: normalizeAssetKind(o.kind),
          name,
          provider: typeof o.provider === "string" ? o.provider.trim().slice(0, 150) || null : null,
          reference: typeof o.reference === "string" ? o.reference.trim().slice(0, 100) || null : null,
          dueDate,
          recurrenceMonths: Number.isInteger(rec) && rec >= 1 && rec <= 60 ? rec : null,
        };
      })
      .filter((a) => a.name);

    if (assets.length === 0) {
      return NextResponse.json(
        { error: "No se detectaron zonas comunes ni pólizas en el archivo. Revisa el formato." },
        { status: 422 }
      );
    }

    return NextResponse.json({ assets });
  } catch (error) {
    console.error("[common-assets import]", error);
    const msg =
      error instanceof Error && /IA|API|saturado|creditos/i.test(error.message)
        ? error.message
        : "No se pudo procesar el archivo. Intenta de nuevo.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

