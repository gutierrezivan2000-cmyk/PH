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

  // La búsqueda lleva al dueño en el `where`: un ticket ajeno y uno que no existe se ven IGUAL (404). Antes el ajeno respondía
  // 403 «No tienes acceso», lo que confirmaba que ese id existe y permitía recorrer ids para saber cuáles son reales.
  const ticket = await db.ticket.findFirst({
    where: { id, userId: session.user.id },
    // Solo lo que la pantalla del ticket muestra. No se devuelve el dueño (ya es quien pregunta), ni el administrador
    // asignado (assignedTo), ni quién escribió cada mensaje (authorId, ids de administradores).
    select: {
      id: true,
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

  return NextResponse.json({ ticket });
}
