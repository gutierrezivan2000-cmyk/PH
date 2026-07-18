export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (IS_DEMO) return NextResponse.json({ announcements: [], quota: { used: 0, limit: 500 } });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { getEmailQuota, getEmailsSentThisMonth } = await import("@/lib/email-quota");
    const { checkSubscriptionAccess } = await import("@/lib/usage");

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const where: { userId: string; propertyId?: string } = { userId: session.user.id };
    if (propertyId) where.propertyId = propertyId;

    const [announcements, access] = await Promise.all([
      db.announcement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { property: { select: { name: true } } },
      }),
      checkSubscriptionAccess(session.user.id),
    ]);
    const isBeta = access.status === "beta";
    const [limit, used] = await Promise.all([
      getEmailQuota(session.user.id, isBeta),
      getEmailsSentThisMonth(session.user.id),
    ]);

    return NextResponse.json({ announcements, quota: { used, limit } });
  } catch (error) {
    console.error("[announcements GET]", error);
    return NextResponse.json({ error: "Error al cargar comunicados" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { propertyId, subject, content } = body as {
    propertyId?: string;
    subject?: string;
    content?: string;
  };

  if (!propertyId || !subject?.trim() || !content?.trim()) {
    return NextResponse.json(
      { error: "Propiedad, asunto y contenido son requeridos." },
      { status: 400 }
    );
  }
  if (subject.length > 150 || content.length > 10000) {
    return NextResponse.json({ error: "Asunto o contenido demasiado largo." }, { status: 400 });
  }

  if (IS_DEMO) {
    return NextResponse.json({ ok: true, sent: 0, demo: true });
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { checkSubscriptionAccess } = await import("@/lib/usage");
    const { checkEmailQuota, recordEmailsSent } = await import("@/lib/email-quota");
    const { sendAnnouncementEmails, textToEmailHtml } = await import("@/lib/email");

    // Active plan / trial / beta required to send.
    const access = await checkSubscriptionAccess(session.user.id);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason || "Necesitas una suscripción activa para enviar comunicados." },
        { status: 403 }
      );
    }
    const isBeta = access.status === "beta";

    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
      select: { id: true, name: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const units = await db.unit.findMany({
      where: { propertyId, email: { not: null } },
      select: { email: true },
    });
    const recipients = Array.from(
      new Set(units.map((u) => u.email!.toLowerCase()))
    );
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Esta propiedad no tiene destinatarios con correo. Agrega unidades primero." },
        { status: 400 }
      );
    }

    const quota = await checkEmailQuota(session.user.id, recipients.length, isBeta);
    if (!quota.allowed) {
      return NextResponse.json({ error: quota.reason, code: "email_quota" }, { status: 403 });
    }

    const admin = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, company: true, logoUrl: true, brandColor: true },
    });

    const { sent, failed } = await sendAnnouncementEmails({
      recipients,
      subject: subject.trim(),
      contentHtml: textToEmailHtml(content),
      propertyName: property.name,
      senderName: admin?.company || admin?.name || "Administración",
      replyTo: admin?.email || undefined,
      logoUrl: admin?.logoUrl,
      brandColor: admin?.brandColor,
    });

    if (sent === 0) {
      return NextResponse.json(
        { error: "No se pudo enviar el comunicado. Verifica la configuración de correo e intenta de nuevo." },
        { status: 502 }
      );
    }

    await recordEmailsSent(session.user.id, sent);
    const announcement = await db.announcement.create({
      data: {
        userId: session.user.id,
        propertyId,
        subject: subject.trim(),
        content: content.trim(),
        status: "sent",
        recipientCount: sent,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, sent, failed, id: announcement.id }, { status: 201 });
  } catch (error) {
    console.error("[announcements POST]", error);
    return NextResponse.json({ error: "Error al enviar el comunicado" }, { status: 500 });
  }
}
