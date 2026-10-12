import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/epayco";
import { normalizePlanId, hasActiveAccess, type CanonicalPlan } from "@/lib/plan";
import { urlBase } from "@/lib/app-url";

const IS_DEMO = process.env.DEMO_MODE === "true";

const ERROR_SIN_DIRECCION = "El pago en línea no está disponible en este momento. Intenta de nuevo más tarde.";

/**
 * Dirección pública para los retornos y la confirmación del pago, o null si en producción no hay ninguna configurada. Se evalúa
 * en cada petición (nunca al cargar el módulo). Sin dirección NO se abre el cobro: con la confirmación apuntando a localhost,
 * ePayco cobraría y el pago nunca se acreditaría.
 */
function direccionPublica(): string | null {
  try {
    return urlBase();
  } catch (e) {
    console.error("[CHECKOUT] no hay dirección pública configurada; no se abre el pago:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // In demo mode: simulate a successful subscription
  if (IS_DEMO) {
    const appUrl = direccionPublica();
    if (!appUrl) return NextResponse.json({ error: ERROR_SIN_DIRECCION }, { status: 500 });
    return NextResponse.json({ url: `${appUrl}/dashboard?success=true&demo=1` });
  }

  let planType: CanonicalPlan = "pro";
  try {
    const body = await req.json();
    if (body.plan === "elite" || body.plan === "business" || body.plan === "pro") {
      planType = body.plan;
    }
  } catch {
    // default to pro
  }

  // Block re-purchasing the SAME plan only while it's genuinely active (paid
  // period not yet ended). Allow upgrades/downgrades between plans, and allow
  // renewing the same plan once the period has lapsed (grace/expired).
  try {
    const { db } = await import("@/lib/db");
    const existing = await db.subscription.findUnique({
      where: { userId: session.user.id },
    });
    const access = hasActiveAccess(existing);
    if (access.status === "active" && normalizePlanId(existing?.planId) === planType) {
      return NextResponse.json(
        { error: "Ya tienes este plan activo." },
        { status: 400 }
      );
    }
  } catch (e) {
    console.error("[CHECKOUT] DB check failed, proceeding:", e);
  }

  const appUrl = direccionPublica();
  if (!appUrl) return NextResponse.json({ error: ERROR_SIN_DIRECCION }, { status: 500 });
  const plan = PLANS[planType];
  const invoice = `ph-${session.user.id}-${Date.now()}`;

  // Persist a server-side pending order. The confirmation callback resolves
  // userId + plan + expected amount from this record (keyed by `invoice`),
  // never from the tamperable x_extra fields.
  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { db } = await import("@/lib/db");
    await db.pendingOrder.create({
      data: {
        ref: invoice,
        userId: session.user.id,
        planType,
        amount: plan.amount,
        currency: plan.currency,
        status: "pending",
      },
    });
  } catch (e) {
    // Sin pedido pendiente la confirmación no puede acreditar nada (ya no hay
    // respaldo por monto firmado): NO se abre el cobro, para no cobrar sin suscripción.
    console.error("[CHECKOUT] pending order create failed; no se abre el pago:", e);
    return NextResponse.json({ error: "No pudimos iniciar el pago. Intenta de nuevo." }, { status: 503 });
  }

  return NextResponse.json({
    checkoutConfig: {
      name: plan.name,
      description: plan.description,
      invoice,
      currency: plan.currency,
      amount: String(plan.amount),
      tax_base: "0",
      tax: "0",
      country: "co",
      lang: "es",
      external: "false",
      confirmation: `${appUrl}/api/epayco/confirmation`,
      response: `${appUrl}/dashboard/epayco/response`,
      extra1: session.user.id,
      extra2: plan.idPlan,
      extra3: session.user.email ?? "",
      name_billing: session.user.name ?? "",
      email_billing: session.user.email ?? "",
    },
    publicKey: process.env.EPAYCO_PUBLIC_KEY,
    isTest: process.env.EPAYCO_TEST === "true",
  });
}
