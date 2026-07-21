import { describe, expect, it } from "vitest";
import {
  daysUntil,
  generateAutoItems,
  monthlyReportItem,
  parseFeatures,
  addBusinessDays,
  assemblyItems,
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

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    // Friday 2026-07-17 + 1 business day = Monday 2026-07-20
    const r = addBusinessDays(new Date(2026, 6, 17), 1);
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 6, 20]);
  });
  it("computes 20 business days = 4 calendar weeks", () => {
    // Wednesday 2026-03-25 + 20 business days = Wednesday 2026-04-22
    const r = addBusinessDays(new Date(2026, 2, 25), 20);
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 3, 22]);
  });
});

describe("assemblyItems", () => {
  const base = {
    id: "asm1",
    type: "ordinaria",
    date: new Date(2026, 2, 25, 19, 0), // Wed Mar 25 2026, 7pm
    status: "convocada",
    convokedAt: null as Date | null,
    actaReadyAt: null as Date | null,
  };

  it("before the meeting: only the convocatoria item, due 15 days ahead", () => {
    const items = assemblyItems(base, new Date(2026, 2, 1));
    const keys = items.map((i) => i.key);
    expect(keys).toContain("asamblea-conv-asm1");
    expect(keys).not.toContain("asamblea-acta-asm1");
    const conv = items.find((i) => i.key === "asamblea-conv-asm1")!;
    expect(conv.dueDate).toBe("2026-03-10"); // Mar 25 - 15 días calendario
    expect(conv.autoDone).toBe(false);
  });

  it("convocatoria marks auto-done once convokedAt is set", () => {
    const items = assemblyItems(
      { ...base, convokedAt: new Date(2026, 2, 5) },
      new Date(2026, 2, 6)
    );
    expect(items.find((i) => i.key === "asamblea-conv-asm1")!.autoDone).toBe(true);
  });

  it("after the meeting: acta due in 20 business days + impugnación in 2 months", () => {
    const items = assemblyItems(base, new Date(2026, 3, 1));
    const acta = items.find((i) => i.key === "asamblea-acta-asm1")!;
    const impug = items.find((i) => i.key === "asamblea-impug-asm1")!;
    expect(acta.dueDate).toBe("2026-04-22"); // 20 días hábiles desde Mar 25
    expect(impug.dueDate).toBe("2026-05-25"); // 2 meses
    expect(acta.autoDone).toBe(false);
  });

  it("acta item auto-done when actaReadyAt is set", () => {
    const items = assemblyItems(
      { ...base, status: "realizada", actaReadyAt: new Date(2026, 3, 2) },
      new Date(2026, 3, 3)
    );
    expect(items.find((i) => i.key === "asamblea-acta-asm1")!.autoDone).toBe(true);
  });

  it("extraordinaria has no 15-day convocatoria item", () => {
    const items = assemblyItems(
      { ...base, type: "extraordinaria" },
      new Date(2026, 2, 1)
    );
    expect(items.some((i) => i.key.startsWith("asamblea-conv"))).toBe(false);
  });

  it("cancelled assemblies produce nothing", () => {
    expect(assemblyItems({ ...base, status: "cancelada" }, new Date(2026, 2, 1))).toEqual([]);
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
