export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateSignatureWith, verifyTransaction } from "@/lib/epayco";
import { allocateFifo, type Allocation } from "@/lib/cartera";

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
      console.error("[unit-confirmation] invalid signature", { ref: x_ref_payco });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // 3) Re-confirm status directly with ePayco (status isn't signed).
    const verification = await verifyTransaction(x_ref_payco);
    if (!verification.success) {
      return NextResponse.json({ error: "Verification unavailable, retry" }, { status: 503 });
    }
    const codResponse = String(verification.data?.x_cod_response ?? x_cod_response);

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
        const claim = await tx.unitPaymentOrder.updateMany({
          where: { id: order.id, status: "pending" },
          data: { status: "completed", epaycoRef: x_ref_payco, completedAt: new Date() },
        });
        if (claim.count !== 1) return; // already reconciled by another callback

        const openCharges = await tx.charge.findMany({
          where: { unitId: order.unitId },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          select: { id: true, amount: true, paidAmount: true },
        });
        const { allocations } = allocateFifo(openCharges, order.amount);
        for (const a of allocations as Allocation[]) {
          await tx.charge.update({ where: { id: a.chargeId }, data: { paidAmount: { increment: a.amount } } });
        }
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
