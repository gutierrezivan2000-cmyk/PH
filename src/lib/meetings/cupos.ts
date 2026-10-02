/**
 * Cupos de Reuniones: horas de audio por mes según el plan (Pro 10, Business 40, Élite 120), 2 horas EN TOTAL durante la
 * prueba gratis, y sin tope para las cuentas beta y mientras dure la fase de pruebas abierta (`OPEN_TESTING`).
 *
 * Se comprueba en `armar_audio`, cuando ya se sabe cuánto dura la reunión: si no alcanza, la reunión pasa a «sin_cupo» (el
 * audio se conserva) con un mensaje que dice cuánto dura y cuánto queda. Lo ya consumido se saca de las propias reuniones
 * (su duración), no de un contador aparte: así reintentar o reprocesar nunca cuenta dos veces.
 */
import { db } from "@/lib/db";
import { PLANS, TRIAL_LIMITS } from "@/lib/epayco";
import { normalizePlanId } from "@/lib/plan";
import { checkSubscriptionAccess } from "@/lib/usage";
import { formatearDuracion } from "./tipos";

const HORA_MS = 3_600_000;
/** Bogotá es UTC−5 todo el año: el mes de cupo empieza a medianoche allá, no a las 7 p. m. del día anterior. */
const DESFASE_BOGOTA_MS = 5 * HORA_MS;

export type Cupo = {
  permitido: boolean;
  /** Sin tope (cuenta beta o fase de pruebas): lo demás no aplica. */
  ilimitado: boolean;
  /** Qué ventana cuenta: el mes, o toda la prueba gratis. */
  periodo: "mes" | "prueba";
  usadoMs: number;
  limiteMs: number | null;
  restanMs: number | null;
  /** Lo que se le dice a la persona cuando no alcanza. */
  mensaje: string | null;
};

const ILIMITADO: Cupo = { permitido: true, ilimitado: true, periodo: "mes", usadoMs: 0, limiteMs: null, restanMs: null, mensaje: null };

/** El primer instante del mes (hora de Bogotá). */
export function inicioDeMes(ahora: Date): Date {
  const local = new Date(ahora.getTime() - DESFASE_BOGOTA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DESFASE_BOGOTA_MS);
}

/** Cuántas horas de reuniones al mes tiene un plan (el plan que no se reconoce cuenta como Pro). */
export function horasPorMes(planId?: string | null): number {
  const plan = normalizePlanId(planId);
  if (plan === "elite") return PLANS.elite.limits.meetingHoursPerMonth;
  if (plan === "business") return PLANS.business.limits.meetingHoursPerMonth;
  return PLANS.pro.limits.meetingHoursPerMonth;
}

const horas = (ms: number) => formatearDuracion(ms);

/** «Esta reunión dura 8 h y te quedan 2 h este mes.» / «Ya usaste las 10 h de reuniones de este mes.» */
export function mensajeDeCupo(p: { duracionMs: number; restanMs: number; limiteMs: number; periodo: "mes" | "prueba" }): string {
  const cuando = p.periodo === "mes" ? "este mes" : "en la prueba";
  if (p.restanMs <= 0) return `Ya usaste las ${horas(p.limiteMs)} de reuniones ${p.periodo === "mes" ? "de este mes" : "de la prueba gratis"}.`;
  return `Esta reunión dura ${horas(p.duracionMs)} y te quedan ${horas(p.restanMs)} ${cuando}.`;
}

/**
 * ¿Le alcanza a este usuario para procesar una reunión de `duracionMs`? `excluirReunionId` es la que se está evaluando (su
 * propia duración no cuenta como consumida). Una falla al consultar NO bloquea: se deja pasar y se registra, como el resto
 * de los topes de la plataforma.
 */
export async function comprobarCupoDeReuniones(userId: string, duracionMs: number, excluirReunionId?: string, ahora: Date = new Date()): Promise<Cupo> {
  try {
    const acceso = await checkSubscriptionAccess(userId);
    if (!acceso.allowed) {
      return { ...ILIMITADO, permitido: false, ilimitado: false, mensaje: acceso.reason ?? "Necesitas una suscripción activa para procesar reuniones." };
    }
    if (acceso.status === "beta" || acceso.status === "testing") return ILIMITADO;

    const prueba = acceso.status === "trialing";
    let limiteMs: number;
    if (prueba) {
      limiteMs = TRIAL_LIMITS.meetingHoursTotal * HORA_MS;
    } else {
      const sub = await db.subscription.findUnique({ where: { userId }, select: { planId: true } });
      limiteMs = horasPorMes(sub?.planId) * HORA_MS;
    }

    const periodo = prueba ? "prueba" : "mes";
    const suma = await db.meeting.aggregate({
      where: {
        userId,
        durationMs: { gt: 0 },
        audioUrl: { not: null },
        status: { not: "sin_cupo" },
        ...(excluirReunionId ? { id: { not: excluirReunionId } } : {}),
        ...(prueba ? {} : { createdAt: { gte: inicioDeMes(ahora) } }),
      },
      _sum: { durationMs: true },
    });
    const usadoMs = suma._sum.durationMs ?? 0;
    const restanMs = Math.max(0, limiteMs - usadoMs);
    const permitido = duracionMs <= restanMs;
    return { permitido, ilimitado: false, periodo, usadoMs, limiteMs, restanMs, mensaje: permitido ? null : mensajeDeCupo({ duracionMs, restanMs, limiteMs, periodo }) };
  } catch (e) {
    console.error("[meetings/cupos] no se pudo comprobar el cupo; se deja pasar", e);
    return ILIMITADO;
  }
}
