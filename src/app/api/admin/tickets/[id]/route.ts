export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          subscription: { select: { id: true, status: true, planId: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { messages: true } },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  // Fetch recent other tickets from the same user
  const recentTickets = await db.ticket.findMany({
    where: { userId: ticket.userId, id: { not: id } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, subject: true, status: true, createdAt: true, priority: true },
  });

  return NextResponse.json({ ticket, recentTickets });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  const { id } = await params;

  const existing = await db.ticket.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    status,
    priority,
    category,
    assignedTo,
  } = body as {
    status?: string;
    priority?: string;
    category?: string;
    assignedTo?: string | null;
  };

  const validStatuses = ["open", "pending", "resolved", "closed"];
  const validPriorities = ["low", "normal", "high", "urgent"];
  const validCategories = ["general", "billing", "technical", "feature", "bug"];

  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  if (priority && !validPriorities.includes(priority)) {
    return NextResponse.json({ error: "Prioridad inválida" }, { status: 400 });
  }
  if (category && !validCategories.includes(category)) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (category !== undefined) data.category = category;
  if (assignedTo !== undefined) data.assignedTo = assignedTo;

  const updated = await db.ticket.update({ where: { id }, data });

  const changes: Record<string, unknown> = {};
  if (status !== undefined && status !== existing.status) {
    changes.status = { from: existing.status, to: status };
  }
  if (priority !== undefined && priority !== existing.priority) {
    changes.priority = { from: existing.priority, to: priority };
  }
  if (category !== undefined && category !== existing.category) {
    changes.category = { from: existing.category, to: category };
  }
  if (assignedTo !== undefined && assignedTo !== existing.assignedTo) {
    changes.assignedTo = { from: existing.assignedTo, to: assignedTo };
  }

  if (Object.keys(changes).length > 0) {
    await logAdminAction({
      adminId: admin.userId,
      action: "ticket.update",
      targetType: "ticket",
      targetId: id,
      metadata: { changes },
    });
  }

  return NextResponse.json({ ticket: updated });
}
