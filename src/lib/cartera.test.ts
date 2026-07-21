import { describe, expect, it } from "vitest";
import {
  fmtCOP,
  canUseCartera,
  allocateFifo,
  computeUnitSummary,
  agingBucket,
  parseNumericToken,
} from "./cartera";

describe("fmtCOP", () => {
  it("formats with es-CO thousands separators", () => {
    expect(fmtCOP(350000)).toBe("$350.000");
    expect(fmtCOP(0)).toBe("$0");
    expect(fmtCOP(1234567.6)).toBe("$1.234.568");
  });
});

describe("canUseCartera (plan gate)", () => {
  it("beta and trialing always pass", () => {
    expect(canUseCartera("beta", null)).toBe(true);
    expect(canUseCartera("trialing", "pro")).toBe(true);
  });
  it("paid plans: business/elite yes, pro no", () => {
    expect(canUseCartera("active", "business")).toBe(true);
    expect(canUseCartera("active", "elite")).toBe(true);
    expect(canUseCartera("active", "pro")).toBe(false);
    expect(canUseCartera("active", null)).toBe(false);
  });
  it("grace period follows the plan", () => {
    expect(canUseCartera("grace", "business")).toBe(true);
    expect(canUseCartera("grace", "pro")).toBe(false);
  });
});

describe("allocateFifo", () => {
  const charges = [
    { id: "a", amount: 100, paidAmount: 0 },
    { id: "b", amount: 200, paidAmount: 50 },
    { id: "c", amount: 300, paidAmount: 300 }, // fully paid — must be skipped
    { id: "d", amount: 400, paidAmount: 0 },
  ];

  it("applies oldest-first and stops when exhausted", () => {
    const { allocations, leftover } = allocateFifo(charges, 180);
    expect(allocations).toEqual([
      { chargeId: "a", amount: 100 },
      { chargeId: "b", amount: 80 },
    ]);
    expect(leftover).toBe(0);
  });

  it("skips fully-paid charges and spills into later ones", () => {
    const { allocations } = allocateFifo(charges, 300);
    expect(allocations).toEqual([
      { chargeId: "a", amount: 100 },
      { chargeId: "b", amount: 150 },
      { chargeId: "d", amount: 50 },
    ]);
  });

  it("returns leftover as credit when payment exceeds all open charges", () => {
    const { allocations, leftover } = allocateFifo(charges, 1000);
    expect(allocations).toEqual([
      { chargeId: "a", amount: 100 },
      { chargeId: "b", amount: 150 },
      { chargeId: "d", amount: 400 },
    ]);
    expect(leftover).toBe(350);
  });

  it("handles zero/negative payments and empty charge lists", () => {
    expect(allocateFifo(charges, 0)).toEqual({ allocations: [], leftover: 0 });
    expect(allocateFifo(charges, -50)).toEqual({ allocations: [], leftover: 0 });
    expect(allocateFifo([], 500)).toEqual({ allocations: [], leftover: 500 });
  });

  it("never over-applies on exact amounts", () => {
    const { allocations, leftover } = allocateFifo(
      [{ id: "x", amount: 100, paidAmount: 0 }],
      100
    );
    expect(allocations).toEqual([{ chargeId: "x", amount: 100 }]);
    expect(leftover).toBe(0);
  });
});

describe("computeUnitSummary", () => {
  const today = new Date(2026, 6, 20); // Jul 20 2026

  it("computes balance from totals (credit shows as negative)", () => {
    const s = computeUnitSummary(
      [{ amount: 300, paidAmount: 300, dueDate: new Date(2026, 5, 10) }],
      400,
      today
    );
    expect(s.charged).toBe(300);
    expect(s.paid).toBe(400);
    expect(s.balance).toBe(-100);
    expect(s.overdueAmount).toBe(0);
  });

  it("tracks overdue amount and days from the oldest overdue charge", () => {
    const s = computeUnitSummary(
      [
        { amount: 100, paidAmount: 0, dueDate: new Date(2026, 4, 10) }, // May 10 → 71d
        { amount: 100, paidAmount: 40, dueDate: new Date(2026, 5, 10) }, // Jun 10 → 40d, open 60
        { amount: 100, paidAmount: 0, dueDate: new Date(2026, 7, 10) }, // future
      ],
      40,
      today
    );
    expect(s.overdueAmount).toBe(160);
    expect(s.overdueDays).toBe(71);
    expect(s.balance).toBe(260);
  });

  it("a charge due today is not overdue yet", () => {
    const s = computeUnitSummary(
      [{ amount: 100, paidAmount: 0, dueDate: new Date(2026, 6, 20, 8) }],
      0,
      today
    );
    expect(s.overdueAmount).toBe(0);
    expect(s.overdueDays).toBe(0);
  });
});

describe("agingBucket", () => {
  it("buckets by days overdue", () => {
    expect(agingBucket(0)).toBe("al_dia");
    expect(agingBucket(1)).toBe("d30");
    expect(agingBucket(30)).toBe("d30");
    expect(agingBucket(31)).toBe("d60");
    expect(agingBucket(60)).toBe("d60");
    expect(agingBucket(90)).toBe("d90");
    expect(agingBucket(91)).toBe("d90plus");
  });
});

describe("parseNumericToken (bulk import)", () => {
  it("parses Colombian thousands format as fee", () => {
    expect(parseNumericToken("350.000")).toEqual({ kind: "fee", value: 350000 });
    expect(parseNumericToken("$1.250.000")).toEqual({ kind: "fee", value: 1250000 });
  });
  it("parses plain integers >= 1000 as fee", () => {
    expect(parseNumericToken("350000")).toEqual({ kind: "fee", value: 350000 });
  });
  it("parses small decimals as coeficiente", () => {
    expect(parseNumericToken("1,25")).toEqual({ kind: "coef", value: 1.25 });
    expect(parseNumericToken("0.85")).toEqual({ kind: "coef", value: 0.85 });
    expect(parseNumericToken("2")).toEqual({ kind: "coef", value: 2 });
  });
  it("rejects plain text and ambiguous values", () => {
    expect(parseNumericToken("Apto 101")).toBeNull();
    expect(parseNumericToken("María Pérez")).toBeNull();
    expect(parseNumericToken("")).toBeNull();
    // 100-999: ambiguous (too big for coef, too small for a fee) → text
    expect(parseNumericToken("500")).toBeNull();
  });
});
