export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const IS_DEMO = process.env.DEMO_MODE === "true";
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function origin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  const host = req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/**
 * Self-service portal-link recovery. A resident who lost their link enters the
 * email registered by the administration and receives it again — no account,
 * no password. Deliberately ALWAYS answers the same thing so the endpoint can't
 * be used to probe which emails belong to a copropiedad.
 */
export async function POST(req: NextRequest) {
  const generic = {
    ok: true,
    message:
      "Si el correo está registrado en una copropiedad, te enviamos el enlace de tu portal. Revisa tu bandeja de entrada y la carpeta de spam.",
  };

  if (IS_DEMO) return NextResponse.json(generic);

  const body = await req.json().catch(() => ({}));
  const email = String((body as { email?: string }).email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 120) {
    return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
  }

  // Anti-abuse: 3/h per email + 10/h per IP (keeps it from becoming a mailer).
  const rl1 = await rateLimit(`recover:email:${email}`, { max: 3, windowMs: 60 * 60 * 1000 });
  const rl2 = await rateLimit(`recover:ip:${clientIp(req)}`, { max: 10, windowMs: 60 * 60 * 1000 });
  if (!rl1.allowed || !rl2.allowed) {
    return NextResponse.json(generic); // stay generic even when throttled
  }

  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { db } = await import("@/lib/db");

    const units = await db.unit.findMany({
      where: { email },
      select: {
        id: true,
        label: true,
        portalToken: true,
        propertyId: true,
        property: { select: { name: true, userId: true } },
      },
      take: 10,
    });
    if (units.length === 0) return NextResponse.json(generic);

    // Generate a token for any unit that doesn't have one yet.
    const { randomBytes } = await import("node:crypto");
    for (const u of units) {
      if (!u.portalToken) {
        const t = randomBytes(15).toString("base64url");
        await db.unit.update({ where: { id: u.id }, data: { portalToken: t } }).catch(() => {});
        u.portalToken = t;
      }
    }

    const base = origin(req);
    const { sendPortalLinkEmails } = await import("@/lib/email");
    const { checkEmailQuota, recordEmailsSent } = await import("@/lib/email-quota");
    const { checkSubscriptionAccess } = await import("@/lib/usage");

    // Group by administrator so each email carries their branding, and charge
    // the send to that administrator's quota.
    const byOwner = new Map<string, typeof units>();
    for (const u of units) {
      const list = byOwner.get(u.property.userId) || [];
      list.push(u);
      byOwner.set(u.property.userId, list);
    }

    for (const [ownerId, list] of byOwner) {
      // Era la única ruta de envío que gastaba cuota sin comprobarla. Como es
      // pública, cualquiera que conozca correos registrados podía vaciar la
      // cuota mensual del administrador (con 10 solicitudes/hora por IP) y
      // dejarlo sin poder mandar comunicados. El `continue` mantiene la
      // respuesta genérica: el solicitante no aprende nada.
      const access = await checkSubscriptionAccess(ownerId).catch(() => ({ status: "" as string }));
      const quota = await checkEmailQuota(ownerId, list.length, access.status === "beta").catch(() => ({ allowed: true }));
      if (!quota.allowed) {
        console.warn(`[portal recuperar] cuota de correos agotada para ${ownerId}; envío omitido`);
        continue;
      }

      const admin = await db.user.findUnique({
        where: { id: ownerId },
        select: { name: true, email: true, company: true, logoUrl: true, brandColor: true },
      });
      const { sent } = await sendPortalLinkEmails({
        recipients: list
          .filter((u) => u.portalToken)
          .map((u) => ({ email, url: `${base}/u/${u.portalToken}`, unitLabel: u.label })),
        propertyName: list[0].property.name,
        senderName: admin?.company || admin?.name || "Administración",
        replyTo: admin?.email || undefined,
        logoUrl: admin?.logoUrl,
        brandColor: admin?.brandColor,
      });
      if (sent > 0) await recordEmailsSent(ownerId, sent).catch(() => {});
    }

    return NextResponse.json(generic);
  } catch (e) {
    console.error("[portal recuperar]", e);
    // Never reveal internals to a public endpoint.
    return NextResponse.json(generic);
  }
}
