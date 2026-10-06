import { describe, expect, it } from "vitest";
import type { Segmento } from "./tipos";
import { MARGEN_DE_CORTE_MS, TOLERANCIA_CORTE_MS, aAbsolutos, asignarANucleo, cantidadDeTramos, planificarTramos, puntoDeCorte, puntoMedio } from "./tramos";

const MIN = 60_000;

describe("planificarTramos", () => {
  it("25 min dan 3 tramos: cada uno con 30 s de solape a cada lado y su núcleo", () => {
    const t = planificarTramos(25 * MIN);
    expect(t).toEqual([
      { i: 0, desdeMs: 0, hastaMs: 10 * MIN + 30_000, nucleoDesdeMs: 0, nucleoHastaMs: 10 * MIN },
      { i: 1, desdeMs: 10 * MIN - 30_000, hastaMs: 20 * MIN + 30_000, nucleoDesdeMs: 10 * MIN, nucleoHastaMs: 20 * MIN },
      { i: 2, desdeMs: 20 * MIN - 30_000, hastaMs: 25 * MIN, nucleoDesdeMs: 20 * MIN, nucleoHastaMs: 25 * MIN },
    ]);
  });

  it("una reunión de 8 h son 48 tramos", () => {
    expect(planificarTramos(8 * 3_600_000)).toHaveLength(48);
  });

  it("una duración que es múltiplo exacto no deja un tramo vacío al final", () => {
    const t = planificarTramos(20 * MIN);
    expect(t).toHaveLength(2);
    expect(t[1].hastaMs).toBe(20 * MIN);
    expect(t[1].nucleoHastaMs).toBe(20 * MIN);
  });

  it("menos de un tramo es un solo tramo con todo el audio", () => {
    expect(planificarTramos(3 * MIN)).toEqual([{ i: 0, desdeMs: 0, hastaMs: 3 * MIN, nucleoDesdeMs: 0, nucleoHastaMs: 3 * MIN }]);
  });

  it("sin audio no hay tramos", () => {
    expect(planificarTramos(0)).toEqual([]);
    expect(cantidadDeTramos(0)).toBe(0);
    expect(cantidadDeTramos(Number.NaN)).toBe(0);
  });

  it("los núcleos cubren la reunión sin huecos ni solapes, sea cual sea la duración", () => {
    for (const d of [1, 36, 599_999, 600_000, 600_001, 1_234_567, 7 * 3_600_000 + 12_345]) {
      const t = planificarTramos(d);
      expect(t[0].nucleoDesdeMs).toBe(0);
      for (let k = 1; k < t.length; k++) expect(t[k].nucleoDesdeMs).toBe(t[k - 1].nucleoHastaMs);
      expect(t[t.length - 1].nucleoHastaMs).toBe(d);
      // El audio de cada tramo contiene su núcleo y no se sale de la reunión.
      for (const x of t) {
        expect(x.desdeMs).toBeLessThanOrEqual(x.nucleoDesdeMs);
        expect(x.hastaMs).toBeGreaterThanOrEqual(x.nucleoHastaMs);
        expect(x.desdeMs).toBeGreaterThanOrEqual(0);
        expect(x.hastaMs).toBeLessThanOrEqual(d);
      }
    }
  });

  it("acepta otro tamaño de tramo y de solape, y rechaza los que no tienen sentido", () => {
    const t = planificarTramos(150_000, 60_000, 5_000);
    expect(t.map((x) => [x.desdeMs, x.hastaMs])).toEqual([[0, 65_000], [55_000, 125_000], [115_000, 150_000]]);
    expect(() => planificarTramos(100_000, 60_000, 60_000)).toThrow();
    expect(() => planificarTramos(100_000, 0, 0)).toThrow();
    expect(() => planificarTramos(100_000, 60_000, -1)).toThrow();
  });
});

