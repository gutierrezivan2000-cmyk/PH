// Cartera (accounts receivable) pure logic — no DB, fully unit-tested.
// Amounts are integer COP throughout.

export function fmtCOP(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

// ── Plan gating ─────────────────────────────────────────────────────────────
// Cartera is a Business/Élite capability. Beta testers keep full access and
// trial users get to taste it (trials convert on the best features); a paid
// Pro plan sees the upgrade path instead.
export function canUseCartera(accessStatus: string, plan: string | null): boolean {
  if (accessStatus === "beta" || accessStatus === "trialing") return true;
  return plan === "business" || plan === "elite";
}

// ── FIFO payment allocation ────────────────────────────────────────────────

export interface AllocatableCharge {
  id: string;
  amount: number;
  paidAmount: number;
}

export interface Allocation {
  chargeId: string;
  amount: number;
}

/**
 * Apply a payment to charges oldest-first (caller passes them sorted by
 * dueDate asc). Returns per-charge allocations and any unapplied leftover
 * (saldo a favor). Skips fully-paid charges; never over-applies.
 */
export function allocateFifo(
  charges: AllocatableCharge[],
  paymentAmount: number
): { allocations: Allocation[]; leftover: number } {
  const allocations: Allocation[] = [];
  let remaining = Math.max(0, Math.round(paymentAmount));
  for (const c of charges) {
    if (remaining <= 0) break;
    const open = c.amount - c.paidAmount;
    if (open <= 0) continue;
    const apply = Math.min(open, remaining);
    allocations.push({ chargeId: c.id, amount: apply });
    remaining -= apply;
  }
  return { allocations, leftover: remaining };
}

// ── Unit summary / aging ────────────────────────────────────────────────────

export interface ChargeLike {
  amount: number;
  paidAmount: number;
  dueDate: Date | string;
}

export interface UnitSummary {
  charged: number;
  paid: number;
  /** charged - paid: positive = owes, negative = saldo a favor. */
  balance: number;
  /** Sum of unpaid amounts already past due. */
  overdueAmount: number;
  /** Days since the OLDEST overdue charge (0 when nothing is overdue). */
  overdueDays: number;
}

export function computeUnitSummary(
  charges: ChargeLike[],
  paymentsTotal: number,
  today: Date
): UnitSummary {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let charged = 0;
  let overdueAmount = 0;
  let oldestOverdue: Date | null = null;

  for (const c of charges) {
    charged += c.amount;
    const open = c.amount - c.paidAmount;
    if (open <= 0) continue;
    const due = new Date(c.dueDate);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    if (dueDay.getTime() < base.getTime()) {
      overdueAmount += open;
      if (!oldestOverdue || dueDay < oldestOverdue) oldestOverdue = dueDay;
    }
  }

  const overdueDays = oldestOverdue
    ? Math.round((base.getTime() - oldestOverdue.getTime()) / 86400000)
    : 0;

  return {
    charged,
    paid: paymentsTotal,
    balance: charged - paymentsTotal,
    overdueAmount,
    overdueDays,
  };
}

/** Standard aging bucket for reports: 0 = current, then 1-30/31-60/61-90/90+. */
export function agingBucket(overdueDays: number): "al_dia" | "d30" | "d60" | "d90" | "d90plus" {
  if (overdueDays <= 0) return "al_dia";
  if (overdueDays <= 30) return "d30";
  if (overdueDays <= 60) return "d60";
  if (overdueDays <= 90) return "d90";
  return "d90plus";
}

export const AGING_LABELS: Record<ReturnType<typeof agingBucket>, string> = {
  al_dia: "Al día",
  d30: "1-30 días",
  d60: "31-60 días",
  d90: "61-90 días",
  d90plus: "+90 días",
};

// ── Bulk-import token parsing (units) ───────────────────────────────────────

/**
 * Interpret a non-email token from a pasted unit line as money/coefficient:
 * - "350.000" / "$350.000" / "350000" (>= 1000) → monthlyFee (COP)
 * - "1,25" / "0.85" / "2" (< 100)               → coeficiente (%)
 * Returns null when the token is plain text (label/name).
 */
export function parseNumericToken(
  raw: string
): { kind: "fee" | "coef"; value: number } | null {
  const t = raw.trim().replace(/^\$/, "").replace(/\s/g, "");
  if (!t) return null;
  // Colombian thousands format: 1.234.567 (dots) — treat as integer fee.
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    return { kind: "fee", value: parseInt(t.replace(/\./g, ""), 10) };
  }
  if (!/^\d+([.,]\d+)?$/.test(t)) return null;
  const value = parseFloat(t.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  if (Number.isInteger(value) && value >= 1000) return { kind: "fee", value };
  if (value > 0 && value < 100) return { kind: "coef", value };
  return null;
}
