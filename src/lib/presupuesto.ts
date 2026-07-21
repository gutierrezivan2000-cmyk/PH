// Presupuesto vs ejecución — pure logic, fully unit-tested. Integer COP.

export type BudgetGroup = "ingreso" | "gasto";

export interface BudgetItem {
  id: string;
  concept: string;
  group: BudgetGroup;
  budgeted: number;
}

export interface LedgerLike {
  itemId?: string | null;
  type: string; // "ingreso" | "gasto" | "fondo_aporte" | "fondo_retiro"
  amount: number;
}

export interface ExecutionRow {
  id: string;
  concept: string;
  group: BudgetGroup;
  budgeted: number;
  executed: number;
  /** executed / budgeted as a 0-100+ percentage (0 when unbudgeted). */
  pct: number;
  /** budgeted - executed (can be negative = over budget). */
  remaining: number;
}

export interface GroupExecution {
  rows: ExecutionRow[];
  budgeted: number;
  executed: number;
}

export interface FundStatus {
  /** 1% of total budgeted expenses (Art. 35, Ley 675). */
  required: number;
  aportes: number;
  retiros: number;
  balance: number;
  /** balance >= required. */
  compliant: boolean;
}

export interface BudgetExecution {
  ingresos: GroupExecution;
  gastos: GroupExecution;
  fondo: FundStatus;
  /** executed ingresos - executed gastos (excludes fund movements). */
  resultado: number;
}

const FONDO_TYPES = new Set(["fondo_aporte", "fondo_retiro"]);

/** Compute budget vs execution per rubro, plus imprevistos-fund status. */
export function computeBudgetExecution(
  items: BudgetItem[],
  entries: LedgerLike[]
): BudgetExecution {
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Executed amount per budget item id, split by movement group.
  const execByItem = new Map<string, number>();
  let otrosIngreso = 0;
  let otrosGasto = 0;
  let aportes = 0;
  let retiros = 0;

  for (const e of entries) {
    const amount = Math.max(0, Math.round(e.amount || 0));
    if (e.type === "fondo_aporte") {
      aportes += amount;
      continue;
    }
    if (e.type === "fondo_retiro") {
      retiros += amount;
      continue;
    }
    if (e.type !== "ingreso" && e.type !== "gasto") continue;

    const item = e.itemId ? itemById.get(e.itemId) : undefined;
    // Only apply to the matching item when its group matches the movement type.
    if (item && item.group === e.type) {
      execByItem.set(item.id, (execByItem.get(item.id) || 0) + amount);
    } else if (e.type === "ingreso") {
      otrosIngreso += amount;
    } else {
      otrosGasto += amount;
    }
  }

  const mkRow = (item: BudgetItem): ExecutionRow => {
    const executed = execByItem.get(item.id) || 0;
    return {
      id: item.id,
      concept: item.concept,
      group: item.group,
      budgeted: item.budgeted,
      executed,
      pct: item.budgeted > 0 ? Math.round((executed / item.budgeted) * 100) : 0,
      remaining: item.budgeted - executed,
    };
  };

  const ingresoRows = items.filter((i) => i.group === "ingreso").map(mkRow);
  const gastoRows = items.filter((i) => i.group === "gasto").map(mkRow);

  if (otrosIngreso > 0) {
    ingresoRows.push({
      id: "otros-ingreso",
      concept: "Otros ingresos (sin rubro)",
      group: "ingreso",
      budgeted: 0,
      executed: otrosIngreso,
      pct: 0,
      remaining: -otrosIngreso,
    });
  }
  if (otrosGasto > 0) {
    gastoRows.push({
      id: "otros-gasto",
      concept: "Otros gastos (sin rubro)",
      group: "gasto",
      budgeted: 0,
      executed: otrosGasto,
      pct: 0,
      remaining: -otrosGasto,
    });
  }

  const sum = (rows: ExecutionRow[], key: "budgeted" | "executed") =>
    rows.reduce((s, r) => s + r[key], 0);

  const ingresos: GroupExecution = {
    rows: ingresoRows,
    budgeted: sum(ingresoRows, "budgeted"),
    executed: sum(ingresoRows, "executed"),
  };
  const gastos: GroupExecution = {
    rows: gastoRows,
    budgeted: sum(gastoRows, "budgeted"),
    executed: sum(gastoRows, "executed"),
  };

  const required = Math.round(gastos.budgeted * 0.01);
  const balance = aportes - retiros;
  const fondo: FundStatus = {
    required,
    aportes,
    retiros,
    balance,
    compliant: balance >= required,
  };

  return {
    ingresos,
    gastos,
    fondo,
    resultado: ingresos.executed - gastos.executed,
  };
}

/** True when a ledger type is a fund movement (kept out of P&L execution). */
export function isFondoType(type: string): boolean {
  return FONDO_TYPES.has(type);
}

/** A ready-to-edit starter chart of accounts for a Colombian PH budget. */
export function defaultBudgetItems(makeId: (n: number) => string): BudgetItem[] {
  const ingresos = ["Cuotas de administración", "Cuotas extraordinarias", "Intereses de mora", "Zonas comunes / salón social", "Parqueaderos visitantes"];
  const gastos = [
    "Vigilancia y seguridad",
    "Aseo y cafetería",
    "Servicios públicos zonas comunes",
    "Mantenimiento de ascensores",
    "Mantenimiento general y reparaciones",
    "Administración (honorarios)",
    "Contador / revisor fiscal",
    "Seguros (póliza zonas comunes)",
    "Jardinería y zonas verdes",
    "Papelería y gastos de oficina",
  ];
  let n = 0;
  return [
    ...ingresos.map((concept) => ({ id: makeId(n++), concept, group: "ingreso" as const, budgeted: 0 })),
    ...gastos.map((concept) => ({ id: makeId(n++), concept, group: "gasto" as const, budgeted: 0 })),
  ];
}

/** Validate & normalize budget items coming from the client. */
export function sanitizeBudgetItems(raw: unknown): BudgetItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BudgetItem[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 200)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id.slice(0, 40) : null;
    const concept = typeof o.concept === "string" ? o.concept.trim().slice(0, 120) : "";
    const group: BudgetGroup = o.group === "ingreso" ? "ingreso" : "gasto";
    const budgeted = Math.max(0, Math.round(Number(o.budgeted) || 0));
    if (!id || !concept || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, concept, group, budgeted });
  }
  return out;
}