describe("aAbsolutos", () => {
  const tramo = planificarTramos(25 * MIN)[1]; // audio de 9:30 a 20:30

  it("suma el inicio del tramo a los tiempos relativos", () => {
    const r = aAbsolutos(tramo, [{ inicioMs: 1_000, finMs: 4_000, hablante: "A", texto: "Hola" }]);
    expect(r).toEqual([{ inicioMs: tramo.desdeMs + 1_000, finMs: tramo.desdeMs + 4_000, hablante: "A", texto: "Hola" }]);
  });

  it("descarta lo que no dice nada y lo que no tiene tiempos", () => {
    const r = aAbsolutos(tramo, [
      { inicioMs: 0, finMs: 1_000, hablante: "A", texto: "   " },
      { inicioMs: Number.NaN, finMs: 1_000, hablante: "A", texto: "x" },
      { inicioMs: 0, finMs: Number.POSITIVE_INFINITY, hablante: "A", texto: "y" },
      { inicioMs: 0, finMs: 1_000, hablante: "A", texto: "  z " },
    ]);
    expect(r.map((s) => s.texto)).toEqual(["z"]);
  });

  it("acota los tiempos al audio del tramo y no deja que el final quede antes del inicio", () => {
    const largo = tramo.hastaMs - tramo.desdeMs;
    const [a, b] = aAbsolutos(tramo, [
      { inicioMs: -500, finMs: largo + 900, hablante: "A", texto: "afuera" },
      { inicioMs: 5_000, finMs: 4_000, hablante: "A", texto: "al revés" },
    ]);
    expect([a.inicioMs, a.finMs]).toEqual([tramo.desdeMs, tramo.hastaMs]);
    expect(b.finMs).toBeGreaterThanOrEqual(b.inicioMs);
  });
});

describe("asignarANucleo", () => {
  const tramos = planificarTramos(25 * MIN);
  const seg = (inicioMs: number, finMs: number): Segmento => ({ inicioMs, finMs, hablante: "A", texto: `${inicioMs}` });

  it("cada segmento se queda con el tramo cuyo núcleo contiene su punto medio", () => {
    // Una frase de 9:55 a 10:20 (punto medio 10:07:30) la ven los tramos 0 y 1; es del 1.
    const frase = seg(9 * MIN + 55_000, 10 * MIN + 20_000);
    expect(puntoMedio(frase)).toBe(10 * MIN + 7_500);
    expect(asignarANucleo(tramos[0], [frase], { ultimo: false })).toEqual([]);
    expect(asignarANucleo(tramos[1], [frase], { ultimo: false })).toEqual([frase]);
  });

  it("una frase con el punto medio justo en el borde es del tramo que empieza (núcleo cerrado a la izquierda)", () => {
    const frase = seg(10 * MIN - 5_000, 10 * MIN + 5_000);
    expect(asignarANucleo(tramos[0], [frase], { ultimo: false })).toEqual([]);
    expect(asignarANucleo(tramos[1], [frase], { ultimo: false })).toEqual([frase]);
  });

  it("de todos los tramos, cada frase sale exactamente una vez", () => {
    const frases = [seg(1_000, 5_000), seg(9 * MIN + 45_000, 10 * MIN + 10_000), seg(10 * MIN + 5_000, 10 * MIN + 12_000), seg(19 * MIN + 50_000, 20 * MIN + 20_000), seg(24 * MIN, 24 * MIN + 30_000)];
    const duenas = tramos.flatMap((t, k) => asignarANucleo(t, frases, { ultimo: k === tramos.length - 1 }));
    expect(duenas.sort((a, b) => a.inicioMs - b.inicioMs)).toEqual(frases);
  });

  it("el último tramo se queda con todo lo que haya del borde hacia adelante, aunque el audio se pase un poco", () => {
    const tarde = seg(25 * MIN - 500, 25 * MIN + 3_000); // el punto medio queda 1,25 s pasada la duración
    expect(asignarANucleo(tramos[2], [tarde], { ultimo: true })).toEqual([tarde]);
    expect(asignarANucleo(tramos[2], [tarde], { ultimo: false })).toEqual([]);
  });

  it("el primer tramo no tiene límite por la izquierda", () => {
    const temprano = seg(0, 2_000);
    expect(asignarANucleo(tramos[0], [temprano], { ultimo: false })).toEqual([temprano]);
  });
});

