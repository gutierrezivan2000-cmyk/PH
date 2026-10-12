export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/ensure-admin-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (process.env.DEMO_MODE === "true") {
    const { getDemoTicket } = await import("@/lib/demo-store");
    const { id } = await params;
    const ticket = getDemoTicket(id, session.user.id);
    if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    return NextResponse.json({ ticket });
  }

  await ensureAdminSchema();
  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    // Solo lo que la pantalla del ticket muestra. `userId` se pide únicamente para comprobar el dueño y no se devuelve;
    // tampoco el administrador asignado (assignedTo) ni quién escribió cada mensaje (authorId, ids de administradores).
    select: {
      id: true,
      userId: true,
      subject: true,
      status: true,
      category: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        where: { internal: false }, // Never expose internal notes to users
        orderBy: { createdAt: "asc" },
        select: { id: true, fromAdmin: true, content: true, attachments: true, createdAt: true },
      },
      _count: { select: { messages: { where: { internal: false } } } },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  // Ownership check — only the ticket owner can view it
  if (ticket.userId !== session.user.id) {
    return NextResponse.json({ error: "No tienes acceso a este ticket" }, { status: 403 });
  }

  const publico: Record<string, unknown> = { ...ticket };
  delete publico.userId;
  return NextResponse.json({ ticket: publico });
}
