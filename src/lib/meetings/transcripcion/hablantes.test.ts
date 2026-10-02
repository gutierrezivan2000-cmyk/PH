import { describe, expect, it } from "vitest";
import {
  CRUCE_MINIMO_MS, elegirVoces, esEtiquetaDeReferencia, etiquetaNueva, mejorMuestra, reconciliar, tiempoDeHabla,
} from "./hablantes";
import type { Segmento } from "./tipos";

const seg = (hablante: string, inicioMs: number, finMs: number, texto = "texto"): Segmento => ({ inicioMs, finMs, hablante, texto });
const S = 1000;

/** Intervenciones de 10 s de cada etiqueta, una tras otra y en rondas, con 1 s de aire entre ellas. */
function conversacion(habla: Record<string, number>, { durSeg = 10 * S, hueco = 1 * S }: { durSeg?: number; hueco?: number } = {}): Segmento[] {
  const pendientes = Object.entries(habla).map(([etiqueta, ms]) => ({ etiqueta, restan: Math.ceil(ms / durSeg) }));
  const salida: Segmento[] = [];
  let t = 0;
  while (pendientes.some((p) => p.restan > 0)) {
    for (const p of pendientes) {
      if (p.restan <= 0) continue;
      salida.push(seg(p.etiqueta, t, t + durSeg));
      t += durSeg + hueco;
      p.restan--;
    }
  }
  return salida;
}

describe("tiempoDeHabla", () => {
  it("suma por etiqueta, en el orden en que aparecen por primera vez", () => {
    const m = tiempoDeHabla([seg("B", 5 * S, 6 * S), seg("A", 0, 3 * S), seg("B", 10 * S, 12 * S)]);
    expect([...m.entries()]).toEqual([["A", 3 * S], ["B", 3 * S]]);
  });

  it("un segmento con el final antes del inicio no resta tiempo", () => {
    expect(tiempoDeHabla([seg("A", 5 * S, 4 * S)]).get("A")).toBe(0);
  });
});

describe("mejorMuestra", () => {
  it("toma el centro de un trozo largo, lejos de los bordes, sin pasar del máximo", () => {
    // 0–10 s de A: sin los 300 ms de cada borde quedan 9,4 s; el centro de 8 s es 1,0–9,0 s.
    expect(mejorMuestra([seg("A", 0, 10 * S)], "A", { minMs: 4 * S, maxMs: 8 * S })).toEqual({ desdeMs: 1_000, hastaMs: 9_000 });
  });

  it("si el trozo limpio mide entre el mínimo y el máximo, lo usa entero (menos los bordes)", () => {
    expect(mejorMuestra([seg("A", 0, 6 * S)], "A", { minMs: 4 * S, maxMs: 8 * S })).toEqual({ desdeMs: 300, hastaMs: 5_700 });
  });

  it("no cuenta lo que se solapa con otra voz (ni a menos de 300 ms)", () => {
    const m = mejorMuestra([seg("A", 0, 10 * S), seg("B", 4 * S, 5 * S)], "A", { minMs: 4 * S, maxMs: 8 * S });
    // Libre: 0,3–3,7 s (3,4 s, corto) y 5,3–9,7 s (4,4 s).
    expect(m).toEqual({ desdeMs: 5_300, hastaMs: 9_700 });
  });

  it("un segmento largo de otra voz que empezó mucho antes también cuenta como solape", () => {
    const m = mejorMuestra([seg("B", 0, 60 * S), seg("A", 30 * S, 40 * S)], "A", { minMs: 2 * S, maxMs: 8 * S });
    expect(m).toBeNull();
  });

  it("une los segmentos seguidos de la misma voz si la pausa es de medio segundo o menos", () => {
    const junto = mejorMuestra([seg("A", 0, 3 * S), seg("A", 3_400, 7 * S)], "A", { minMs: 4 * S, maxMs: 8 * S });
    expect(junto).toEqual({ desdeMs: 300, hastaMs: 6_700 });
    const separado = mejorMuestra([seg("A", 0, 3 * S), seg("A", 4 * S, 7 * S)], "A", { minMs: 4 * S, maxMs: 8 * S });
    expect(separado).toBeNull();
  });

  it("de varios trozos buenos elige el más largo; si empatan, el primero", () => {
    const m = mejorMuestra([seg("A", 0, 5 * S), seg("A", 20 * S, 28 * S), seg("A", 40 * S, 48 * S)], "A", { minMs: 4 * S, maxMs: 8 * S });
    expect(m).toEqual({ desdeMs: 20_300, hastaMs: 27_700 }); // 7,4 s: el de 5 s es más corto y los de 8 s empatan
  });

  it("devuelve null si la etiqueta no habla o no tiene un trozo del largo pedido", () => {
    expect(mejorMuestra([seg("B", 0, 10 * S)], "A", { minMs: 2 * S, maxMs: 8 * S })).toBeNull();
    expect(mejorMuestra([seg("A", 0, 3 * S)], "A", { minMs: 4 * S, maxMs: 8 * S })).toBeNull();
  });

  it("no depende del orden en que vengan los segmentos", () => {
    const a = [seg("A", 0, 10 * S), seg("B", 4 * S, 5 * S)];
    expect(mejorMuestra([...a].reverse(), "A", { minMs: 4 * S, maxMs: 8 * S })).toEqual(mejorMuestra(a, "A", { minMs: 4 * S, maxMs: 8 * S }));
  });
});

