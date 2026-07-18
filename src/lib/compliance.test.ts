import { describe, expect, it } from "vitest";
import {
  daysUntil,
  generateAutoItems,
  monthlyReportItem,
  parseFeatures,
} from "./compliance";

// Fixed reference date: 2026-07-18 (mid-July).
const TODAY = new Date(2026, 6, 18);

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    expect(daysUntil("2026-07-18", TODAY)).toBe(0);
  });
  it("returns positive days for future dates", () => {
    expect(daysUntil("2026-07-25", TODAY)).toBe(7);
  });
  it("returns negative days for past dates", () => {
    expect(daysUntil("2026-07-10", TODAY)).toBe(-8);
  });
  it("ignores the time-of-day of the reference date", () => {
    const lateNight = new Date(2026, 6, 18, 23, 59);
    expect(daysUntil("2026-07-19", lateNight)).toBe(1);
  });
});

describe("generateAutoItems — base obligations", () => {
  it("always includes asamblea (Mar 31) and presupuesto (Dec 15) in window", () => {
    const items = generateAutoItems({}, TODAY);
    const keys = items.map((i) => i.key);
    // July 2026: asamblea-2026 (Mar 31) is 109 days past → within 180-day window.
    expect(keys).toContain("asamblea-2026");
    expect(keys).toContain("presupuesto-2026");
    // asamblea-2027 (Mar 31 2027) is ~256 days ahead → within 365-day window.
    expect(keys).toContain("asamblea-2027");
    // 2025 items are more than 180 days past → excluded.
    expect(keys).not.toContain("asamblea-2025");
    expect(keys).not.toContain("presupuesto-2025");
  });

  it("emits no equipment items without features", () => {
    const items = generateAutoItems({}, TODAY);
    expect(items.some((i) => i.key.startsWith("ascensor"))).toBe(false);
    expect(items.some((i) => i.key.startsWith("piscina"))).toBe(false);
    expect(items.some((i) => i.key.startsWith("planta"))).toBe(false);
    expect(items.some((i) => i.key.startsWith("sgsst"))).toBe(false);
    expect(items.some((i) => i.key.startsWith("poliza"))).toBe(false);
  });

  it("handles null/undefined features", () => {
    expect(generateAutoItems(null, TODAY).length).toBeGreaterThan(0);
    expect(generateAutoItems(undefined, TODAY).length).toBeGreaterThan(0);
  });
});

describe("generateAutoItems — feature-driven obligations", () => {
  it("adds annual elevator certification when ascensor=true", () => {
    const items = generateAutoItems({ ascensor: true }, TODAY);
    const item = items.find((i) => i.key === "ascensor-2026");
    expect(item).toBeDefined();
    expect(item!.dueDate).toBe("2026-12-31");
    expect(item!.category).toBe("mantenimiento");
  });

  it("adds pool compliance when piscina=true", () => {
    const items = generateAutoItems({ piscina: true }, TODAY);
    expect(items.find((i) => i.key === "piscina-2026")).toBeDefined();
  });

  it("adds two semiannual power-plant items when plantaElectrica=true", () => {
    const items = generateAutoItems({ plantaElectrica: true }, TODAY);
    const s1 = items.find((i) => i.key === "planta-2026-s1");
    const s2 = items.find((i) => i.key === "planta-2026-s2");
    // s1 (Jun 30) is 18 days past → visible as overdue; s2 due Dec 31.
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s1!.dueDate).toBe("2026-06-30");
    expect(s2!.dueDate).toBe("2026-12-31");
  });

  it("adds SG-SST self-assessment when empleadosDirectos=true", () => {
    const items = generateAutoItems({ empleadosDirectos: true }, TODAY);
    const item = items.find((i) => i.key === "sgsst-2026");
    expect(item).toBeDefined();
    expect(item!.category).toBe("sgsst");
  });

  it("generates yearly insurance renewal anchored to the expiry month/day", () => {
    const items = generateAutoItems({ polizaVence: "2026-09-15" }, TODAY);
    const item = items.find((i) => i.key === "poliza-2026");
    expect(item).toBeDefined();
    expect(item!.dueDate).toBe("2026-09-15");
    // Next year's renewal is within the 365-day window (Sep 2027 > Jul 2027 → out).
    // 2027-09-15 is 424 days away → excluded by the window.
    expect(items.find((i) => i.key === "poliza-2027")).toBeUndefined();
  });

  it("clamps the insurance day to short months (Jan 31 → Feb never overflows)", () => {
    // Anniversary Feb 29 in a non-leap year must clamp to Feb 28.
    const items = generateAutoItems({ polizaVence: "2024-02-29" }, new Date(2026, 0, 10));
    const item = items.find((i) => i.key === "poliza-2026");
    expect(item).toBeDefined();
    expect(item!.dueDate).toBe("2026-02-28");
  });

  it("ignores malformed polizaVence values", () => {
    const items = generateAutoItems({ polizaVence: "no-es-fecha" }, TODAY);
    expect(items.some((i) => i.key.startsWith("poliza"))).toBe(false);
  });
});

describe("monthlyReportItem", () => {
  it("targets the current month with due date at month end", () => {
    const item = monthlyReportItem(TODAY);
    expect(item.key).toBe("informe-2026-7");
    expect(item.dueDate).toBe("2026-07-31");
    expect(item.category).toBe("informe");
  });

  it("handles February month-end", () => {
    const item = monthlyReportItem(new Date(2026, 1, 5));
    expect(item.dueDate).toBe("2026-02-28");
  });
});

describe("parseFeatures", () => {
  it("returns empty profile for null/garbage input", () => {
    expect(parseFeatures(null)).toEqual({});
    expect(parseFeatures("x")).toEqual({});
    expect(parseFeatures([1, 2])).toEqual({});
    expect(parseFeatures("x").ascensor).toBeFalsy();
  });

  it("keeps only well-formed values", () => {
    const parsed = parseFeatures({
      ascensor: true,
      piscina: "yes", // not a boolean → false
      polizaVence: "2026-05-01",
    });
    expect(parsed.ascensor).toBe(true);
    expect(parsed.piscina).toBe(false);
    expect(parsed.polizaVence).toBe("2026-05-01");
  });

  it("rejects malformed dates", () => {
    expect(parseFeatures({ polizaVence: "01/05/2026" }).polizaVence).toBeNull();
  });
});
