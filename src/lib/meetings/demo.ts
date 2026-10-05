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
  EstadoProcesoDTO, Ficha, FuenteDTO, HablanteDTO, IntervencionDTO, MarcadorDTO, PersonaDTO, RangoMs, ReunionDetalle, ReunionResumen, VivoDTO,
} from "./dto";
import {
  DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE, MARCADORES_SEPTIEMBRE, PERSONAS_LOS_PINOS, SILENCIOS_SEPTIEMBRE,
  construirHablantes, construirIntervenciones,
} from "./demo-datos";
import { nombreDeSesion, offsetAntesDe, planificarCierre, type ParteRecibida } from "./cierre";
import { planificarGuardado, type PedidoDeHablante } from "./nombres";
import { estadoDelResumen, sePuedeReintentarElResumen } from "./resumen-pantalla";
import { MAX_FUENTES_POR_REUNION, MAX_MARCADORES, MAX_SESIONES_VIVO, estaEnMarcha, puedeAgregarFuentes, type EtapaReunion } from "./tipos";
import { cantidadDeTramos } from "./transcripcion/tramos";
import type { CambiosPersona, CambiosReunion, NuevaMarca, NuevaPersona, ParteViva, SesionDeCierre } from "./validar";

/** Lo que dice la reunión de ejemplo cuyo resumen falló (es el texto real que deja el análisis). */
const AVISO_SIN_RESUMEN_DEMO = "El resumen con IA no se pudo generar: la transcripción está completa y puedes revisarla.";

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
  /** Partes de la grabadora en vivo (el demo guarda solo su medida, no el audio). */
  vivo: ParteVivaDemo[];
  /** Sesiones de grabación ya cerradas (cada una es una fuente). */
  cerradas: Array<{ session: number; durationMs: number }>;
  /** Números de sesión ya entregados a un dispositivo. */
  reservas: number[];
  /** Cuándo empezó a «procesarse» en el demo (ms). La simulación avanza con el tiempo. */
  procesoDesde: number | null;
  /** La simulación es solo el análisis con IA (se volvió a pedir el resumen): la transcripción ya estaba. */
  soloAnalisis: boolean;
};