describe("elegirVoces", () => {
  it("elige hasta 4 voces con 60 s o más de habla, de la que más habla a la que menos, y las llama V1…V4", () => {
    const refs = elegirVoces(conversacion({ A: 200 * S, B: 150 * S, C: 90 * S, D: 70 * S, E: 65 * S, F: 30 * S }));
    expect(refs.map((r) => [r.nombre, r.etiquetaLocal])).toEqual([["V1", "A"], ["V2", "B"], ["V3", "C"], ["V4", "D"]]);
  });

  it("cada muestra mide de 4 a 8 s y cae dentro de una intervención de su voz, sin pisar a otra", () => {
    const habla = conversacion({ A: 120 * S, B: 100 * S, C: 80 * S });
    for (const r of elegirVoces(habla)) {
      const largo = r.hastaMs - r.desdeMs;
      expect(largo).toBeGreaterThanOrEqual(4_000);
      expect(largo).toBeLessThanOrEqual(8_000);
      const suyos = habla.filter((s) => s.hablante === r.etiquetaLocal);
      expect(suyos.some((s) => s.inicioMs <= r.desdeMs && s.finMs >= r.hastaMs)).toBe(true);
      expect(habla.filter((s) => s.hablante !== r.etiquetaLocal).some((s) => s.inicioMs < r.hastaMs && s.finMs > r.desdeMs)).toBe(false);
    }
  });

  it("quien habla menos de 60 s no es voz de referencia", () => {
    const refs = elegirVoces(conversacion({ A: 120 * S, B: 50 * S }));
    expect(refs.map((r) => r.etiquetaLocal)).toEqual(["A"]);
  });

  it("sin nadie con habla suficiente no hay referencias (el siguiente tramo irá sin voces conocidas)", () => {
    expect(elegirVoces(conversacion({ A: 30 * S, B: 20 * S }))).toEqual([]);
    expect(elegirVoces([])).toEqual([]);
  });

  it("a igual habla, queda primero quien apareció antes", () => {
    const refs = elegirVoces(conversacion({ A: 70 * S, B: 70 * S }));
    expect(refs.map((r) => r.etiquetaLocal)).toEqual(["A", "B"]);
  });

  it("si una voz habla mucho pero nunca sola, se salta y la siguiente ocupa su lugar", () => {
    // «Z» habla 3 s y la pisa «Y» durante 2 s, una y otra vez: nunca queda un trozo limpio de 2,5 s.
    const fragmentada: Segmento[] = [];
    for (let k = 0; k < 25; k++) {
      fragmentada.push(seg("Z", k * 5 * S, k * 5 * S + 3 * S));
      fragmentada.push(seg("Y", k * 5 * S + 3 * S, k * 5 * S + 5 * S));
    }
    const sana = conversacion({ W: 100 * S }).map((s) => ({ ...s, inicioMs: s.inicioMs + 200 * S, finMs: s.finMs + 200 * S }));
    const refs = elegirVoces([...fragmentada, ...sana]);
    expect(refs.map((r) => r.etiquetaLocal)).toEqual(["W"]);
    expect(refs[0].nombre).toBe("V1");
  });

  it("si no hay un trozo limpio de 4 s, acepta uno más corto (2,5 s como mínimo)", () => {
    const corto = conversacion({ A: 70 * S }, { durSeg: 3_200, hueco: 1_000 });
    const [r] = elegirVoces(corto);
    expect(r.etiquetaLocal).toBe("A");
    expect(r.hastaMs - r.desdeMs).toBe(2_600);
  });

  it("respeta el máximo de voces que se le pida", () => {
    expect(elegirVoces(conversacion({ A: 90 * S, B: 90 * S, C: 90 * S }), { maxVoces: 2 })).toHaveLength(2);
  });
});

describe("etiquetaNueva", () => {
  it("V1…V4 quedan reservadas: la primera etiqueta nueva es H5", () => {
    expect(etiquetaNueva([])).toBe("H5");
    expect(etiquetaNueva(["V1", "V2"])).toBe("H5");
  });
  it("sigue a la última usada", () => {
    expect(etiquetaNueva(["V1", "V2", "V3", "V4", "H5"])).toBe("H6");
    expect(etiquetaNueva(["H9", "H6"])).toBe("H10");
  });
  it("ignora lo que no es una etiqueta de la reunión", () => {
    expect(etiquetaNueva(["A", "B", "speaker_3"])).toBe("H5");
  });
});

