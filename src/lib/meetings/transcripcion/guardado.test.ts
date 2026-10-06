import { describe, expect, it } from "vitest";
import { leerReferenciasElegidas, leerResultadoDeTramo, leerSegmentosGuardados, tramoDeResultado } from "./guardado";

describe("leerSegmentosGuardados", () => {
  it("lee los segmentos y descarta lo que no cuadra", () => {
    expect(
      leerSegmentosGuardados([
        { inicioMs: 1, finMs: 2, hablante: "A", texto: "hola" },
        { inicioMs: "1", finMs: 2, hablante: "A", texto: "mal" },
        { inicioMs: 1, finMs: 2, hablante: 7, texto: "mal" },
        { inicioMs: 1, finMs: Number.NaN, hablante: "A", texto: "mal" },
        null,
        "x",
      ]),
    ).toEqual([{ inicioMs: 1, finMs: 2, hablante: "A", texto: "hola" }]);
    expect(leerSegmentosGuardados(null)).toEqual([]);
    expect(leerSegmentosGuardados({})).toEqual([]);
  });
});

describe("leerResultadoDeTramo", () => {
  const bueno = { i: 2, desdeMs: 1, hastaMs: 9, nucleoDesdeMs: 2, nucleoHastaMs: 8, segmentos: [{ inicioMs: 0, finMs: 1, hablante: "A", texto: "x" }], costoUsd: 0.06, proveedor: "openai" };

  it("lee un resultado completo", () => {
    expect(leerResultadoDeTramo(bueno)).toEqual({ ...bueno, omitido: undefined });
    expect(leerResultadoDeTramo({ ...bueno, omitido: "dura menos de un segundo" })?.omitido).toBe("dura menos de un segundo");
  });

  it("si falta algún tiempo no es legible; lo opcional tiene valores por omisión", () => {
    expect(leerResultadoDeTramo({ ...bueno, nucleoHastaMs: undefined })).toBeNull();
    expect(leerResultadoDeTramo({ basura: true })).toBeNull();
    expect(leerResultadoDeTramo(null)).toBeNull();
    expect(leerResultadoDeTramo([])).toBeNull();
    expect(leerResultadoDeTramo({ ...bueno, costoUsd: "x", proveedor: 5, segmentos: "no" })).toMatchObject({ costoUsd: 0, proveedor: "desconocido", segmentos: [] });
  });

  it("de un resultado sale el tramo que se transcribió", () => {
    const r = leerResultadoDeTramo(bueno)!;
    expect(tramoDeResultado(r)).toEqual({ i: 2, desdeMs: 1, hastaMs: 9, nucleoDesdeMs: 2, nucleoHastaMs: 8 });
  });
});

describe("leerReferenciasElegidas", () => {
  const r = (nombre: string, extra: Record<string, unknown> = {}) => ({ nombre, etiquetaLocal: "A", desdeMs: 1000, hastaMs: 6000, ...extra });

  it("lee V1…V4 y descarta lo demás", () => {
    expect(leerReferenciasElegidas([r("V1"), r("V2")])).toHaveLength(2);
    expect(leerReferenciasElegidas([r("V5"), r("H5"), r("v1"), r("V1", { hastaMs: 1000 }), r("V1", { etiquetaLocal: 3 }), null])).toEqual([]);
  });

  it("no repite nombres y no pasa de cuatro", () => {
    expect(leerReferenciasElegidas([r("V1"), r("V1", { desdeMs: 5 })])).toHaveLength(1);
    expect(leerReferenciasElegidas([r("V1"), r("V2"), r("V3"), r("V4"), r("V4", { desdeMs: 0 })])).toHaveLength(4);
  });

  it("lo que no es una lista es una lista vacía", () => {
    expect(leerReferenciasElegidas(null)).toEqual([]);
    expect(leerReferenciasElegidas({ nombre: "V1" })).toEqual([]);
  });
});
