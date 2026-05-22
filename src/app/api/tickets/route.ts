export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tickets = await db.ticket.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { messages: true } },
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    subject,
    category = "general",
    priority = "normal",
    content,
  } = body as {
    subject?: string;
    category?: string;
    priority?: string;
    content?: string;
  };

  if (!subject || !content) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: subject, content" },
      { status: 400 }
    );
  }

  const validCategories = ["general", "billing", "technical", "feature", "bug"];
  const validPriorities = ["low", "normal", "high"];

  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }
  if (!validPriorities.includes(priority)) {
    return NextResponse.json({ error: "Prioridad inválida" }, { status: 400 });
  }

  const ticket = await db.ticket.create({
    data: {
      userId: session.user.id,
      subject: subject.trim(),
      category,
      priority,
      status: "open",
      messages: {
        create: {
          fromAdmin: false,
          authorId: session.user.id,
          content: content.trim(),
          internal: false,
        },
      },
    },
    select: { id: true, subject: true, status: true, createdAt: true },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
