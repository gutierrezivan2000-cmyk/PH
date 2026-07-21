export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import {
  computeBudgetExecution,
  sanitizeBudgetItems,
  type BudgetItem,
  type LedgerLike,
} from "@/lib/presupuesto";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET(req: NextRequest) {
  if (IS_DEMO) {
    return NextResponse.json({ items: [], entries: [], execution: null });
  }

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const propertyId = req.nextUrl.searchParams.get("propertyId");
  const year = parseInt(req.nextUrl.searchParams.get("year") || "", 10);
  if (!propertyId || !Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "propertyId y year requeridos" }, { status: 400 });
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

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const [budget, entries] = await Promise.all([
      db.budget.findUnique({ where: { propertyId_year: { propertyId, year } } }),
      db.ledgerEntry.findMany({
        where: { propertyId, date: { gte: yearStart, lt: yearEnd } },
        orderBy: { date: "desc" },
      }),
    ]);

    const items = (budget?.items as BudgetItem[] | undefined) ?? [];
    const execution = computeBudgetExecution(items, entries as unknown as LedgerLike[]);

    return NextResponse.json({ items, entries, execution });
  } catch (error) {
    console.error("[presupuesto GET]", error);
    return NextResponse.json({ error: "Error al cargar el presupuesto" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, year, items } = body as {
    propertyId?: string;
    year?: number;
    items?: unknown;
  };
  const y = Number(year);
  if (!propertyId || !Number.isInteger(y) || y < 2020 || y > 2100) {
    return NextResponse.json({ error: "propertyId y year requeridos" }, { status: 400 });
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

    const clean = sanitizeBudgetItems(items);
    const budget = await db.budget.upsert({
      where: { propertyId_year: { propertyId, year: y } },
      create: { userId, propertyId, year: y, items: clean as unknown as object },
      update: { items: clean as unknown as object },
    });

    return NextResponse.json({ ok: true, items: budget.items });
  } catch (error) {
    console.error("[presupuesto PUT]", error);
    return NextResponse.json({ error: "Error al guardar el presupuesto" }, { status: 500 });
  }
}
