/**
 * Unir los tramos transcritos en una sola transcripción de la reunión. Todo son funciones puras: el manejador `unir`
 * lee las tareas, llama a `unirTramos` y escribe el resultado.
 *
 * Qué pasa aquí, en orden:
 *  1. Los tiempos de cada tramo (relativos a su audio) pasan a tiempos de la reunión.
 *  2. Las etiquetas de cada tramo se vuelven globales (V1…V4 por las muestras; el resto, emparejando el solape).
 *  3. Cada par de tramos seguidos se cose en un punto de corte donde los dos coinciden (ver `puntoDeCorte`): lo anterior
 *     es del primero y lo posterior, del segundo. Una frase del borde sale una sola vez y completa.
 *  4. Se quitan los repetidos que pudieran quedar si no hubo un punto de corte limpio y se juntan las intervenciones
 *     seguidas de una voz.
 *  5. Se miden la cobertura (qué parte del tiempo cubren los núcleos), los silencios largos y el habla de cada voz.
 */
import { formatearReloj } from "../tipos";
import { etiquetaNueva, mejorMuestra, reconciliar, tiempoDeHabla } from "./hablantes";
import type { ReferenciaElegida, Segmento, SilencioDetectado, Tramo } from "./tipos";
import { aAbsolutos, asignarANucleo, puntoDeCorte } from "./tramos";

/** Un hueco sin nadie hablando se anota como «Sin voz» a partir de esta duración (una pausa normal dura segundos). */
export const UMBRAL_SILENCIO_MS = 2 * 60_000;
/** Dos intervenciones seguidas de la misma voz se juntan si el hueco es menor que esto y el resultado dura menos que lo otro. */
export const HUECO_FUSION_MS = 1_000;
export const MAX_INTERVENCION_MS = 60_000;
/** Un segmento repetido en el borde de dos tramos: lo que comparte con otro y cuántas palabras mínimo para decidirlo. */
const CONTENIDO_MINIMO = 0.8;
const PALABRAS_MINIMAS = 3;

const porInicio = (a: Segmento, b: Segmento) => a.inicioMs - b.inicioMs || a.finMs - b.finMs;

/* ════════════════════════════════════════════════════════════════════
   Cobertura y silencios
   ════════════════════════════════════════════════════════════════════ */

/**
 * Qué parte (0..1) de la línea de tiempo quedó transcrita: lo que cubren, sin repetir, los núcleos de los tramos hechos.
 * Un tramo sin voz cuenta: se transcribió y no había nadie hablando. Debe dar 1 para pasar a `unir`.
 */
