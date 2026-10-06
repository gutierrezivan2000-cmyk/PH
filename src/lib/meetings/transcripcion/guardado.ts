/**
 * Lo que las tareas de transcripción dejan guardado en la base de datos (JSON), y cómo se vuelve a leer.
 *
 * Es JSON escrito por el propio procesamiento, pero se lee con tolerancia: lo que no cuadra se descarta en vez de
 * romper la unión de una reunión de 8 horas por un dato dañado.
 */
import type { ReferenciaElegida, ResultadoDeTramo, Segmento, Tramo } from "./tipos";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function leerSegmentosGuardados(json: unknown): Segmento[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((s): Segmento[] => {
    if (!esObjeto(s) || !esNumero(s.inicioMs) || !esNumero(s.finMs) || typeof s.hablante !== "string" || typeof s.texto !== "string") return [];
    return [{ inicioMs: s.inicioMs, finMs: s.finMs, hablante: s.hablante, texto: s.texto }];
  });
}

/** El `result` de una tarea `transcribir_tramo`. null si no es legible. */
export function leerResultadoDeTramo(json: unknown): ResultadoDeTramo | null {
  if (!esObjeto(json)) return null;
  const { i, desdeMs, hastaMs, nucleoDesdeMs, nucleoHastaMs } = json;
  if (!esNumero(i) || !esNumero(desdeMs) || !esNumero(hastaMs) || !esNumero(nucleoDesdeMs) || !esNumero(nucleoHastaMs)) return null;
  return {
    i,
    desdeMs,
    hastaMs,
    nucleoDesdeMs,
    nucleoHastaMs,
    segmentos: leerSegmentosGuardados(json.segmentos),
    costoUsd: esNumero(json.costoUsd) ? json.costoUsd : 0,
    proveedor: typeof json.proveedor === "string" ? json.proveedor : "desconocido",
    omitido: typeof json.omitido === "string" ? json.omitido : undefined,
  };
}

export const tramoDeResultado = (r: ResultadoDeTramo): Tramo => ({
  i: r.i, desdeMs: r.desdeMs, hastaMs: r.hastaMs, nucleoDesdeMs: r.nucleoDesdeMs, nucleoHastaMs: r.nucleoHastaMs,
});

/** `Meeting.speakerRefs`: las voces de referencia elegidas en el primer tramo (hasta 4, V1…V4). */
export function leerReferenciasElegidas(json: unknown): ReferenciaElegida[] {
  if (!Array.isArray(json)) return [];
  const vistas = new Set<string>();
  const salida: ReferenciaElegida[] = [];
  for (const r of json) {
    if (!esObjeto(r) || typeof r.nombre !== "string" || !/^V[1-4]$/.test(r.nombre) || vistas.has(r.nombre)) continue;
    if (typeof r.etiquetaLocal !== "string" || !esNumero(r.desdeMs) || !esNumero(r.hastaMs) || r.hastaMs <= r.desdeMs) continue;
    vistas.add(r.nombre);
    salida.push({ nombre: r.nombre, etiquetaLocal: r.etiquetaLocal, desdeMs: r.desdeMs, hastaMs: r.hastaMs });
  }
  return salida.slice(0, 4);
}
