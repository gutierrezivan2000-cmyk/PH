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
