export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exigirModulo } from "@/lib/modulos-acceso";
import { registrarEvento } from "@/lib/agentes/eventos";
import { rateLimit } from "@/lib/rate-limit";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  {
    const puerta = await exigirModulo("comunicados");
    if ("error" in puerta) return puerta.error;
  }
  if (IS_DEMO) {
    const { getDemoAnnouncements } = await import("@/lib/demo-store");
    const announcements = getDemoAnnouncements(req.nextUrl.searchParams.get("propertyId"));
    const used = announcements.reduce((s, a) => s + a.recipientCount, 0);
    return NextResponse.json({ announcements, quota: { used, limit: 500 } });
  }

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

    return NextResponse.json({ announcements, quota: { used: Math.min(used, limit), limit } });
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
  {
    const puerta = await exigirModulo("comunicados");
    if ("error" in puerta) return puerta.error;
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
    // Nothing is actually mailed, but reporting 0 after the button offered to
    // send to 11 residents reads as a failure. Echo the real recipient count.
    const { getDemoUnits } = await import("@/lib/demo-store");
    const sent = getDemoUnits(propertyId).filter((u) => u.email).length;
    return NextResponse.json({ ok: true, sent, demo: true });
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { checkSubscriptionAccess } = await import("@/lib/usage");
    const { getEmailQuota, reservarEmails, liberarEmails } = await import("@/lib/email-quota");
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

    // Freno de ráfagas: la cuota se lee antes de enviar y se descuenta después,
    // así que peticiones paralelas la leerían todas en 0. Limitar el ritmo por
    // usuario (atómico, y deniega si la base falla) acota ese margen.
    const ritmo = await rateLimit(`announce:${session.user.id}`, {
      max: 3,
      windowMs: 60_000,
      failClosed: true,
    });
    if (!ritmo.allowed) {
      return NextResponse.json(
        {
          error: ritmo.unavailable
            ? "Servicio temporalmente no disponible. Intenta de nuevo en unos segundos."
            : "Demasiados envíos seguidos. Espera un momento antes de enviar otro comunicado.",
        },
        {
          status: ritmo.unavailable ? 503 : 429,
          headers: { "Retry-After": String(ritmo.retryAfterSec ?? 30) },
        }
      );
    }

    // Reserva atómica ANTES de enviar: dos envíos simultáneos no pueden pasarse de la cuota.
    const limiteMensual = await getEmailQuota(session.user.id, isBeta);
    const reserva = await reservarEmails(session.user.id, recipients.length, limiteMensual);
    if (!reserva.allowed) {
      if (reserva.unavailable) {
        return NextResponse.json({ error: reserva.reason }, { status: 503, headers: { "Retry-After": "30" } });
      }
      return NextResponse.json({ error: reserva.reason, code: "email_quota" }, { status: 403 });
    }

    const admin = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, company: true, logoUrl: true, brandColor: true },
    });

    let resultado: { sent: number; failed: number };
    try {
      resultado = await sendAnnouncementEmails({
        recipients,
        subject: subject.trim(),
        contentHtml: textToEmailHtml(content),
        propertyName: property.name,
        senderName: admin?.company || admin?.name || "Administración",
        replyTo: admin?.email || undefined,
        logoUrl: admin?.logoUrl,
        brandColor: admin?.brandColor,
      });
    } catch (e) {
      // No se envió nada de forma confiable: se devuelve toda la reserva.
      await liberarEmails(session.user.id, recipients.length);
      throw e;
    }
    const { sent, failed } = resultado;

    // Se devuelve a la cuota lo reservado que no se pudo enviar.
    await liberarEmails(session.user.id, recipients.length - sent);

    if (sent === 0) {
      return NextResponse.json(
        { error: "No se pudo enviar el comunicado. Verifica la configuración de correo e intenta de nuevo." },
        { status: 502 }
      );
    }

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

    await registrarEvento({
      userId: session.user.id,
      propertyId,
      modulo: "comunicados",
      accion: "comunicado_enviado",
      resumen: `Comunicado «${announcement.subject.slice(0, 100)}» enviado a ${sent} destinatarios`,
      refType: "Announcement",
      refId: announcement.id,
    });

    return NextResponse.json({ ok: true, sent, failed, id: announcement.id }, { status: 201 });
  } catch (error) {
    console.error("[announcements POST]", error);
    return NextResponse.json({ error: "Error al enviar el comunicado" }, { status: 500 });
  }
}
