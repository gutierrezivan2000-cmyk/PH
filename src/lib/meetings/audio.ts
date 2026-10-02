/**
 * Audio de una reunión (servidor): una sola línea de tiempo en MP3 CBR 32 kbps mono 16 kHz.
 *
 * A esa tasa cada trama mide EXACTAMENTE 144 bytes y dura 36 ms, así que el milisegundo `t` está en el byte
 * `floor(t / 36) * 144` y recortar un tramo para transcribirlo es leer un rango de bytes, sin ffmpeg. Sin cabecera
 * Xing ni etiqueta ID3, concatenar segmentos (o archivos) da otro MP3 válido: `audio.mp3` es la suma de los
 * segmentos normalizados de todas las fuentes, en orden.
 */
import {
  concatenarFlujos, contarBytes, leerTodo, type Almacen, type RangoBytes,
} from "./almacen";
import { MP3_BYTES_POR_MS, MP3_TRAMA_BYTES, MP3_TRAMA_MS, duracionMp3Cbr } from "./tipos";

/* ════════════════════════════════════════════════════════════════════
   Aritmética de tiempo y bytes (pura)
   ════════════════════════════════════════════════════════════════════ */

/** El primer byte de la trama que contiene el milisegundo `ms`. */
export const byteDeMs = (ms: number): number => Math.floor(Math.max(0, ms) / MP3_TRAMA_MS) * MP3_TRAMA_BYTES;

/**
 * Los bytes que cubren de `desdeMs` a `hastaMs`: de la trama que contiene el principio a la que contiene el final
 * (inclusive en ambos extremos, como un `Range` de HTTP). Con `totalBytes` no pasa del final del archivo.
 */
export function rangoDeBytes(desdeMs: number, hastaMs: number, totalBytes?: number): RangoBytes & { hasta: number } {
  const desde = byteDeMs(desdeMs);
  let hasta = Math.ceil(Math.max(hastaMs, desdeMs + 1) / MP3_TRAMA_MS) * MP3_TRAMA_BYTES - 1;
  if (totalBytes !== undefined) hasta = Math.min(hasta, totalBytes - 1);
  return { desde, hasta };
}

/** ¿Es un tamaño de MP3 normalizado (solo tramas completas)? */
export const esMultiploDeTrama = (bytes: number): boolean => bytes > 0 && bytes % MP3_TRAMA_BYTES === 0;

/** ¿Empieza este bloque de bytes con una cabecera de trama MPEG-2 capa III (`FF F3`) — y no con ID3 ni Xing? */
export const empiezaConTrama = (b: Uint8Array): boolean => b.length >= 2 && b[0] === 0xff && (b[1] & 0xfe) === 0xf2;

/* ════════════════════════════════════════════════════════════════════
   Segmentos normalizados
   ════════════════════════════════════════════════════════════════════ */

/** Lo que se guarda en `MeetingSource.segments`. */
export type SegmentoGuardado = { n: number; url: string; durationMs: number; bytes: number };

/** Lee `MeetingSource.segments` (JSON escrito por el procesamiento) con tolerancia: lo que no cuadra se descarta. */
export function leerSegmentos(json: unknown): SegmentoGuardado[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((s): SegmentoGuardado[] => {
      const x = s as Record<string, unknown> | null;
      return x && typeof x.n === "number" && typeof x.url === "string" && typeof x.bytes === "number" && x.bytes > 0 && typeof x.durationMs === "number"
        ? [{ n: x.n, url: x.url, durationMs: x.durationMs, bytes: x.bytes }]
        : [];
    })
    .sort((a, b) => a.n - b.n);
}

/** Cuánto lleva normalizado una fuente: la suma de lo que duran sus segmentos (los bytes mandan). */
export const normalizadoMs = (segmentos: readonly SegmentoGuardado[]): number => segmentos.reduce((s, x) => s + duracionMp3Cbr(x.bytes), 0);

/** El siguiente número de segmento (y de dónde seguir) tras lo ya hecho. */
export function siguienteSegmento(segmentos: readonly SegmentoGuardado[]): { numero: number; desdeMs: number } {
  const ultimo = segmentos.length ? segmentos[segmentos.length - 1].n : -1;
  return { numero: ultimo + 1, desdeMs: normalizadoMs(segmentos) };
}

export const rutaDeSegmento = (prefijoReunion: string, sourceId: string, n: number): string =>
  `${prefijoReunion}norm/${sourceId}/${String(n).padStart(4, "0")}.mp3`;

/* ════════════════════════════════════════════════════════════════════
   Ensamblar una sesión de la grabadora
   ════════════════════════════════════════════════════════════════════ */

export type ParteParaEnsamblar = { url: string; bytes: number };

