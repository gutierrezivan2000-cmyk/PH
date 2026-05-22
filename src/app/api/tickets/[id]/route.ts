export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      messages: {
        where: { internal: false }, // Never expose internal notes to users
        orderBy: { createdAt: "asc" },
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

  return NextResponse.json({ ticket });
}