type ParteVivaDemo = ParteRecibida & { creadaEn: string };

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
    vivo: [],
    cerradas: [],
    reservas: [],
    procesoDesde: null,
    soloAnalisis: false,
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

  // 6 · Lista, pero la IA no pudo hacer el resumen: la transcripción está completa y se puede pedir el resumen otra vez.
  const sinResumen: ReunionDemo = {
    ...vacia({
      id: "reunion-demo-006",
      propertyId: "prop-demo-001",
      type: "consejo",
      title: "Reunión de consejo — agosto",
      date: fechaA(52, 19),
    }),
    status: "lista",
    durationMs: DURACION_SEPTIEMBRE_MS,
    coverage: 1,
    errorMessage: AVISO_SIN_RESUMEN_DEMO,
    consentAt: fechaA(52, 18, 57),
    readyAt: fechaA(52, 21, 35),
    provider: "demo",
    costUsd: 2.91,
    hasAudio: true,
    fuentes: [
      {
        id: "src-demo-006", idx: 0, kind: "archivo", name: "consejo-agosto.m4a", sizeBytes: 64_300_000,
        mimeType: "audio/mp4", status: "normalizada", durationMs: DURACION_SEPTIEMBRE_MS, offsetMs: 0,
      },
    ],
    hablantes: construirHablantes(intervenciones),
    marcadores: [],
    ficha: { ...structuredClone(FICHA_SEPTIEMBRE), resumen: "", asistentes: [], pendientes: [AVISO_SIN_RESUMEN_DEMO] },
    intervenciones,
    silencios: SILENCIOS_SEPTIEMBRE,
  };

  return {
    reuniones: [septiembre, octubre, comite, asamblea, sinCupo, sinResumen],
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

/* ── Procesamiento simulado ───────────────────────────────────────────── */

/** Cuántas tareas tiene el análisis simulado: 5 bloques de ~25 min y la ficha. */
const TAREAS_DE_ANALISIS_DEMO = 6;
/** Cuánto «espera en cola» el análisis cuando solo se vuelve a pedir el resumen. */
const COLA_REANALISIS_DEMO_MS = 1_000;

/** Cuánto «espera en cola» una reunión recién enviada, antes de que un trabajador la tome. */
export const COLA_DEMO_MS = 2_000;
/** Los pasos que el demo simula, con lo que dura cada uno. El hito del análisis con IA agrega el suyo al final. */
export const PASOS_DEMO: ReadonlyArray<{ etapa: EtapaReunion; ms: number }> = [
  { etapa: "preparando_audio", ms: 8_000 },
  { etapa: "transcribiendo", ms: 18_000 },
  { etapa: "uniendo", ms: 4_000 },
  { etapa: "analizando", ms: 6_000 },
];

/**
 * Termina el procesamiento simulado: la reunión queda lista con la transcripción de ejemplo (la de septiembre), sus voces
 * sin nombre todavía (así se ve cómo es «Voz 1») y los silencios. El audio simulado dura lo de esa reunión.
 */
function completarDemo(r: ReunionDemo, ahora: number): void {
  const intervenciones = construirIntervenciones();
  r.status = "lista";
  r.stage = null;
  r.progress = 100;
  r.hechas = null;
  r.total = null;
  r.errorMessage = null;
  r.durationMs = DURACION_SEPTIEMBRE_MS;
  r.coverage = 1;
  r.provider = "demo";
  r.costUsd = 0;
  r.hasAudio = true;
  r.readyAt = new Date(ahora).toISOString();
  r.intervenciones = intervenciones;
  // Las voces sin nombre, con lo que la IA sugiere de cada una (la persona decide).
  r.ficha = structuredClone(FICHA_SEPTIEMBRE);
  r.hablantes = construirHablantes(intervenciones).map((h) => {
    const sug = FICHA_SEPTIEMBRE.hablantes.find((x) => x.etiqueta === h.label);
    return {
      ...h, name: null, role: null, personId: null, confirmed: false,
      suggestion: sug ? { nombre: sug.nombreSugerido, rol: sug.rol, evidencia: sug.evidencia, t: sug.t, confianza: sug.confianza } : null,
    };
  });
  r.silencios = SILENCIOS_SEPTIEMBRE.map((x) => ({ ...x }));
  let desde = 0;
  for (const f of r.fuentes) {
    f.status = "normalizada";
    f.durationMs = Math.round(DURACION_SEPTIEMBRE_MS / r.fuentes.length);
    f.offsetMs = desde;
    desde += f.durationMs;
  }
}

/** Termina el análisis que se volvió a pedir: la reunión queda lista con su resumen completo (la transcripción no cambia). */
function completarAnalisisDemo(r: ReunionDemo, ahora: number): void {
  r.status = "lista";
  r.stage = null;
  r.progress = 100;
  r.hechas = null;
  r.total = null;
  r.errorMessage = null;
  r.soloAnalisis = false;
  r.procesoDesde = null;
  r.readyAt = new Date(ahora).toISOString();
  r.ficha = structuredClone(FICHA_SEPTIEMBRE);
  // Las sugerencias de nombre llegan con la ficha, solo a las voces que todavía no tienen nombre confirmado.
  for (const h of r.hablantes) {
    const sug = FICHA_SEPTIEMBRE.hablantes.find((x) => x.etiqueta === h.label);
    if (!h.confirmed && sug) h.suggestion = { nombre: sug.nombreSugerido, rol: sug.rol, evidencia: sug.evidencia, t: sug.t, confianza: sug.confianza };
  }
}

/** Pone la reunión en el estado que le toca según el tiempo que lleva «procesándose». */
function avanzarDemo(r: ReunionDemo, ahora: number = Date.now()): void {
  if (r.procesoDesde === null || !estaEnMarcha(r.status)) return;
  const t = ahora - r.procesoDesde;
  // Volver a pedir el resumen es solo la última etapa: no hay cola larga ni audio que preparar.
  const cola = r.soloAnalisis ? COLA_REANALISIS_DEMO_MS : COLA_DEMO_MS;
  const pasos = r.soloAnalisis ? PASOS_DEMO.filter((p) => p.etapa === "analizando") : PASOS_DEMO;
  if (t < cola) {
    r.status = r.soloAnalisis ? "procesando" : "en_cola";
    return;
  }
  r.status = "procesando";
  let resto = t - cola;
  for (const paso of pasos) {
    if (resto < paso.ms) {
      r.stage = paso.etapa;
      r.progress = Math.round((resto / paso.ms) * 100);
      if (paso.etapa === "transcribiendo" || paso.etapa === "analizando") {
        // Los tramos de la transcripción, o los bloques de análisis más la ficha que los junta.
        r.total = paso.etapa === "transcribiendo" ? cantidadDeTramos(DURACION_SEPTIEMBRE_MS) : TAREAS_DE_ANALISIS_DEMO;
        r.hechas = Math.floor((resto / paso.ms) * r.total);
      } else {
        r.hechas = null;
        r.total = null;
      }
      return;
    }
    resto -= paso.ms;
  }
  if (r.soloAnalisis) completarAnalisisDemo(r, ahora);
  else completarDemo(r, ahora);
}

function resumen(r: ReunionDemo): ReunionResumen {
  avanzarDemo(r);
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
  avanzarDemo(r);
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
    // Copias: el almacén es mutable y quien lee no debe poder (ni sufrir) cambiar lo que guarda.
    sources: r.fuentes.map((f) => ({ ...f })),
    speakers: r.hablantes.map((h) => ({ ...h })),
    markers: r.marcadores.map((m) => ({ ...m })).sort((a, b) => a.atMs - b.atMs),
    digest: r.ficha ? structuredClone(r.ficha) : null,
    silences: r.silencios.map((x) => ({ ...x })),
    live: r.status === "grabando" ? resumenVivoDemo(r) : null,
  };
}

