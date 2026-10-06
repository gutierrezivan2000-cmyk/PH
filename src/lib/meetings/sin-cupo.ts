/**
 * «Procesar de nuevo» una reunión que quedó en «sin_cupo»: cuando se renueva el mes o se sube de plan, la persona la manda a
 * procesar sin volver a subir el audio (se conservó). No se hace sola: gastar horas del plan es una decisión de la persona,
 * que además puede tener varias esperando y elegir cuál procesar con las horas que le quedan.
 *
 * Solo se vuelve a mirar el cupo con la duración que ya se midió; si ahora alcanza, la reunión pasa a «en_cola» y el
 * orquestador sigue donde se quedó (el audio ya está armado: lo que viene es transcribir).
 */
import { db } from "@/lib/db";
import { comprobarCupoDeReuniones, type Cupo } from "./cupos";
import { avanzar } from "./orquestador";
import { estaEnMarcha } from "./tipos";

export type ResultadoDeReprocesar =
  | { ok: true; status: string }
  | { ok: false; codigo: "no_existe" | "no_esta_en_espera" | "sin_cupo"; error: string };

/** Lo que se le dice a quien pide procesar algo que no está esperando horas (un borrador, una con error…). */
const NO_ESPERA_HORAS = "Esta reunión no está esperando horas.";
/** Cuando el cupo dice que no alcanza pero no explica por qué (no debería pasar: `comprobarCupoDeReuniones` siempre trae mensaje). */
const SIN_HORAS = "Todavía no tienes horas disponibles para esta reunión.";

export async function reprocesarSinCupo({
  meetingId, userId, comprobarCupo = comprobarCupoDeReuniones,
}: {
  meetingId: string;
  userId: string;
  /** Quien llama puede cambiarla en las pruebas. */
  comprobarCupo?: (userId: string, duracionMs: number, excluirReunionId?: string) => Promise<Cupo>;
}): Promise<ResultadoDeReprocesar> {
  const m = await db.meeting.findFirst({ where: { id: meetingId, userId }, select: { id: true, status: true, durationMs: true } });
  if (!m) return { ok: false, codigo: "no_existe", error: "Reunión no encontrada" };

  if (m.status !== "sin_cupo") {
    // Un segundo clic, o una reunión que ya se procesó: se dice dónde va, sin tocar nada.
    if (estaEnMarcha(m.status) || m.status === "lista") return { ok: true, status: m.status };
    return { ok: false, codigo: "no_esta_en_espera", error: NO_ESPERA_HORAS };
  }

  const cupo = await comprobarCupo(userId, m.durationMs ?? 0, meetingId);
  if (!cupo.permitido) return { ok: false, codigo: "sin_cupo", error: cupo.mensaje ?? SIN_HORAS };

  // Dos clics casi a la vez: solo el primero la pasa a «en_cola» y encola lo que sigue; el otro encuentra el cambio hecho.
  const r = await db.meeting.updateMany({ where: { id: meetingId, status: "sin_cupo" }, data: { status: "en_cola", stage: null, progress: 0, errorMessage: null } });
  if (r.count === 1) await avanzar(meetingId);
  return { ok: true, status: "en_cola" };
}
