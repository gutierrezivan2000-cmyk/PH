/** Tipos y claves de las tareas de transcripción y de análisis (en un módulo liviano: las usan el orquestador y los manejadores). */
export const KIND_TRAMO = "transcribir_tramo";
export const KIND_VOCES = "voces";
export const KIND_UNIR = "unir";
export const CLAVE_VOCES = "voces";
export const CLAVE_UNIR = "unir";
export const claveTramo = (i: number): string => `tramo:${i}`;

/** El análisis con IA: un bloque de ~25 min cada tarea, y la ficha que los junta. */
export const KIND_BLOQUE = "analizar_bloque";
export const KIND_FICHA = "ficha";
export const CLAVE_FICHA = "ficha";
export const claveBloque = (k: number): string => `bloque:${k}`;

/**
 * El acta: tres tipos de tarea por cada acta que se pide (cada acta es una `Generation` con `meetingId`).
 * `calentar` escribe la transcripción en la caché del servicio; después van las secciones (en paralelo, leyendo esa caché) y,
 * cuando todas están, `final` las arma. Las claves llevan el identificador de la generación: puede haber varias actas por reunión.
 */
export const KIND_ACTA_CALENTAR = "acta_calentar";
export const KIND_ACTA_SECCION = "acta_seccion";
export const KIND_ACTA_FINAL = "acta_final";
export const KINDS_DE_ACTA: readonly string[] = [KIND_ACTA_CALENTAR, KIND_ACTA_SECCION, KIND_ACTA_FINAL];
export const claveActaCalentar = (generationId: string): string => `acta:${generationId}:calentar`;
export const claveActaSeccion = (generationId: string, k: number): string => `acta:${generationId}:s${k}`;
export const claveActaFinal = (generationId: string): string => `acta:${generationId}:final`;
export const prefijoDeActa = (generationId: string): string => `acta:${generationId}:`;
export const esClaveDeActa = (clave: string): boolean => clave.startsWith("acta:");
/** El identificador de la generación de una clave de acta; null si no es de acta. */
export function generacionDeClaveDeActa(clave: string): string | null {
  const m = /^acta:([^:]+):/.exec(clave);
  return m ? m[1] : null;
}
