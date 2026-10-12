export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/ensure-admin-schema";
import { rateLimit } from "@/lib/rate-limit";
import { LIMITES, cuerpoComoObjeto, textoAcotado } from "@/lib/validar-entrada";

/** Respuestas por persona y hora: una conversación normal queda lejos; frena el goteo que reabre tickets sin parar. */
const MAX_RESPUESTAS_POR_HORA = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json({ error: "El demo es de solo lectura. Crea tu cuenta para guardar cambios." }, { status: 403 });
  }

  // Lista blanca: solo `content`. Autor, "fromAdmin", "internal" y el estado los pone el servidor.
  const cuerpo = cuerpoComoObjeto(await req.json().catch(() => null));
  if (!cuerpo) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const mensaje = textoAcotado(cuerpo.content, "El mensaje", LIMITES.mensajeTicket, { obligatorio: true, variasLineas: true });
  if (!mensaje.ok) {
    return NextResponse.json({ error: mensaje.error }, { status: 400 });
  }

  // Después de validar, para que un mensaje mal armado no gaste el cupo; antes de tocar la base de tickets.
  const ritmo = await rateLimit(`ticket-msg:${session.user.id}`, { max: MAX_RESPUESTAS_POR_HORA, windowMs: 3_600_000 });
  if (!ritmo.allowed) {
    return NextResponse.json({ error: "Has enviado muchos mensajes seguidos. Espera un rato e inténtalo de nuevo." }, { status: 429 });
  }

  await ensureAdminSchema();
  const { id } = await params;

  // El dueño va en el `where`: un ticket ajeno y uno inexistente responden lo mismo (404), para no confirmar que el id existe.
  const ticket = await db.ticket.findFirst({ where: { id, userId: session.user.id }, select: { id: true, status: true } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  if (ticket.status === "resolved" || ticket.status === "closed") {
    return NextResponse.json(
      { error: "No puedes responder a un ticket cerrado o resuelto" },
      { status: 400 }
    );
  }

  const [message] = await db.$transaction([
    db.ticketMessage.create({
      data: {
        ticketId: id,
        fromAdmin: false,
        authorId: session.user.id,
        content: mensaje.valor,
        internal: false,
      },
      // Solo lo que la pantalla necesita del mensaje recién creado.
      select: { id: true, fromAdmin: true, content: true, createdAt: true },
    }),
    // User replied → set status back to "open" (needs admin attention)
    db.ticket.update({ where: { id }, data: { status: "open", updatedAt: new Date() } }),
  ]);

  return NextResponse.json({ message }, { status: 201 });
}
