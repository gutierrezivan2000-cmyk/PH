import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateConfirmationSignature, verifyTransaction } from "@/lib/epayco";
import { normalizePlanId, planFromAmount, type CanonicalPlan } from "@/lib/plan";

// ePayco sends a POST (or GET) to this endpoint after each transaction.
// This is the server-to-server callback — NOT user-facing.
//
// Trust model: the ePayco signature only covers ref/transaction/amount/currency
// — NOT x_extra1 (userId) or x_extra2 (plan). So we NEVER trust those to decide
// who gets what plan. Instead we resolve userId + plan + expected amount from
// the PendingOrder we stored at checkout (keyed by the invoice), and we verify
// the signed x_amount matches that order. This closes: free upgrades to Elite,
// activating someone else's account, and replaying an old approval to renew.

function amountMatches(xAmount: string | undefined, expected: number): boolean {
  const n = parseFloat(String(xAmount ?? ""));
  if (Number.isNaN(n)) return false;
  return Math.abs(Math.round(n) - expected) <= 1; // 1-peso tolerance for rounding
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData().catch(() => null);
    const params = body
      ? Object.fromEntries(body.entries())
      : Object.fromEntries(req.nextUrl.searchParams.entries());

    const {
      x_ref_payco,
      x_transaction_id,
      x_amount,
      x_currency_code,
      x_signature,
      x_cod_response,
      x_id_invoice, // the invoice we set at checkout → PendingOrder.ref
      x_extra1, // userId (UNSIGNED — legacy fallback only)
      x_extra2, // plan idPlan (UNSIGNED — never trusted)
    } = params as Record<string, string>;

    if (!x_ref_payco || !x_transaction_id) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // 1) Signature — proves ref/transaction/amount/currency came from ePayco.
    const isValid = validateConfirmationSignature({
      x_ref_payco,
      x_transaction_id,
      x_amount,
      x_currency_code,
      x_signature,
    });
    if (!isValid) {
      console.error("[ePayco confirmation] Invalid signature", { x_ref_payco });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // 2) Re-confirm the transaction status directly with ePayco's API.
    const verification = await verifyTransaction(x_ref_payco);
    const codResponse = verification.success
      ? String(verification.data?.x_cod_response ?? x_cod_response)
      : String(x_cod_response);

    // 3) Resolve the order server-side. Ensure the table exists first.
    try {
      const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
      await ensureAdminSchema();
    } catch { /* best effort */ }

    let order: {
      id: string;
      userId: string;
      planType: string;
      amount: number;
      status: string;
    } | null = null;
    if (x_id_invoice) {
      order = await db.pendingOrder
        .findUnique({
          where: { ref: x_id_invoice },
          select: { id: true, userId: true, planType: true, amount: true, status: true },
        })
        .catch(() => null);
    }

    // Resolve userId, plan, and the amount we EXPECTED to be charged.
    let userId: string | undefined;
    let plan: CanonicalPlan;
    let expectedAmount: number | undefined;

    if (order) {
      userId = order.userId;
      plan = normalizePlanId(order.planType) || "pro";
      expectedAmount = order.amount;
    } else {
      // Legacy fallback (payment started before this table existed): resolve the
      // plan from the SIGNED amount — never from the unsigned x_extra2 — so a
      // tampered callback still can't claim a higher plan than what was paid.
      userId = x_extra1;
      plan = planFromAmount(x_amount) || "pro";
      console.warn("[ePayco confirmation] no PendingOrder for invoice, using signed-amount fallback", {
        x_ref_payco,
        x_id_invoice,
      });
    }

    if (!userId) {
      console.error("[ePayco confirmation] Could not resolve userId", { x_ref_payco });
      return NextResponse.json({ received: true });
    }

    // 4) The charged amount must match what we asked ePayco to charge.
    if (expectedAmount !== undefined && !amountMatches(x_amount, expectedAmount)) {
      console.error("[ePayco confirmation] amount mismatch", {
        x_ref_payco,
        x_amount,
        expectedAmount,
      });
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    // 5) Idempotency — never apply the same order twice (blocks replay renewals).
    if (order && order.status === "completed") {
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (codResponse === "1") {
      // ── APPROVED ──
      await db.subscription.upsert({
        where: { userId },
        create: {
          userId,
          status: "active",
          epaycoRef: x_ref_payco,
          planId: plan,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        update: {
          status: "active",
          epaycoRef: x_ref_payco,
          planId: plan,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      if (order) {
        await db.pendingOrder
          .update({
            where: { id: order.id },
            data: { status: "completed", epaycoRef: x_ref_payco, completedAt: now },
          })
          .catch(() => {});
      }
    } else if (codResponse === "2" || codResponse === "4") {
      // ── REJECTED or FAILED ──
      // Only degrade a genuinely ACTIVE subscription (a failed renewal). A
      // rejected first payment must NOT revoke a still-valid trial.
      await db.subscription.updateMany({
        where: { userId, status: "active" },
        data: { status: "past_due", epaycoRef: x_ref_payco },
      });
      if (order) {
        await db.pendingOrder
          .update({ where: { id: order.id }, data: { status: "rejected", epaycoRef: x_ref_payco } })
          .catch(() => {});
      }
    }
    // codResponse === "3" (pending) — no action, wait for final confirmation

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[ePayco confirmation] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ePayco may also send GET requests depending on configuration
export async function GET(req: NextRequest) {
  return POST(req);
}
