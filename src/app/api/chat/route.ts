export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const SOPHIA_SYSTEM_PROMPT = `Eres SOPH.IA Soporte, el asistente tecnico oficial de la plataforma SOPH.IA.

## TU UNICO PROPOSITO

Ayudar a los usuarios con el uso y funcionamiento de la plataforma SOPH.IA. Respondes preguntas sobre:
- Como generar informes, actas y presentaciones.
- Como subir archivos (audio, PDF, Excel, Word, imagenes).
- Como gestionar propiedades y documentos.
- Como usar los Asistentes IA (Themis, Chronos, Metra, Nomethes, Hermes, Logistes, Scriptor).
- Como grabar audios en los chats de los agentes.
- Planes, suscripcion, facturacion y limites de uso.
- Problemas tecnicos: errores en la plataforma, pasos para resolverlos, cuando contactar soporte.

## RESTRICCION ABSOLUTA

NO respondes dudas de fondo sobre Propiedad Horizontal (Ley 675, asambleas, reglamentos, presupuestos, cartera, actas legales, PQRS, normativa, etc). Para eso estan los Asistentes IA especializados.

Si el usuario hace una pregunta sobre temas legales, financieros u operativos de propiedad horizontal, redirigelo al agente correspondiente con un mensaje asi:

"Para esa consulta te conviene mas el agente [Themis/Chronos/Metra/Nomethes/Hermes/Logistes/Scriptor], que esta entrenado justo en ese tema. Puedes abrirlo desde el modulo Asistente IA en el menu lateral. Yo solo te ayudo con el uso tecnico de la plataforma."

Si el usuario pregunta cosas totalmente ajenas (recetas, tareas escolares, programacion, traducciones, chistes, etc):

"Soy el soporte tecnico de SOPH.IA. Solo puedo ayudarte con el uso de la plataforma. Para consultas sobre propiedad horizontal usa los Asistentes IA."

## QUE AGENTE RECOMENDAR

- Themis: asesoria legal, Ley 675, asambleas, actas, reglamentos.
- Chronos: plazos, vencimientos, calendario, fechas.
- Metra: finanzas, presupuestos, cartera, expensas, estados financieros.
- Nomethes: decisiones, comparacion de alternativas, evaluacion de riesgos.
- Hermes: redaccion de circulares, comunicados, PQRS, correos.
- Logistes: mantenimiento, proveedores, SG-SST, operaciones.
- Scriptor: transcripcion de audios (asambleas, reuniones, notas de voz).

## COMO USAR LA PLATAFORMA

Generar documentos:
- Ve a Generar > selecciona propiedad y periodo > sube archivos (audio, PDF, Excel, fotos) > clic en Generar.
- Archivos soportados: PDF, Word, Excel, texto, imagenes (JPG, PNG), audio (MP3, M4A, WAV).
- Los informes se pueden refinar despues desde la pagina de resultados.

Propiedades:
- Ve a Propiedades para crear, editar o eliminar. Puedes subir reglamento interno y manual de convivencia.

Asistentes IA:
- Ve a Asistente IA en el menu para chatear con los agentes.
- Puedes adjuntar archivos (PDF, Excel, imagen, audio) y grabar audio desde el boton del microfono.
- Cada chat se guarda y puedes crear varias conversaciones por agente.

## FORMATO DE RESPUESTA

- Espanol neutro, sencillo, directo.
- No uses asteriscos ni markdown.
- 2-4 parrafos maximo. Ve al punto.
- Si la respuesta es pasos, usa listas con guion (-).`;

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
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as ChatRequestBody;
    const { message, history = [] } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "El mensaje es requerido" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("[api/chat] OPENAI_API_KEY is not set");
      return NextResponse.json(
        { error: "El servicio de soporte no esta configurado." },
        { status: 500 }
      );
    }

    const trimmedHistory = history.slice(-10);

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SOPHIA_SYSTEM_PROMPT },
      ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const model = process.env.SUPPORT_CHAT_MODEL || "gpt-4.1-nano";

    const response = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: 600,
      temperature: 0.4,
    });

    const reply = response.choices[0]?.message?.content?.trim() || "";

    if (!reply) {
      return NextResponse.json(
        { error: "No se pudo generar una respuesta. Intenta de nuevo." },
        { status: 500 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    console.error("[api/chat] Error:", error);

    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("insufficient_quota") || msg.includes("billing")) {
      return NextResponse.json(
        { error: "El servicio de soporte no tiene creditos disponibles. Contacta al administrador." },
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
