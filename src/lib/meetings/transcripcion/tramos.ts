/**
 * Cómo se parte una reunión larga para transcribirla.
 *
 * El audio se transcribe en tramos de 10 minutos, cada uno con 30 s de solape a cada lado. El «núcleo» de un tramo
 * es lo que de verdad le toca (los núcleos se tocan sin solaparse); el solape sirve para que una frase que cruza el
 * borde la oiga completa al menos uno de los dos tramos y para emparejar a los hablantes entre tramos.
 */
import { SOLAPE_MS, TRAMO_MS } from "../tipos";
import type { Segmento, Tramo } from "./tipos";

/** Cuántos tramos hacen falta para una duración (0 si no hay audio). */
export function cantidadDeTramos(duracionMs: number, tramoMs: number = TRAMO_MS): number {
  if (!Number.isFinite(duracionMs) || duracionMs <= 0 || tramoMs <= 0) return 0;
  return Math.ceil(duracionMs / tramoMs);
}

/**
 * El tramo `i` manda a transcribir el audio `[max(0, i·T − S), min(D, (i+1)·T + S)]` y su núcleo es
 * `[i·T, min(D, (i+1)·T))`.
 */
export function planificarTramos(duracionMs: number, tramoMs: number = TRAMO_MS, solapeMs: number = SOLAPE_MS): Tramo[] {
  if (!(tramoMs > 0) || solapeMs < 0 || solapeMs >= tramoMs) throw new Error("Tramos mal definidos: el solape debe ser menor que el tramo.");
  const n = cantidadDeTramos(duracionMs, tramoMs);
  return Array.from({ length: n }, (_, i) => ({
    i,
    desdeMs: Math.max(0, i * tramoMs - solapeMs),
    hastaMs: Math.min(duracionMs, (i + 1) * tramoMs + solapeMs),
    nucleoDesdeMs: i * tramoMs,
    nucleoHastaMs: Math.min(duracionMs, (i + 1) * tramoMs),
  }));
}

const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Pasa los segmentos de un tramo (con tiempos relativos al inicio de su audio) a tiempos de la reunión. Descarta los
 * que no dicen nada y acota los tiempos al audio del tramo.
 */
export function aAbsolutos(tramo: Tramo, segmentos: readonly Segmento[]): Segmento[] {
  const largo = tramo.hastaMs - tramo.desdeMs;
  return segmentos.flatMap((s) => {
    const texto = s.texto.trim();
    if (!texto || !Number.isFinite(s.inicioMs) || !Number.isFinite(s.finMs)) return [];
    const inicio = acotar(s.inicioMs, 0, largo);
    const fin = acotar(Math.max(s.finMs, s.inicioMs), 0, largo);
    return [{ inicioMs: tramo.desdeMs + Math.round(inicio), finMs: tramo.desdeMs + Math.round(fin), hablante: s.hablante, texto }];
  });
}

export const puntoMedio = (s: Pick<Segmento, "inicioMs" | "finMs">): number => (s.inicioMs + s.finMs) / 2;

/**
 * De los segmentos de un tramo (en tiempos de la reunión), los que le tocan: aquellos cuyo punto medio cae entre sus
 * dos cortes. Por omisión los cortes son los bordes del núcleo; `unirTramos` pasa los puntos de corte que eligió
 * (ver `puntoDeCorte`). El primer tramo no tiene límite por la izquierda y el último no lo tiene por la derecha.
 */
export function asignarANucleo(
  tramo: Tramo,
  segmentos: readonly Segmento[],
  opciones: { ultimo: boolean; desdeMs?: number; hastaMs?: number },
): Segmento[] {
  const desde = opciones.desdeMs ?? (tramo.i > 0 ? tramo.nucleoDesdeMs : Number.NEGATIVE_INFINITY);
  const hasta = opciones.hastaMs ?? (opciones.ultimo ? Number.POSITIVE_INFINITY : tramo.nucleoHastaMs);
  return segmentos.filter((s) => {
    const m = puntoMedio(s);
    return m >= desde && m < hasta;
  });
}

/** Dos tramos «coinciden» en un instante si ninguna de sus intervenciones lo atraviesa por más de esto a cada lado. */
export const TOLERANCIA_CORTE_MS = 150;
/** El corte no se busca en los últimos segundos del audio de un tramo: ahí el proveedor oye peor (frases cortadas). */
export const MARGEN_DE_CORTE_MS = 5_000;

/**
 * Dónde coser dos tramos seguidos. La regla más simple (cada frase es del tramo cuyo núcleo contiene su punto medio)
 * falla si los dos tramos parten de otra manera la misma frase del borde: uno se queda con una mitad, el otro con la
 * otra, y entre las dos se pierden o se repiten palabras. Por eso se cose en un instante donde AMBOS tramos coinciden
 * en que ninguna intervención lo atraviesa (una pausa, o un final y un principio que los dos ven igual): lo anterior es
 * del primer tramo y lo posterior, del segundo, sin que ninguna frase quede a caballo.
 *
 * Se busca, entre los inicios y finales de intervención de los dos tramos dentro del solape (sin los últimos segundos
 * de cada lado), el instante más cercano al borde. Si no hay ninguno (alguien habla sin parar los 50 s) se usa el
 * borde mismo, y lo que quede repetido lo limpia `eliminarRepetidosDeBorde`.
 */
export function puntoDeCorte(anterior: readonly Segmento[], actual: readonly Segmento[], borde: number, solapeMs: number): number {
  const margen = Math.min(MARGEN_DE_CORTE_MS, solapeMs / 2);
  const desde = borde - (solapeMs - margen);
  const hasta = borde + (solapeMs - margen);
  const cercanos = [...anterior, ...actual].filter((s) => s.finMs > desde - TOLERANCIA_CORTE_MS && s.inicioMs < hasta + TOLERANCIA_CORTE_MS);

  const atraviesa = (c: number) => cercanos.some((s) => s.inicioMs < c - TOLERANCIA_CORTE_MS && s.finMs > c + TOLERANCIA_CORTE_MS);
  const candidatos = new Set<number>([borde]);
  for (const s of cercanos) {
    for (const t of [s.inicioMs, s.finMs]) if (t >= desde && t <= hasta) candidatos.add(t);
  }
  let mejor: number | null = null;
  for (const c of [...candidatos].sort((a, b) => a - b)) {
    if (atraviesa(c)) continue;
    if (mejor === null || Math.abs(c - borde) < Math.abs(mejor - borde)) mejor = c;
  }
  return mejor ?? borde;
}
