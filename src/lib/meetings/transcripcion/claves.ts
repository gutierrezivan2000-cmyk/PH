/** Tipos y claves de las tareas de transcripción (en un módulo liviano: las usan el orquestador y los manejadores). */
export const KIND_TRAMO = "transcribir_tramo";
export const KIND_VOCES = "voces";
export const KIND_UNIR = "unir";
export const CLAVE_VOCES = "voces";
export const CLAVE_UNIR = "unir";
export const claveTramo = (i: number): string => `tramo:${i}`;
