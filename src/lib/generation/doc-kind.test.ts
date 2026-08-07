import { describe, it, expect } from "vitest";
import {
  normalizeDocSelection,
  toDocFlags,
  docSelectionFromTypes,
  docTypesFromSelection,
} from "./doc-kind";

describe("normalizeDocSelection", () => {
  it("respeta docKind explícito", () => {
    expect(normalizeDocSelection({ docKind: "acta" }).kind).toBe("acta");
    expect(normalizeDocSelection({ docKind: "informe" }).kind).toBe("informe");
  });

  it("cae en informe cuando no se especifica nada", () => {
    expect(normalizeDocSelection({}).kind).toBe("informe");
  });

  it("ignora un docKind desconocido y usa informe", () => {
    expect(normalizeDocSelection({ docKind: "pptx" }).kind).toBe("informe");
    expect(normalizeDocSelection({ docKind: 42 }).kind).toBe("informe");
  });

  it("descarta la presentación cuando el documento es un acta", () => {
    // Un acta no tiene diapositivas: pedir ambas cosas no debe colar el PPTX.
    const sel = normalizeDocSelection({ docKind: "acta", includePptx: true });
    expect(sel).toEqual({ kind: "acta", includePptx: false });
  });

  it("acepta la presentación junto al informe", () => {
    expect(normalizeDocSelection({ docKind: "informe", includePptx: true })).toEqual({
      kind: "informe",
      includePptx: true,
    });
  });

  describe("compatibilidad con los booleanos antiguos", () => {
    it("deduce acta desde includeActa", () => {
      expect(normalizeDocSelection({ includeActa: true, includeInforme: false }).kind).toBe("acta");
    });

    it("deduce informe desde includeInforme", () => {
      expect(normalizeDocSelection({ includeInforme: true }).kind).toBe("informe");
    });

    it("resuelve a informe cuando la petición antigua pide los dos", () => {
      // Es lo que enviaban los clientes previos al cambio; nunca debe generar ambos.
      const sel = normalizeDocSelection({ includeInforme: true, includeActa: true });
      expect(sel.kind).toBe("informe");
      expect(toDocFlags(sel).includeActa).toBe(false);
    });
  });
});

describe("toDocFlags", () => {
  it("nunca marca informe y acta a la vez", () => {
    for (const input of [
      { docKind: "informe" as const },
      { docKind: "acta" as const },
      { includeInforme: true, includeActa: true },
      {},
    ]) {
      const flags = toDocFlags(normalizeDocSelection(input));
      expect(flags.includeInforme && flags.includeActa).toBe(false);
      expect(flags.includeInforme || flags.includeActa).toBe(true);
    }
  });

  it("no marca pptx junto al acta", () => {
    const flags = toDocFlags(normalizeDocSelection({ docKind: "acta", includePptx: true }));
    expect(flags).toEqual({ includeInforme: false, includeActa: true, includePptx: false });
  });
});

describe("docSelectionFromTypes", () => {
  it("devuelve null cuando no se pide ningún documento", () => {
    expect(docSelectionFromTypes([])).toBeNull();
    expect(docSelectionFromTypes(["pptx"])).toBeNull();
    expect(docSelectionFromTypes(undefined)).toBeNull();
  });

  it("prioriza el informe cuando un lote antiguo pedía ambos", () => {
    expect(docSelectionFromTypes(["informe", "acta", "pptx"])).toEqual({
      kind: "informe",
      includePptx: true,
    });
  });

  it("respeta un lote de solo actas y le quita el pptx", () => {
    expect(docSelectionFromTypes(["acta", "pptx"])).toEqual({ kind: "acta", includePptx: false });
  });
});

describe("docTypesFromSelection", () => {
  it("va y vuelve sin perder información", () => {
    for (const sel of [
      { kind: "informe" as const, includePptx: true },
      { kind: "informe" as const, includePptx: false },
      { kind: "acta" as const, includePptx: false },
    ]) {
      expect(docSelectionFromTypes(docTypesFromSelection(sel))).toEqual(sel);
    }
  });
});
