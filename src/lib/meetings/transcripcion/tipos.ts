/**
 * Transcripción: los tipos que comparten el proveedor, la unión de tramos y los manejadores de la cola.
 *
 * Todo en milisegundos y con la etiqueta de hablante como texto. Las etiquetas que da un proveedor son LOCALES a una
 * llamada («A», «B»…) salvo las que coinciden con el nombre de una voz de referencia («V1»…«V4»): esas ya son
 * GLOBALES en toda la reunión. `hablantes.ts` y `unir.ts` convierten las locales en globales.
 */

/** Lo que dijo alguien entre dos instantes. Los tiempos son relativos al audio que se mandó transcribir. */
export type Segmento = {
  inicioMs: number;
  finMs: number;
  hablante: string;
  texto: string;
};

/** Una voz de referencia ya cortada del audio: el proveedor la usa para reconocer a la misma persona en otros tramos. */
export type VozDeReferencia = {
  /** Nombre global: V1…V4. */
  nombre: string;
  audio: Uint8Array;
  /** Tipo MIME del audio (siempre `audio/mpeg`: se corta del mismo `audio.mp3`). */
  mime: string;
};

export type OpcionesDeTramo = {
  /** Voces conocidas (hasta 4). Vacío en el primer tramo. */
  referencias: readonly VozDeReferencia[];
  /** Dónde empieza este audio dentro de la reunión, y cuánto dura. Solo lo usan los proveedores de ejemplo. */
  desdeMs: number;
  duracionMs: number;
  /** Tiempo máximo de la llamada. */
  timeoutMs: number;
  senal?: AbortSignal;
};

export type NombreDeProveedor = "openai" | "assemblyai" | "demo";

export interface ProveedorDeTranscripcion {
  readonly nombre: NombreDeProveedor;
  /** `tramos`: la reunión se parte en tramos con solape y cada uno es una tarea. `completo`: el proveedor recibe todo el audio (hito 10). */
  readonly modo: "tramos" | "completo";
  readonly tramoMs: number;
  readonly solapeMs: number;
  /** Cuánto cuesta transcribir un minuto de audio (para el registro de costos). */
  readonly costoUsdPorMinuto: number;
  transcribirTramo(audio: Uint8Array, opciones: OpcionesDeTramo): Promise<Segmento[]>;
}

/** Un tramo del plan: el audio que se manda y el núcleo (la parte que de verdad le toca). */
export type Tramo = {
  i: number;
  /** El audio del tramo: el núcleo más el solape a cada lado. */
  desdeMs: number;
  hastaMs: number;
  /** Lo que este tramo aporta a la transcripción final. Los núcleos de todos los tramos se tocan sin solaparse. */
  nucleoDesdeMs: number;
  nucleoHastaMs: number;
};

/** Lo que guarda `transcribir_tramo` en el `result` de su tarea. */
export type ResultadoDeTramo = {
  i: number;
  /** El audio que se transcribió y el núcleo que le tocaba (con esto la unión no depende de cómo se planifique después). */
  desdeMs: number;
  hastaMs: number;
  nucleoDesdeMs: number;
  nucleoHastaMs: number;
  /** Los segmentos con tiempos relativos al inicio del tramo (`desdeMs`). */
  segmentos: Segmento[];
  costoUsd: number;
  proveedor: string;
  /** Si el tramo no se transcribió por una razón que no es un fallo (por ejemplo, dura menos de un segundo). */
  omitido?: string;
};

/** Una voz de referencia elegida en el primer tramo: de qué etiqueta local viene y qué trozo del audio es. */
export type ReferenciaElegida = {
  /** Nombre global: V1…V4. */
  nombre: string;
  /** La etiqueta que le puso el proveedor en el tramo 0 («A», «B»…). */
  etiquetaLocal: string;
  /** El trozo de audio (de toda la reunión) que sirve de muestra: 2–10 s. */
  desdeMs: number;
  hastaMs: number;
};

export type SilencioDetectado = { desdeMs: number; hastaMs: number };

/**
 * Un fallo del proveedor, ya con el mensaje que ve la persona y la decisión de si vale la pena reintentar (una caída del
 * servicio, sí; un audio que rechaza o una clave que no sirve, no). Lo convierte en `ErrorTarea` el manejador de la cola.
 */
export class ErrorTranscripcion extends Error {
  readonly reintentable: boolean;
  constructor(mensaje: string, opciones: { reintentable: boolean }) {
    super(mensaje);
    this.name = "ErrorTranscripcion";
    this.reintentable = opciones.reintentable;
  }
}
