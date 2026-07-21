import { describe, expect, it } from "vitest";
import {
  computeBudgetExecution,
  sanitizeBudgetItems,
  defaultBudgetItems,
  isFondoType,
  type BudgetItem,
} from "./presupuesto";

const items: BudgetItem[] = [
  { id: "i1", concept: "Cuotas administración", group: "ingreso", budgeted: 12_000_000 },
  { id: "g1", concept: "Vigilancia", group: "gasto", budgeted: 6_000_000 },
  { id: "g2", concept: "Aseo", group: "gasto", budgeted: 2_000_000 },
];

describe("computeBudgetExecution", () => {
  it("sums executed per rubro and computes pct/remaining", () => {
    const exec = computeBudgetExecution(items, [
      { itemId: "i1", type: "ingreso", amount: 3_000_000 },
      { itemId: "i1", type: "ingreso", amount: 1_000_000 },
      { itemId: "g1", type: "gasto", amount: 3_000_000 },
    ]);
    const cuotas = exec.ingresos.rows.find((r) => r.id === "i1")!;
    expect(cuotas.executed).toBe(4_000_000);
    expect(cuotas.pct).toBe(33); // 4M / 12M
    expect(cuotas.remaining).toBe(8_000_000);
    const vig = exec.gastos.rows.find((r) => r.id === "g1")!;
    expect(vig.executed).toBe(3_000_000);
    expect(vig.pct).toBe(50);
    expect(exec.ingresos.executed).toBe(4_000_000);
    expect(exec.gastos.executed).toBe(3_000_000);
    expect(exec.resultado).toBe(1_000_000);
  });

  it("routes a movement to a rubro only when its group matches the type", () => {
    // itemId points at an INGRESO rubro but movement is a GASTO → goes to "otros gasto"
    const exec = computeBudgetExecution(items, [
      { itemId: "i1", type: "gasto", amount: 500_000 },
    ]);
    expect(exec.ingresos.rows.find((r) => r.id === "i1")!.executed).toBe(0);
    const otros = exec.gastos.rows.find((r) => r.id === "otros-gasto")!;
    expect(otros.executed).toBe(500_000);
  });

  it("collects unclassified movements into an 'otros' row per group", () => {
    const exec = computeBudgetExecution(items, [
      { itemId: null, type: "ingreso", amount: 200_000 },
      { itemId: "nonexistent", type: "gasto", amount: 300_000 },
    ]);
    expect(exec.ingresos.rows.find((r) => r.id === "otros-ingreso")!.executed).toBe(200_000);
    expect(exec.gastos.rows.find((r) => r.id === "otros-gasto")!.executed).toBe(300_000);
  });

  it("computes the imprevistos fund: 1% of budgeted expenses + balance", () => {
    const exec = computeBudgetExecution(items, [
      { itemId: null, type: "fondo_aporte", amount: 100_000 },
      { itemId: null, type: "fondo_aporte", amount: 50_000 },
      { itemId: null, type: "fondo_retiro", amount: 30_000 },
    ]);
    // 1% of (6M + 2M) = 80.000
    expect(exec.fondo.required).toBe(80_000);
    expect(exec.fondo.aportes).toBe(150_000);
    expect(exec.fondo.retiros).toBe(30_000);
    expect(exec.fondo.balance).toBe(120_000);
    expect(exec.fondo.compliant).toBe(true);
  });

  it("flags the fund as non-compliant when the balance is below 1%", () => {
    const exec = computeBudgetExecution(items, [
      { itemId: null, type: "fondo_aporte", amount: 10_000 },
    ]);
    expect(exec.fondo.required).toBe(80_000);
    expect(exec.fondo.compliant).toBe(false);
  });

  it("fund movements never leak into income/expense execution", () => {
    const exec = computeBudgetExecution(items, [
      { itemId: null, type: "fondo_aporte", amount: 999_999 },
    ]);
    expect(exec.ingresos.executed).toBe(0);
    expect(exec.gastos.executed).toBe(0);
  });

  it("handles an empty budget", () => {
    const exec = computeBudgetExecution([], []);
    expect(exec.ingresos.budgeted).toBe(0);
    expect(exec.fondo.required).toBe(0);
    expect(exec.resultado).toBe(0);
  });
});

describe("sanitizeBudgetItems", () => {
  it("keeps valid items, drops junk, dedups ids, clamps negatives", () => {
    const clean = sanitizeBudgetItems([
      { id: "a", concept: "  Vigilancia  ", group: "gasto", budgeted: 100 },
      { id: "a", concept: "dup id", group: "gasto", budgeted: 50 }, // dup → dropped
      { id: "b", concept: "", group: "gasto", budgeted: 10 }, // empty concept → dropped
      { id: "c", concept: "Cuotas", group: "ingreso", budgeted: -5 }, // clamp to 0
      { id: "d", concept: "Bad group", group: "otro", budgeted: 3 }, // group → gasto
      "not an object",
    ]);
    expect(clean).toEqual([
      { id: "a", concept: "Vigilancia", group: "gasto", budgeted: 100 },
      { id: "c", concept: "Cuotas", group: "ingreso", budgeted: 0 },
      { id: "d", concept: "Bad group", group: "gasto", budgeted: 3 },
    ]);
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeBudgetItems(null)).toEqual([]);
    expect(sanitizeBudgetItems("x")).toEqual([]);
  });
});

describe("defaultBudgetItems", () => {
  it("produces unique ids and both groups", () => {
    let n = 0;
    const items = defaultBudgetItems(() => `id${n++}`);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
    expect(items.some((i) => i.group === "ingreso")).toBe(true);
    expect(items.some((i) => i.group === "gasto")).toBe(true);
    expect(items.every((i) => i.budgeted === 0)).toBe(true);
  });
});

describe("isFondoType", () => {
  it("identifies fund movement types", () => {
    expect(isFondoType("fondo_aporte")).toBe(true);
    expect(isFondoType("fondo_retiro")).toBe(true);
    expect(isFondoType("gasto")).toBe(false);
    expect(isFondoType("ingreso")).toBe(false);
  });
});
