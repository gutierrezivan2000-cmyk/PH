export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTransaction } from "@/lib/epayco";
import { applyPaymentFifoTx, type Allocation } from "@/lib/cartera";

// Safety net for resident online payments: a callback can be lost (ePayco's
// validation API down during all retries, admin rotated their keys mid-flight,
// network blip). Without this, the resident is charged but the cartera never
// reflects it — they'd get mora, intereses and a collection letter.
//
// Every 15 min we sweep orders that have been pending too long and ask ePayco
// directly what happened, using the order's own ref as the search key.

const STALE_MINUTES = 20;
const MAX_AGE_HOURS = 72; // beyond this ePayco won't have a live reference
const PER_RUN = 25;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
  } catch { /* best effort */ }

  const now = Date.now();
  const staleBefore = new Date(now - STALE_MINUTES * 60 * 1000);
  const tooOld = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000);

  let checked = 0;
  let reconciled = 0;
  let expired = 0;

  try {
    const stale = await db.unitPaymentOrder.findMany({
      where: { status: "pending", createdAt: { lt: staleBefore, gt: tooOld } },
      orderBy: { createdAt: "asc" },
      take: PER_RUN,
    });

    for (const order of stale) {
      checked++;
      // ePayco's validation endpoint also accepts the merchant invoice.
      const v = await verifyTransaction(order.ref);
      if (!v.success || !v.data) continue;

      const cod = String(v.data.x_cod_response ?? "");
      const isTest = String(v.data.x_test_request ?? "").toUpperCase() === "TRUE";
      const amountOk =
        Math.abs(Math.round(parseFloat(String(v.data.x_amount ?? "0"))) - order.amount) <= 1;
      const invoiceOk = !v.data.x_id_invoice || String(v.data.x_id_invoice) === order.ref;
      const epRef = v.data.x_ref_payco ? String(v.data.x_ref_payco) : null;

      if (cod !== "1") {
        if (cod === "2" || cod === "4") {
          await db.unitPaymentOrder
            .update({ where: { id: order.id }, data: { status: "rejected", epaycoRef: epRef } })
            .catch(() => {});
        }
        continue; // "3" pending → check again next run
      }

      if (isTest || order.test) {
        await db.unitPaymentOrder
          .update({ where: { id: order.id }, data: { status: "test", epaycoRef: epRef, completedAt: new Date() } })
          .catch(() => {});
        continue;
      }
      if (!amountOk || !invoiceOk) {
        await db.unitPaymentOrder
          .update({
            where: { id: order.id },
            data: { status: "needs_review", failReason: !amountOk ? "amount_mismatch" : "invoice_mismatch" },
          })
          .catch(() => {});
        continue;
      }

      // Approved and consistent → reconcile exactly like the callback would.
      try {
        await db.$transaction(async (tx) => {
          const claim = await tx.unitPaymentOrder.updateMany({
            where: { id: order.id, status: "pending" },
            data: { status: "completed", epaycoRef: epRef, completedAt: new Date() },
          });
          if (claim.count !== 1) return;

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
              reference: epRef,
              note: "Pago en línea conciliado automáticamente",
              allocations: allocations as unknown as object,
              receivedAt: new Date(),
            },
          });
        });
        reconciled++;
      } catch (e) {
        // Unique epaycoRef violation = this transaction already settled another
        // order; flag rather than silently retry forever.
        console.error("[reconcile-payments] reconcile failed", order.ref, e);
        await db.unitPaymentOrder
          .update({ where: { id: order.id }, data: { status: "needs_review", failReason: "reconcile_error" } })
          .catch(() => {});
      }
    }

    // Orders older than the window that never confirmed: close them so they
    // stop being swept (the resident was never charged, or it needs a human).
    const stuck = await db.unitPaymentOrder.updateMany({
      where: { status: "pending", createdAt: { lt: tooOld } },
      data: { status: "needs_review", failReason: "expired_without_confirmation" },
    });
    expired = stuck.count;

    return NextResponse.json({ ok: true, checked, reconciled, expired });
  } catch (error) {
    console.error("[reconcile-payments]", error);
    return NextResponse.json({ error: "Error en la conciliación" }, { status: 500 });
  }
}