export function calcularCobertura(nucleosHechos: ReadonlyArray<{ desdeMs: number; hastaMs: number }>, duracionMs: number): number {
  if (!(duracionMs > 0)) return 0;
  const acotado = (v: number) => Math.min(duracionMs, Math.max(0, v));
  const ordenados = nucleosHechos
    .map((n): [number, number] => [acotado(n.desdeMs), acotado(n.hastaMs)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let cubierto = 0;
  let hasta = 0;
  for (const [a, b] of ordenados) {
    const desde = Math.max(a, hasta);
    if (b > desde) {
      cubierto += b - desde;
      hasta = b;
    }
  }
  return cubierto >= duracionMs ? 1 : cubierto / duracionMs;
}

/** Los huecos largos sin voz, incluidos el del principio y el del final de la grabación. */
export function detectarSilencios(segmentos: readonly Segmento[], duracionMs: number, umbralMs: number = UMBRAL_SILENCIO_MS): SilencioDetectado[] {
  const huecos: SilencioDetectado[] = [];
  let hasta = 0; // hasta dónde llega lo ya dicho (puede haber voces que se pisan)
  for (const s of [...segmentos].sort(porInicio)) {
    if (s.inicioMs - hasta >= umbralMs) huecos.push({ desdeMs: hasta, hastaMs: s.inicioMs });
    hasta = Math.max(hasta, s.finMs);
  }
  if (duracionMs - hasta >= umbralMs) huecos.push({ desdeMs: hasta, hastaMs: duracionMs });
  return huecos;
}

/* ════════════════════════════════════════════════════════════════════
   Fusionar y quitar repetidos
   ════════════════════════════════════════════════════════════════════ */

/** Junta las intervenciones seguidas de la misma voz: hueco menor que 1 s y menos de 60 s en total. */
export function fusionarContiguos(
  segmentos: readonly Segmento[],
  { huecoMs = HUECO_FUSION_MS, maxMs = MAX_INTERVENCION_MS }: { huecoMs?: number; maxMs?: number } = {},
): Segmento[] {
  const salida: Segmento[] = [];
  for (const s of [...segmentos].sort(porInicio)) {
    const u = salida[salida.length - 1];
    if (u && u.hablante === s.hablante && s.inicioMs - u.finMs < huecoMs && Math.max(u.finMs, s.finMs) - u.inicioMs < maxMs) {
      u.finMs = Math.max(u.finMs, s.finMs);
      u.texto = `${u.texto} ${s.texto}`;
    } else {
      salida.push({ ...s });
    }
  }
  return salida;
}

function palabras(texto: string): Set<string> {
  return new Set(
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** Qué fracción de las palabras de `a` están también en `b`. */
function contenidoEn(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0) return 0;
  let comunes = 0;
  for (const p of a) if (b.has(p)) comunes++;
  return comunes / a.size;
}

/**
 * Si dos tramos partieron distinto una misma frase del borde, el texto puede quedar dos veces: una en el tramo que
 * termina y otra en el que empieza. Se quita cuando una intervención de un tramo coincide en el tiempo con una del
 * tramo anterior Y casi todas sus palabras están en la otra. Dos personas que hablan a la vez dicen cosas distintas,
 * así que no se tocan.
 */
export function eliminarRepetidosDeBorde(duenos: ReadonlyArray<{ i: number; segmentos: readonly Segmento[] }>): Segmento[] {
  const ordenados = [...duenos].sort((a, b) => a.i - b.i);
  const descartados = new Set<Segmento>();
  const texto = new Map<Segmento, Set<string>>();
  const palabrasDe = (s: Segmento) => {
    let p = texto.get(s);
    if (!p) texto.set(s, (p = palabras(s.texto)));
    return p;
  };

  for (let k = 1; k < ordenados.length; k++) {
    for (const y of ordenados[k].segmentos) {
      for (const x of ordenados[k - 1].segmentos) {
        if (descartados.has(x) || descartados.has(y)) continue;
        if (Math.min(x.finMs, y.finMs) - Math.max(x.inicioMs, y.inicioMs) <= 0) continue;
        const px = palabrasDe(x);
        const py = palabrasDe(y);
        if (py.size >= PALABRAS_MINIMAS && contenidoEn(py, px) >= CONTENIDO_MINIMO) descartados.add(y);
        else if (px.size >= PALABRAS_MINIMAS && contenidoEn(px, py) >= CONTENIDO_MINIMO) descartados.add(x);
      }
    }
  }
  return ordenados.flatMap((d) => d.segmentos.filter((s) => !descartados.has(s)));
}

/* ════════════════════════════════════════════════════════════════════
   Unir los tramos
   ════════════════════════════════════════════════════════════════════ */

export type TramoParaUnir = {
  tramo: Tramo;
  /** Lo que devolvió el proveedor: tiempos relativos al inicio del audio del tramo y etiquetas locales. */
  segmentos: readonly Segmento[];
};

export type EtiquetaUnida = {
  etiqueta: string;
  talkMs: number;
  /** Un trozo de 5–8 s donde habla solo esa voz, para «Escuchar» en la pestaña Hablantes. */
  muestra: { desdeMs: number; hastaMs: number } | null;
  /** Es una de las voces de referencia (V1…V4). */
  referencia: boolean;
};

export type TranscripcionUnida = {
  segmentos: Segmento[];
  etiquetas: EtiquetaUnida[];
  cobertura: number;
  silencios: SilencioDetectado[];
};

const MUESTRA_HABLANTE = { ideal: 5_000, minima: 3_000, max: 8_000 };

export function unirTramos(tramos: readonly TramoParaUnir[], duracionMs: number, referencias: readonly ReferenciaElegida[] = []): TranscripcionUnida {
  const ordenados = [...tramos].sort((a, b) => a.tramo.i - b.tramo.i);
  const ultimoI = ordenados.length ? ordenados[ordenados.length - 1].tramo.i : -1;
  const nombresDeReferencia = new Set(referencias.map((r) => r.nombre));
  const usadas = new Set(nombresDeReferencia);
  const localDelTramo0 = new Map(referencias.map((r) => [r.etiquetaLocal, r.nombre]));

  let anterior: Segmento[] = []; // los segmentos del tramo anterior, ya con etiquetas globales
  let anteriorI = -2;
  const globalizados: Array<{ tramo: Tramo; segmentos: Segmento[] }> = [];
  /** Dónde se cose cada tramo con el anterior (por el número del tramo de la derecha). */
  const cortes = new Map<number, number>();
  for (const { tramo, segmentos } of ordenados) {
    const absolutos = aAbsolutos(tramo, segmentos).sort(porInicio);
    const locales = [...new Set(absolutos.map((s) => s.hablante))];
    const mapa = new Map<string, string>();
    const solape = tramo.nucleoDesdeMs - tramo.desdeMs;

    if (tramo.i === 0) {
      for (const l of locales) {
        const g = localDelTramo0.get(l) ?? etiquetaNueva(usadas);
        mapa.set(l, g);
        usadas.add(g);
      }
    } else {
      // Las que el proveedor ya llamó V1…V4 son globales; las demás se emparejan con el tramo anterior en el solape.
      const conocidas = new Set(locales.filter((l) => nombresDeReferencia.has(l)));
      const ventana = { desdeMs: tramo.nucleoDesdeMs - solape, hastaMs: tramo.nucleoDesdeMs + solape };
      const emparejadas = reconciliar(anterior, absolutos, ventana, { ocupadas: conocidas });
      for (const l of locales) {
        if (conocidas.has(l)) {
          mapa.set(l, l);
          continue;
        }
        const g = emparejadas.get(l) ?? etiquetaNueva(usadas);
        mapa.set(l, g);
        usadas.add(g);
      }
    }

    const globales = absolutos.map((s) => ({ ...s, hablante: mapa.get(s.hablante) ?? s.hablante }));
    // Solo se cose con el tramo anterior si de verdad es el vecino de la izquierda (si falta uno, se queda el borde).
    if (tramo.i > 0 && anteriorI === tramo.i - 1) cortes.set(tramo.i, puntoDeCorte(anterior, globales, tramo.nucleoDesdeMs, solape));
    anterior = globales;
    anteriorI = tramo.i;
    globalizados.push({ tramo, segmentos: globales });
  }

  const duenos = globalizados.map(({ tramo, segmentos }) => ({
    i: tramo.i,
    segmentos: asignarANucleo(tramo, segmentos, {
      ultimo: tramo.i === ultimoI,
      desdeMs: cortes.get(tramo.i),
      hastaMs: cortes.get(tramo.i + 1),
    }),
  }));

  const segmentos = fusionarContiguos(eliminarRepetidosDeBorde(duenos));
  const habla = tiempoDeHabla(segmentos);
  const etiquetas: EtiquetaUnida[] = [...habla.entries()]
    .map(([etiqueta, talkMs]) => ({
      etiqueta,
      talkMs,
      muestra:
        mejorMuestra(segmentos, etiqueta, { minMs: MUESTRA_HABLANTE.ideal, maxMs: MUESTRA_HABLANTE.max }) ??
        mejorMuestra(segmentos, etiqueta, { minMs: MUESTRA_HABLANTE.minima, maxMs: MUESTRA_HABLANTE.max }),
      referencia: nombresDeReferencia.has(etiqueta),
    }))
    .sort((a, b) => b.talkMs - a.talkMs || a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));

  return {
    segmentos,
    etiquetas,
    cobertura: calcularCobertura(
      ordenados.map((t) => ({ desdeMs: t.tramo.nucleoDesdeMs, hastaMs: t.tramo.nucleoHastaMs })),
      duracionMs,
    ),
    silencios: detectarSilencios(segmentos, duracionMs),
  };
}

/* ════════════════════════════════════════════════════════════════════
   Texto
   ════════════════════════════════════════════════════════════════════ */

const enUnaLinea = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * La transcripción como texto, una línea por intervención: `[01:23:45] V1 (Martha López): texto`. Sin nombre queda
 * `[01:23:45] V1: texto`. Los silencios largos se intercalan como `[00:30:20] (Sin voz hasta 00:41:00)`.
 */
export function formatearTranscripcion(
  segmentos: ReadonlyArray<Pick<Segmento, "inicioMs" | "hablante" | "texto">>,
  nombres: Readonly<Record<string, string>> = {},
  silencios: readonly SilencioDetectado[] = [],
): string {
  const items: Array<{ ms: number; orden: number; linea: string }> = [
    ...segmentos.map((s) => {
      const nombre = enUnaLinea(nombres[s.hablante] ?? "");
      return {
        ms: s.inicioMs,
        orden: 1,
        linea: `[${formatearReloj(s.inicioMs)}] ${s.hablante}${nombre ? ` (${nombre})` : ""}: ${enUnaLinea(s.texto)}`,
      };
    }),
    ...silencios.map((s) => ({
      ms: s.desdeMs,
      orden: 0,
      linea: `[${formatearReloj(s.desdeMs)}] (Sin voz hasta ${formatearReloj(s.hastaMs)})`,
    })),
  ];
  return items
    .sort((a, b) => a.ms - b.ms || a.orden - b.orden)
    .map((i) => i.linea)
    .join("\n");
}