/** Lo que el acta simulada necesita de una reunión de ejemplo: la reunión, su ficha, sus voces y su transcripción. */
export type ContextoDeActaDemo = {
  id: string;
  propertyId: string;
  propiedad: string;
  tipo: string;
  titulo: string;
  fecha: Date;
  duracionMs: number;
  /** ¿Está lista y con transcripción? Solo entonces se puede redactar su acta. */
  lista: boolean;
  tieneTranscripcion: boolean;
  ficha: Ficha | null;
  hablantes: HablanteDTO[];
  intervenciones: IntervencionDTO[];
};

export function demoContextoDeActa(userId: string, id: string): ContextoDeActaDemo | null {
  const r = buscar(userId, id);
  if (!r) return null;
  avanzarDemo(r);
  return {
    id: r.id,
    propertyId: r.propertyId,
    propiedad: nombreDePropiedad(r.userId, r.propertyId),
    tipo: r.type,
    titulo: r.title,
    fecha: new Date(r.date),
    duracionMs: r.durationMs ?? DURACION_SEPTIEMBRE_MS,
    lista: r.status === "lista",
    tieneTranscripcion: r.intervenciones.length > 0,
    ficha: r.ficha ? structuredClone(r.ficha) : null,
    hablantes: r.hablantes.map((h) => ({ ...h })),
    intervenciones: r.intervenciones.map((u) => ({ ...u })),
  };
}

function resumenVivoDemo(r: ReunionDemo): VivoDTO | null {
  const audio = r.vivo.filter((p) => p.seq >= 0);
  if (audio.length === 0) return null;
  return {
    sesiones: new Set(audio.map((p) => p.session)).size,
    durMs: audio.reduce((suma, p) => suma + p.durationMs, 0),
    partes: audio.length,
    ultimaParteEn: audio.map((p) => p.creadaEn).sort().at(-1) ?? null,
  };
}

/** Todas las intervenciones de una reunión (la ruta de transcripción las filtra y pagina). */
export function demoIntervenciones(userId: string, id: string): IntervencionDTO[] | null {
  const r = almacen().reuniones.find((x) => x.id === id && x.userId === userId);
  return r ? r.intervenciones : null;
}

