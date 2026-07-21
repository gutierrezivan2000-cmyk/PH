export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { allocateFifo, type Allocation } from "@/lib/cartera";

const IS_DEMO = process.env.DEMO_MODE === "true";

const METHODS = ["efectivo", "transferencia", "consignacion", "otro"] as const;

/** Register a payment and apply it FIFO to the unit's oldest open charges. */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true }, { status: 201 });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, unitId, amount, method, reference, note, receivedAt } = body as {
    propertyId?: string;
    unitId?: string;
    amount?: number;
    method?: string;
    reference?: string;
    note?: string;
    receivedAt?: string;
  };

  const amt = Math.round(Number(amount));
  if (!propertyId || !unitId || !Number.isFinite(amt) || amt <= 0 || amt > 1_000_000_000) {
    return NextResponse.json({ error: "Monto inválido." }, { status: 400 });
  }
  if (method && !METHODS.includes(method as (typeof METHODS)[number])) {
    return NextResponse.json({ error: "Método de pago inválido." }, { status: 400 });
  }
  let when = new Date();
  if (receivedAt) {
    const d = new Date(receivedAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Fecha de pago inválida." }, { status: 400 });
    }
    when = d;
  }

  try {
    const { db } = await import("@/lib/db");
    const unit = await db.unit.findFirst({
      where: { id: unitId, propertyId, userId },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }

    // FIFO over open charges, oldest due first.
    const openCharges = await db.charge.findMany({
      where: { unitId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, amount: true, paidAmount: true },
    });
    const { allocations, leftover } = allocateFifo(openCharges, amt);

    const payment = await db.$transaction(async (tx) => {
      for (const a of allocations) {
        await tx.charge.update({
          where: { id: a.chargeId },
          data: { paidAmount: { increment: a.amount } },
        });
      }
      return tx.unitPayment.create({
        data: {
          userId,
          propertyId,
          unitId,
          amount: amt,
          method: (method || "transferencia") as string,
          reference: reference?.trim().slice(0, 100) || null,
          note: note?.trim().slice(0, 300) || null,
          allocations: allocations as unknown as object,
          receivedAt: when,
        },
      });
    });

    return NextResponse.json(
      { ok: true, id: payment.id, applied: amt - leftover, credit: leftover },
      { status: 201 }
    );
  } catch (error) {
    console.error("[cartera payments POST]", error);
    return NextResponse.json({ error: "Error al registrar el pago" }, { status: 500 });
  }
}

/** Delete a payment, reversing its FIFO allocations exactly. */
export async function DELETE(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const payment = await db.unitPayment.findFirst({
      where: { id, userId },
      select: { id: true, allocations: true },
    });
    if (!payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    const allocations = (Array.isArray(payment.allocations)
      ? payment.allocations
      : []) as unknown as Allocation[];

    await db.$transaction(async (tx) => {
      for (const a of allocations) {
        if (!a?.chargeId || !Number.isFinite(a.amount)) continue;
        await tx.charge.update({
          where: { id: a.chargeId },
          data: { paidAmount: { decrement: Math.round(a.amount) } },
        });
      }
      await tx.unitPayment.delete({ where: { id: payment.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cartera payments DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar el pago" }, { status: 500 });
  }
}
