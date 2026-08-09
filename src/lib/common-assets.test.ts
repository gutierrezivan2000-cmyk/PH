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
  // `now` fijo para que las pruebas no dependan del día en que se ejecuten.
  const ANTES = new Date(2020, 0, 1);
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("suma meses preservando el día", () => {
    expect(ymd(advanceDueDate(new Date(2026, 0, 15), 3, ANTES))).toBe("2026-04-15");
  });

  it("cruza el año correctamente", () => {
    expect(ymd(advanceDueDate(new Date(2026, 10, 1), 12, ANTES))).toBe("2027-11-01");
  });

  it("no muta la fecha original", () => {
    const original = new Date(2026, 0, 15);
    const copy = new Date(original);
    advanceDueDate(original, 3, ANTES);
    expect(original.getTime()).toBe(copy.getTime());
  });

  describe("no desborda al final de mes", () => {
    // Date.setMonth desbordaba: 31 ene + 1 mes daba 3 de MARZO, saltándose
    // febrero entero, y 31 ago + 1 mes daba 1 de octubre.
    it("31 de enero + 1 mes cae en el último día de febrero, no en marzo", () => {
      expect(ymd(advanceDueDate(new Date(2026, 0, 31), 1, ANTES))).toBe("2026-02-28");
    });

    it("respeta el año bisiesto", () => {
      expect(ymd(advanceDueDate(new Date(2028, 0, 31), 1, ANTES))).toBe("2028-02-29");
    });

    it("31 de agosto + 1 mes cae el 30 de septiembre, no el 1 de octubre", () => {
      expect(ymd(advanceDueDate(new Date(2026, 7, 31), 1, ANTES))).toBe("2026-09-30");
    });

    it("la deriva tras un mes corto es de una sola vez y se estabiliza", () => {
      // Compromiso documentado en advanceDueDate: sin columna de ancla, el día
      // baja con el mes corto (31 -> 28) y ahí se queda. Lo que importa es que
      // el MES sea el correcto; antes saltaba a marzo saltándose febrero.
      const feb = advanceDueDate(new Date(2026, 0, 31), 1, ANTES);
      expect(ymd(feb)).toBe("2026-02-28");
      const mar = advanceDueDate(feb, 1, ANTES);
      expect(ymd(mar)).toBe("2026-03-28");
      // Estable a partir de aquí: no sigue bajando mes a mes.
      expect(ymd(advanceDueDate(mar, 1, ANTES))).toBe("2026-04-28");
    });
  });

  describe("alcanza siempre una fecha futura", () => {
    // Antes avanzaba un solo ciclo: un activo abandonado ocho meses seguía
    // vencido tras marcarlo "hecho", y había que pulsar ocho veces.
    it("salta todos los ciclos perdidos de una vez", () => {
      const hoy = new Date(2026, 7, 7);
      const abandonado = new Date(2025, 11, 15); // 8 meses atrás, mensual
      const next = advanceDueDate(abandonado, 1, hoy);
      expect(next.getTime()).toBeGreaterThan(hoy.getTime());
      expect(ymd(next)).toBe("2026-08-15");
    });

    it("con recurrencia anual salta los años perdidos", () => {
      const hoy = new Date(2026, 7, 7);
      const next = advanceDueDate(new Date(2023, 2, 10), 12, hoy);
      expect(ymd(next)).toBe("2027-03-10");
    });

    it("avanza un solo ciclo cuando el activo estaba al día", () => {
      const hoy = new Date(2026, 7, 7);
      expect(ymd(advanceDueDate(new Date(2026, 7, 20), 3, hoy))).toBe("2026-11-20");
    });
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