/**
 * Guarda los nombres de las voces y fusiona las que se llaman igual (la que más habla se queda con las intervenciones de la
 * otra), con las mismas reglas que la ruta de verdad. Devuelve las voces que quedan, la que más habla primero.
 */
export function demoGuardarHablantes(userId: string, id: string, pedidos: readonly PedidoDeHablante[]): HablanteDTO[] | null {
  const r = almacen().reuniones.find((x) => x.id === id && x.userId === userId);
  if (!r) return null;
  const plan = planificarGuardado(r.hablantes, pedidos);
  for (const f of plan.fusiones) {
    for (const i of r.intervenciones) if (f.absorbidas.includes(i.speaker)) i.speaker = f.canonica;
    r.hablantes = r.hablantes.filter((h) => !f.absorbidas.includes(h.label));
  }
  for (const a of plan.actualizar) {
    const h = r.hablantes.find((x) => x.label === a.label);
    if (h) Object.assign(h, { name: a.name, role: a.role, personId: a.personId, confirmed: a.confirmed, talkMs: a.talkMs });
  }
  return r.hablantes.map((h) => ({ ...h })).sort((a, b) => b.talkMs - a.talkMs || a.label.localeCompare(b.label, "es", { numeric: true }));
}

export function demoPersonas(propertyId: string): PersonaDTO[] {
  return almacen()
    .personas.filter((p) => p.propertyId === propertyId && p.active)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/* ── Escritura (el demo permite crear y editar, con tope) ────────────── */

/** Tope por usuario: el demo vive en memoria y no debe crecer sin límite. */
export const MAX_REUNIONES_DEMO = 30;
export const MAX_PERSONAS_DEMO = 60;

let secuencia = 0;

/** Solo para pruebas: vuelve a sembrar el demo. */
export function reiniciarDemoReuniones(): void {
  global.__demoReuniones = undefined;
}

function buscar(userId: string, id: string): ReunionDemo | undefined {
  return almacen().reuniones.find((x) => x.id === id && x.userId === userId);
}

/** Crea un borrador. null si se llegó al tope del demo. */
export function demoCrearReunion(
  userId: string,
  datos: { propertyId: string; type: string; title: string; date: Date },
): ReunionResumen | null {
  const a = almacen();
  if (a.reuniones.filter((r) => r.userId === userId).length >= MAX_REUNIONES_DEMO) return null;
  const r: ReunionDemo = {
    ...vacia({
      id: `reunion-${Date.now()}-${++secuencia}`,
      propertyId: datos.propertyId,
      type: datos.type,
      title: datos.title,
      date: datos.date.toISOString(),
    }),
    userId,
  };
  a.reuniones.push(r);
  return resumen(r);
}

export function demoActualizarReunion(userId: string, id: string, cambios: CambiosReunion): ReunionResumen | null {
  const r = buscar(userId, id);
  if (!r) return null;
  if (cambios.title !== undefined) r.title = cambios.title;
  if (cambios.type !== undefined) r.type = cambios.type;
  if (cambios.date !== undefined) r.date = cambios.date.toISOString();
  if (cambios.consentAt !== undefined) r.consentAt = cambios.consentAt ? cambios.consentAt.toISOString() : null;
  return resumen(r);
}

export function demoEliminarReunion(userId: string, id: string): boolean {
  const a = almacen();
  const i = a.reuniones.findIndex((x) => x.id === id && x.userId === userId);
  if (i < 0) return false;
  a.reuniones.splice(i, 1);
  return true;
}

/**
 * Crea una persona; si ya hay una activa con ese nombre (sin distinguir mayúsculas) devuelve esa
 * con `creada: false`. null si se llegó al tope.
 */
export function demoCrearPersona(propertyId: string, datos: NuevaPersona): { persona: PersonaDTO; creada: boolean } | null {
  const a = almacen();
  const existente = a.personas.find(
    (p) => p.propertyId === propertyId && p.active && p.name.toLowerCase() === datos.name.toLowerCase(),
  );
  if (existente) return { persona: existente, creada: false };
  if (a.personas.filter((p) => p.propertyId === propertyId).length >= MAX_PERSONAS_DEMO) return null;
  const nueva: PersonaDTO = { id: `persona-${Date.now()}-${++secuencia}`, propertyId, name: datos.name, role: datos.role, active: true };
  a.personas.push(nueva);
  return { persona: nueva, creada: true };
}

export function demoActualizarPersona(propertyId: string, id: string, cambios: CambiosPersona): PersonaDTO | null {
  const p = almacen().personas.find((x) => x.id === id && x.propertyId === propertyId);
  if (!p) return null;
  if (cambios.name !== undefined) p.name = cambios.name;
  if (cambios.role !== undefined) p.role = cambios.role;
  if (cambios.active !== undefined) p.active = cambios.active;
  return p;
}

export function demoEliminarPersona(propertyId: string, id: string): boolean {
  const a = almacen();
  const i = a.personas.findIndex((x) => x.id === id && x.propertyId === propertyId);
  if (i < 0) return false;
  a.personas.splice(i, 1);
  return true;
}

/* ── Archivos de la reunión (subida simulada) ────────────────────────── */

export type FaltanDemo = Array<{ session: number; seq: number }>;
export type ResultadoDemo<T> =
  | { ok: true; valor: T }
  | { ok: false; codigo: "no_existe" | "cerrada" | "tope" | "vacia" | "pendiente" | "faltan" | "sin_constancia" | "no_lista" | "no_hace_falta"; error: string; faltan?: FaltanDemo };

const NO_EXISTE = { ok: false, codigo: "no_existe", error: "Reunión no encontrada" } as const;
const CERRADA = {
  ok: false, codigo: "cerrada",
  error: "Esta reunión ya no admite más archivos: se está procesando o ya está lista.",
} as const;

/** Antes de subir: la reunión pasa a «Subiendo» (si era borrador o tenía un error). */
export function demoPrepararSubida(userId: string, id: string): ResultadoDemo<null> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  if (!puedeAgregarFuentes(r.status)) return CERRADA;
  if (r.fuentes.length >= MAX_FUENTES_POR_REUNION) {
    return { ok: false, codigo: "tope", error: `Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.` };
  }
  if (r.status === "borrador" || r.status === "error") {
    r.status = "subiendo";
    r.errorMessage = null;
  }
  return { ok: true, valor: null };
}

