export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateSignatureWith, verifyTransaction } from "@/lib/epayco";
import { applyPaymentFifoTx, type Allocation } from "@/lib/cartera";

// ePayco server-to-server callback for a resident's administration payment.
// Same integrity model as the subscription confirmation, but:
//  - the signature is validated with the ADMIN's keys (funds settle to them);
//  - on approval we reconcile a UnitPayment into the unit's cartera (FIFO).

function amountMatches(xAmount: string | undefined, expected: number): boolean {
  const n = parseFloat(String(xAmount ?? ""));
  if (Number.isNaN(n)) return false;
  return Math.abs(Math.round(n) - expected) <= 1;
}

export async function POST(req: NextRequest) {
  try {
    const bodyForm = await req.formData().catch(() => null);
    const params = bodyForm
      ? Object.fromEntries(bodyForm.entries())
      : Object.fromEntries(req.nextUrl.searchParams.entries());

    const {
      x_ref_payco,
      x_transaction_id,
      x_amount,
      x_currency_code,
      x_signature,
      x_cod_response,
      x_id_invoice,
    } = params as Record<string, string>;

    if (!x_ref_payco || !x_transaction_id || !x_id_invoice) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    try {
      const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
      await ensureAdminSchema();
    } catch { /* best effort */ }

    // 1) Resolve the order server-side (never trust the callback for who/how-much).
    const order = await db.unitPaymentOrder
      .findUnique({ where: { ref: x_id_invoice } })
      .catch(() => null);
    if (!order) {
      // Unknown invoice — ack so ePayco stops retrying, but do nothing.
      return NextResponse.json({ received: true, unknownOrder: true });
    }

    // 2) Signature with the ADMIN's own ePayco keys.
    const admin = await db.user.findUnique({
      where: { id: order.userId },
      select: { epaycoPCustId: true, epaycoPKey: true },
    });
    if (!admin?.epaycoPCustId || !admin?.epaycoPKey) {
      console.error("[unit-confirmation] admin ePayco keys missing", { ref: x_ref_payco });
      return NextResponse.json({ error: "Merchant not configured" }, { status: 400 });
    }
    const sigOk = validateSignatureWith(admin.epaycoPCustId, admin.epaycoPKey, {
      x_ref_payco,
      x_transaction_id,
      x_amount,
      x_currency_code,
      x_signature,
    });
    if (!sigOk) {
      // Could be forged — or the admin rotated their ePayco keys mid-flight,
      // which would silently strand a REAL payment. Flag it for review instead
      // of leaving the order pending forever with no trace.
      console.error("[unit-confirmation] invalid signature", { ref: x_ref_payco });
      await db.unitPaymentOrder
        .update({
          where: { id: order.id },
          data: { status: "needs_review", failReason: "invalid_signature", epaycoRef: x_ref_payco },
        })
        .catch(() => {});
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // 3) Re-confirm status directly with ePayco (status isn't signed).
    const verification = await verifyTransaction(x_ref_payco);
    if (!verification.success) {
      // Transient: keep the order pending so ePayco retries and the
      // reconciliation cron can still settle it later.
      return NextResponse.json({ error: "Verification unavailable, retry" }, { status: 503 });
    }
    const codResponse = String(verification.data?.x_cod_response ?? x_cod_response);

    // 3b) ANTI-REPLAY: x_id_invoice is NOT covered by ePayco's signature, so a
    // signed tuple could otherwise be pointed at a different order of the same
    // amount. Bind the verified transaction to THIS order.
    const verifiedInvoice = verification.data?.x_id_invoice;
    if (verifiedInvoice && String(verifiedInvoice) !== order.ref) {
      console.error("[unit-confirmation] invoice mismatch", {
        ref: x_ref_payco,
        callbackInvoice: x_id_invoice,
        verifiedInvoice,
        orderRef: order.ref,
      });
      await db.unitPaymentOrder
        .update({ where: { id: order.id }, data: { status: "needs_review", failReason: "invoice_mismatch" } })
        .catch(() => {});
      return NextResponse.json({ error: "Invoice mismatch" }, { status: 400 });
    }

    // 3c) SANDBOX: a test transaction moves no real money — never credit it to
    // the cartera. Record it so the admin can see the test went through.
    const isTestTx = String(verification.data?.x_test_request ?? "").toUpperCase() === "TRUE";
    if (isTestTx || order.test) {
      await db.unitPaymentOrder
        .update({
          where: { id: order.id },
          data: {
            status: "test",
            epaycoRef: x_ref_payco,
            failReason: isTestTx ? null : "order_created_in_test_mode",
            completedAt: new Date(),
          },
        })
        .catch(() => {});
      return NextResponse.json({ received: true, test: true });
    }

    // 4) Amount + currency must match the order we created.
    if (!amountMatches(x_amount, order.amount)) {
      console.error("[unit-confirmation] amount mismatch", { ref: x_ref_payco, x_amount, expected: order.amount });
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }
    if (x_currency_code && x_currency_code.toLowerCase() !== "cop") {
      return NextResponse.json({ error: "Currency mismatch" }, { status: 400 });
    }

    // 5) Idempotency — never reconcile the same order twice.
    if (order.status === "completed") {
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    if (codResponse === "1") {
      // ── APPROVED — atomically claim the order and reconcile into cartera ──
      // The claim (pending → completed) and the FIFO application live in ONE
      // transaction. Concurrent duplicate callbacks serialize on the order row:
      // only the first claim matches (count === 1); the rest see 0 and no-op.
      await db.$transaction(async (tx) => {
        // The claim also writes epaycoRef, which carries a UNIQUE index: if this
        // same ePayco transaction already settled another order, the insert
        // fails and the whole transaction rolls back (anti cross-replay).
        const claim = await tx.unitPaymentOrder.updateMany({
          where: { id: order.id, status: "pending" },
          data: { status: "completed", epaycoRef: x_ref_payco, completedAt: new Date() },
        });
        if (claim.count !== 1) return; // already reconciled by another callback

        // Read + allocate + write under a row lock on the unit (same helper as
        // the manual payment path) so the two can never double-impute.
        const { allocations } = await applyPaymentFifoTx(
          tx as unknown as Parameters<typeof applyPaymentFifoTx>[0],
          order.unitId,
          order.amount
        );
        void (allocations as Allocation[]);
        await tx.unitPayment.create({
          data: {
            userId: order.userId,
            propertyId: order.propertyId,
            unitId: order.unitId,
            amount: order.amount,
            method: "online",
            reference: x_ref_payco,
            note: "Pago en línea (ePayco)",
            allocations: allocations as unknown as object,
            receivedAt: new Date(),
          },
        });
      });
    } else if (codResponse === "2" || codResponse === "4") {
      // ── REJECTED / FAILED ──
      await db.unitPaymentOrder
        .update({ where: { id: order.id }, data: { status: "rejected", epaycoRef: x_ref_payco } })
        .catch(() => {});
    }
    // "3" (pending) — wait for a final confirmation.

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[unit-confirmation] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
