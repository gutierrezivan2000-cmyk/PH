/**
 * Hablantes: quién es quién a lo largo de una reunión que se transcribe por tramos.
 *
 * Cada llamada al proveedor etiqueta a las voces por su cuenta («A», «B»…): la «A» de un tramo no es la «A» del
 * siguiente. Se resuelve con dos recursos:
 *
 *  1. Tras el primer tramo se eligen hasta 4 voces con mucho habla y se corta de cada una una muestra limpia de
 *     unos segundos. Esas muestras se mandan con los demás tramos como «voces conocidas» (V1…V4): el proveedor las
 *     reconoce y las etiqueta con ese nombre, que ya vale para toda la reunión.
 *  2. Las voces que no tienen muestra (o que el proveedor no reconoció) se emparejan con el tramo anterior mirando
 *     el solape: en esos 60 s los dos tramos oyeron lo mismo, y quien habla a la vez en uno y en otro es la misma
 *     persona. Lo que no empareja recibe una etiqueta nueva (H5, H6…).
 */
import type { ReferenciaElegida, Segmento } from "./tipos";

export const MAX_VOCES = 4;
/** Una voz merece muestra de referencia si habla al menos esto en el primer tramo. */
export const MIN_HABLA_REFERENCIA_MS = 60_000;
/** Largo de una muestra: de 4 a 8 s (el servicio acepta de 2 a 10). */
export const REFERENCIA_IDEAL_MS = 4_000;
export const REFERENCIA_MAX_MS = 8_000;
/** Si no hay un trozo limpio de 4 s, se acepta uno más corto, pero nunca menos de esto (el servicio pide 2 s). */
export const REFERENCIA_MINIMA_MS = 2_500;
/** Dos etiquetas son la misma persona si hablaron a la vez, al menos esto, en el solape de dos tramos. */
export const CRUCE_MINIMO_MS = 1_500;

/** Se descarta esto en cada extremo de una intervención al cortar una muestra: ahí las marcas de tiempo son menos precisas. */
const MARGEN_LIMPIO_MS = 300;
/** Dos segmentos de la misma voz separados por menos que esto son un solo habla continuo. */
const PAUSA_MISMA_VOZ_MS = 500;
/** Ningún segmento dura más que esto: acota hasta dónde hay que mirar hacia atrás al buscar quién se superpone. */
const LARGO_MAXIMO_SEGMENTO_MS = 5 * 60_000;

export const esEtiquetaDeReferencia = (etiqueta: string): boolean => /^V\d+$/.test(etiqueta);

/* ════════════════════════════════════════════════════════════════════
   Intervalos
   ════════════════════════════════════════════════════════════════════ */

type Intervalo = [number, number];

/** `base` sin los `cortes` (ordenados o no): lo que queda libre. */
function restar(base: Intervalo, cortes: readonly Intervalo[]): Intervalo[] {
  let libres: Intervalo[] = [base];
  for (const [a, b] of cortes) {
    const siguiente: Intervalo[] = [];
    for (const [x, y] of libres) {
      if (b <= x || a >= y) {
        siguiente.push([x, y]);
        continue;
      }
      if (a > x) siguiente.push([x, a]);
      if (b < y) siguiente.push([b, y]);
    }
    libres = siguiente;
    if (libres.length === 0) break;
  }
  return libres;
}