/** Registra un archivo ya «subido». Idempotente por ruta. */
export function demoRegistrarFuente(
  userId: string,
  id: string,
  datos: { nombre: string; tamano: number; tipo: string; pathname: string },
): ResultadoDemo<{ fuente: FuenteDTO; creada: boolean }> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  const existente = r.fuentes.find((f) => f.id === `src-${datos.pathname}`);
  if (existente) return { ok: true, valor: { fuente: existente, creada: false } };
  if (!puedeAgregarFuentes(r.status)) return CERRADA;
  if (r.fuentes.length >= MAX_FUENTES_POR_REUNION) {
    return { ok: false, codigo: "tope", error: `Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.` };
  }
  const fuente: FuenteDTO = {
    id: `src-${datos.pathname}`,
    idx: r.fuentes.length,
    kind: "archivo",
    name: datos.nombre,
    sizeBytes: datos.tamano,
    mimeType: datos.tipo,
    status: "recibida",
    durationMs: null,
    offsetMs: null,
  };
  r.fuentes.push(fuente);
  if (r.status === "borrador" || r.status === "error") r.status = "subiendo";
  return { ok: true, valor: { fuente, creada: true } };
}

/** Quita un archivo y renumera; sin archivos, la reunión vuelve a borrador. */
export function demoQuitarFuente(userId: string, id: string, sourceId: string): ResultadoDemo<null> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  if (!puedeAgregarFuentes(r.status)) return CERRADA;
  const i = r.fuentes.findIndex((f) => f.id === sourceId);
  if (i < 0) return { ok: false, codigo: "no_existe", error: "Archivo no encontrado" };
  r.fuentes.splice(i, 1);
  r.fuentes.forEach((f, n) => (f.idx = n));
  if (r.fuentes.length === 0 && r.status === "subiendo") r.status = "borrador";
  return { ok: true, valor: null };
}

