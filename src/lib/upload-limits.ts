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

/**
 * Tipo MIME por extensión, para cuando el navegador no lo sabe.
 *
 * Muchos móviles y gestores de archivos entregan la grabación con `type`
 * vacío; el cliente mandaba entonces "application/octet-stream", que la lista
 * de arriba NO admite, y la subida moría tras subir el archivo entero con un
 * error en inglés de la librería de almacenamiento.
 */
const TIPOS_POR_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac",
  wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  webm: "audio/webm", amr: "audio/amr", "3gp": "audio/3gpp", "3gpp": "audio/3gpp",
  flac: "audio/flac", caf: "audio/x-caf", wma: "audio/x-ms-wma",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", txt: "text/plain",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};

export function tipoDeArchivo(file: { name: string; type?: string }): string {
  const porExtension = TIPOS_POR_EXTENSION[extensionDe(file.name)];
  // La extensión manda sobre un `type` genérico.
  if (porExtension && (!file.type || file.type === "application/octet-stream")) return porExtension;
  return file.type || porExtension || "application/octet-stream";
}

/** Extensiones que ofrece el selector de archivos, alineadas con lo que se sabe leer. */
export const ACCEPT_ARCHIVOS =
  ".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp," +
  ".mp3,.wav,.ogg,.oga,.opus,.m4a,.mp4,.aac,.webm,.amr,.3gp,.flac";

/** Explica el tope del archivo concreto, no un número genérico. */
export function mensajeDeTamano(file: { name: string; size: number }): string {
  const mb = (file.size / 1024 / 1024).toFixed(1);
  const tope = limiteMbPara(file.name);
  return esAudio(file.name)
    ? `"${file.name}" pesa ${mb} MB y el máximo para audio es ${tope} MB. Si la grabación es más larga, súbela partida en dos archivos.`
    : `"${file.name}" pesa ${mb} MB y el máximo para documentos es ${tope} MB.`;
}

/**
 * Tamaño de archivo legible para la interfaz.
 *
 * Antes las fichas de archivo del chat mostraban `(size/1024).toFixed(0)}KB`:
 * un archivo de 402 bytes aparecía como «0KB» —parecía vacío o roto— y uno de
 * 3 MB como «2930KB». Se escala la unidad y se conserva un decimal por debajo
 * de 10 KB, que es donde el redondeo a entero engaña.
 */
export function formatoTamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1000) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  // Las grabaciones de reuniones sí llegan a GB (un WAV de 8 h pesa ~5,5 GB): «5632.0 MB» no se lee.
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/* ════════════════════════════════════════════════════════════════════
   Reuniones: audio Y video, sin tope por tamaño
   La subida es directa y reanudable (el archivo no pasa por el servidor), así
   que no rige MAX_AUDIO_MB: solo un tope de seguridad por archivo
   (MAX_FUENTE_BYTES en lib/meetings/tipos). Zoom, Meet y Teams entregan MP4;
   el celular, MOV: ffmpeg extrae el audio de cualquiera de ellos.
   ════════════════════════════════════════════════════════════════════ */

/** Extensiones de video que se aceptan además del audio (mp4, webm y 3gp ya cuentan como audio). */
const EXT_VIDEO_REUNION = new Set(["mov", "m4v", "mkv", "avi", "mpg", "mpeg", "wmv"]);

const TIPOS_VIDEO_REUNION = [
  "video/mp4", "video/quicktime", "video/x-m4v", "video/webm", "video/x-matroska", "video/x-msvideo",
  "video/mpeg", "video/3gpp", "video/x-ms-wmv",
];

/** Tipos MIME que acepta la subida de reuniones: todo el audio de arriba más video. */
export const TIPOS_ARCHIVO_REUNION: string[] = [
  ...ALLOWED_CONTENT_TYPES.filter((t) => t.startsWith("audio/")),
  ...TIPOS_VIDEO_REUNION,
];

/** Para el selector de archivos de Reuniones. */
export const ACCEPT_REUNION =
  ".mp3,.m4a,.wav,.ogg,.oga,.opus,.aac,.webm,.amr,.3gp,.flac,.caf,.wma,.mp4,.mov,.m4v,.mkv,.avi,.mpg,.mpeg,.wmv";

export function esArchivoDeReunion(nombre: string): boolean {
  const ext = extensionDe(nombre);
  return EXT_AUDIO.has(ext) || EXT_VIDEO_REUNION.has(ext);
}

const TIPOS_VIDEO_POR_EXTENSION: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", mkv: "video/x-matroska",
  avi: "video/x-msvideo", mpg: "video/mpeg", mpeg: "video/mpeg", wmv: "video/x-ms-wmv",
};

/**
 * Tipo MIME de un archivo de reunión. Si el navegador no lo sabe (móviles y gestores de
 * archivos entregan `type` vacío) se deduce de la extensión; a diferencia de tipoDeArchivo,
 * un .mp4 sin tipo se toma por video (el audio también viaja en MP4 y ffmpeg lo trata igual).
 */
export function tipoDeArchivoReunion(file: { name: string; type?: string }): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = extensionDe(file.name);
  return TIPOS_VIDEO_POR_EXTENSION[ext] ?? TIPOS_POR_EXTENSION[ext] ?? "application/octet-stream";
}

/** ¿Lo puede recibir la subida de reuniones? (tipo MIME ya resuelto). */
export function esTipoDeReunionPermitido(tipo: string): boolean {
  return TIPOS_ARCHIVO_REUNION.includes(tipo);
}
