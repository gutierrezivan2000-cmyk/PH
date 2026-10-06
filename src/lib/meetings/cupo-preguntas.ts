/**
 * El cupo de «Preguntar»: cada pregunta a una reunión cuenta como un mensaje de agente del plan (30 al día y 150 a la semana en
 * Pro; 60 y 400 en Business; 150 y 1.000 en Élite; 15 al día en la prueba gratis), en la misma bolsa que el chat de los agentes:
 * se suman los mensajes que la persona le escribió a los agentes y las preguntas que le hizo a sus reuniones.
 *
 * Sin tope para las cuentas beta y mientras dure la fase de pruebas abierta (`OPEN_TESTING`). Una falla al consultar NO bloquea: se
 * deja pasar y se registra, como el resto de los topes de la plataforma. Los días y las semanas son los de Bogotá.
 */
import { db } from "@/lib/db";
import { PLANS, TRIAL_LIMITS } from "@/lib/epayco";
import { normalizePlanId } from "@/lib/plan";
import { checkSubscriptionAccess } from "@/lib/usage";

/** El tipo con que se registra cada pregunta (su costo y sus tokens quedan en `UsageRecord`). */
export const TIPO_DE_USO_PREGUNTA = "reunion_pregunta";

const HORA_MS = 3_600_000;
/** Bogotá es UTC−5 todo el año. */
const DESFASE_BOGOTA_MS = 5 * HORA_MS;

/** La medianoche de hoy en Bogotá. */
export function inicioDeDia(ahora: Date): Date {
  const local = new Date(ahora.getTime() - DESFASE_BOGOTA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DESFASE_BOGOTA_MS);
}

/** La medianoche del lunes de esta semana en Bogotá. */
export function inicioDeSemana(ahora: Date): Date {
  const local = new Date(ahora.getTime() - DESFASE_BOGOTA_MS);
  const desdeElLunes = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - desdeElLunes) + DESFASE_BOGOTA_MS);
}

/** Cuántos mensajes de agente tiene un plan por día y por semana (el plan que no se reconoce cuenta como Pro). */
export function limitesDeMensajes(planId?: string | null): { porDia: number; porSemana: number } {
  const plan = normalizePlanId(planId);
  const l = plan === "elite" ? PLANS.elite.limits : plan === "business" ? PLANS.business.limits : PLANS.pro.limits;
  return { porDia: l.agentMessagesPerDay, porSemana: l.agentMessagesPerWeek };
}

export type CupoDePreguntas = {
  permitido: boolean;
  /** Sin tope (cuenta beta o fase de pruebas). */
  ilimitado: boolean;
  usadoHoy: number;
  limiteHoy: number | null;
  usadoEstaSemana: number;
  limiteSemana: number | null;
  /** Lo que se le dice a la persona cuando no alcanza. */
  mensaje: string | null;
};

const ILIMITADO: CupoDePreguntas = { permitido: true, ilimitado: true, usadoHoy: 0, limiteHoy: null, usadoEstaSemana: 0, limiteSemana: null, mensaje: null };

const preguntasHechas = (userId: string, desde: Date): Promise<number> =>
  db.usageRecord.count({ where: { userId, type: TIPO_DE_USO_PREGUNTA, date: { gte: desde } } });

/**
 * Las preguntas que la persona le hizo a sus reuniones desde `desde`. Cuentan como mensajes de agente del plan: el chat de los
 * agentes y `/api/agents/usage` las suman a los suyos para que la bolsa sea una sola. No lanza: si no se pueden contar, cuenta 0
 * (un tope no debe tumbar el chat), como el resto de los topes de la plataforma.
 */
export async function contarPreguntasAReuniones(userId: string, desde: Date): Promise<number> {
  try {
    return await preguntasHechas(userId, desde);
  } catch (e) {
    console.error("[meetings/cupo-preguntas] no se pudieron contar las preguntas a reuniones", e);
    return 0;
  }
}

/** Los mensajes de la persona desde `desde`: lo que le escribió a los agentes más las preguntas que hizo a sus reuniones. */
async function contarMensajes(userId: string, desde: Date): Promise<number> {
  let alAgente = 0;
  try {
    const chats = await db.agentChat.findMany({ where: { userId }, select: { id: true } });
    if (chats.length > 0) {
      alAgente = await db.agentMessage.count({ where: { chatId: { in: chats.map((c: { id: string }) => c.id) }, role: "user", createdAt: { gte: desde } } });
    }
  } catch (e) {
    // Las tablas del chat pueden no existir todavía: se cuentan solo las preguntas a reuniones.
    console.error("[meetings/cupo-preguntas] no se pudieron contar los mensajes de los agentes", e);
  }
  return alAgente + (await preguntasHechas(userId, desde));
}

export async function comprobarCupoDePreguntas(userId: string, ahora: Date = new Date()): Promise<CupoDePreguntas> {
  try {
    const acceso = await checkSubscriptionAccess(userId);
    if (!acceso.allowed) {
      return { ...ILIMITADO, permitido: false, ilimitado: false, mensaje: acceso.reason ?? "Necesitas una suscripción activa para preguntarle a una reunión." };
    }
    if (acceso.status === "beta" || acceso.status === "testing") return ILIMITADO;

    const prueba = acceso.status === "trialing";
    let porDia: number;
    let porSemana: number | null;
    if (prueba) {
      porDia = TRIAL_LIMITS.agentMessagesPerDay;
      porSemana = null;
    } else {
      const sub = await db.subscription.findUnique({ where: { userId }, select: { planId: true } });
      ({ porDia, porSemana } = limitesDeMensajes(sub?.planId));
    }

    const usadoHoy = await contarMensajes(userId, inicioDeDia(ahora));
    if (usadoHoy >= porDia) {
      return { permitido: false, ilimitado: false, usadoHoy, limiteHoy: porDia, usadoEstaSemana: usadoHoy, limiteSemana: porSemana, mensaje: `Has alcanzado el límite diario de ${porDia} mensajes. Intenta mañana.` };
    }
    const usadoEstaSemana = porSemana === null ? usadoHoy : await contarMensajes(userId, inicioDeSemana(ahora));
    if (porSemana !== null && usadoEstaSemana >= porSemana) {
      return { permitido: false, ilimitado: false, usadoHoy, limiteHoy: porDia, usadoEstaSemana, limiteSemana: porSemana, mensaje: `Has alcanzado el límite semanal de ${porSemana} mensajes.` };
    }
    return { permitido: true, ilimitado: false, usadoHoy, limiteHoy: porDia, usadoEstaSemana, limiteSemana: porSemana, mensaje: null };
  } catch (e) {
    console.error("[meetings/cupo-preguntas] no se pudo comprobar el cupo; se deja pasar", e);
    return ILIMITADO;
  }
}