/**
 * Cierra la captura y manda la reunión a la cola. Idempotente. Con `sesiones` (lo que declara la grabadora)
 * comprueba que no falte ninguna parte; las sesiones con audio que nadie declaró se cierran con lo que haya.
 */
export function demoProcesar(
  userId: string,
  id: string,
  sesiones: readonly SesionDeCierre[] | null = null,
): ResultadoDemo<{ status: string }> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  if (r.status === "en_cola" || r.status === "procesando" || r.status === "lista") return { ok: true, valor: { status: r.status } };
  if (!puedeAgregarFuentes(r.status)) return CERRADA;

  const plan = planificarCierre(r.vivo, r.cerradas.map((c) => ({ kind: "grabacion", session: c.session })), sesiones);
  if (plan.faltan.length > 0) {
    return { ok: false, codigo: "faltan", error: "Faltan partes de la grabación. Vuelve a enviarlas.", faltan: plan.faltan };
  }
  if (r.fuentes.length + plan.cerrar.length === 0) {
    return { ok: false, codigo: "vacia", error: "Sube al menos un archivo antes de procesar la reunión." };
  }
  if (r.fuentes.length + plan.cerrar.length > MAX_FUENTES_POR_REUNION) {
    return { ok: false, codigo: "tope", error: `Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.` };
  }
  if (r.fuentes.some((f) => f.status !== "recibida")) {
    return { ok: false, codigo: "pendiente", error: "Algún archivo todavía se está preparando. Espera un momento." };
  }

  for (const c of plan.cerrar) {
    r.fuentes.push({
      id: `src-viva-${c.session}`,
      idx: r.fuentes.length,
      kind: "grabacion",
      name: nombreDeSesion(c.session, plan.cerrar.length),
      sizeBytes: c.sizeBytes,
      mimeType: c.mimeType,
      status: "recibida",
      durationMs: c.durationMs,
      offsetMs: null,
    });
    r.cerradas.push({ session: c.session, durationMs: c.durationMs });
  }
  r.status = "en_cola";
  r.stage = null;
  r.progress = 0;
  r.errorMessage = null;
  r.procesoDesde = Date.now();
  return { ok: true, valor: { status: "en_cola" } };
}

/** El estado del procesamiento (lo que consulta la página mientras espera). */
export function demoEstado(userId: string, id: string): EstadoProcesoDTO | null {
  const r = buscar(userId, id);
  if (!r) return null;
  avanzarDemo(r);
  const enProceso = estaEnMarcha(r.status);
  return {
    status: r.status,
    stage: r.stage,
    progress: r.progress,
    errorMessage: r.errorMessage,
    durationMs: r.durationMs,
    coverage: r.coverage,
    tareas: { hechas: enProceso ? r.hechas : null, total: enProceso ? r.total : null },
  };
}

/** «Reintentar» una reunión en error: sigue procesándose desde el principio de la simulación. */
export function demoReintentar(userId: string, id: string): ResultadoDemo<{ status: string }> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  if (r.status !== "error") return { ok: true, valor: { status: r.status } };
  r.status = "procesando";
  r.errorMessage = null;
  r.procesoDesde = Date.now() - COLA_DEMO_MS;
  return { ok: true, valor: { status: "procesando" } };
}

/**
 * «Generar el resumen otra vez»: solo si el resumen falló (o quedaron fragmentos sin analizar). La reunión vuelve a
 * «procesando» (solo el análisis con IA) y termina lista con su resumen completo.
 */
export function demoReanalizar(userId: string, id: string): ResultadoDemo<{ status: string; fragmentos: number }> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  avanzarDemo(r);
  if (r.status !== "lista") return { ok: false, codigo: "no_lista", error: "Esta reunión todavía se está procesando." };
  const estado = estadoDelResumen(r, r.ficha);
  if (!sePuedeReintentarElResumen(estado)) {
    return { ok: false, codigo: "no_hace_falta", error: estado === "completo" ? "Esta reunión ya tiene su resumen." : "No hay nada que resumir en esta reunión." };
  }
  r.status = "procesando";
  r.stage = "analizando";
  r.progress = 0;
  r.hechas = 0;
  r.total = TAREAS_DE_ANALISIS_DEMO;
  r.errorMessage = null;
  r.soloAnalisis = true;
  r.procesoDesde = Date.now();
  return { ok: true, valor: { status: "procesando", fragmentos: r.ficha?.fragmentosOmitidos ?? 0 } };
}

