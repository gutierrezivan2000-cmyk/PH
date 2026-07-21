export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { computeUnitSummary, interesMora } from "@/lib/cartera";

const IS_DEMO = process.env.DEMO_MODE === "true";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Monthly late-interest liquidation for a property. For every unit with an
 * overdue balance (EXCLUDING prior interest charges — no interest on
 * interest), creates one "interes" charge for the given month at rate%.
 * Idempotent per (unit, month, year). Also persists the rate to the
 * property's building profile for next time.
 */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true, created: 0 });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, month, year, rate } = body as {
    propertyId?: string;
    month?: number;
    year?: number;
    rate?: number;
  };

  const m = Number(month);
  const y = Number(year);
  const pct = Number(rate);
  if (!propertyId || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2020 || y > 2100) {
    return NextResponse.json({ error: "Mes y año inválidos." }, { status: 400 });
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct > 15) {
    return NextResponse.json(
      { error: "Tasa mensual inválida (0.1% a 15%). Recuerda el tope legal: 1.5× el interés bancario corriente." },
      { status: 400 }
    );
  }

  try {
    const { db } = await import("@/lib/db");
    const { parseFeatures } = await import("@/lib/compliance");

    const property = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true, features: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const [units, charges, existing] = await Promise.all([
      db.unit.findMany({ where: { propertyId }, select: { id: true } }),
      db.charge.findMany({
        where: { propertyId },
        select: { unitId: true, type: true, amount: true, paidAmount: true, dueDate: true },
      }),
      db.charge.findMany({
        where: { propertyId, type: "interes", month: m, year: y },
        select: { unitId: true },
      }),
    ]);
    const alreadyLiquidated = new Set(existing.map((c) => c.unitId));

    const chargesByUnit = new Map<string, typeof charges>();
    for (const c of charges) {
      const list = chargesByUnit.get(c.unitId) || [];
      list.push(c);
      chargesByUnit.set(c.unitId, list);
    }

    const now = new Date();
    const concept = `Intereses de mora ${MONTH_NAMES[m - 1]} ${y} (${pct}% mensual)`;
    const toCreate: {
      userId: string;
      propertyId: string;
      unitId: string;
      concept: string;
      type: string;
      amount: number;
      month: number;
      year: number;
      dueDate: Date;
    }[] = [];

    for (const u of units) {
      if (alreadyLiquidated.has(u.id)) continue;
      // Base excludes "interes" charges — never interest on interest.
      const base = (chargesByUnit.get(u.id) || []).filter((c) => c.type !== "interes");
      const summary = computeUnitSummary(base, 0, now);
      // overdueAmount here is per-charge open amounts past due (payments are
      // already reflected in paidAmount, so passing 0 as paymentsTotal is fine
      // for the overdue computation).
      const interest = interesMora(summary.overdueAmount, pct);
      if (interest < 100) continue; // ignore negligible amounts (< COP $100)
      toCreate.push({
        userId,
        propertyId,
        unitId: u.id,
        concept,
        type: "interes",
        amount: interest,
        month: m,
        year: y,
        dueDate: now,
      });
    }

    if (toCreate.length > 0) {
      await db.charge.createMany({ data: toCreate });
    }

    // Remember the rate in the building profile (best effort).
    try {
      const features = parseFeatures(property.features);
      await db.property.update({
        where: { id: propertyId },
        data: { features: { ...features, tasaMora: pct } as object },
      });
    } catch {
      // non-fatal
    }

    return NextResponse.json({
      ok: true,
      created: toCreate.length,
      skippedExisting: alreadyLiquidated.size,
      total: toCreate.reduce((s, c) => s + c.amount, 0),
    });
  } catch (error) {
    console.error("[cartera intereses]", error);
    return NextResponse.json({ error: "Error al liquidar intereses" }, { status: 500 });
  }
}