describe("esEtiquetaDeReferencia", () => {
  it("V1…V4 son de referencia; las H y las locales, no", () => {
    expect(["V1", "V4"].every(esEtiquetaDeReferencia)).toBe(true);
    expect(["H5", "A", "V", "VX"].some(esEtiquetaDeReferencia)).toBe(false);
  });
});

describe("reconciliar", () => {
  // El tramo 1 empieza en 10:00; su audio arranca 30 s antes, así que la ventana de solape es 9:30–10:30.
  const V = { desdeMs: 570 * S, hastaMs: 630 * S };

  it("empareja la etiqueta local con la global que habló a la vez en el solape (A ↔ V1)", () => {
    const prev = [seg("V1", 560 * S, 600 * S), seg("H5", 600 * S, 640 * S)];
    const actual = [seg("A", 575 * S, 598 * S), seg("B", 602 * S, 620 * S)];
    expect(Object.fromEntries(reconciliar(prev, actual, V))).toEqual({ A: "V1", B: "H5" });
  });

  it("no empareja si comparten menos de 1,5 s", () => {
    const prev = [seg("V1", 560 * S, 600 * S)];
    const justo = [seg("A", 598_500, 610 * S)]; // 1,5 s
    const poco = [seg("A", 598_600, 610 * S)]; // 1,4 s
    expect(reconciliar(prev, justo, V).get("A")).toBe("V1");
    expect(reconciliar(prev, poco, V).has("A")).toBe(false);
    expect(CRUCE_MINIMO_MS).toBe(1_500);
  });

  it("solo cuenta el tiempo que cae dentro de la ventana", () => {
    const prev = [seg("V1", 500 * S, 580 * S)];
    const actual = [seg("A", 500 * S, 580 * S)]; // coinciden 80 s, pero solo 10 s dentro de la ventana
    expect(reconciliar(prev, actual, V).get("A")).toBe("V1");
    expect(reconciliar(prev, actual, { desdeMs: 580 * S, hastaMs: 620 * S }).size).toBe(0);
  });

  it("empareja de mayor a menor y sin repetir: si dos locales quieren la misma global, gana la que más se cruza", () => {
    const prev = [seg("V1", 570 * S, 630 * S)];
    const actual = [seg("A", 570 * S, 580 * S), seg("B", 580 * S, 595 * S)];
    expect(Object.fromEntries(reconciliar(prev, actual, V))).toEqual({ B: "V1" });
  });

  it("una local que coincide con dos globales se queda con la que más se cruza", () => {
    const prev = [seg("V1", 570 * S, 580 * S), seg("V2", 580 * S, 600 * S)];
    const actual = [seg("A", 570 * S, 600 * S)];
    expect(reconciliar(prev, actual, V).get("A")).toBe("V2");
  });

  it("suma varios cruces de un mismo par", () => {
    const prev = [seg("V1", 570 * S, 571 * S), seg("V1", 575 * S, 576 * S)];
    const actual = [seg("A", 570 * S, 571 * S), seg("A", 575 * S, 576 * S)]; // 1 s + 1 s, cada uno bajo el mínimo
    expect(reconciliar(prev, actual, V).get("A")).toBe("V1");
  });

  it("las globales que el proveedor ya puso en este tramo (voces de referencia) no se ofrecen a nadie más", () => {
    const prev = [seg("V2", 570 * S, 630 * S)];
    const actual = [seg("V2", 570 * S, 600 * S), seg("A", 600 * S, 630 * S)];
    // «A» habló a la vez que V2 en el tramo anterior pero V2 ya está identificada en este tramo con su propia muestra.
    expect(reconciliar(prev, actual, V, { ocupadas: new Set(["V2"]) }).size).toBe(0);
  });

  it("sin solape no hay emparejamientos", () => {
    expect(reconciliar([seg("V1", 0, 60 * S)], [seg("A", 700 * S, 760 * S)], V).size).toBe(0);
    expect(reconciliar([], [seg("A", 575 * S, 598 * S)], V).size).toBe(0);
  });

  it("es determinista: a igual cruce decide el orden de las etiquetas, no el de los segmentos", () => {
    const prev = [seg("H5", 570 * S, 580 * S), seg("V1", 580 * S, 590 * S)];
    const actual = [seg("B", 570 * S, 590 * S)];
    const uno = reconciliar(prev, actual, V);
    const otro = reconciliar([...prev].reverse(), actual, V);
    expect(uno.get("B")).toBe("H5");
    expect(otro.get("B")).toBe("H5");
  });
});
