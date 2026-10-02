/**
 * Cola durable del procesamiento (Postgres, tabla `MeetingTask`).
 *
 * Todo lo que tarda se hace en tareas cortas (menos de ~230 s: las rutas tienen `maxDuration = 300`) que se
 * reclaman de forma atómica, se reintentan solas con espera creciente y son idempotentes por (reunión, clave).
 * Las drena el cron cada minuto (solo producción) y las empujan las rutas con `after()`.
 */
import { db } from "@/lib/db";
import { ESPERAS_REINTENTO_MS, MAX_INTENTOS_TAREA, TAREA_MUERTA_MS, formatearRelojCorto } from "./tipos";

export type TareaReclamada = {
  id: string;
  meetingId: string;
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  /** Cuántas veces se ha ejecutado, contando esta. */
  attempts: number;
};

/** Las tareas de una reunión en error se «congelan» hasta esta fecha; «Reintentar» las descongela. */
export const FUTURO_LEJANO = new Date("2099-01-01T00:00:00.000Z");

const comoObjeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Crea la tarea si no existe (idempotente por la clave única). Devuelve true si se creó ahora. */
export async function encolar(meetingId: string, kind: string, key: string, payload: Record<string, unknown> = {}, runAfter: Date = new Date()): Promise<boolean> {
  const antes = await db.meetingTask.findFirst({ where: { meetingId, key }, select: { id: true } });
  if (antes) return false;
  await db.meetingTask.upsert({
    where: { meetingId_key: { meetingId, key } },
    create: { meetingId, kind, key, payload: payload as object, runAfter },
    update: {},
  });
  return true;
}

/**
 * Toma hasta `limite` tareas listas, las más antiguas primero. Cada una se reclama con un `updateMany` condicionado
 * a que siga «pendiente»: si dos trabajadores se pisan, a uno le da `count = 0` y esa tarea es del otro.
 */
export async function reclamar(limite: number, kinds?: readonly string[], ahora: Date = new Date()): Promise<TareaReclamada[]> {
  if (limite <= 0) return [];
  const candidatas = await db.meetingTask.findMany({
    where: { status: "pendiente", runAfter: { lte: ahora }, ...(kinds ? { kind: { in: [...kinds] } } : {}) },
    orderBy: { createdAt: "asc" },
    take: limite * 3, // algunas se las llevará otro trabajador
  });
  const mias: TareaReclamada[] = [];
  for (const t of candidatas) {
    if (mias.length >= limite) break;
    const intentosAntes = t.attempts;
    const r = await db.meetingTask.updateMany({
      where: { id: t.id, status: "pendiente" },
      data: { status: "en_curso", lockedAt: ahora, attempts: { increment: 1 } },
    });
    if (r.count === 1) mias.push({ id: t.id, meetingId: t.meetingId, kind: t.kind, key: t.key, payload: comoObjeto(t.payload), attempts: intentosAntes + 1 });
  }
  return mias;
}

/** Una tarea larga avisa que sigue viva (cada ~30 s); el vigilante rescata las que dejan de avisar. */
export async function latido(id: string, ahora: Date = new Date()): Promise<void> {
  await db.meetingTask.updateMany({ where: { id, status: "en_curso" }, data: { lockedAt: ahora } });
}

export async function completar(id: string, resultado?: Record<string, unknown>): Promise<void> {
  await db.meetingTask.updateMany({
    where: { id },
    data: { status: "hecha", lockedAt: null, error: null, ...(resultado ? { result: resultado as object } : {}) },
  });
}

/**
 * La tarea hizo una parte y sigue en otra pasada (se acabó su presupuesto de tiempo): vuelve a «pendiente» al
 * instante y NO cuenta como intento (avanzó, no falló).
 */
export async function continuar(id: string, ahora: Date = new Date()): Promise<void> {
  await db.meetingTask.updateMany({
    where: { id, status: "en_curso" },
    data: { status: "pendiente", runAfter: ahora, lockedAt: null, attempts: { decrement: 1 } },
  });
}

/** Una tarea que no se pudo ejecutar ahora (la reunión está en error): vuelve atrás sin gastar el intento. */
export async function devolver(id: string): Promise<void> {
  await db.meetingTask.updateMany({
    where: { id, status: "en_curso" },
    data: { status: "pendiente", runAfter: FUTURO_LEJANO, lockedAt: null, attempts: { decrement: 1 } },
  });
}

/* ════════════════════════════════════════════════════════════════════
   Fallos
   ════════════════════════════════════════════════════════════════════ */

/** Cómo se llama lo que hacía cada tarea, para decir en español qué no se pudo. */
export function describirTarea(kind: string, payload: unknown): string {
  const p = comoObjeto(payload);
  const nombre = typeof p.nombre === "string" && p.nombre ? p.nombre : null;
  switch (kind) {
    case "ensamblar_sesion":
      return typeof p.session === "number" ? `unir las partes de la grabación (sesión ${p.session})` : "unir las partes de la grabación";
    case "normalizar":
      return nombre ? `preparar el audio de «${nombre}»` : "preparar el audio";
    case "armar_audio":
      return "unir el audio de la reunión";
    case "transcribir_tramo": {
      // «2:10:00–2:20:00»: el tramo es lo que la persona oye como «de la hora 2:10 a la 2:20», sin el solape.
      const desde = typeof p.nucleoDesdeMs === "number" ? p.nucleoDesdeMs : null;
      const hasta = typeof p.nucleoHastaMs === "number" ? p.nucleoHastaMs : null;
      return desde !== null && hasta !== null ? `transcribir el tramo ${formatearRelojCorto(desde)}–${formatearRelojCorto(hasta)}` : "transcribir un tramo de la reunión";
    }
    case "voces":
      return "reconocer las voces de la reunión";
    case "unir":
      return "unir la transcripción de la reunión";
    default:
      return "procesar un paso de la reunión";
  }
}

