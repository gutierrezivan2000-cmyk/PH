/**
 * Reuniones: tipos, estados, constantes y formatos compartidos.
 *
 * Es TypeScript puro (sin React ni acceso a la base): lo usan a la vez el
 * servidor, el navegador y las pruebas. Las decisiones detrás de cada número
 * están en design/reuniones/PLAN.md.
 */
import type { TipoEstado } from "@/components/kit/Estado";

/* ════════════════════════════════════════════════════════════════════
   Tipos de reunión
   ════════════════════════════════════════════════════════════════════ */

export const TIPOS_DE_REUNION = {
  consejo: { nombre: "Consejo de administración", corto: "Consejo" },
  comite: { nombre: "Comité", corto: "Comité" },
  asamblea_ordinaria: { nombre: "Asamblea ordinaria", corto: "Asamblea ordinaria" },
  asamblea_extraordinaria: { nombre: "Asamblea extraordinaria", corto: "Asamblea extraordinaria" },
  otra: { nombre: "Otra reunión", corto: "Otra" },
} as const;

export type TipoReunion = keyof typeof TIPOS_DE_REUNION;

export const CLAVES_TIPO_REUNION = Object.keys(TIPOS_DE_REUNION) as TipoReunion[];

export function esTipoReunion(valor: unknown): valor is TipoReunion {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(TIPOS_DE_REUNION, valor);
}

/** Nombre completo del tipo («Consejo de administración»); «Reunión» si el valor no se conoce. */
export function nombreTipoReunion(tipo: string | null | undefined): string {
  return esTipoReunion(tipo) ? TIPOS_DE_REUNION[tipo].nombre : "Reunión";
}

/** Nombre corto para tablas y subtítulos. */
export function cortoTipoReunion(tipo: string | null | undefined): string {
  return esTipoReunion(tipo) ? TIPOS_DE_REUNION[tipo].corto : "Reunión";
}

/* ════════════════════════════════════════════════════════════════════
   Estados
   ════════════════════════════════════════════════════════════════════ */

export const ESTADOS_REUNION = [
  "borrador", "grabando", "subiendo", "en_cola", "procesando", "lista", "error", "sin_cupo",
] as const;

export type EstadoReunion = (typeof ESTADOS_REUNION)[number];

export function esEstadoReunion(valor: unknown): valor is EstadoReunion {
  return typeof valor === "string" && (ESTADOS_REUNION as readonly string[]).includes(valor);
}

/** Pasos del procesamiento, en el orden en que ocurren (`Meeting.stage`). */
export const ETAPAS = ["preparando_audio", "transcribiendo", "uniendo", "analizando"] as const;
export type EtapaReunion = (typeof ETAPAS)[number];

export const TEXTO_ETAPA: Record<EtapaReunion, string> = {
  preparando_audio: "Preparando el audio",
  transcribiendo: "Transcribiendo",
  uniendo: "Uniendo y verificando cobertura",
  analizando: "Analizando con IA",
};

/** Cómo se dice cada estado y qué `Estado` del kit lo pinta (icono + color + palabra, nunca solo color). */
const BASE_ESTADO: Record<EstadoReunion, { tipo: TipoEstado; texto: string }> = {
  borrador: { tipo: "sin", texto: "Sin audio" },
  grabando: { tipo: "enCurso", texto: "Grabando" },
  subiendo: { tipo: "enCurso", texto: "Subiendo" },
  en_cola: { tipo: "pendiente", texto: "En cola" },
  procesando: { tipo: "enCurso", texto: "Procesando" },
  lista: { tipo: "ok", texto: "Lista" },
  error: { tipo: "vencido", texto: "Error" },
  sin_cupo: { tipo: "falta", texto: "Sin horas disponibles" },
};

export type DatosEstado = {
  status: string;
  stage?: string | null;
  /** 0-100 del paso actual. */
  progress?: number | null;
  /** Tareas hechas y totales del paso actual (la ruta de estado las trae). */
  hechas?: number | null;
  total?: number | null;
};

const entre0y100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * El estado de una reunión como lo ve la persona: «Subiendo 45 %», «Transcribiendo 23 de 48»,
 * «Lista». Un estado desconocido se muestra neutro en vez de romper la pantalla.
 */
export function describirEstado(d: DatosEstado): { tipo: TipoEstado; texto: string } {
  if (!esEstadoReunion(d.status)) return { tipo: "sin", texto: d.status || "Sin estado" };
  const base = BASE_ESTADO[d.status];
  const pct = typeof d.progress === "number" && Number.isFinite(d.progress) ? entre0y100(d.progress) : null;

  if (d.status === "subiendo" && pct !== null && pct > 0) return { tipo: base.tipo, texto: `Subiendo ${pct} %` };

  if (d.status === "procesando") {
    const etapa = (ETAPAS as readonly string[]).includes(d.stage ?? "") ? (d.stage as EtapaReunion) : null;
    const hayConteo = typeof d.hechas === "number" && typeof d.total === "number" && d.total > 0;
    if (etapa === "transcribiendo") {
      if (hayConteo) return { tipo: base.tipo, texto: `Transcribiendo ${d.hechas} de ${d.total}` };
      return { tipo: base.tipo, texto: pct !== null ? `Transcribiendo ${pct} %` : "Transcribiendo" };
    }
    if (etapa === "preparando_audio") return { tipo: base.tipo, texto: "Preparando el audio" };
    if (etapa === "uniendo") return { tipo: base.tipo, texto: "Uniendo y verificando" };
    if (etapa === "analizando") return { tipo: base.tipo, texto: "Analizando con IA" };
  }
  return base;
}

