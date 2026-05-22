export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") || undefined;
  const priority = searchParams.get("priority") || undefined;
  const category = searchParams.get("category") || undefined;
  const assignedTo = searchParams.get("assignedTo") || undefined;
  const q = searchParams.get("q") || undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (assignedTo === "unassigned") {
    where.assignedTo = null;
  } else if (assignedTo && assignedTo !== "all") {
    where.assignedTo = assignedTo;
  }
  if (q) {
    where.OR = [{ subject: { contains: q, mode: "insensitive" } }];
  }

  const tickets = await db.ticket.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      _count: { select: { messages: true } },
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  const body = await req.json().catch(() => ({}));
  const {
    userId,
    subject,
    category = "general",
    priority = "normal",
    content,
  } = body as {
    userId?: string;
    subject?: string;
    category?: string;
    priority?: string;
    content?: string;
  };

  if (!userId || !subject || !content) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: userId, subject, content" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const ticket = await db.ticket.create({
    data: {
      userId,
      subject,
      category,
      priority,
      status: "open",
      assignedTo: admin.userId,
      messages: {
        create: {
          fromAdmin: true,
          authorId: admin.userId,
          content,
          internal: false,
        },
      },
    },
    include: { messages: true },
  });

  await logAdminAction({
    adminId: admin.userId,
    action: "ticket.create",
    targetType: "ticket",
    targetId: ticket.id,
    metadata: { userId, subject, category, priority },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
