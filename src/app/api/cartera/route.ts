export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { computeUnitSummary } from "@/lib/cartera";

const IS_DEMO = process.env.DEMO_MODE === "true";

// Colombia is UTC-5 year-round.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
function bogotaMonthStart(now: Date): Date {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + BOGOTA_OFFSET_MS);
}

export async function GET(req: NextRequest) {
  if (IS_DEMO) {
    return NextResponse.json({
      units: [],
      kpis: { totalOwed: 0, overdueUnits: 0, collectedThisMonth: 0, chargedThisMonth: 0, unitsCount: 0 },
    });
  }

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId requerido" }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const property = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const now = new Date();
    const monthStart = bogotaMonthStart(now);

    const [units, charges, paymentSums, lastPayments] = await Promise.all([
      db.unit.findMany({
        where: { propertyId },
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          residentName: true,
          email: true,
          monthlyFee: true,
          coeficiente: true,
        },
      }),
      db.charge.findMany({
        where: { propertyId },
        select: { unitId: true, amount: true, paidAmount: true, dueDate: true },
      }),
      db.unitPayment.groupBy({
        by: ["unitId"],
        where: { propertyId },
        _sum: { amount: true },
      }),
      db.unitPayment.groupBy({
        by: ["unitId"],
        where: { propertyId },
        _max: { receivedAt: true },
      }),
    ]);

    const paidByUnit = new Map(paymentSums.map((p) => [p.unitId, p._sum.amount || 0]));
    const lastPayByUnit = new Map(lastPayments.map((p) => [p.unitId, p._max.receivedAt]));
    const chargesByUnit = new Map<string, typeof charges>();
    for (const c of charges) {
      const list = chargesByUnit.get(c.unitId) || [];
      list.push(c);
      chargesByUnit.set(c.unitId, list);
    }

    const rows = units.map((u) => {
      const summary = computeUnitSummary(
        chargesByUnit.get(u.id) || [],
        paidByUnit.get(u.id) || 0,
        now
      );
      return {
        ...u,
        summary,
        lastPaymentAt: lastPayByUnit.get(u.id)?.toISOString() ?? null,
      };
    });

    const [collectedThisMonth, chargedThisMonth] = await Promise.all([
      db.unitPayment.aggregate({
        where: { propertyId, receivedAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      db.charge.aggregate({
        where: { propertyId, dueDate: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    const kpis = {
      totalOwed: rows.reduce((s, u) => s + Math.max(0, u.summary.balance), 0),
      overdueUnits: rows.filter((u) => u.summary.overdueDays > 0 && u.summary.balance > 0).length,
      collectedThisMonth: collectedThisMonth._sum.amount || 0,
      chargedThisMonth: chargedThisMonth._sum.amount || 0,
      unitsCount: units.length,
    };

    return NextResponse.json({ units: rows, kpis });
  } catch (error) {
    console.error("[cartera GET]", error);
    return NextResponse.json({ error: "Error al cargar la cartera" }, { status: 500 });
  }
}
