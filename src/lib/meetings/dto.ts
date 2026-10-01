/**
 * Reuniones: la forma de los datos tal como viajan entre la API y la interfaz.
 *
 * Solo tipos (sin Prisma ni React): las fechas van en ISO y los tamaños en
 * número, así que el mismo objeto sirve para la respuesta real, para el demo y
 * para las pruebas. El contrato de cada ruta está en design/reuniones/PLAN.md §10.
 */

export type ReunionResumen = {
  id: string;
  propertyId: string;
  propertyName: string;
  type: string;
  title: string;
  /** Fecha y hora de la reunión (ISO). */
  date: string;
  status: string;
  stage: string | null;
  /** 0-100 del paso actual. */
  progress: number;
  durationMs: number | null;
  /** Tareas hechas y totales del paso actual (solo mientras se procesa). */
  hechas: number | null;
  total: number | null;
  /** Mensaje legible cuando el estado es «error» o «sin_cupo». */
  errorMessage: string | null;
};

export type FuenteDTO = {
  id: string;
  idx: number;
  kind: "archivo" | "grabacion";
  name: string;
  sizeBytes: number;
  mimeType: string | null;
  status: string;
  durationMs: number | null;
  offsetMs: number | null;
};

export type SugerenciaHablante = {
  nombre?: string;
  rol?: string;
  /** Por qué la IA lo cree, para que la persona lo confirme sin adivinar. */
  evidencia: string;
  /** Segundos desde el inicio donde está la pista. */
  t?: number;
  /** Etiqueta con la que probablemente es la misma persona (fusión). */
  igualA?: string;
  confianza?: "alta" | "media" | "baja";
};

export type HablanteDTO = {
  label: string;
  name: string | null;
  role: string | null;
  personId: string | null;
  /** false = el nombre es solo una sugerencia de la IA. */
  confirmed: boolean;
  suggestion: SugerenciaHablante | null;
  talkMs: number;
  sampleStartMs: number | null;
  sampleEndMs: number | null;
};

export type TipoMarcador = "tema" | "votacion" | "compromiso" | "nota";

export type MarcadorDTO = {
  id: string;
  atMs: number;
  kind: TipoMarcador;
  note: string | null;
};

export type IntervencionDTO = {
  id: string;
  startMs: number;
  endMs: number;
  /** Etiqueta global: V1..V4 (voces de referencia) o H5, H6… */
  speaker: string;
  text: string;
};

export type RangoMs = { desdeMs: number; hastaMs: number };

export type FichaVotacion = {
  /** Segundos desde el inicio. */
  t: number;
  asunto: string;
  aFavor?: number;
  enContra?: number;
  abstenciones?: number;
  resultado: string;
};

/** La ficha de la reunión: lo que la IA extrae de la transcripción completa (se guarda en `Meeting.digest`). */
export type Ficha = {
  resumen: string;
  ordenDelDia: { titulo: string; inicioS: number }[];
  asistentes: { nombre: string; rol?: string }[];
  /** Identificadores estables D1, D2… que el acta debe recoger todos. */
  decisiones: { id: string; texto: string; t: number }[];
  /** Identificadores estables C1, C2… */
  compromisos: { id: string; texto: string; responsable?: string; fecha?: string; t: number }[];
  votaciones: FichaVotacion[];
  pendientes: string[];
  hablantes: {
    etiqueta: string;
    nombreSugerido?: string;
    rol?: string;
    confianza: "alta" | "media" | "baja";
    evidencia: string;
    igualA?: string;
  }[];
};

export type ReunionDetalle = {
  meeting: ReunionResumen & {
    /** 0..1: qué parte de la línea de tiempo quedó transcrita. */
    coverage: number | null;
    consentAt: string | null;
    readyAt: string | null;
    provider: string | null;
    costUsd: number | null;
    hasAudio: boolean;
  };
  sources: FuenteDTO[];
  speakers: HablanteDTO[];
  markers: MarcadorDTO[];
  digest: Ficha | null;
  /** Tramos sin voz detectados (se muestran como «Sin voz entre …»). */
  silences: RangoMs[];
};

export type PersonaDTO = {
  id: string;
  propertyId: string;
  name: string;
  role: string | null;
  active: boolean;
};
