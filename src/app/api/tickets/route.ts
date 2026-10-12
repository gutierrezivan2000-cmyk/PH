export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureAdminSchema } from "@/lib/ensure-admin-schema";
import { rateLimit } from "@/lib/rate-limit";
import { LIMITES, cuerpoComoObjeto, textoAcotado } from "@/lib/validar-entrada";

/** Tickets nuevos por persona: el tope por hora frena ráfagas y el diario, el goteo; un uso normal queda lejos de ambos. */
const MAX_TICKETS_POR_HORA = 5;
const MAX_TICKETS_POR_DIA = 20;

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
      // Solo lo que la pantalla muestra: ni el administrador asignado (assignedTo) ni quién escribió cada mensaje.
      select: {
        id: true,
        subject: true,
        status: true,
        category: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        // El mismo filtro que el detalle («Never expose internal notes to
        // users»). Sin él, la nota interna que un administrador escribe con el
        // candado se convertía en el mensaje más reciente del ticket y su
        // contenido íntegro viajaba al usuario en este listado.
        _count: { select: { messages: { where: { internal: false } } } },
        messages: {
          where: { internal: false },
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, fromAdmin: true, content: true, createdAt: true },
        },
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

  // Lista blanca: solo asunto, categoría, prioridad y mensaje. Estado, asignación y usuario los pone el servidor.
  const cuerpo = cuerpoComoObjeto(await req.json().catch(() => null));
  if (!cuerpo) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const asunto = textoAcotado(cuerpo.subject, "El asunto", LIMITES.asuntoTicket, { obligatorio: true });
  if (!asunto.ok) return NextResponse.json({ error: asunto.error }, { status: 400 });
  const mensaje = textoAcotado(cuerpo.content, "El mensaje", LIMITES.mensajeTicket, { obligatorio: true, variasLineas: true });
  if (!mensaje.ok) return NextResponse.json({ error: mensaje.error }, { status: 400 });

  const validCategories = ["general", "billing", "technical", "feature", "bug"];
  const validPriorities = ["low", "normal", "high"];
  const category = cuerpo.category === undefined ? "general" : cuerpo.category;
  const priority = cuerpo.priority === undefined ? "normal" : cuerpo.priority;

  if (typeof category !== "string" || !validCategories.includes(category)) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  }
  if (typeof priority !== "string" || !validPriorities.includes(priority)) {
    return NextResponse.json({ error: "Prioridad inválida" }, { status: 400 });
  }

  // Después de validar, para que un formulario mal llenado no gaste el cupo; antes de tocar la base de tickets.
  const [porHora, porDia] = await Promise.all([
    rateLimit(`ticket:h:${session.user.id}`, { max: MAX_TICKETS_POR_HORA, windowMs: 3_600_000 }),
    rateLimit(`ticket:d:${session.user.id}`, { max: MAX_TICKETS_POR_DIA, windowMs: 24 * 3_600_000 }),
  ]);
  if (!porHora.allowed || !porDia.allowed) {
    return NextResponse.json(
      { error: "Has creado varios tickets seguidos. Espera un rato, o responde en uno de tus tickets abiertos." },
      { status: 429 }
    );
  }

  await ensureAdminSchema();
  const ticket = await db.ticket.create({
    data: {
      userId: session.user.id,
      subject: asunto.valor,
      category,
      priority,
      status: "open",
      messages: {
        create: {
          fromAdmin: false,
          authorId: session.user.id,
          content: mensaje.valor,
          internal: false,
        },
      },
    },
    select: { id: true, subject: true, status: true, createdAt: true },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
