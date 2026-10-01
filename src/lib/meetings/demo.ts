/**
 * Almacén en memoria de Reuniones para el modo demo (DEMO_MODE=true).
 *
 * Sin base de datos ni claves: las rutas de /api/meetings responden desde aquí
 * ANTES de tocar `db` (que en demo lanza error a propósito). Vive en
 * `globalThis` porque en desarrollo cada ruta puede compilarse en su propio
 * paquete y un `let` de módulo no se compartiría entre ellas.
 */
import { DEMO_USER, getProperties } from "@/lib/demo-store";
import type {
  Ficha, FuenteDTO, HablanteDTO, IntervencionDTO, MarcadorDTO, PersonaDTO, RangoMs, ReunionDetalle, ReunionResumen,
} from "./dto";
import {
  DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE, MARCADORES_SEPTIEMBRE, PERSONAS_LOS_PINOS, SILENCIOS_SEPTIEMBRE,
  construirHablantes, construirIntervenciones,
} from "./demo-datos";

type ReunionDemo = {
  id: string;
  userId: string;
  propertyId: string;
  type: string;
  title: string;
  date: string;
  status: string;
  stage: string | null;
  progress: number;
  errorMessage: string | null;
  durationMs: number | null;
  hechas: number | null;
  total: number | null;
  coverage: number | null;
  consentAt: string | null;
  readyAt: string | null;
  provider: string | null;
  costUsd: number | null;
  hasAudio: boolean;
  fuentes: FuenteDTO[];
  hablantes: HablanteDTO[];
  marcadores: MarcadorDTO[];
  ficha: Ficha | null;
  intervenciones: IntervencionDTO[];
  silencios: RangoMs[];
};

type Almacen = { reuniones: ReunionDemo[]; personas: PersonaDTO[] };