/**
 * El mensaje que ve la persona cuando una tarea ya no se reintenta. Si el motivo es una explicación ya lista para
 * leer (empieza por «No pudimos»), se usa tal cual; si no, se dice qué paso falló y que se reintentó.
 */
export function mensajeDeFallo(kind: string, payload: unknown, motivo: string, agotada: boolean): string {
  const accion = describirTarea(kind, payload);
  if (!agotada) return /^No pudimos/.test(motivo) ? motivo : `No pudimos ${accion}. ${motivo}`;
  return `No pudimos ${accion} después de ${MAX_INTENTOS_TAREA} intentos. Reintenta: solo se vuelve a procesar ese paso.`;
}

/** Cuánto se espera antes de volver a intentar, según cuántos intentos van (1.º fallo → 30 s, 2.º → 2 min…). */
export const esperaDeReintento = (intentos: number): number => ESPERAS_REINTENTO_MS[Math.min(Math.max(intentos, 1), ESPERAS_REINTENTO_MS.length) - 1];

export type DestinoDelFallo = "reintento" | "fallida" | "inexistente";

/** La reunión pasa a «error» con un mensaje legible, y el resto de sus tareas pendientes se congela. */
async function marcarReunionEnError(meetingId: string, mensaje: string): Promise<void> {
  await db.meeting.updateMany({ where: { id: meetingId, status: { in: ["en_cola", "procesando"] } }, data: { status: "error", errorMessage: mensaje } });
  await db.meetingTask.updateMany({ where: { meetingId, status: "pendiente" }, data: { runAfter: FUTURO_LEJANO } });
}

/**
 * Una tarea falló. Si el fallo es del momento (red, servicio) y quedan intentos, vuelve a «pendiente» con espera
 * creciente. Si no, queda «fallida» y la reunión pasa a «error» con un mensaje que dice qué paso fue.
 */
export async function fallar(id: string, motivo: string, opciones: { reintentable: boolean }, ahora: Date = new Date()): Promise<DestinoDelFallo> {
  const t = await db.meetingTask.findFirst({ where: { id } });
  if (!t) return "inexistente";
  const texto = motivo.slice(0, 500);
  const agotada = !opciones.reintentable || t.attempts >= MAX_INTENTOS_TAREA;
  if (!agotada) {
    await db.meetingTask.updateMany({
      where: { id },
      data: { status: "pendiente", runAfter: new Date(ahora.getTime() + esperaDeReintento(t.attempts)), lockedAt: null, error: texto },
    });
    return "reintento";
  }
  await db.meetingTask.updateMany({ where: { id }, data: { status: "fallida", lockedAt: null, error: texto } });
  await marcarReunionEnError(t.meetingId, mensajeDeFallo(t.kind, t.payload, texto, opciones.reintentable));
  return "fallida";
}

/**
 * Rescata las tareas «en curso» que dejaron de avisar (la función murió: tiempo agotado, despliegue, memoria). Cuentan
 * como un intento fallido: vuelven a «pendiente» o, si ya llevan 3, quedan «fallidas».
 */
export async function vigilante(ahora: Date = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - TAREA_MUERTA_MS);
  const muertas = await db.meetingTask.findMany({ where: { status: "en_curso", lockedAt: { lt: limite } } });
  let n = 0;
  for (const t of muertas) {
    // Solo si sigue muerta: pudo terminar mientras tanto.
    const sigue = await db.meetingTask.findFirst({ where: { id: t.id, status: "en_curso", lockedAt: { lt: limite } } });
    if (!sigue) continue;
    await fallar(t.id, "La tarea se interrumpió.", { reintentable: true }, ahora);
    n++;
  }
  return n;
}

/** «Reintentar»: las fallidas vuelven a empezar de cero, las congeladas se descongelan y la reunión sigue. */
export async function reintentarFallidas(meetingId: string, ahora: Date = new Date()): Promise<number> {
  const r = await db.meetingTask.updateMany({ where: { meetingId, status: "fallida" }, data: { status: "pendiente", attempts: 0, runAfter: ahora, error: null } });
  await db.meetingTask.updateMany({ where: { meetingId, status: "pendiente", runAfter: FUTURO_LEJANO }, data: { runAfter: ahora } });
  if (r.count > 0) await db.meeting.updateMany({ where: { id: meetingId, status: "error" }, data: { status: "procesando", errorMessage: null } });
  return r.count;
}

/** ¿Hay trabajo listo y nadie lo está haciendo (o quien lo hacía dejó de avisar)? Decide si vale la pena empujar. */
export async function hayTrabajoSinAtender(meetingId: string | null, ahora: Date = new Date(), margenMs = 45_000): Promise<boolean> {
  const dueno = meetingId ? { meetingId } : {};
  const listas = await db.meetingTask.count({ where: { ...dueno, status: "pendiente", runAfter: { lte: ahora } } });
  if (listas === 0) return false;
  const vivas = await db.meetingTask.count({ where: { ...dueno, status: "en_curso", lockedAt: { gt: new Date(ahora.getTime() - margenMs) } } });
  return vivas === 0;
}