/** El primer índice de `ordenados` (por `inicioMs`) cuyo inicio es ≥ `x` (búsqueda binaria). */
function primerIndiceDesde(ordenados: readonly Segmento[], x: number): number {
  let lo = 0;
  let hi = ordenados.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ordenados[mid].inicioMs < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const porInicio = (a: Segmento, b: Segmento) => a.inicioMs - b.inicioMs || a.finMs - b.finMs;

/** Cuánto habla cada etiqueta, en el orden en que aparecen por primera vez. */
export function tiempoDeHabla(segmentos: readonly Segmento[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const s of [...segmentos].sort(porInicio)) {
    total.set(s.hablante, (total.get(s.hablante) ?? 0) + Math.max(0, s.finMs - s.inicioMs));
  }
  return total;
}

/* ════════════════════════════════════════════════════════════════════
   Muestras de voz
   ════════════════════════════════════════════════════════════════════ */

/**
 * El mejor trozo de audio donde habla SOLO esa etiqueta: una sola voz y sin solaparse con ninguna otra (ni a menos de
 * 300 ms). Mide entre `minMs` y `maxMs`; si el trozo limpio es más largo que `maxMs` toma el centro, lejos de los
 * bordes. null si no hay ninguno.
 */
export function mejorMuestra(
  segmentos: readonly Segmento[],
  etiqueta: string,
  { minMs, maxMs }: { minMs: number; maxMs: number },
): { desdeMs: number; hastaMs: number } | null {
  const ordenados = [...segmentos].sort(porInicio);
  const suyos = ordenados.filter((s) => s.hablante === etiqueta && s.finMs > s.inicioMs);

  // El habla continua de esa voz: segmentos seguidos con una pausa mínima entre ellos.
  const corridas: Intervalo[] = [];
  for (const s of suyos) {
    const ultima = corridas[corridas.length - 1];
    if (ultima && s.inicioMs - ultima[1] <= PAUSA_MISMA_VOZ_MS) ultima[1] = Math.max(ultima[1], s.finMs);
    else corridas.push([s.inicioMs, s.finMs]);
  }

  let mejor: { desde: number; hasta: number; largo: number } | null = null;
  for (const [a, b] of corridas) {
    const interior: Intervalo = [a + MARGEN_LIMPIO_MS, b - MARGEN_LIMPIO_MS];
    if (interior[1] - interior[0] < minMs) continue;

    // Las demás voces que se acercan a este trozo (un segmento largo que empezó antes también cuenta).
    const cortes: Intervalo[] = [];
    for (let k = primerIndiceDesde(ordenados, a - MARGEN_LIMPIO_MS - LARGO_MAXIMO_SEGMENTO_MS); k < ordenados.length; k++) {
      const o = ordenados[k];
      if (o.inicioMs >= b + MARGEN_LIMPIO_MS) break;
      if (o.hablante === etiqueta || o.finMs <= a - MARGEN_LIMPIO_MS) continue;
      cortes.push([o.inicioMs - MARGEN_LIMPIO_MS, o.finMs + MARGEN_LIMPIO_MS]);
    }

    for (const [x, y] of restar(interior, cortes)) {
      const largo = Math.min(y - x, maxMs);
      if (largo < minMs) continue;
      if (!mejor || largo > mejor.largo) {
        const desde = y - x > maxMs ? x + (y - x - maxMs) / 2 : x;
        mejor = { desde, hasta: desde + largo, largo };
      }
    }
  }
  return mejor ? { desdeMs: Math.round(mejor.desde), hastaMs: Math.round(mejor.hasta) } : null;
}

/**
 * Elige las voces de referencia con los segmentos del primer tramo: hasta 4 etiquetas con al menos 60 s de habla y,
 * de cada una, un fragmento limpio de 4–8 s. Se nombran V1…V4 de la que más habla a la que menos.
 */
export function elegirVoces(
  segmentosTramo0: readonly Segmento[],
  { maxVoces = MAX_VOCES, minHablaMs = MIN_HABLA_REFERENCIA_MS }: { maxVoces?: number; minHablaMs?: number } = {},
): ReferenciaElegida[] {
  const candidatas = [...tiempoDeHabla(segmentosTramo0).entries()]
    .filter(([, ms]) => ms >= minHablaMs)
    .sort((a, b) => b[1] - a[1]); // el orden es estable: a igual habla, quien apareció primero
  const referencias: ReferenciaElegida[] = [];
  for (const [etiqueta] of candidatas) {
    if (referencias.length >= maxVoces) break;
    const muestra =
      mejorMuestra(segmentosTramo0, etiqueta, { minMs: REFERENCIA_IDEAL_MS, maxMs: REFERENCIA_MAX_MS }) ??
      mejorMuestra(segmentosTramo0, etiqueta, { minMs: REFERENCIA_MINIMA_MS, maxMs: REFERENCIA_MAX_MS });
    if (!muestra) continue;
    referencias.push({ nombre: `V${referencias.length + 1}`, etiquetaLocal: etiqueta, ...muestra });
  }
  return referencias;
}

/* ════════════════════════════════════════════════════════════════════
   Emparejar etiquetas entre tramos
   ════════════════════════════════════════════════════════════════════ */

/** La siguiente etiqueta libre para una voz sin muestra: H5, H6… (V1…V4 quedan reservadas aunque no se usen todas). */
export function etiquetaNueva(usadas: Iterable<string>): string {
  let mayor = MAX_VOCES;
  for (const e of usadas) {
    const n = /^[VH](\d+)$/.exec(e);
    if (n) mayor = Math.max(mayor, Number(n[1]));
  }
  return `H${mayor + 1}`;
}

/**
 * Empareja las etiquetas locales de un tramo con las del tramo anterior (ya globales) mirando la `ventana` de solape.
 * Suma, para cada par (local, global), cuánto tiempo hablaron a la vez en esa ventana, y los junta de mayor a menor si
 * comparten al menos 1,5 s, sin repetir ninguno. Devuelve `local → global` solo para los que emparejaron.
 *
 * `ocupadas` son las etiquetas globales que el proveedor ya puso por su cuenta en este tramo (las voces de
 * referencia): esas no se ofrecen a nadie más, porque ya tienen dueño.
 */
export function reconciliar(
  prev: readonly Segmento[],
  actual: readonly Segmento[],
  ventana: { desdeMs: number; hastaMs: number },
  { cruceMinimoMs = CRUCE_MINIMO_MS, ocupadas = new Set<string>() }: { cruceMinimoMs?: number; ocupadas?: ReadonlySet<string> } = {},
): Map<string, string> {
  const dentro = (s: Segmento) => s.finMs > ventana.desdeMs && s.inicioMs < ventana.hastaMs;
  const anteriores = prev.filter((s) => dentro(s) && !ocupadas.has(s.hablante));
  const locales = actual.filter((s) => dentro(s) && !ocupadas.has(s.hablante));

  const cruces = new Map<string, { local: string; global: string; ms: number }>();
  for (const l of locales) {
    for (const g of anteriores) {
      const ms = Math.min(l.finMs, g.finMs, ventana.hastaMs) - Math.max(l.inicioMs, g.inicioMs, ventana.desdeMs);
      if (ms <= 0) continue;
      const clave = `${l.hablante}\u0000${g.hablante}`;
      const previo = cruces.get(clave);
      if (previo) previo.ms += ms;
      else cruces.set(clave, { local: l.hablante, global: g.hablante, ms });
    }
  }

  const pares = [...cruces.values()]
    .filter((p) => p.ms >= cruceMinimoMs)
    .sort((a, b) => b.ms - a.ms || a.local.localeCompare(b.local) || a.global.localeCompare(b.global));
  const emparejadas = new Map<string, string>();
  const tomadas = new Set<string>();
  for (const p of pares) {
    if (emparejadas.has(p.local) || tomadas.has(p.global)) continue;
    emparejadas.set(p.local, p.global);
    tomadas.add(p.global);
  }
  return emparejadas;
}
