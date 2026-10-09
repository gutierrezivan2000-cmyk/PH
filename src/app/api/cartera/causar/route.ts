export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { fmtCOP } from "@/lib/cartera";
import { registrarEvento } from "@/lib/agentes/eventos";

const IS_DEMO = process.env.DEMO_MODE === "true";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Monthly billing run: creates the "Administración <mes>" charge for every
 * unit with a configured monthlyFee that doesn't already have one for that
 * month/year. Idempotent — re-running skips existing charges.
 */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true, created: 0 });

  const r = await requireCartera("cartera");
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, month, year, dueDay } = body as {
    propertyId?: string;
    month?: number;
    year?: number;
    dueDay?: number;
  };

  const m = Number(month);
  const y = Number(year);
  const day = Math.min(Math.max(1, Math.round(Number(dueDay) || 10)), 28);
  if (!propertyId || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2020 || y > 2100) {
    return NextResponse.json({ error: "Mes y año inválidos." }, { status: 400 });
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

    const [units, existing] = await Promise.all([
      db.unit.findMany({
        where: { propertyId },
        select: { id: true, monthlyFee: true },
      }),
      db.charge.findMany({
        where: { propertyId, type: "admin", month: m, year: y },
        select: { unitId: true },
      }),
    ]);
    const alreadyCharged = new Set(existing.map((c) => c.unitId));

    const dueDate = new Date(y, m - 1, day, 12);
    const concept = `Administración ${MONTH_NAMES[m - 1]} ${y}`;

    const toCreate = units
      .filter((u) => (u.monthlyFee || 0) > 0 && !alreadyCharged.has(u.id))
      .map((u) => ({
        userId,
        propertyId,
        unitId: u.id,
        concept,
        type: "admin",
        amount: u.monthlyFee!,
        month: m,
        year: y,
        dueDate,
      }));

    if (toCreate.length > 0) {
      await db.charge.createMany({ data: toCreate });
      await registrarEvento({
        userId,
        propertyId,
        modulo: "cartera",
        accion: "cuotas_causadas",
        resumen: `Cuotas de administración de ${MONTH_NAMES[m - 1]} ${y} causadas en ${toCreate.length} unidades (total ${fmtCOP(toCreate.reduce((s, c) => s + c.amount, 0))})`,
      });
    }

    const withoutFee = units.filter((u) => !(u.monthlyFee || 0)).length;

    return NextResponse.json({
      ok: true,
      created: toCreate.length,
      skippedExisting: alreadyCharged.size,
      skippedNoFee: withoutFee,
    });
  } catch (error) {
    console.error("[cartera causar]", error);
    return NextResponse.json({ error: "Error al causar el mes" }, { status: 500 });
  }
}
