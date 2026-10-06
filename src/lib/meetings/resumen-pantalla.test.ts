/** Lo que la pestaña «Resumen» decide con la ficha: estado, cifras, párrafos, minutos y votos. */
import { describe, expect, it } from "vitest";
import { FICHA_SEPTIEMBRE } from "./demo-datos";
import type { Ficha } from "./dto";
import {
  cifrasDeResumen, enOrdenDeMinuto, estadoDelResumen, fichaTieneHallazgos, minutoDeHallazgo, ordenDelDiaEnOrden, parrafosDeResumen,
  sePuedeReintentarElResumen, textoDeVotos,
} from "./resumen-pantalla";

const fichaVacia = (extra: Partial<Ficha> = {}): Ficha => ({ resumen: "", ordenDelDia: [], asistentes: [], decisiones: [], compromisos: [], votaciones: [], pendientes: [], hablantes: [], ...extra });

describe("estadoDelResumen", () => {
  it("con resumen: completo, aunque haya quedado un aviso", () => {
    expect(estadoDelResumen({ errorMessage: null }, FICHA_SEPTIEMBRE)).toBe("completo");
    expect(estadoDelResumen({ errorMessage: "algo" }, FICHA_SEPTIEMBRE)).toBe("completo");
  });

  it("con resumen pero con fragmentos que la IA no pudo analizar: parcial (se puede completar)", () => {
    expect(estadoDelResumen({ errorMessage: null }, { resumen: "Se aprobó el presupuesto.", fragmentosOmitidos: 2 })).toBe("parcial");
    expect(estadoDelResumen({ errorMessage: null }, { resumen: "Se aprobó el presupuesto.", fragmentosOmitidos: 0 })).toBe("completo");
    expect(estadoDelResumen({ errorMessage: null }, { resumen: "Se aprobó el presupuesto." })).toBe("completo");
    // sin resumen, los fragmentos omitidos no cambian que falló
    expect(estadoDelResumen({ errorMessage: "x" }, { resumen: "", fragmentosOmitidos: 3 })).toBe("fallo");
  });

  it("sin resumen y con el aviso de que la IA falló: fallo (se puede reintentar)", () => {
    expect(estadoDelResumen({ errorMessage: "El resumen con IA no se pudo generar." }, fichaVacia({ decisiones: [{ id: "D1", texto: "x", t: 1 }] }))).toBe("fallo");
    expect(estadoDelResumen({ errorMessage: "No pudimos generar el resumen con IA: sin saldo." }, null)).toBe("fallo");
    expect(estadoDelResumen({ errorMessage: "x" }, fichaVacia({ resumen: "   " }))).toBe("fallo");
  });

  it("ficha sin resumen y sin aviso: no había nada que resumir; sin ficha ni aviso: muy corta", () => {
    expect(estadoDelResumen({ errorMessage: null }, fichaVacia({ pendientes: ["No se identificaron temas."] }))).toBe("sin_contenido");
    expect(estadoDelResumen({ errorMessage: null }, null)).toBe("corta");
  });

  it("solo cuando algo falló se puede volver a pedir: el fallo y lo parcial", () => {
    expect(sePuedeReintentarElResumen("fallo")).toBe(true);
    expect(sePuedeReintentarElResumen("parcial")).toBe(true);
    for (const e of ["completo", "sin_contenido", "corta"] as const) expect(sePuedeReintentarElResumen(e)).toBe(false);
  });
});

describe("parrafosDeResumen", () => {
  it("separa en las líneas en blanco, junta los saltos sueltos y descarta lo vacío", () => {
    expect(parrafosDeResumen("Primero.\n\nSegundo   párrafo\ncon salto.\n \n\n  Tercero.  ")).toEqual(["Primero.", "Segundo párrafo con salto.", "Tercero."]);
    expect(parrafosDeResumen("")).toEqual([]);
    expect(parrafosDeResumen("  \n\n ")).toEqual([]);
    expect(parrafosDeResumen("Uno solo.")).toEqual(["Uno solo."]);
  });
});

describe("minutoDeHallazgo", () => {
  it("las horas van sin cero a la izquierda y negativos o raros no rompen", () => {
    expect(minutoDeHallazgo(490)).toBe("0:08:10");
    expect(minutoDeHallazgo(3930)).toBe("1:05:30");
    expect(minutoDeHallazgo(0)).toBe("0:00:00");
    expect(minutoDeHallazgo(-5)).toBe("0:00:00");
    expect(minutoDeHallazgo(8 * 3600 + 12 * 60)).toBe("8:12:00");
  });
});

describe("cifrasDeResumen", () => {
  it("con ficha: duración, participantes de la ficha, decisiones y compromisos", () => {
    expect(cifrasDeResumen(8_040_000, FICHA_SEPTIEMBRE, [{ label: "V1" }])).toEqual([
      { clave: "duracion", etiqueta: "Duración", cifra: "2 h 14 min" },
      { clave: "participantes", etiqueta: "Participantes", cifra: "5" },
      { clave: "decisiones", etiqueta: "Decisiones", cifra: "3" },
      { clave: "compromisos", etiqueta: "Compromisos", cifra: "6" },
    ]);
  });

  it("sin ficha (o sin asistentes en ella) cuenta las voces y las llama «Voces»", () => {
    const voces = [{ label: "V1" }, { label: "V2" }, { label: "H5" }];
    expect(cifrasDeResumen(3_600_000, null, voces).map((c) => [c.clave, c.etiqueta, c.cifra])).toEqual([
      ["duracion", "Duración", "1 h"], ["participantes", "Voces", "3"], ["decisiones", "Decisiones", "0"], ["compromisos", "Compromisos", "0"],
    ]);
    expect(cifrasDeResumen(null, fichaVacia(), voces)[1]).toMatchObject({ etiqueta: "Voces", cifra: "3" });
    expect(cifrasDeResumen(null, fichaVacia(), voces)[0].cifra).toBe("—");
  });
});

describe("textoDeVotos", () => {
  it("dice solo lo que se dijo, con el plural de abstención", () => {
    expect(textoDeVotos({ aFavor: 3, enContra: 0, abstenciones: 0 })).toBe("3 a favor · 0 en contra · 0 abstenciones");
    expect(textoDeVotos({ aFavor: 5, enContra: 1, abstenciones: 1 })).toBe("5 a favor · 1 en contra · 1 abstención");
    expect(textoDeVotos({ aFavor: 4 })).toBe("4 a favor");
    expect(textoDeVotos({})).toBe("");
  });
});

describe("orden y hallazgos", () => {
  it("pone en orden de minuto lo que llegue desordenado, sin tocar la lista original", () => {
    const original = [{ t: 30, id: "b" }, { t: 5, id: "a" }, { t: 60, id: "c" }];
    expect(enOrdenDeMinuto(original).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(original.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(ordenDelDiaEnOrden([{ titulo: "B", inicioS: 100 }, { titulo: "A", inicioS: 1 }]).map((x) => x.titulo)).toEqual(["A", "B"]);
  });

  it("una ficha con algo más que el resumen tiene hallazgos", () => {
    expect(fichaTieneHallazgos(FICHA_SEPTIEMBRE)).toBe(true);
    expect(fichaTieneHallazgos(fichaVacia({ resumen: "solo texto" }))).toBe(false);
    expect(fichaTieneHallazgos(fichaVacia({ pendientes: ["x"] }))).toBe(true);
  });
});