/** Fecha a las `h:m` (hora local) de hace `dias` días (negativo = dentro de `-dias` días). */
function fechaA(dias: number, h: number, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const HORA = 3_600_000;

function vacia(base: Pick<ReunionDemo, "id" | "propertyId" | "type" | "title" | "date">): ReunionDemo {
  return {
    ...base,
    userId: DEMO_USER.id,
    status: "borrador",
    stage: null,
    progress: 0,
    errorMessage: null,
    durationMs: null,
    hechas: null,
    total: null,
    coverage: null,
    consentAt: null,
    readyAt: null,
    provider: null,
    costUsd: null,
    hasAudio: false,
    fuentes: [],
    hablantes: [],
    marcadores: [],
    ficha: null,
    intervenciones: [],
    silencios: [],
  };
}

function sembrar(): Almacen {
  const intervenciones = construirIntervenciones();

  // 1 · Lista y completa: sirve para recorrer todas las pestañas.
  const septiembre: ReunionDemo = {
    ...vacia({
      id: "reunion-demo-001",
      propertyId: "prop-demo-001",
      type: "consejo",
      title: "Reunión de consejo — septiembre",
      date: fechaA(20, 19),
    }),
    status: "lista",
    durationMs: DURACION_SEPTIEMBRE_MS,
    coverage: 1,
    consentAt: fechaA(20, 18, 58),
    readyAt: fechaA(20, 21, 40),
    provider: "demo",
    costUsd: 4.62,
    hasAudio: true,
    fuentes: [
      {
        id: "src-demo-001", idx: 0, kind: "archivo", name: "consejo-septiembre.m4a", sizeBytes: 64_300_000,
        mimeType: "audio/mp4", status: "normalizada", durationMs: DURACION_SEPTIEMBRE_MS, offsetMs: 0,
      },
    ],
    hablantes: construirHablantes(intervenciones),
    marcadores: MARCADORES_SEPTIEMBRE,
    ficha: FICHA_SEPTIEMBRE,
    intervenciones,
    silencios: SILENCIOS_SEPTIEMBRE,
  };

  // 2 · Procesándose: transcribiendo 12 de 24 tramos (4 h de audio en dos archivos).
  const octubre: ReunionDemo = {
    ...vacia({
      id: "reunion-demo-002",
      propertyId: "prop-demo-001",
      type: "consejo",
      title: "Reunión de consejo — octubre",
      date: fechaA(1, 18, 30),
    }),
    status: "procesando",
    stage: "transcribiendo",
    progress: 50,
    hechas: 12,
    total: 24,
    durationMs: 4 * HORA,
    consentAt: fechaA(1, 18, 28),
    provider: "demo",
    hasAudio: true,
    fuentes: [
      {
        id: "src-demo-002", idx: 0, kind: "archivo", name: "parte-1.mp3", sizeBytes: 115_200_000,
        mimeType: "audio/mpeg", status: "normalizada", durationMs: 2 * HORA, offsetMs: 0,
      },
      {
        id: "src-demo-003", idx: 1, kind: "archivo", name: "parte-2.mp3", sizeBytes: 115_200_000,
        mimeType: "audio/mpeg", status: "normalizada", durationMs: 2 * HORA, offsetMs: 2 * HORA,
      },
    ],
  };

  // 3 · Borrador: todavía sin audio.
  const comite: ReunionDemo = vacia({
    id: "reunion-demo-003",
    propertyId: "prop-demo-001",
    type: "comite",
    title: "Comité de convivencia",
    date: fechaA(-5, 17),
  });

  // 4 · Error en un tramo (un WAV de 3,9 GB para ver el formato en GB).
  const asamblea: ReunionDemo = {
    ...vacia({
      id: "reunion-demo-004",
      propertyId: "prop-demo-002",
      type: "asamblea_ordinaria",
      title: "Asamblea ordinaria 2026",
      date: fechaA(12, 10),
    }),
    status: "error",
    stage: "transcribiendo",
    progress: 36,
    hechas: 13,
    total: 36,
    durationMs: 6 * HORA,
    errorMessage: "No pudimos transcribir el tramo 2:10:00–2:20:00 después de 3 intentos. Reintenta: solo se vuelve a procesar ese tramo.",
    consentAt: fechaA(12, 9, 55),
    provider: "demo",
    hasAudio: true,
    fuentes: [
      {
        id: "src-demo-004", idx: 0, kind: "archivo", name: "asamblea-2026.wav", sizeBytes: 4_147_200_000,
        mimeType: "audio/wav", status: "normalizada", durationMs: 6 * HORA, offsetMs: 0,
      },
    ],
  };

  // 5 · Sin horas disponibles: el audio se conserva y se procesa al haber cupo.
  const sinCupo: ReunionDemo = {
    ...vacia({
      id: "reunion-demo-005",
      propertyId: "prop-demo-002",
      type: "consejo",
      title: "Reunión de consejo — septiembre",
      date: fechaA(3, 19),
    }),
    status: "sin_cupo",
    durationMs: 8 * HORA,
    errorMessage: "Esta reunión dura 8 h y te quedan 2 h este mes.",
    consentAt: fechaA(3, 18, 57),
    provider: "demo",
    hasAudio: true,
    fuentes: [
      {
        id: "src-demo-005", idx: 0, kind: "archivo", name: "consejo-septiembre-completo.m4a", sizeBytes: 230_000_000,
        mimeType: "audio/mp4", status: "normalizada", durationMs: 8 * HORA, offsetMs: 0,
      },
    ],
  };

  return {
    reuniones: [septiembre, octubre, comite, asamblea, sinCupo],
    personas: PERSONAS_LOS_PINOS.map((p) => ({ ...p })),
  };
}

const global = globalThis as unknown as { __demoReuniones?: Almacen };

function almacen(): Almacen {
  return (global.__demoReuniones ??= sembrar());
}

function nombreDePropiedad(userId: string, propertyId: string): string {
  return getProperties(userId).find((p) => p.id === propertyId)?.name ?? "Copropiedad";
}

function resumen(r: ReunionDemo): ReunionResumen {
  return {
    id: r.id,
    propertyId: r.propertyId,
    propertyName: nombreDePropiedad(r.userId, r.propertyId),
    type: r.type,
    title: r.title,
    date: r.date,
    status: r.status,
    stage: r.stage,
    progress: r.progress,
    durationMs: r.durationMs,
    hechas: r.hechas,
    total: r.total,
    errorMessage: r.errorMessage,
  };
}

/** Reuniones del usuario, la más reciente primero; `propertyId` filtra por copropiedad. */
export function demoReuniones(userId: string, propertyId?: string | null): ReunionResumen[] {
  return almacen()
    .reuniones.filter((r) => r.userId === userId && (!propertyId || r.propertyId === propertyId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(resumen);
}

export function demoReunion(userId: string, id: string): ReunionDetalle | null {
  const r = almacen().reuniones.find((x) => x.id === id && x.userId === userId);
  if (!r) return null;
  return {
    meeting: {
      ...resumen(r),
      coverage: r.coverage,
      consentAt: r.consentAt,
      readyAt: r.readyAt,
      provider: r.provider,
      costUsd: r.costUsd,
      hasAudio: r.hasAudio,
    },
    sources: r.fuentes,
    speakers: r.hablantes,
    markers: r.marcadores,
    digest: r.ficha,
    silences: r.silencios,
  };
}

/** Todas las intervenciones de una reunión (la ruta de transcripción las filtra y pagina). */
export function demoIntervenciones(userId: string, id: string): IntervencionDTO[] | null {
  const r = almacen().reuniones.find((x) => x.id === id && x.userId === userId);
  return r ? r.intervenciones : null;
}

export function demoPersonas(propertyId: string): PersonaDTO[] {
  return almacen().personas.filter((p) => p.propertyId === propertyId && p.active);
}