describe("asignarANucleo con cortes elegidos", () => {
  const tramos = planificarTramos(25 * MIN);
  const seg = (inicioMs: number, finMs: number): Segmento => ({ inicioMs, finMs, hablante: "A", texto: `${inicioMs}` });

  it("usa los cortes que se le den en lugar de los bordes del núcleo", () => {
    const frase = seg(9 * MIN + 50_000, 9 * MIN + 58_000); // punto medio 9:54: del tramo 0 por el núcleo
    expect(asignarANucleo(tramos[0], [frase], { ultimo: false })).toEqual([frase]);
    expect(asignarANucleo(tramos[0], [frase], { ultimo: false, hastaMs: 9 * MIN + 40_000 })).toEqual([]);
    expect(asignarANucleo(tramos[1], [frase], { ultimo: false, desdeMs: 9 * MIN + 40_000 })).toEqual([frase]);
  });
});

describe("puntoDeCorte", () => {
  const B = 600_000;
  const S = 30_000;
  const seg = (inicioMs: number, finMs: number, texto = "x"): Segmento => ({ inicioMs, finMs, hablante: "A", texto });

  it("si nadie atraviesa el borde, se cose en el borde mismo", () => {
    expect(puntoDeCorte([seg(580_000, 590_000)], [seg(580_000, 590_000), seg(610_000, 620_000)], B, S)).toBe(B);
  });

  it("si una frase atraviesa el borde, se cose en el principio o el final de esa frase, el más cercano", () => {
    // La ven entera los dos tramos: va de 9:55 a 10:20.
    const frase = seg(595_000, 620_000);
    expect(puntoDeCorte([frase], [frase], B, S)).toBe(595_000);
    expect(puntoDeCorte([seg(580_000, 593_000), seg(593_000 + 30_000, 600_000 + 40_000 - 10_000 + 1)], [seg(590_000, 620_000)], B, S)).not.toBe(B);
  });

  it("cuando los dos tramos parten distinto la misma frase, no corta por dentro de ninguna de las dos versiones", () => {
    const anterior = [seg(592_000, 597_950), seg(597_950, 609_000)]; // la parte en 598,0 s
    const actual = [seg(592_000, 599_650), seg(599_650, 609_000)]; // la parte en 599,7 s
    // Ni 597,95 ni 599,65 sirven (cada uno atraviesa una versión de la otra); tampoco el borde (600 s).
    expect(puntoDeCorte(anterior, actual, B, S)).toBe(592_000);
  });

  it("no corta en los últimos 5 s del audio de cada tramo", () => {
    // Las únicas pausas están pegadas a los extremos del solape (9:30 y 10:30): quedan fuera de la zona fiable.
    const anterior = [seg(572_000, 628_000)];
    const actual = [seg(572_000, 628_000)];
    expect(puntoDeCorte(anterior, actual, B, S)).toBe(B); // sin candidatos válidos, el borde
    expect(MARGEN_DE_CORTE_MS).toBe(5_000);
  });

  it("una intervención que apenas pasa de un lado a otro (menos de la tolerancia) no impide cortar", () => {
    const rozando = seg(590_000, 600_000 + TOLERANCIA_CORTE_MS - 50);
    expect(puntoDeCorte([rozando], [rozando], B, S)).toBe(B);
  });

  it("entre varios puntos limpios elige el más cercano al borde", () => {
    const anterior = [seg(560_000, 570_000), seg(585_000, 590_000), seg(612_000, 625_000)];
    // Candidatos limpios: 590 s (a 10 s del borde) y 612 s (a 12 s); también 600 s, pero ese es el borde y también está libre.
    expect(puntoDeCorte(anterior, anterior, B, S)).toBe(B);
    const ocupado = [seg(560_000, 570_000), seg(585_000, 590_000), seg(594_000, 606_000), seg(612_000, 625_000)];
    expect(puntoDeCorte(ocupado, ocupado, B, S)).toBe(594_000);
  });
});
