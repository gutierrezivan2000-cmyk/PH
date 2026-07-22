export const runtime = "nodejs";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const IS_DEMO = process.env.DEMO_MODE === "true";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

interface ExtractedUnit {
  label: string;
  residentName?: string | null;
  email?: string | null;
  phone?: string | null;
  coeficiente?: number | null;
  monthlyFee?: number | null;
}

/**
 * AI-assisted unit import. Accepts a spreadsheet / PDF / Word / CSV file,
 * parses it to text, and asks Claude to organize it into a clean unit list
 * (label, resident, email, phone, coeficiente, cuota). Returns the extracted
 * units for the admin to REVIEW before creating them — never writes here.
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
    return NextResponse.json({ error: "El archivo supera el límite de 8 MB." }, { status: 400 });
  }

  if (IS_DEMO) {
    return NextResponse.json({
      units: [
        { label: "Apto 101", residentName: "María Ejemplo", email: "maria@correo.com", phone: "3001112233", coeficiente: 1.25, monthlyFee: 350000 },
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

    // Rate limit AI extraction: 20/hour per user.
    const { rateLimit } = await import("@/lib/rate-limit");
    const rl = await rateLimit(`units-import:${session.user.id}`, { max: 20, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Alcanzaste el límite de importaciones por hora. Intenta más tarde." }, { status: 429 });
    }

    // Parse the file to text.
    const { parseFile } = await import("@/lib/parsers");
    const { text } = await parseFile(file);
    const content = (text || "").slice(0, 60000); // cap tokens
    if (content.trim().length < 5) {
      return NextResponse.json({ error: "No se pudo leer contenido del archivo." }, { status: 400 });
    }

    const { generateWithClaude } = await import("@/lib/ai-client");
    const system = `Eres un asistente que organiza listados de unidades de una copropiedad (propiedad horizontal en Colombia) a partir de datos crudos (una hoja de cálculo exportada a CSV, un PDF, etc.).

Extrae CADA unidad y devuelve EXCLUSIVAMENTE un arreglo JSON válido (sin texto antes ni después, sin markdown, sin \`\`\`), donde cada elemento es:
{"label": string, "residentName": string|null, "email": string|null, "phone": string|null, "coeficiente": number|null, "monthlyFee": number|null}

Reglas:
- "label": identificador de la unidad (ej: "Apto 101", "Casa 12", "Local 3", "Torre 2 Apto 504"). OBLIGATORIO. Si solo hay un número, usa "Apto <n>".
- "residentName": nombre del propietario o residente si aparece; si no, null.
- "email": correo electrónico si aparece y es válido; si no, null.
- "phone": teléfono/celular si aparece (solo dígitos, sin espacios); si no, null.
- "coeficiente": coeficiente de copropiedad en porcentaje como número (ej 1.25). Suele ser un valor pequeño (<100). Si no aparece, null.
- "monthlyFee": cuota de administración mensual en pesos colombianos como entero SIN separadores (ej 350000). Suele ser >= 1000. Si no aparece, null.
- Ignora filas de encabezado, totales, subtotales y filas vacías.
- No inventes datos: lo que no esté, va como null.
- Si el archivo no contiene un listado de unidades, devuelve [].
Devuelve máximo 1000 unidades.`;

    const { text: aiText } = await generateWithClaude(system, `Datos crudos:\n\n${content}`);

    // Parse the JSON array defensively (strip any stray fences/prose).
    let parsed: unknown = [];
    try {
      const m = aiText.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(m ? m[0] : aiText);
    } catch {
      return NextResponse.json(
        { error: "La IA no pudo estructurar el archivo. Revisa que contenga un listado de unidades." },
        { status: 422 }
      );
    }

    const units: ExtractedUnit[] = (Array.isArray(parsed) ? parsed : [])
      .slice(0, 1000)
      .map((r) => {
        const o = (r || {}) as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
        const email =
          typeof o.email === "string" && /[^@\s]+@[^@\s]+\.[^@\s]+/.test(o.email)
            ? o.email.trim().toLowerCase().slice(0, 120)
            : null;
        const phoneDigits = typeof o.phone === "string" || typeof o.phone === "number"
          ? String(o.phone).replace(/[^\d]/g, "").slice(0, 15)
          : "";
        const coef = Number(o.coeficiente);
        const fee = Number(o.monthlyFee);
        return {
          label,
          residentName: typeof o.residentName === "string" ? o.residentName.trim().slice(0, 100) || null : null,
          email,
          phone: phoneDigits.length >= 7 ? phoneDigits : null,
          coeficiente: Number.isFinite(coef) && coef > 0 && coef <= 100 ? coef : null,
          monthlyFee: Number.isFinite(fee) && fee >= 0 && fee <= 100_000_000 ? Math.round(fee) : null,
        };
      })
      .filter((u) => u.label);

    if (units.length === 0) {
      return NextResponse.json(
        { error: "No se detectaron unidades en el archivo. Revisa el formato." },
        { status: 422 }
      );
    }

    return NextResponse.json({ units });
  } catch (error) {
    console.error("[units import]", error);
    const msg =
      error instanceof Error && /IA|API|saturado|creditos/i.test(error.message)
        ? error.message
        : "No se pudo procesar el archivo. Intenta de nuevo.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
