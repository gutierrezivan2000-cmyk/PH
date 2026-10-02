/**
 * Trozos y partes de la grabadora (funciones puras).
 *
 * El navegador entrega un TROZO cada 5 s (`MediaRecorder` con `timeslice`). Un trozo suelto no se
 * puede reproducir: solo el primero lleva la cabecera del archivo; unidos EN ORDEN forman el archivo
 * completo de esa sesión. Al servidor se sube una PARTE cada ~30 s, que es la unión de seis trozos
 * consecutivos. Las partes se numeran por la posición de sus trozos (parte k = trozos 6k…6k+5), no por
 * el momento en que se envían: así, tras cerrar el navegador a mitad, las partes que faltan por subir
 * se reconstruyen idénticas a partir de lo guardado.
 */
import { VIVO_ENVIO_MS, VIVO_PARTE_MAX_BYTES, VIVO_TROZO_MS } from "./tipos";

/** Trozos que forman una parte (30 s / 5 s = 6). */
export const TROZOS_POR_PARTE = Math.round(VIVO_ENVIO_MS / VIVO_TROZO_MS);

/** A qué parte pertenece el trozo `idx`. */
export const parteDeTrozo = (idx: number): number => Math.floor(idx / TROZOS_POR_PARTE);

/** Rango de trozos [desde, hasta] de la parte `seq`. */
export function trozosDeParte(seq: number): { desde: number; hasta: number } {
  return { desde: seq * TROZOS_POR_PARTE, hasta: seq * TROZOS_POR_PARTE + TROZOS_POR_PARTE - 1 };
}

/**
 * Partes que ya se pueden subir cuando el último trozo guardado es `ultimoIdx` (−1 = ninguno): las que
 * tienen sus seis trozos y, si la sesión ya cerró, también la última, aunque esté incompleta.
 */
export function partesCompletas(ultimoIdx: number, cerrada: boolean): number[] {
  if (ultimoIdx < 0) return [];
  const trozos = ultimoIdx + 1;
  const n = cerrada ? Math.ceil(trozos / TROZOS_POR_PARTE) : Math.floor(trozos / TROZOS_POR_PARTE);
  return Array.from({ length: n }, (_, k) => k);
}

/** Las partes listas que el servidor aún no confirmó, en orden. */
export function partesPendientes(ultimoIdx: number, cerrada: boolean, enviadas: Iterable<number>): number[] {
  const hechas = new Set(enviadas);
  return partesCompletas(ultimoIdx, cerrada).filter((k) => !hechas.has(k));
}

/** Ordena partes por sesión y luego por número (sin modificar el original). */
export function ordenarPartes<T extends { session: number; seq: number }>(partes: readonly T[]): T[] {
  return [...partes].sort((a, b) => a.session - b.session || a.seq - b.seq);
}

/**
 * Números de parte que faltan entre 0 y la última (inclusive). Con `ultima` se comprueba contra lo que
 * debía haber; sin ella, contra la mayor que llegó (un hueco AL FINAL no se puede detectar así: por eso
 * el cierre de la grabación declara cuál era la última).
 */
export function detectarHuecos(seqs: Iterable<number>, ultima?: number): number[] {
  const llegadas = new Set(seqs);
  const tope = ultima ?? (llegadas.size ? Math.max(...llegadas) : -1);
  const faltan: number[] = [];
  for (let k = 0; k <= tope; k++) if (!llegadas.has(k)) faltan.push(k);
  return faltan;
}

/** Extensión de archivo que corresponde al tipo MIME de la grabación. */
export function extensionDeGrabacion(mime: string): "webm" | "mp4" | "ogg" | null {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "audio/webm") return "webm";
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/aac") return "mp4";
  if (base === "audio/ogg") return "ogg";
  return null;
}

/** El tipo MIME sin parámetros («audio/webm;codecs=opus» → «audio/webm»). */
export const mimeBase = (mime: string): string => mime.split(";")[0].trim().toLowerCase();

/**
 * Con qué tipo grabar: el primero que el navegador soporte. Chrome, Edge y Android dan WebM/Opus; Safari
 * (iOS y macOS) da MP4 fragmentado. null = este navegador no puede grabar audio.
 */
export const MIMES_PREFERIDOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"] as const;

export function elegirMime(soporta: (mime: string) => boolean): string | null {
  return MIMES_PREFERIDOS.find((m) => soporta(m)) ?? null;
}

/** ¿Cabe esta parte en lo que acepta el servidor? */
export const parteCabe = (bytes: number): boolean => bytes > 0 && bytes <= VIVO_PARTE_MAX_BYTES;

/** Une los trozos en el orden dado (el orden ES el archivo). */
export function unirTrozos(trozos: ReadonlyArray<ArrayBuffer>, mime: string): Blob {
  return new Blob([...trozos], { type: mimeBase(mime) });
}