/** Solo se suman archivos mientras la reunión no se ha cerrado a la captura. */
export function puedeAgregarFuentes(status: string): boolean {
  return status === "borrador" || status === "subiendo" || status === "error";
}

/** El trabajo sigue en marcha en el servidor (la página debe seguir consultando el estado). */
export function estaEnMarcha(status: string): boolean {
  return status === "en_cola" || status === "procesando";
}

/* ════════════════════════════════════════════════════════════════════
   Audio normalizado: MP3 CBR 32 kbps, mono, 16 kHz
   A esa tasa cada trama mide exactamente 144 bytes y dura 36 ms, sin relleno.
   Por eso un milisegundo se traduce a un byte y recortar es leer un rango.
   ════════════════════════════════════════════════════════════════════ */

export const MP3_KBPS = 32;
export const MP3_HZ = 16_000;
export const MP3_TRAMA_BYTES = 144;
export const MP3_TRAMA_MS = 36;
/** 32 kbps = 4000 bytes por segundo = 4 bytes por milisegundo. */
export const MP3_BYTES_POR_MS = 4;

/** Duración de un MP3 CBR normalizado a partir de su tamaño (sin leer el archivo). */
export function duracionMp3Cbr(bytes: number): number {
  return Math.max(0, Math.round(bytes / MP3_BYTES_POR_MS));
}

/* ════════════════════════════════════════════════════════════════════
   Procesamiento
   ════════════════════════════════════════════════════════════════════ */

/** Cada tramo se transcribe aparte (10 min) con 30 s de solape a cada lado. */
export const TRAMO_MS = 10 * 60_000;
export const SOLAPE_MS = 30_000;
/** La ficha se arma por bloques de unos 25 minutos. */
export const BLOQUE_MS = 25 * 60_000;
/** Una tarea de la cola nunca debe pasar de esto (las rutas tienen maxDuration = 300). */
export const PRESUPUESTO_TAREA_MS = 230_000;
export const MAX_INTENTOS_TAREA = 3;
/** Espera antes del reintento 1, 2 y 3. */
export const ESPERAS_REINTENTO_MS = [30_000, 120_000, 600_000] as const;
/** Una tarea «en curso» sin latido por tanto tiempo se considera muerta. */
export const TAREA_MUERTA_MS = 10 * 60_000;

/* ════════════════════════════════════════════════════════════════════
   Captura
   ════════════════════════════════════════════════════════════════════ */

/** Partes de la subida directa: Blob exige 5 MB como mínimo (salvo la última). */
export const PARTE_SUBIDA_BYTES = 16 * 1024 * 1024;
/** Tope de seguridad por archivo (no de producto): una reunión de 8 h en WAV pesa unos 5,5 GB. */
export const MAX_FUENTE_BYTES = 20 * 1024 * 1024 * 1024;
/** Tope de archivos por reunión; frena abusos, no reuniones largas. */
export const MAX_FUENTES_POR_REUNION = 60;

/** La grabadora corta trozos de 5 s y los envía cada ~30 s. */
export const VIVO_TROZO_MS = 5_000;
export const VIVO_ENVIO_MS = 30_000;
export const VIVO_PARTE_MAX_BYTES = 2 * 1024 * 1024;
export const VIVO_BITS_POR_SEGUNDO = 32_000;
/** Si no entra sonido por tanto tiempo, la grabadora avisa. */
export const VIVO_SILENCIO_AVISO_MS = 2 * 60_000;

/* ════════════════════════════════════════════════════════════════════
   Retención
   ════════════════════════════════════════════════════════════════════ */

/** El original subido (y la sesión ensamblada) se borra a los 90 días; el audio normalizado y la transcripción se quedan. */
export const RETENCION_ORIGINAL_DIAS = 90;
/** Las partes en vivo huérfanas se limpian a los 2 días. */
export const RETENCION_PARTES_VIVO_DIAS = 2;

/* ════════════════════════════════════════════════════════════════════
   Formatos de tiempo
   ════════════════════════════════════════════════════════════════════ */

const dos = (n: number) => String(n).padStart(2, "0");

/** Reloj de la transcripción: 4_990_000 → «01:23:10». Siempre con horas, para que las citas se lean igual. */
export function formatearReloj(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${dos(h)}:${dos(m)}:${dos(s)}`;
}

/** Lo inverso: «01:23:10» o «23:10» → milisegundos; null si no es un reloj válido. */
export function leerReloj(texto: string): number | null {
  const m = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (min > 59 || s > 59) return null;
  return ((h * 60 + min) * 60 + s) * 1000;
}

/**
 * Duración para leer, no para medir: «8 h 12 min», «45 min», «50 s».
 * Redondea al minuto desde el primer minuto; por debajo, segundos.
 */
export function formatearDuracion(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return "—";
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.round(segundos / 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
