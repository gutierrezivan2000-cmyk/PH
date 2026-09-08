/**
 * Topes de subida, en un solo sitio.
 *
 * Antes había un único tope de 25 MB para todo, y eso hacía imposible el flujo
 * principal del producto: el insumo de un ACTA es la grabación de la asamblea,
 * que dura entre dos y cuatro horas y nunca cabe en 25 MB. Además, 25 MB
 * significan cosas muy distintas según el archivo — son dos minutos de WAV o
 * media hora de MP3 —, así que el tope se fija POR TIPO.
 *
 * El techo del audio no es un número redondo: sale del tiempo que la función
 * tiene para transcribir. Con segmentos de 10 minutos, cuatro en paralelo y un
 * presupuesto de 200 s (ver parsers/audio.ts), caben unas 2,5–3 horas de
 * grabación. 200 MB cubren ese rango holgadamente en los códecs que usan los
 * móviles (un MP3 de 2 h ronda los 60–120 MB).
 */

export const MAX_AUDIO_MB = 200;
export const MAX_DOC_MB = 50;

/** Extensiones que tratamos como audio a efectos del tope. */
const EXT_AUDIO = new Set([
  "mp3", "m4a", "mp4", "aac", "wav", "ogg", "oga", "opus",
  "webm", "amr", "3gp", "3gpp", "flac", "caf", "wma",
]);

/**
 * Tipos que acepta el almacenamiento. Incluye los formatos que graban los
 * móviles de verdad (m4a de iPhone, 3gpp y amr de Android, opus de WhatsApp):
 * la pantalla los dejaba soltar y el servidor los rechazaba.
 */
export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/x-aac",
  "audio/amr",
  "audio/3gpp",
  "audio/3gpp2",
  "audio/flac",
  "audio/x-flac",
  "audio/x-caf",
  "audio/x-ms-wma",
];

export function extensionDe(nombre: string): string {
  const partes = (nombre || "").split(".");
  return partes.length > 1 ? partes.pop()!.toLowerCase() : "";
}

export function esAudio(nombre: string): boolean {
  return EXT_AUDIO.has(extensionDe(nombre));
}

/** Tope en MB que le corresponde a un archivo por su nombre. */
export function limiteMbPara(nombre: string): number {
  return esAudio(nombre) ? MAX_AUDIO_MB : MAX_DOC_MB;
}

export function limiteBytesPara(nombre: string): number {
  return limiteMbPara(nombre) * 1024 * 1024;
}

/** El mayor de los topes: sirve para el mensaje genérico de la interfaz. */
export const MAX_ANY_MB = Math.max(MAX_AUDIO_MB, MAX_DOC_MB);
