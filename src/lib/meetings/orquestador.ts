/**
 * El orquestador decide qué sigue en el procesamiento de una reunión. `avanzar(meetingId)` se llama al cerrar la
 * captura y al terminar cada tarea: mira qué fuentes hay y qué tareas están hechas, encola las que siguen (con
 * claves fijas, así llamarlo de más no duplica nada) y deja anotados la etapa y el avance que ve la persona.
 *
 * `planificarSiguientes` es PURA (recibe el estado, devuelve qué encolar): ahí está toda la lógica y se prueba sin
 * base de datos. Cada hito agrega su etapa aquí (M5: transcribir, M6: ficha).
 *
 * El recorrido, con claves fijas: fuentes → `normalizar:*` → `armar_audio` → `tramo:0` → `voces` → `tramo:1…N-1` → `unir`.
 * Los demás tramos esperan a `voces` porque llevan las muestras de las voces que ella elige.
 */
import { db } from "@/lib/db";
import { encolar } from "./cola";
import { alPasarALista } from "./terminado";
import { CLAVE_FICHA, CLAVE_UNIR, CLAVE_VOCES, KIND_BLOQUE, KIND_FICHA, KIND_TRAMO, KIND_UNIR, KIND_VOCES, claveTramo } from "./transcripcion/claves";
import type { Tramo } from "./transcripcion/tipos";
import { cantidadDeTramos, planificarTramos } from "./transcripcion/tramos";
import { ETAPAS, SOLAPE_MS, TRAMO_MS, type EtapaReunion } from "./tipos";

export type FuenteDeProceso = {
  id: string;
  idx: number;
  kind: string;
  session: number | null;
  name: string;
  url: string | null;
  status: string;
  normalizedMs: number;
  durationMs: number | null;
};

export type TareaDeProceso = { kind: string; key: string; status: string };

export type TareaPorEncolar = { kind: string; key: string; payload: Record<string, unknown> };

export type PlanDeProceso = {
  encolar: TareaPorEncolar[];
  /** null cuando ya no queda nada que hacer (la reunión está lista). */
  etapa: EtapaReunion | null;
  /** 0-100 del paso actual. */
  progreso: number;
  /** `audio.mp3` ya está armado. */
  audioListo: boolean;
  /** Terminó todo el procesamiento: la reunión pasa a «lista». */
  lista: boolean;
};

/** Qué tareas pertenecen a cada etapa (para contar «hechas de total»). `voces` es un paso interno: no cuenta como tramo. */
export const TAREAS_DE_ETAPA: Record<EtapaReunion, readonly string[]> = {
  preparando_audio: ["ensamblar_sesion", "normalizar", "armar_audio"],
  transcribiendo: [KIND_TRAMO],
  uniendo: [KIND_UNIR],
  analizando: [KIND_BLOQUE, KIND_FICHA],
};

export const CLAVE_ARMAR_AUDIO = "armar_audio";
export const claveEnsamblar = (sourceId: string) => `ensamblar_sesion:${sourceId}`;
export const claveNormalizar = (sourceId: string) => `normalizar:${sourceId}`;

const entre0y100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Cuánto de la fuente está listo para el audio, de 0 a 1: unir partes 10 %, normalizar 85 %, listo 100 %. */
export function fraccionDeFuente(f: Pick<FuenteDeProceso, "kind" | "url" | "status" | "normalizedMs" | "durationMs">): number {
  if (f.status === "normalizada") return 1;
  if (f.kind === "grabacion" && !f.url) return 0;
  const base = f.kind === "grabacion" ? 0.1 : 0;
  const normalizado = f.durationMs && f.durationMs > 0 ? Math.min(0.99, f.normalizedMs / f.durationMs) : 0;
  return base + (1 - base) * normalizado * 0.95;
}

/** El avance de «Preparando el audio»: las fuentes valen 92 %, unirlas en audio.mp3 el 8 % final. */
export function progresoDePreparacion(fuentes: readonly FuenteDeProceso[], audioListo: boolean): number {
  if (audioListo) return 100;
  if (fuentes.length === 0) return 0;
  const suma = fuentes.reduce((s, f) => s + fraccionDeFuente(f), 0);
  return entre0y100((suma / fuentes.length) * 92);
}

export type EntradaDelPlan = {
  fuentes: readonly FuenteDeProceso[];
  tareas: readonly TareaDeProceso[];
  /** Cuánto dura `audio.mp3` (lo fija `armar_audio`). Sin esto no se pueden planificar los tramos. */
  duracionMs?: number | null;
  tramoMs?: number;
  solapeMs?: number;
};