/**
 * Concatena las partes de una sesión (en orden) en un solo archivo. No necesita ffmpeg: las partes de una misma
 * sesión, unidas en orden, SON un archivo WebM o MP4 válido (se comprobó con grabaciones reales de Chromium).
 * Se comprueba que lo subido pese exactamente lo que suman las partes.
 */
export async function ensamblarSesion(
  almacen: Almacen,
  partes: readonly ParteParaEnsamblar[],
  pathname: string,
  contentType: string,
  senal?: AbortSignal,
): Promise<{ url: string; pathname: string; bytes: number }> {
  if (partes.length === 0) throw new Error("No hay partes que ensamblar.");
  const esperado = partes.reduce((s, p) => s + p.bytes, 0);
  // Se pide la siguiente parte mientras se sube la actual: 900 lecturas una tras otra tardarían más de lo que hay.
  const flujo = concatenarFlujos(partes.map((p) => async () => (await almacen.leer(p.url, { senal })).flujo), senal, 4);
  const contado = contarBytes(flujo);
  const r = await almacen.subirFlujo(pathname, contado.flujo, contentType);
  const subido = await almacen.tamano(r.url);
  if (contado.bytes() !== esperado || subido !== esperado) {
    throw new Error(`La sesión ensamblada pesa ${subido} bytes y debía pesar ${esperado}.`);
  }
  return { url: r.url, pathname: r.pathname, bytes: esperado };
}

/* ════════════════════════════════════════════════════════════════════
   Armar audio.mp3
   ════════════════════════════════════════════════════════════════════ */

export type FuenteParaArmar = { id: string; idx: number; segmentos: readonly SegmentoGuardado[] };

export type AudioArmado = {
  url: string;
  pathname: string;
  bytes: number;
  durationMs: number;
  /** Dónde empieza cada fuente dentro de audio.mp3. */
  offsets: Map<string, number>;
};

/**
 * Une en orden los segmentos de todas las fuentes en `audio.mp3` y calcula el `offsetMs` de cada fuente y la
 * duración total. Después comprueba, leyendo 2 bytes en cada unión, que cada segmento empieza con una cabecera de
 * trama (`FF F3`): si quedó un ID3 o un Xing en medio, se dice aquí y no al reproducir.
 */
export async function armarAudio(almacen: Almacen, pathname: string, fuentes: readonly FuenteParaArmar[], senal?: AbortSignal): Promise<AudioArmado> {
  const ordenadas = [...fuentes].sort((a, b) => a.idx - b.idx);
  const segmentos = ordenadas.flatMap((f) => f.segmentos);
  if (segmentos.length === 0) throw new Error("No hay audio normalizado que unir.");
  for (const s of segmentos) {
    if (!esMultiploDeTrama(s.bytes)) throw new Error(`El segmento ${s.n} no tiene tramas completas (${s.bytes} bytes).`);
  }

  const offsets = new Map<string, number>();
  let bytes = 0;
  const uniones: number[] = [];
  for (const f of ordenadas) {
    offsets.set(f.id, bytes / MP3_BYTES_POR_MS);
    for (const s of f.segmentos) {
      uniones.push(bytes);
      bytes += s.bytes;
    }
  }

  const flujo = concatenarFlujos(segmentos.map((s) => async () => (await almacen.leer(s.url, { senal })).flujo), senal, 3);
  const contado = contarBytes(flujo);
  const r = await almacen.subirFlujo(pathname, contado.flujo, "audio/mpeg");
  const subido = await almacen.tamano(r.url);
  if (contado.bytes() !== bytes || subido !== bytes) throw new Error(`audio.mp3 pesa ${subido} bytes y debía pesar ${bytes}.`);

  // Cada unión debe caer en una cabecera de trama.
  for (let i = 0; i < uniones.length; i += 6) {
    const lote = uniones.slice(i, i + 6);
    const cabezas = await Promise.all(lote.map((desde) => leerTodo(almacen, r.url, { desde, hasta: desde + 1 })));
    cabezas.forEach((c, k) => {
      if (!empiezaConTrama(c)) throw new Error(`audio.mp3 no tiene una trama válida en el byte ${lote[k]} (¿quedó una etiqueta entre segmentos?).`);
    });
  }
  return { url: r.url, pathname: r.pathname, bytes, durationMs: duracionMp3Cbr(bytes), offsets };
}

/**
 * Recorta un tramo del audio con una lectura por rango (sin ffmpeg). La primera trama puede perder 36 ms por la
 * reserva de bits del MP3; no afecta a la transcripción.
 */
export async function recortar(almacen: Almacen, audioUrl: string, desdeMs: number, hastaMs: number, totalBytes?: number): Promise<Uint8Array> {
  return leerTodo(almacen, audioUrl, rangoDeBytes(desdeMs, hastaMs, totalBytes));
}
