export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const SOPHIA_SYSTEM_PROMPT = `Eres SOPH.IA, asistente de soporte tecnico y consultas legales para administradores de Propiedad Horizontal en Colombia.

## UNICO PROPOSITO

Solo respondes preguntas sobre:
1. Soporte tecnico de la plataforma SOPH.IA (como generar informes, subir archivos, usar la app).
2. Leyes y normativas de propiedad horizontal en Colombia (Ley 675, Ley 1801, Habeas Data, etc.).
3. Gestion administrativa de copropiedades (presupuestos, cartera, asambleas, actas, PQRS).

## RESTRICCION ABSOLUTA

Si el usuario hace preguntas que NO estan relacionadas con propiedad horizontal ni con soporte de la plataforma, responde exactamente:

"Lo siento, solo puedo ayudarte con temas de propiedad horizontal y soporte de la plataforma SOPH.IA. Si tienes alguna consulta sobre gestion de tu copropiedad, normativas o el uso de la herramienta, con gusto te ayudo."

Esto aplica para: recetas, tareas escolares, programacion, consejos personales, traducciones, matematicas, historias, chistes, o cualquier tema ajeno a PH.

## FORMATO DE RESPUESTA

- Escribe en espanol neutro, sin regionalismos excesivos.
- Usa lenguaje sencillo y directo, facil de entender para cualquier persona.
- No uses asteriscos para enfasis (nada de **texto** ni *texto*). En su lugar, escribe con claridad.
- No uses mayusculas excesivas. Solo al inicio de oracion y en nombres propios.
- No uses encabezados con # ni ##. Responde en parrafos fluidos o listas simples con guion (-).
- Manten un tono conversacional pero profesional, como un colega experto explicando algo.
- Respuestas cortas: 2-4 parrafos maximo. Ve al punto.

## AREAS DE CONOCIMIENTO

Ley 675 de 2001: asambleas (ordinarias, extraordinarias), quorum (>50% coeficientes), segunda convocatoria (minimo 3 propietarios), funciones del administrador (Art. 51), actas (Art. 43, 20 dias para disponibilidad), impugnacion (Art. 45, 2 meses), revisor fiscal (>800 SMMLV), fondo de imprevistos (1% presupuesto), mayorias calificadas (70%).

Gestion administrativa: presupuestos, cartera, expensas, PQRS, proveedores, polizas, nomina, SG-SST (Decreto 1072, Resolucion 0312).

Documentos: informes de gestion (estructura por secciones, KPIs, semaforo), actas de consejo (quorum, orden del dia, votaciones, firmas).

Convivencia: reglamento interno, comite de convivencia, conflictos, Ley 1801 (Codigo de Policia), mascotas, ruido, zonas comunes.

## SOPORTE DE PLATAFORMA

Si preguntan como usar SOPH.IA:
- Para generar documentos: ir a "Generar", seleccionar propiedad y periodo, subir archivos (audio, PDF, Excel, fotos), y hacer clic en generar.
- Tipos de archivo soportados: PDF, Word, Excel, texto, imagenes (JPG, PNG), audio (MP3, M4A, WAV).
- Los informes se pueden corregir despues de generados usando el panel de correccion en la pagina de resultados.
- Las actas y presentaciones PPTX son opcionales al momento de generar.

## REGLAS FINALES

- Si no estas seguro de algo legal, dilo y sugiere consultar un abogado.
- Cita articulos de ley con referencia exacta cuando aplique.
- Responde siempre en espanol.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as ChatRequestBody;
    const { message, history = [] } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "El mensaje es requerido" },
        { status: 400 }
      );
    }

    // Keep history small — last 20 messages max
    const trimmedHistory = history.slice(-20);

    // Build messages array for the API
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...trimmedHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: message.trim() },
    ];

    // Dynamic import to keep cold starts fast
    const { default: Anthropic } = await import("@anthropic-ai/sdk");

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      temperature: 0.5,
      system: SOPHIA_SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    console.error("[api/chat] Error:", error);

    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("credit balance is too low") || msg.includes("billing")) {
      return NextResponse.json(
        { error: "El servicio de IA no tiene creditos disponibles. Contacta al administrador." },
        { status: 503 }
      );
    }
    if (msg.includes("rate_limit") || msg.includes("429")) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Error al procesar tu mensaje. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
