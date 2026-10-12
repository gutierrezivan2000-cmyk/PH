export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { CAMPOS_DE_NOMBRE, codigoDeUsuario } from "@/lib/admin/identidad";
import { LIMITES, cuerpoComoObjeto, textoAcotado } from "@/lib/validar-entrada";

/** Los ids de usuario son cuid (25 caracteres); el tope evita consultar la base con textos desmesurados. */
const MAX_ID_USUARIO = 64;

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
      user: { select: CAMPOS_DE_NOMBRE },
      _count: { select: { messages: true } },
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ tickets: tickets.map((t) => ({ ...t, user: { ...t.user, codigo: codigoDeUsuario(t.user.id) } })) });
}

export async function POST(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  // Cada campo se valida por tipo y largo: antes un número o un objeto en `subject`/`content` llegaba tal cual a la base (500) y
  // `content` se guardaba sin recortar.
  const body = cuerpoComoObjeto(await req.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const idUsuario = textoAcotado(body.userId, "El usuario", MAX_ID_USUARIO, { obligatorio: true });
  if (!idUsuario.ok) return NextResponse.json({ error: idUsuario.error }, { status: 400 });
  const asunto = textoAcotado(body.subject, "El asunto", LIMITES.asuntoTicket, { obligatorio: true });
  if (!asunto.ok) return NextResponse.json({ error: asunto.error }, { status: 400 });
  const mensaje = textoAcotado(body.content, "El mensaje", LIMITES.mensajeTicket, { obligatorio: true, variasLineas: true });
  if (!mensaje.ok) return NextResponse.json({ error: mensaje.error }, { status: 400 });
  const userId = idUsuario.valor;
  const subject = asunto.valor;
  const content = mensaje.valor;

  const validCategories = ["general", "billing", "technical", "feature", "bug"];
  const validPriorities = ["low", "normal", "high", "urgent"];
  // Si no vienen, valen los valores por omisión; si vienen, deben ser texto de la lista (ni "" ni null ni números).
  const category = body.category === undefined ? "general" : body.category;
  const priority = body.priority === undefined ? "normal" : body.priority;
  if (typeof category !== "string" || !validCategories.includes(category)) {
    return NextResponse.json({ error: "Categoría inválida." }, { status: 400 });
  }
  if (typeof priority !== "string" || !validPriorities.includes(priority)) {
    return NextResponse.json({ error: "Prioridad inválida." }, { status: 400 });
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
    // El asunto lo escribe el equipo y puede traer datos de la persona: la auditoría guarda solo su largo, no el texto.
    metadata: { userId, category, priority, subjectLength: subject.length },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
