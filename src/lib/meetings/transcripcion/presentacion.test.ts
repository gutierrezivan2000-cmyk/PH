import { describe, expect, it } from "vitest";
import type { IntervencionDTO, MarcadorDTO } from "../dto";
import { NOMBRE_DE_MARCA, construirLinea, nombreDeHablante, textoDeMarca, textoDeSilencio } from "./presentacion";

const MIN = 60_000;
const H = 60 * MIN;
const u = (startMs: number, speaker = "V1", text = "texto"): IntervencionDTO => ({ id: `u${startMs}`, startMs, endMs: startMs + 1000, speaker, text });
const m = (atMs: number, kind: MarcadorDTO["kind"] = "tema", note: string | null = null): MarcadorDTO => ({ id: `m${atMs}`, atMs, kind, note });

describe("nombreDeHablante", () => {
  it("usa el nombre si lo tiene; si no, «Voz» y el número de la etiqueta", () => {
    expect(nombreDeHablante("V1", { V1: "Martha López" })).toBe("Martha López");
    expect(nombreDeHablante("V2", {})).toBe("Voz 2");
    expect(nombreDeHablante("H5", {})).toBe("Voz 5");
    expect(nombreDeHablante("H12", {})).toBe("Voz 12");
  });
  it("un nombre en blanco cuenta como no tener nombre; una etiqueta rara se muestra tal cual", () => {
    expect(nombreDeHablante("V1", { V1: "   " })).toBe("Voz 1");
    expect(nombreDeHablante("A", {})).toBe("A");
    expect(nombreDeHablante("V1", { V1: "  Ana  " })).toBe("Ana");
  });
});

describe("textos", () => {
  it("el silencio dice entre qué minutos, con horas sin cero a la izquierda", () => {
    expect(textoDeSilencio({ desdeMs: 2 * H + 10 * MIN, hastaMs: 2 * H + 24 * MIN + 30_000 })).toBe("Sin voz entre 2:10:00 y 2:24:30");
    expect(textoDeSilencio({ desdeMs: 30 * MIN + 20_000, hastaMs: 41 * MIN })).toBe("Sin voz entre 0:30:20 y 0:41:00");
  });
  it("la marca dice su tipo y, si tiene, su nota", () => {
    expect(textoDeMarca({ kind: "tema", note: "Ascensores" })).toBe("Nuevo tema · Ascensores");
    expect(textoDeMarca({ kind: "votacion", note: null })).toBe("Votación");
    expect(Object.keys(NOMBRE_DE_MARCA).sort()).toEqual(["compromiso", "nota", "tema", "votacion"]);
  });
});

describe("construirLinea", () => {
  it("agrupa por hora de la reunión, en orden, con el rango de cada hora", () => {
    const g = construirLinea({ intervenciones: [u(5_000), u(H + 10 * MIN), u(H + 20 * MIN), u(3 * H)], silencios: [], marcas: [], cargadoHastaMs: null });
    expect(g.map((x) => [x.hora, x.rango, x.entradas.length])).toEqual([[0, "0:00 – 1:00", 1], [1, "1:00 – 2:00", 2], [3, "3:00 – 4:00", 1]]);
  });

  it("intercala los silencios y las marcas en su minuto, y al mismo minuto la marca va primero", () => {
    const g = construirLinea({
      intervenciones: [u(10 * MIN), u(41 * MIN)],
      silencios: [{ desdeMs: 30 * MIN + 20_000, hastaMs: 41 * MIN }],
      marcas: [m(41 * MIN, "tema", "Ascensores"), m(10 * MIN, "nota")],
      cargadoHastaMs: null,
    });
    expect(g).toHaveLength(1);
    expect(g[0].entradas.map((e) => [e.tipo, e.ms])).toEqual([
      ["marca", 10 * MIN], ["intervencion", 10 * MIN], ["silencio", 30 * MIN + 20_000], ["marca", 41 * MIN], ["intervencion", 41 * MIN],
    ]);
  });

  it("un silencio que cruza de una hora a otra se muestra en la hora donde empieza", () => {
    const g = construirLinea({ intervenciones: [u(MIN), u(2 * H)], silencios: [{ desdeMs: 50 * MIN, hastaMs: 2 * H - MIN }], marcas: [], cargadoHastaMs: null });
    expect(g.map((x) => [x.hora, x.entradas.map((e) => e.tipo)])).toEqual([[0, ["intervencion", "silencio"]], [2, ["intervencion"]]]);
  });

  it("solo muestra silencios y marcas de lo ya cargado", () => {
    const entrada = { intervenciones: [u(MIN)], silencios: [{ desdeMs: 40 * MIN, hastaMs: 50 * MIN }, { desdeMs: 100 * MIN, hastaMs: 110 * MIN }], marcas: [m(45 * MIN), m(120 * MIN)] };
    const tipos = (hasta: number | null) => construirLinea({ ...entrada, cargadoHastaMs: hasta }).flatMap((g) => g.entradas.map((e) => `${e.tipo}@${e.ms / MIN}`));
    expect(tipos(30 * MIN)).toEqual(["intervencion@1"]);
    expect(tipos(90 * MIN)).toEqual(["intervencion@1", "silencio@40", "marca@45"]);
    expect(tipos(null)).toHaveLength(5);
  });

  it("las intervenciones que ya llegaron siempre se muestran, aunque pasen del límite", () => {
    expect(construirLinea({ intervenciones: [u(31 * MIN)], silencios: [], marcas: [], cargadoHastaMs: 30 * MIN })[0].entradas).toHaveLength(1);
  });

  it("sin nada no hay grupos, y las claves de las entradas no se repiten", () => {
    expect(construirLinea({ intervenciones: [], silencios: [], marcas: [], cargadoHastaMs: null })).toEqual([]);
    const claves = construirLinea({ intervenciones: [u(1), u(2)], silencios: [{ desdeMs: 1, hastaMs: 9 }], marcas: [m(1)], cargadoHastaMs: null }).flatMap((g) => g.entradas.map((e) => e.clave));
    expect(new Set(claves).size).toBe(claves.length);
  });
});
