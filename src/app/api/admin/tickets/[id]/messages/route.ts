export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  const { id } = await params;

  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { content, internal = false } = body as {
    content?: string;
    internal?: boolean;
  };

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "El contenido no puede estar vacío" }, { status: 400 });
  }

  // Create the message and potentially update ticket status
  const [message] = await db.$transaction([
    db.ticketMessage.create({
      data: {
        ticketId: id,
        fromAdmin: true,
        authorId: admin.userId,
        content: content.trim(),
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
