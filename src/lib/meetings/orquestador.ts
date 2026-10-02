/**
 * El orquestador decide qué sigue en el procesamiento de una reunión. `avanzar(meetingId)` se llama al cerrar la
 * captura y al terminar cada tarea: mira qué fuentes hay y qué tareas están hechas, encola las que siguen (con
 * claves fijas, así llamarlo de más no duplica nada) y deja anotados la etapa y el avance que ve la persona.
 *
 * `planificarSiguientes` es PURA (recibe el estado, devuelve qué encolar): ahí está toda la lógica y se prueba sin
 * base de datos. Cada hito agrega su etapa aquí (M5: transcribir, M6: ficha).
 */
import { db } from "@/lib/db";
import { encolar } from "./cola";
import { ETAPAS, type EtapaReunion } from "./tipos";

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
  etapa: EtapaReunion | null;
  /** 0-100 del paso actual. */
  progreso: number;
  /** `audio.mp3` ya está armado. */
  audioListo: boolean;
};

/** Qué tareas pertenecen a cada etapa (para contar «hechas de total»). */
export const TAREAS_DE_ETAPA: Record<EtapaReunion, readonly string[]> = {
  preparando_audio: ["ensamblar_sesion", "normalizar", "armar_audio"],
  transcribiendo: ["transcribir_tramo", "voces"],
  uniendo: ["unir"],
  analizando: ["analizar_bloque", "ficha"],
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

export function planificarSiguientes(e: { fuentes: readonly FuenteDeProceso[]; tareas: readonly TareaDeProceso[] }): PlanDeProceso {
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
  if (!audioListo) return { encolar: porEncolar, etapa: "preparando_audio", progreso: progresoDePreparacion(fuentes, false), audioListo: false };

  // M5 continúa aquí: con el audio listo sigue transcribir.
  return { encolar: porEncolar, etapa: "transcribiendo", progreso: 0, audioListo: true };
}

/** Cuántas tareas de una etapa hay hechas y cuántas son (para «Transcribiendo 23 de 48»). */
export function contarTareasDeEtapa(tareas: readonly TareaDeProceso[], etapa: EtapaReunion | null): { hechas: number; total: number } {
  if (!etapa) return { hechas: 0, total: 0 };
  const propias = tareas.filter((t) => TAREAS_DE_ETAPA[etapa].includes(t.kind));
  return { hechas: propias.filter((t) => t.status === "hecha").length, total: propias.length };
}

export const esEtapa = (v: unknown): v is EtapaReunion => typeof v === "string" && (ETAPAS as readonly string[]).includes(v);

/** Estados en los que el procesamiento puede avanzar. */
const AVANZABLES = new Set(["en_cola", "procesando"]);

/**
 * Mira el estado de la reunión, encola lo que sigue y actualiza la etapa y el avance. Es seguro llamarla de más y
 * a la vez desde varias tareas: encolar es idempotente por clave y escribir la etapa, también.
 */
export async function avanzar(meetingId: string): Promise<PlanDeProceso | null> {
  const reunion = await db.meeting.findFirst({ where: { id: meetingId }, select: { id: true, status: true, stage: true, progress: true } });
  if (!reunion || !AVANZABLES.has(reunion.status)) return null;

  const [fuentes, tareas] = await Promise.all([
    db.meetingSource.findMany({
      where: { meetingId },
      orderBy: { idx: "asc" },
      select: { id: true, idx: true, kind: true, session: true, name: true, url: true, status: true, normalizedMs: true, durationMs: true },
    }),
    db.meetingTask.findMany({ where: { meetingId }, select: { kind: true, key: true, status: true } }),
  ]);
  const plan = planificarSiguientes({ fuentes, tareas });
  for (const t of plan.encolar) await encolar(meetingId, t.kind, t.key, t.payload);

  // «En cola» sigue así hasta que un trabajador empieza la primera tarea (ahí pasa a «procesando»): solo se encola.
  if (reunion.status === "en_cola") return plan;

  // El avance nunca retrocede dentro de una etapa (varias tareas lo calculan a la vez con datos de distinto momento).
  const mismaEtapa = reunion.stage === plan.etapa;
  const progreso = mismaEtapa ? Math.max(reunion.progress, plan.progreso) : plan.progreso;
  if (!mismaEtapa || progreso !== reunion.progress) {
    await db.meeting.updateMany({ where: { id: meetingId, status: "procesando" }, data: { stage: plan.etapa, progress: progreso } });
  }
  return plan;
}
