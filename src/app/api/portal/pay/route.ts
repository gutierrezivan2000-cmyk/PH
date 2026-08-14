export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { computeUnitSummary } from "@/lib/cartera";

const IS_DEMO = process.env.DEMO_MODE === "true";
const TOKEN_RE = /^[A-Za-z0-9_-]{16,48}$/;

function origin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, "");
  const host = req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/** Create a pending online-payment order for a unit and return ePayco checkout
 *  params (using the ADMIN's own merchant key, so funds settle to them). */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ error: "No disponible en demo" }, { status: 400 });

  // El portal ya no muestra el botón de pago mientras Cartera está pausada,
  // pero la ruta seguía viva y aceptando cobros reales de quien la llamara
  // directamente. Cerrarla evita mover dinero de una función que no se está
  // operando: nadie estaría del otro lado para conciliar ni responder.
  const { COMING_SOON } = await import("@/lib/feature-flags");
  if (COMING_SOON.cartera) {
    return NextResponse.json(
      { error: "El pago en línea no está disponible por ahora." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { token, amount } = body as { token?: string; amount?: number };
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Enlace inválido." }, { status: 400 });
  }

  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { db } = await import("@/lib/db");

    const unit = await db.unit.findUnique({
      where: { portalToken: token },
      select: {
        id: true,
        label: true,
        propertyId: true,
        property: {
          select: {
            name: true,
            userId: true,
            user: { select: { epaycoPublicKey: true, epaycoPCustId: true, epaycoPKey: true, epaycoTest: true } },
          },
        },
      },
    });
    if (!unit) return NextResponse.json({ error: "Enlace inválido." }, { status: 404 });

    // Don't take a payment the administration can no longer reconcile (their
    // plan no longer covers cartera): the money would move with no visible
    // trace on their side.
    const { ownerHasCarteraPlan } = await import("@/lib/cartera-server");
    if (!(await ownerHasCarteraPlan(unit.property.userId))) {
      return NextResponse.json(
        {
          error: "El pago en línea no está disponible en este momento. Comunícate con la administración.",
          code: "not_available",
        },
        { status: 403 }
      );
    }

    const merchant = unit.property.user;
    if (!merchant?.epaycoPublicKey || !merchant?.epaycoPCustId || !merchant?.epaycoPKey) {
      return NextResponse.json(
        { error: "La administración aún no ha habilitado el pago en línea.", code: "not_configured" },
        { status: 400 }
      );
    }

    // Current balance (charged - paid).
    const [charges, paidAgg] = await Promise.all([
      db.charge.findMany({ where: { unitId: unit.id }, select: { amount: true, paidAmount: true, dueDate: true } }),
      db.unitPayment.aggregate({ where: { unitId: unit.id }, _sum: { amount: true } }),
    ]);
    const summary = computeUnitSummary(charges, paidAgg._sum.amount || 0, new Date());
    const balance = summary.balance;

    // Amount to charge: requested (capped to balance) or the full balance.
    let amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) amt = balance;
    if (balance <= 0) {
      return NextResponse.json({ error: "Tu unidad está al día — no hay saldo por pagar.", code: "no_balance" }, { status: 400 });
    }
    amt = Math.min(amt, balance);
    if (amt < 1000) {
      return NextResponse.json({ error: "El monto mínimo de pago es $1.000." }, { status: 400 });
    }

    // Anti-abuse: a resident creating unlimited pending orders is the setup for
    // replay games and clutters reconciliation. 10 checkouts/hour per unit.
    const { rateLimit } = await import("@/lib/rate-limit");
    const rl = await rateLimit(`portal-pay:${unit.id}`, { max: 10, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos de pago seguidos. Espera unos minutos e intenta de nuevo." },
        { status: 429 }
      );
    }

    const isTest = merchant.epaycoTest ?? true;
    const ref = `uadm-${unit.id.slice(-8)}-${randomBytes(4).toString("hex")}`;
    await db.unitPaymentOrder.create({
      data: {
        ref,
        userId: unit.property.userId,
        propertyId: unit.propertyId,
        unitId: unit.id,
        amount: amt,
        status: "pending",
        test: isTest,
      },
    });

    const base = origin(req);
    return NextResponse.json({
      ref,
      publicKey: merchant.epaycoPublicKey,
      test: isTest,
      amount: amt,
      currency: "cop",
      name: `Administración ${unit.property.name}`,
      description: `Pago administración · ${unit.label}`,
      confirmationUrl: `${base}/api/epayco/unit-confirmation`,
      responseUrl: `${base}/pago/respuesta`,
      propertyName: unit.property.name,
      unitLabel: unit.label,
    });
  } catch (e) {
    console.error("[portal pay]", e);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Intenta de nuevo." }, { status: 500 });
  }
}
