export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/ensure-admin-schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  await ensureAdminSchema();
  const { id } = await params;

  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  // Ensure this ticket belongs to the user
  if (ticket.userId !== session.user.id) {
    return NextResponse.json({ error: "No tienes acceso a este ticket" }, { status: 403 });
  }

  if (ticket.status === "resolved" || ticket.status === "closed") {
    return NextResponse.json(
      { error: "No puedes responder a un ticket cerrado o resuelto" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { content } = body as { content?: string };

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "El contenido no puede estar vacío" }, { status: 400 });
  }

  const [message] = await db.$transaction([
    db.ticketMessage.create({
      data: {
        ticketId: id,
        fromAdmin: false,
        authorId: session.user.id,
        content: content.trim(),
        internal: false,
      },
    }),
    // User replied → set status back to "open" (needs admin attention)
    db.ticket.update({ where: { id }, data: { status: "open", updatedAt: new Date() } }),
  ]);

  return NextResponse.json({ message }, { status: 201 });
}