/* ── Grabadora en vivo ───────────────────────────────────────────────── */

const CERRADA_AUDIO = {
  ok: false, codigo: "cerrada",
  error: "Esta reunión ya no admite más audio: se está procesando o ya está lista.",
} as const;
const SIN_CONSTANCIA = {
  ok: false, codigo: "sin_constancia",
  error: "Antes de grabar, confirma que avisaste a los asistentes.",
} as const;
/** El demo vive en memoria: tope de partes por reunión (≈ 33 h). */
export const MAX_PARTES_VIVO_DEMO = 4_000;

/** Reserva el número de la próxima sesión de grabación y dice dónde empieza dentro de la reunión. */
export function demoNuevaSesionVivo(userId: string, id: string): ResultadoDemo<{ session: number; offsetMs: number }> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  if (!puedeAgregarFuentes(r.status)) return CERRADA_AUDIO;
  if (!r.consentAt) return SIN_CONSTANCIA;
  const session = Math.max(0, ...r.reservas, ...r.vivo.map((p) => p.session), ...r.cerradas.map((c) => c.session)) + 1;
  if (session > MAX_SESIONES_VIVO) return { ok: false, codigo: "tope", error: "Esta reunión ya tiene demasiadas sesiones de grabación." };
  r.reservas.push(session);
  const offsetMs = offsetAntesDe(session, r.vivo, r.cerradas.map((c) => ({ kind: "grabacion", session: c.session, durationMs: c.durationMs })));
  return { ok: true, valor: { session, offsetMs } };
}

/** Recibe una parte de la grabadora (idempotente por sesión y número). */
export function demoRegistrarParteViva(userId: string, id: string, d: ParteViva & { bytes: number }): ResultadoDemo<null> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  if (!puedeAgregarFuentes(r.status)) return CERRADA_AUDIO;
  if (!r.consentAt) return SIN_CONSTANCIA;
  const existente = r.vivo.find((p) => p.session === d.session && p.seq === d.seq);
  if (existente) {
    Object.assign(existente, { bytes: d.bytes, durationMs: d.durMs, mimeType: d.mime, creadaEn: new Date().toISOString() });
  } else {
    if (r.vivo.length >= MAX_PARTES_VIVO_DEMO) return { ok: false, codigo: "tope", error: "El demo no admite más audio en esta reunión." };
    r.vivo.push({ session: d.session, seq: d.seq, bytes: d.bytes, durationMs: d.durMs, mimeType: d.mime, creadaEn: new Date().toISOString() });
  }
  if (r.status !== "grabando") {
    r.status = "grabando";
    r.errorMessage = null;
  }
  return { ok: true, valor: null };
}

/** Guarda una marca puesta durante la grabación. Idempotente por el identificador del dispositivo. */
export function demoRegistrarMarca(userId: string, id: string, d: NuevaMarca): ResultadoDemo<{ marca: MarcadorDTO; creada: boolean }> {
  const r = buscar(userId, id);
  if (!r) return NO_EXISTE;
  const marcaId = d.id ? `marca-${d.id}` : `marca-${Date.now()}-${++secuencia}`;
  const existente = r.marcadores.find((m) => m.id === marcaId);
  if (existente) return { ok: true, valor: { marca: { ...existente }, creada: false } };
  if (r.marcadores.length >= MAX_MARCADORES) return { ok: false, codigo: "tope", error: `Máximo ${MAX_MARCADORES} marcas por reunión.` };
  const marca: MarcadorDTO = { id: marcaId, atMs: d.atMs, kind: d.kind, note: d.note };
  r.marcadores.push(marca);
  return { ok: true, valor: { marca: { ...marca }, creada: true } };
}
