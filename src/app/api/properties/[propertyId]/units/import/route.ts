export const runtime = "nodejs";
// 300s: la extracción se hace por trozos (una llamada al modelo por cada
// ~120 filas), así que un archivo grande necesita varias pasadas seguidas.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const IS_DEMO = process.env.DEMO_MODE === "true";
// Vercel corta el cuerpo de una petición serverless en 4,5 MB. Anunciar 8 MB
// era una promesa que la plataforma no cumple: los archivos entre 4,5 y 8 MB
// nunca llegaban aquí — la conexión se cerraba y el navegador lo reportaba
// como fallo de red, sin mensaje.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
// Tope de texto a analizar. Con el troceo ya no es un tope de tokens.
const MAX_INPUT_CHARS = 300_000;
// INVARIANTE (ver ai-client): con maxRetries 1 son DOS intentos por llamada,
// así que 45s x 2 = 90s por trozo. No arrancar un trozo pasados los 180s deja
// 180 + 90 = 270s < maxDuration 300.
const CHUNK_TIMEOUT_MS = 45_000;
const SOFT_DEADLINE_MS = 180_000;

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
    return NextResponse.json(
      { error: "El archivo supera el límite de 4 MB. Si es un Excel, guárdalo como CSV: pesa mucho menos." },
      { status: 413 }
    );
  }

  if (IS_DEMO) {
    return NextResponse.json({
      units: [
        { label: "Apto 101", residentName: "María Ejemplo", email: "maria@correo.com", phone: "3001112233", coeficiente: 1.25, monthlyFee: 350000 },
      ],
      demo: true,
    });
  }

  const startedAt = Date.now();

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
    // Tope duro de seguridad, no de tokens: el troceo de abajo es el que hace
    // que quepa. Antes eran 60.000 caracteres y un Excel de 400 unidades con
    // 15 columnas (~68.000) perdía las últimas filas sin decir nada.
    const rawText = text || "";
    const inputTruncated = rawText.length > MAX_INPUT_CHARS;
    const content = rawText.slice(0, MAX_INPUT_CHARS);
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
- Cada bloque de datos que recibas puede ser una PARTE del archivo; extrae todas las unidades de lo que recibas y nada más.`;

    // Una llamada por trozo. Con ~50 tokens de salida por unidad, `max_tokens:
    // 16384` solo alcanza para ~300; pedir 400 de una vez cortaba la respuesta
    // a mitad de objeto y la ruta respondía 422 culpando a un archivo válido.
    const { chunkRowsForExtraction, salvageJsonArray, dedupeByLabel } = await import("@/lib/units-extract");
    const chunks = chunkRowsForExtraction(content, { maxLines: 120, maxChars: 20_000 });

    const rawRows: unknown[] = [];
    let aiTruncated = false;
    let chunksDone = 0;
    let failedChunks = 0;
    let deadlineHit = false;
    let totalTokens = 0;
    let lastError: unknown = null;

    for (const chunk of chunks) {
      // No arrancar una pasada que no alcanza a terminar: con maxRetries 1 el
      // SDK hace hasta dos intentos, así que el peor caso son 2 x CHUNK_TIMEOUT.
      if (Date.now() - startedAt > SOFT_DEADLINE_MS) { deadlineHit = true; break; }
      try {
        const { text: aiText, tokensUsed } = await generateWithClaude(
          system,
          `Datos crudos:\n\n${chunk.text}`,
          undefined,
          { timeoutMs: CHUNK_TIMEOUT_MS }
        );
        totalTokens += tokensUsed;
        const salvaged = salvageJsonArray(aiText);
        if (salvaged) {
          rawRows.push(...salvaged.rows);
          if (salvaged.truncated) aiTruncated = true;
          chunksDone++;
        } else {
          // El modelo contestó algo que no es un arreglo (prosa, o un JSON
          // irrescatable). Ese trozo NO está hecho: contarlo como hecho dejaba
          // la importación a medias con `truncated: false`, y el administrador
          // creaba 300 de 400 unidades convencido de que estaban todas.
          failedChunks++;
          console.warn(`[units import] trozo sin unidades legibles (${aiText.slice(0, 120)})`);
        }
      } catch (e) {
        // Un trozo caído no debe tumbar la importación completa: se conserva lo
        // ya extraído y se avisa que quedó incompleta.
        lastError = e;
        console.error("[units import] trozo fallido", e);
        break;
      }
    }

    // Record the spend so it shows up in Consumo IA (imports can be large).
    const { recordUsage } = await import("@/lib/usage");
    if (totalTokens > 0) {
      await recordUsage(
        session.user.id,
        totalTokens,
        (totalTokens / 1_000_000) * 9,
        "import_unidades"
      ).catch(() => {});
    }

    if (rawRows.length === 0) {
      // Solo aquí se puede culpar al archivo; si el fallo fue del modelo, se
      // dice tal cual en vez de mandar al usuario a revisar un archivo sano.
      if (lastError) {
        const m = lastError instanceof Error ? lastError.message : "";
        return NextResponse.json(
          { error: /IA|API|saturado|creditos|timeout|abort/i.test(m) ? m : "El servicio de IA no pudo leer el archivo. Intenta de nuevo." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "La IA no pudo estructurar el archivo. Revisa que contenga un listado de unidades." },
        { status: 422 }
      );
    }

    const mapped: ExtractedUnit[] = rawRows
      .slice(0, 1000)
      .map((r) => {
        const o = (r || {}) as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
        // Extraer en vez de validar-y-guardar-crudo: la IA suele devolver la
        // celda entera ("María Pérez maria@x.com"), y esa cadena pasaba el
        // .test() sin anclas y se guardaba tal cual como correo. Después
        // tumbaba el lote completo del envío masivo de enlaces.
        const emailMatch =
          typeof o.email === "string"
            ? o.email.trim().toLowerCase().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
            : null;
        const email = emailMatch ? emailMatch[0].slice(0, 120) : null;
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

    // El encabezado se repite en cada trozo y algunas hojas parten una unidad
    // en dos renglones: sin deduplicar se crearían apartamentos repetidos.
    const units = dedupeByLabel(mapped);

    if (units.length === 0) {
      return NextResponse.json(
        { error: "No se detectaron unidades en el archivo. Revisa el formato." },
        { status: 422 }
      );
    }

    // Lo que quedó fuera se dice, no se calla. Antes la respuesta era `{units}`
    // a secas y la UI anunciaba «330 unidades detectadas» sobre un archivo de
    // 400 sin una sola advertencia.
    // La nota dice la causa REAL en vez de culpar siempre al tamaño.
    const pendientes = chunks.length - chunksDone - failedChunks;
    const incomplete =
      inputTruncated || aiTruncated || failedChunks > 0 || pendientes > 0;
    let note: string | undefined;
    if (incomplete) {
      const cola = ` Se leyeron ${units.length} unidades: créalas y sube el resto en un segundo archivo.`;
      if (inputTruncated) {
        note = "El archivo es tan grande que no cupo entero en una sola lectura." + cola;
      } else if (lastError) {
        note = "El servicio de IA falló a mitad de la lectura." + cola;
      } else if (deadlineHit || pendientes > 0) {
        note = "El archivo era tan grande que se agotó el tiempo de lectura." + cola;
      } else if (failedChunks > 0) {
        note = `Una parte del archivo (${failedChunks} de ${chunks.length} bloques) no se pudo interpretar.` + cola;
      } else {
        note = "La lectura quedó incompleta." + cola;
      }
    }
    return NextResponse.json({ units, truncated: incomplete, note });
  } catch (error) {
    console.error("[units import]", error);
    const msg =
      error instanceof Error && /IA|API|saturado|creditos/i.test(error.message)
        ? error.message
        : "No se pudo procesar el archivo. Intenta de nuevo.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
