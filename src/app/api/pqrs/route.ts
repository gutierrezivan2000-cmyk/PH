export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";

const IS_DEMO = process.env.DEMO_MODE === "true";
const STATUSES = ["radicado", "en_proceso", "resuelto", "cerrado"] as const;

/** Admin PQRS inbox. Query: ?propertyId=&status= */
export async function GET(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ pqrs: [], counts: {} });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const propertyId = req.nextUrl.searchParams.get("propertyId") || undefined;
  const status = req.nextUrl.searchParams.get("status") || undefined;

  try {
    const { db } = await import("@/lib/db");
    const where: { userId: string; propertyId?: string; status?: string } = { userId };
    if (propertyId) where.propertyId = propertyId;
    if (status && STATUSES.includes(status as (typeof STATUSES)[number])) where.status = status;

    const [pqrs, grouped] = await Promise.all([
      db.pqrs.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: 100,
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          property: { select: { name: true } },
        },
      }),
      db.pqrs.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.status] = g._count._all;

    return NextResponse.json({ pqrs, counts });
  } catch (e) {
    console.error("[pqrs GET]", e);
    return NextResponse.json({ error: "Error al cargar las PQRS" }, { status: 500 });
  }
}

/** Respond to a PQRS and/or change its status. Body { id, reply?, status?, notify? }. */
export async function PATCH(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { id, reply, status, notify } = body as {
    id?: string;
    reply?: string;
    status?: string;
    notify?: boolean;
  };
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }
  if (!reply?.trim() && !status) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const pqrs = await db.pqrs.findFirst({
      where: { id, userId },
      select: { id: true, residentContact: true, subject: true, property: { select: { name: true } } },
    });
    if (!pqrs) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

    if (reply?.trim()) {
      await db.pqrsMessage.create({
        data: { pqrsId: id, fromAdmin: true, content: reply.trim().slice(0, 4000) },
      });
    }
    // Replying moves radicado → en_proceso unless an explicit status is given.
    const newStatus = status || (reply?.trim() ? "en_proceso" : undefined);
    if (newStatus) {
      await db.pqrs.update({ where: { id }, data: { status: newStatus } });
    } else {
      await db.pqrs.update({ where: { id }, data: { updatedAt: new Date() } });
    }

    // Optional email notification if the resident left an email.
    let notified = false;
    if (notify && reply?.trim() && pqrs.residentContact && /[^@\s]+@[^@\s]+\.[^@\s]+/.test(pqrs.residentContact)) {
      try {
        const { sendAnnouncementEmails, textToEmailHtml } = await import("@/lib/email");
        const admin = await db.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, company: true, logoUrl: true, brandColor: true },
        });
        const res = await sendAnnouncementEmails({
          recipients: [pqrs.residentContact.trim().toLowerCase()],
          subject: `Respuesta a su solicitud — ${pqrs.subject}`,
          contentHtml: textToEmailHtml(reply.trim()),
          propertyName: pqrs.property.name,
          senderName: admin?.company || admin?.name || "Administración",
          replyTo: admin?.email || undefined,
          logoUrl: admin?.logoUrl,
          brandColor: admin?.brandColor,
        });
        notified = res.sent > 0;
      } catch (e) {
        console.error("[pqrs notify]", e);
      }
    }

    return NextResponse.json({ ok: true, notified });
  } catch (e) {
    console.error("[pqrs PATCH]", e);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