const tareaDeTramo = (t: Tramo, total: number): TareaPorEncolar => ({
  kind: KIND_TRAMO,
  key: claveTramo(t.i),
  payload: { i: t.i, total, desdeMs: t.desdeMs, hastaMs: t.hastaMs, nucleoDesdeMs: t.nucleoDesdeMs, nucleoHastaMs: t.nucleoHastaMs },
});

export function planificarSiguientes(e: EntradaDelPlan): PlanDeProceso {
  const claves = new Map(e.tareas.map((t) => [t.key, t.status]));
  const porEncolar: TareaPorEncolar[] = [];
  const fuentes = e.fuentes.filter((f) => f.status !== "error");

  for (const f of [...fuentes].sort((a, b) => a.idx - b.idx)) {
    if (f.status === "normalizada") continue;
    if (f.kind === "grabacion" && !f.url) {
      if (!claves.has(claveEnsamblar(f.id))) {
        porEncolar.push({ kind: "ensamblar_sesion", key: claveEnsamblar(f.id), payload: { sourceId: f.id, session: f.session, nombre: f.name } });
      }
    } else if (!claves.has(claveNormalizar(f.id))) {
      porEncolar.push({ kind: "normalizar", key: claveNormalizar(f.id), payload: { sourceId: f.id, nombre: f.name } });
    }
  }

  const todasNormalizadas = fuentes.length > 0 && fuentes.every((f) => f.status === "normalizada");
  if (todasNormalizadas && !claves.has(CLAVE_ARMAR_AUDIO)) porEncolar.push({ kind: "armar_audio", key: CLAVE_ARMAR_AUDIO, payload: {} });

  const audioListo = claves.get(CLAVE_ARMAR_AUDIO) === "hecha";
  if (!audioListo) {
    return { encolar: porEncolar, etapa: "preparando_audio", progreso: progresoDePreparacion(fuentes, false), audioListo: false, lista: false };
  }

  // Transcribir: tramo 0 → voces → el resto de los tramos → unir.
  const tramos = planificarTramos(e.duracionMs ?? 0, e.tramoMs ?? TRAMO_MS, e.solapeMs ?? SOLAPE_MS);
  if (tramos.length === 0) return { encolar: porEncolar, etapa: "transcribiendo", progreso: 0, audioListo: true, lista: false };

  const estado = (clave: string) => claves.get(clave);
  if (!claves.has(claveTramo(0))) porEncolar.push(tareaDeTramo(tramos[0], tramos.length));
  if (estado(claveTramo(0)) === "hecha" && !claves.has(CLAVE_VOCES)) porEncolar.push({ kind: KIND_VOCES, key: CLAVE_VOCES, payload: {} });
  if (estado(CLAVE_VOCES) === "hecha") {
    for (const t of tramos.slice(1)) if (!claves.has(claveTramo(t.i))) porEncolar.push(tareaDeTramo(t, tramos.length));
  }

  const hechos = tramos.filter((t) => estado(claveTramo(t.i)) === "hecha").length;
  const todosHechos = hechos === tramos.length;
  if (todosHechos && !claves.has(CLAVE_UNIR)) porEncolar.push({ kind: KIND_UNIR, key: CLAVE_UNIR, payload: {} });

  if (estado(CLAVE_UNIR) === "hecha") {
    // El análisis con IA: un bloque por tarea (los encola `unir` todos juntos) y al final la ficha que los junta. Sin bloques
    // (una grabación casi sin palabras) no hay nada que analizar y la reunión ya está lista. La IA nunca deja una tarea
    // «fallida» (omite el paso y lo anota), así que «hecha» es el único estado final.
    const bloques = e.tareas.filter((t) => t.kind === KIND_BLOQUE);
    if (bloques.length === 0) return { encolar: porEncolar, etapa: null, progreso: 100, audioListo: true, lista: true };
    const bloquesHechos = bloques.filter((t) => t.status === "hecha").length;
    if (bloquesHechos === bloques.length && !claves.has(CLAVE_FICHA)) porEncolar.push({ kind: KIND_FICHA, key: CLAVE_FICHA, payload: {} });
    if (estado(CLAVE_FICHA) === "hecha") return { encolar: porEncolar, etapa: null, progreso: 100, audioListo: true, lista: true };
    const hechas = bloquesHechos + (estado(CLAVE_FICHA) === "hecha" ? 1 : 0);
    return { encolar: porEncolar, etapa: "analizando", progreso: entre0y100((hechas / (bloques.length + 1)) * 100), audioListo: true, lista: false };
  }
  if (todosHechos) return { encolar: porEncolar, etapa: "uniendo", progreso: 0, audioListo: true, lista: false };
  return { encolar: porEncolar, etapa: "transcribiendo", progreso: entre0y100((hechos / tramos.length) * 100), audioListo: true, lista: false };
}

