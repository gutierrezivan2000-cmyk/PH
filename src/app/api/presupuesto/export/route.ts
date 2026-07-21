export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import {
  computeBudgetExecution,
  type BudgetItem,
  type LedgerLike,
} from "@/lib/presupuesto";

const IS_DEMO = process.env.DEMO_MODE === "true";

const TYPE_LABELS: Record<string, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  fondo_aporte: "Aporte fondo imprevistos",
  fondo_retiro: "Retiro fondo imprevistos",
};

export async function GET(req: NextRequest) {
  if (IS_DEMO) {
    return NextResponse.json({ error: "No disponible en modo demo" }, { status: 400 });
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
      select: { id: true, name: true },
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
        orderBy: { date: "asc" },
      }),
    ]);

    const items = (budget?.items as BudgetItem[] | undefined) ?? [];
    const exec = computeBudgetExecution(items, entries as unknown as LedgerLike[]);

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Presupuesto vs Ejecución ──────────────────────────
    const rows: (string | number)[][] = [];
    rows.push([`Presupuesto vs Ejecución ${year} — ${property.name}`]);
    rows.push([]);
    rows.push(["INGRESOS", "Presupuesto", "Ejecutado", "% ejec.", "Diferencia"]);
    for (const row of exec.ingresos.rows) {
      rows.push([row.concept, row.budgeted, row.executed, row.pct / 100, row.remaining]);
    }
    rows.push(["Total ingresos", exec.ingresos.budgeted, exec.ingresos.executed, "", exec.ingresos.budgeted - exec.ingresos.executed]);
    rows.push([]);
    rows.push(["GASTOS", "Presupuesto", "Ejecutado", "% ejec.", "Diferencia"]);
    for (const row of exec.gastos.rows) {
      rows.push([row.concept, row.budgeted, row.executed, row.pct / 100, row.remaining]);
    }
    rows.push(["Total gastos", exec.gastos.budgeted, exec.gastos.executed, "", exec.gastos.budgeted - exec.gastos.executed]);
    rows.push([]);
    rows.push(["Resultado ejecutado (ingresos - gastos)", "", exec.resultado]);
    rows.push([]);
    rows.push(["FONDO DE IMPREVISTOS (Art. 35, Ley 675)"]);
    rows.push(["Requerido (1% del presupuesto de gastos)", exec.fondo.required]);
    rows.push(["Aportes", exec.fondo.aportes]);
    rows.push(["Retiros", exec.fondo.retiros]);
    rows.push(["Saldo del fondo", exec.fondo.balance]);
    rows.push(["Cumple mínimo legal", exec.fondo.compliant ? "SÍ" : "NO"]);

    const ws1 = XLSX.utils.aoa_to_sheet(rows);
    ws1["!cols"] = [{ wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Presupuesto vs Ejec");

    // ── Sheet 2: Movimientos (libro) ───────────────────────────────
    const itemName = new Map(items.map((i) => [i.id, i.concept]));
    const mov: (string | number)[][] = [["Fecha", "Tipo", "Concepto", "Rubro", "Monto", "Nota"]];
    for (const e of entries) {
      mov.push([
        new Date(e.date).toISOString().slice(0, 10),
        TYPE_LABELS[e.type] || e.type,
        e.concept,
        e.itemId ? itemName.get(e.itemId) || "" : "",
        e.amount,
        e.note || "",
      ]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(mov);
    ws2["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 32 }, { wch: 28 }, { wch: 16 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Movimientos");

    const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const safeName = property.name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="presupuesto_${safeName}_${year}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[presupuesto export]", error);
    return NextResponse.json({ error: "Error al generar el Excel" }, { status: 500 });
  }
}
