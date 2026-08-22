export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/ensure-admin-schema";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (process.env.DEMO_MODE === "true") {
    const { getDemoTickets } = await import("@/lib/demo-store");
    return NextResponse.json({ tickets: getDemoTickets(session.user.id) });
  }

  // Without try/catch an unhandled throw here answered 500 with an EMPTY body,
  // and the settings page died on `res.json()` with "Unexpected end of JSON
  // input" instead of showing an error.
  try {
    await ensureAdminSchema();
    const tickets = await db.ticket.findMany({
      where: { userId: session.user.id },
      include: {
        // El mismo filtro que el detalle («Never expose internal notes to
        // users»). Sin él, la nota interna que un administrador escribe con el
        // candado se convertía en el mensaje más reciente del ticket y su
        // contenido íntegro viajaba al usuario en este listado.
        _count: { select: { messages: { where: { internal: false } } } },
        messages: { where: { internal: false }, take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("[api/tickets GET]", error);
    return NextResponse.json({ error: "Error al cargar los tickets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json({ error: "El demo es de solo lectura. Crea tu cuenta para guardar cambios." }, { status: 403 });
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

  await ensureAdminSchema();
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
