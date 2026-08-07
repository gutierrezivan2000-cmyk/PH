import { describe, it, expect } from "vitest";
import {
  normalizeAssetKind,
  advanceDueDate,
  categoryForKind,
  defaultTitle,
  assetDescription,
  recurrenceLabel,
} from "./common-assets";

describe("normalizeAssetKind", () => {
  it("acepta poliza y todo lo demás cae en zona_comun", () => {
    expect(normalizeAssetKind("poliza")).toBe("poliza");
    expect(normalizeAssetKind("zona_comun")).toBe("zona_comun");
    expect(normalizeAssetKind("equipo")).toBe("zona_comun");
    expect(normalizeAssetKind(undefined)).toBe("zona_comun");
    expect(normalizeAssetKind(42)).toBe("zona_comun");
  });
});

describe("advanceDueDate", () => {
  it("suma meses preservando el día", () => {
    const d = advanceDueDate(new Date(2026, 0, 15), 3);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // abril (0-indexed)
    expect(d.getDate()).toBe(15);
  });

  it("cruza el año correctamente", () => {
    const d = advanceDueDate(new Date(2026, 10, 1), 12); // nov 2026 + 12 = nov 2027
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(10);
  });

  it("no muta la fecha original", () => {
    const original = new Date(2026, 0, 15);
    const copy = new Date(original);
    advanceDueDate(original, 3);
    expect(original.getTime()).toBe(copy.getTime());
  });
});

describe("categoryForKind", () => {
  it("mapea poliza y zona_comun a las categorías existentes del calendario", () => {
    expect(categoryForKind("poliza")).toBe("poliza");
    expect(categoryForKind("zona_comun")).toBe("mantenimiento");
    expect(categoryForKind("cualquier-otra-cosa")).toBe("mantenimiento");
  });
});

describe("defaultTitle", () => {
  it("distingue el título según el tipo", () => {
    expect(defaultTitle({ kind: "poliza", name: "Todo riesgo" })).toBe("Vencimiento: Todo riesgo");
    expect(defaultTitle({ kind: "zona_comun", name: "Ascensor" })).toBe("Mantenimiento: Ascensor");
  });
});

describe("assetDescription", () => {
  it("compone solo las partes presentes", () => {
    expect(assetDescription({ provider: null, reference: null, recurrenceMonths: null })).toBe("");
    expect(
      assetDescription({ provider: "Seguros Bolívar", reference: "POL-123", recurrenceMonths: 12 })
    ).toBe("Seguros Bolívar · Ref. POL-123 · cada 12 meses");
    expect(assetDescription({ provider: "ACME", reference: null, recurrenceMonths: null })).toBe("ACME");
  });

  it("usa singular cuando la recurrencia es de un mes", () => {
    expect(assetDescription({ provider: null, reference: null, recurrenceMonths: 1 })).toBe("cada mes");
  });
});

describe("recurrenceLabel", () => {
  it("singular para 1, plural para el resto", () => {
    expect(recurrenceLabel(1)).toBe("cada mes");
    expect(recurrenceLabel(3)).toBe("cada 3 meses");
    expect(recurrenceLabel(12)).toBe("cada 12 meses");
  });
});
