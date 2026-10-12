export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { LIMITES, cuerpoComoObjeto, textoAcotado } from "@/lib/validar-entrada";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  const { id } = await params;

  // Se valida antes de tocar la base: `content` debe ser texto (antes `content.trim()` daba 500 con un número o un objeto), con
  // tope de largo, e `internal` un booleano de verdad (antes cualquier valor "verdadero", como "no", marcaba la nota como interna).
  const cuerpo = cuerpoComoObjeto(await req.json().catch(() => null));
  if (!cuerpo) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const mensaje = textoAcotado(cuerpo.content, "El contenido", LIMITES.mensajeTicket, { obligatorio: true, variasLineas: true });
  if (!mensaje.ok) {
    return NextResponse.json({ error: mensaje.error }, { status: 400 });
  }
  if (cuerpo.internal !== undefined && typeof cuerpo.internal !== "boolean") {
    return NextResponse.json({ error: "El campo internal debe ser verdadero o falso." }, { status: 400 });
  }
  const internal = cuerpo.internal === true;
  const content = mensaje.valor;

  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  // Create the message and potentially update ticket status
  const [message] = await db.$transaction([
    db.ticketMessage.create({
      data: {
        ticketId: id,
        fromAdmin: true,
        authorId: admin.userId,
        content,
        internal,
      },
    }),
    // If non-internal reply, move ticket from "open" → "pending" (admin replied, waiting for user)
    ...(!internal && ticket.status === "open"
      ? [db.ticket.update({ where: { id }, data: { status: "pending", updatedAt: new Date() } })]
      : [db.ticket.update({ where: { id }, data: { updatedAt: new Date() } })]),
  ]);

  await logAdminAction({
    adminId: admin.userId,
    action: internal ? "ticket.internal_note" : "ticket.reply",
    targetType: "ticket",
    targetId: id,
    metadata: { internal, contentLength: content.length },
  });

  return NextResponse.json({ message }, { status: 201 });
}
