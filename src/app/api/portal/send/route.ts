export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { randomBytes } from "node:crypto";

const IS_DEMO = process.env.DEMO_MODE === "true";

function newToken(): string {
  return randomBytes(15).toString("base64url");
}

function portalOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  const host = req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/**
 * Email residents their portal link. Body { propertyId, unitId? }:
 * one unit or every unit in the property that has an email. Generates a token
 * on the fly for any unit missing one. Counts against the monthly email quota.
 */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true, sent: 0 });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId, accessStatus } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, unitId } = body as { propertyId?: string; unitId?: string };
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId requerido" }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const property = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true, name: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const units = await db.unit.findMany({
      where: unitId
        ? { id: unitId, propertyId, email: { not: null } }
        : { propertyId, email: { not: null } },
      select: { id: true, label: true, email: true, portalToken: true },
    });
    if (units.length === 0) {
      return NextResponse.json(
        { error: "No hay unidades con correo registrado para enviar el enlace." },
        { status: 400 }
      );
    }

    // Email quota gate (one email per unit).
    const { checkEmailQuota, recordEmailsSent } = await import("@/lib/email-quota");
    const quota = await checkEmailQuota(userId, units.length, accessStatus === "beta");
    if (!quota.allowed) {
      return NextResponse.json({ error: quota.reason, code: "email_quota" }, { status: 403 });
    }

    // Ensure every target unit has a token.
    for (const u of units) {
      if (!u.portalToken) {
        const t = newToken();
        await db.unit.update({ where: { id: u.id }, data: { portalToken: t } }).catch(() => {});
        u.portalToken = t;
      }
    }

    const origin = portalOrigin(req);
    const admin = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, company: true, logoUrl: true, brandColor: true },
    });

    const recipients = units
      .filter((u) => u.portalToken && u.email)
      .map((u) => ({ email: u.email!, url: `${origin}/u/${u.portalToken}`, unitLabel: u.label }));

    const { sendPortalLinkEmails } = await import("@/lib/email");
    const { sent, failed } = await sendPortalLinkEmails({
      recipients,
      propertyName: property.name,
      senderName: admin?.company || admin?.name || "Administración",
      replyTo: admin?.email || undefined,
      logoUrl: admin?.logoUrl,
      brandColor: admin?.brandColor,
    });

    if (sent === 0) {
      return NextResponse.json({ error: "No se pudo enviar el enlace. Intenta de nuevo." }, { status: 502 });
    }
    await recordEmailsSent(userId, sent);
    return NextResponse.json({ ok: true, sent, failed });
  } catch (error) {
    console.error("[portal send]", error);
    return NextResponse.json({ error: "Error al enviar los enlaces" }, { status: 500 });
  }
}