/**
 * Cuántas tareas de una etapa hay hechas y cuántas son (para «Transcribiendo 23 de 48»). Los tramos se encolan por
 * tandas (los demás esperan a las voces), así que, con la duración, el total es el de TODOS los tramos de la reunión.
 */
export function contarTareasDeEtapa(
  tareas: readonly TareaDeProceso[],
  etapa: EtapaReunion | null,
  duracionMs?: number | null,
  tramoMs: number = TRAMO_MS,
): { hechas: number; total: number } {
  if (!etapa) return { hechas: 0, total: 0 };
  const propias = tareas.filter((t) => TAREAS_DE_ETAPA[etapa].includes(t.kind));
  const bloques = propias.filter((t) => t.kind === KIND_BLOQUE).length;
  // Transcribiendo: todos los tramos de la reunión. Analizando: los bloques más la ficha que los junta.
  const total =
    etapa === "transcribiendo" && duracionMs
      ? Math.max(propias.length, cantidadDeTramos(duracionMs, tramoMs))
      : etapa === "analizando" && bloques > 0
        ? bloques + 1
        : propias.length;
  return { hechas: propias.filter((t) => t.status === "hecha").length, total };
}

export const esEtapa = (v: unknown): v is EtapaReunion => typeof v === "string" && (ETAPAS as readonly string[]).includes(v);

/** Estados en los que el procesamiento puede avanzar. */
const AVANZABLES = new Set(["en_cola", "procesando"]);

/**
 * Mira el estado de la reunión, encola lo que sigue y actualiza la etapa y el avance. Es seguro llamarla de más y
 * a la vez desde varias tareas: encolar es idempotente por clave y escribir la etapa, también.
 */
export async function avanzar(meetingId: string): Promise<PlanDeProceso | null> {
  const reunion = await db.meeting.findFirst({ where: { id: meetingId }, select: { id: true, status: true, stage: true, progress: true, durationMs: true } });
  if (!reunion || !AVANZABLES.has(reunion.status)) return null;

  const [fuentes, tareas] = await Promise.all([
    db.meetingSource.findMany({
      where: { meetingId },
      orderBy: { idx: "asc" },
      select: { id: true, idx: true, kind: true, session: true, name: true, url: true, status: true, normalizedMs: true, durationMs: true },
    }),
    db.meetingTask.findMany({ where: { meetingId }, select: { kind: true, key: true, status: true } }),
  ]);
  const plan = planificarSiguientes({ fuentes, tareas, duracionMs: reunion.durationMs });
  for (const t of plan.encolar) await encolar(meetingId, t.kind, t.key, t.payload);

  // «En cola» sigue así hasta que un trabajador empieza la primera tarea (ahí pasa a «procesando»): solo se encola.
  if (reunion.status === "en_cola") return plan;

  if (plan.lista) {
    // Quien gana la carrera (el `updateMany` condicionado a «procesando» devuelve 1 solo a una llamada) hace lo que se hace
    // una vez: sumar el costo, dejar el registro de uso y avisar por correo. `errorMessage` no se toca: la ficha deja ahí el
    // aviso de que el resumen con IA no se pudo generar, para que la pantalla lo diga.
    const r = await db.meeting.updateMany({
      where: { id: meetingId, status: "procesando" },
      data: { status: "lista", stage: null, progress: 100, readyAt: new Date() },
    });
    if (r.count === 1) await alPasarALista(meetingId).catch((e) => console.error("[meetings/orquestador] al pasar a lista", meetingId, e));
    return plan;
  }

  // El avance nunca retrocede dentro de una etapa (varias tareas lo calculan a la vez con datos de distinto momento).
  const mismaEtapa = reunion.stage === plan.etapa;
  const progreso = mismaEtapa ? Math.max(reunion.progress, plan.progreso) : plan.progreso;
  if (!mismaEtapa || progreso !== reunion.progress) {
    await db.meeting.updateMany({ where: { id: meetingId, status: "procesando" }, data: { stage: plan.etapa, progress: progreso } });
  }
  return plan;
}
