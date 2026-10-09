export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { applyPaymentFifoTx, fmtCOP, type Allocation } from "@/lib/cartera";
import { registrarEvento } from "@/lib/agentes/eventos";

const IS_DEMO = process.env.DEMO_MODE === "true";

const METHODS = ["efectivo", "transferencia", "consignacion", "otro"] as const;

/** Register a payment and apply it FIFO to the unit's oldest open charges. */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true }, { status: 201 });

  const r = await requireCartera("cartera");
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, unitId, amount, method, reference, note, receivedAt, idempotencyKey } = body as {
    /** Clave del intento (la genera el navegador): repetirla no duplica el pago. */
    idempotencyKey?: string;
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

  const clave = typeof idempotencyKey === "string" && /^[A-Za-z0-9-]{8,64}$/.test(idempotencyKey) ? idempotencyKey : null;

  try {
    const { db } = await import("@/lib/db");
    // Un reintento de la MISMA clave devuelve el pago ya registrado (si el mismo intento llegó dos veces, o la respuesta se perdió).
    if (clave) {
      const previo = await db.unitPayment.findFirst({ where: { userId, idempotencyKey: clave }, select: { id: true, amount: true, unitId: true } });
      if (previo) {
        if (previo.amount !== amt || previo.unitId !== unitId) {
          return NextResponse.json({ error: "Esa clave ya se usó para otro pago. Recarga la página e inténtalo de nuevo." }, { status: 409 });
        }
        return NextResponse.json({ ok: true, id: previo.id, repetido: true }, { status: 200 });
      }
    }
    const unit = await db.unit.findFirst({
      where: { id: unitId, propertyId, userId },
      select: { id: true, label: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }

    // Read + allocate + write inside ONE transaction, behind a lock on the unit,
    // so concurrent payments can never double-impute the same charge.
    const { payment, leftover } = await db.$transaction(async (tx) => {
      const { allocations, leftover: rest } = await applyPaymentFifoTx(
        tx as unknown as Parameters<typeof applyPaymentFifoTx>[0],
        unitId,
        amt
      );
      const created = await tx.unitPayment.create({
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
          idempotencyKey: clave,
        },
      });
      return { payment: created, leftover: rest };
    });

    await registrarEvento({
      userId,
      propertyId,
      modulo: "cartera",
      accion: "pago_registrado",
      resumen: `Pago de ${fmtCOP(amt)} registrado en ${unit.label ?? "una unidad"} (${method || "transferencia"})`,
      refType: "UnitPayment",
      refId: payment.id,
    });

    return NextResponse.json(
      { ok: true, id: payment.id, applied: amt - leftover, credit: leftover },
      { status: 201 }
    );
  } catch (error) {
    // Dos peticiones simultáneas con la misma clave: la que llegó segundo choca con el índice único y se revierte entera
    // (también sus asignaciones FIFO). Se responde con el pago que sí quedó.
    if (clave && (error as { code?: string })?.code === "P2002") {
      const { db } = await import("@/lib/db");
      const ya = await db.unitPayment.findFirst({ where: { userId, idempotencyKey: clave }, select: { id: true } });
      if (ya) return NextResponse.json({ ok: true, id: ya.id, repetido: true }, { status: 200 });
    }
    console.error("[cartera payments POST]", error);
    return NextResponse.json({ error: "Error al registrar el pago" }, { status: 500 });
  }
}

/** Delete a payment, reversing its FIFO allocations exactly. */
export async function DELETE(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true });

  const r = await requireCartera("cartera");
  if ("error" in r) return r.error;
  const { userId } = r;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const payment = await db.unitPayment.findFirst({
      where: { id, userId },
      select: { id: true, allocations: true, propertyId: true, amount: true, unit: { select: { label: true } } },
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

    await registrarEvento({
      userId,
      propertyId: payment.propertyId,
      modulo: "cartera",
      accion: "pago_anulado",
      resumen: `Pago de ${fmtCOP(payment.amount)} anulado en ${payment.unit?.label ?? "una unidad"}`,
      refType: "UnitPayment",
      refId: payment.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cartera payments DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar el pago" }, { status: 500 });
  }
}
