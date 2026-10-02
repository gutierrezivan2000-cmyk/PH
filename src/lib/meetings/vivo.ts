/**
 * Grabadora en vivo, del lado del servidor y con base de datos real: reservar el número de una sesión y
 * resumir lo que ya se recibió. Las decisiones puras (qué falta, dónde empieza una sesión) están en cierre.ts.
 *
 * Una «reserva» es una fila de `MeetingLivePart` con `seq = -1`: la clave única (reunión, sesión, parte) hace
 * que dos dispositivos que empiezan a grabar a la vez no obtengan el mismo número de sesión (y no se pisen
 * las partes). Toda consulta de audio filtra `seq >= 0`.
 */
import { db } from "@/lib/db";
import { offsetAntesDe, type FuenteGrabada, type ParteRecibida } from "./cierre";
import type { VivoDTO } from "./dto";
import { MAX_SESIONES_VIVO } from "./tipos";

const esChoqueUnico = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

/** Cuántas veces se reintenta si otro dispositivo se quedó con el número justo antes. */
const INTENTOS_RESERVA = 8;

export async function reservarSesion(meetingId: string): Promise<{ session: number; offsetMs: number } | { tope: true }> {
  for (let intento = 0; intento < INTENTOS_RESERVA; intento++) {
    const [enPartes, enFuentes] = await Promise.all([
      db.meetingLivePart.aggregate({ where: { meetingId }, _max: { session: true } }),
      db.meetingSource.aggregate({ where: { meetingId, kind: "grabacion" }, _max: { session: true } }),
    ]);
    const session = Math.max(enPartes._max.session ?? 0, enFuentes._max.session ?? 0) + 1;
    if (session > MAX_SESIONES_VIVO) return { tope: true };
    try {
      await db.meetingLivePart.create({ data: { meetingId, session, seq: -1, url: "", bytes: 0, durationMs: 0, mimeType: "" } });
    } catch (e) {
      if (esChoqueUnico(e)) continue;
      throw e;
    }
    const [partes, fuentes] = await Promise.all([
      db.meetingLivePart.findMany({
        where: { meetingId, session: { lt: session } },
        select: { session: true, seq: true, bytes: true, durationMs: true, mimeType: true },
      }),
      db.meetingSource.findMany({ where: { meetingId, kind: "grabacion" }, select: { kind: true, session: true, durationMs: true } }),
    ]);
    return { session, offsetMs: offsetAntesDe(session, partes as ParteRecibida[], fuentes as FuenteGrabada[]) };
  }
  throw new Error("No se pudo reservar la sesión de grabación.");
}

/** Lo recibido hasta ahora de la grabadora (null si todavía no llegó audio). */
export async function resumenVivo(meetingId: string): Promise<VivoDTO | null> {
  const donde = { meetingId, seq: { gte: 0 } };
  const [suma, sesiones] = await Promise.all([
    db.meetingLivePart.aggregate({ where: donde, _sum: { durationMs: true }, _count: { _all: true }, _max: { createdAt: true } }),
    db.meetingLivePart.findMany({ where: donde, distinct: ["session"], select: { session: true } }),
  ]);
  const partes = suma._count._all;
  if (partes === 0) return null;
  const ultima = suma._max.createdAt;
  return {
    sesiones: sesiones.length,
    durMs: suma._sum.durationMs ?? 0,
    partes,
    ultimaParteEn: ultima ? new Date(ultima).toISOString() : null,
  };
}
