/**
 * El cupo de «Preguntar»: cada pregunta a una reunión es un gasto del chat y cuenta en el mismo porcentaje de uso que el chat de
 * los agentes (ver `uso-chat-servidor.ts`). Sin tope para las cuentas beta y mientras dure la fase de pruebas (`OPEN_TESTING`).
 * Una falla al consultar NO bloquea: se deja pasar y se registra, como el resto de los topes de la plataforma.
 */
import { db } from "@/lib/db";
import { TIPOS } from "@/lib/consumo/funciones";
import { checkSubscriptionAccess } from "@/lib/usage";
import { usoDelChat } from "@/lib/uso-chat-servidor";
import { inicioDelDiaBogota, mensajeDeAgotado } from "@/lib/uso-chat";

/** El tipo con que se registra cada pregunta (su costo y sus tokens quedan en `UsageRecord`). */
export const TIPO_DE_USO_PREGUNTA = TIPOS.reunionPregunta;

export type CupoDePreguntas = {
  permitido: boolean;
  /** Sin tope (cuenta beta o fase de pruebas). */
  ilimitado: boolean;
  /** Lo que queda del uso del chat, en %; null si no aplica o no se pudo saber. */
  porcentajeRestante: number | null;
  /** Lo que se le dice a la persona cuando no alcanza. */
  mensaje: string | null;
};

/**
 * Las cuentas beta y la fase de pruebas no tienen porcentaje de uso, pero una pregunta sobre una reunión larga puede costar hasta
 * ≈ US$0,15 (la transcripción completa va delante en cada una): llevan un techo de seguridad de 60 preguntas al día.
 */
export const MAX_PREGUNTAS_POR_DIA_SIN_PLAN = 60;

const SIN_TOPE: CupoDePreguntas = { permitido: true, ilimitado: true, porcentajeRestante: null, mensaje: null };

export async function comprobarCupoDePreguntas(userId: string, ahora: Date = new Date()): Promise<CupoDePreguntas> {
  try {
    const acceso = await checkSubscriptionAccess(userId);
    if (!acceso.allowed) {
      return { permitido: false, ilimitado: false, porcentajeRestante: null, mensaje: acceso.reason ?? "Necesitas una suscripción activa para preguntarle a una reunión." };
    }
    const uso = await usoDelChat(userId, ahora);
    if (!uso) return { permitido: true, ilimitado: false, porcentajeRestante: null, mensaje: null };
    if (uso.ilimitado) {
      const hoy = await db.usageRecord.count({ where: { userId, type: TIPO_DE_USO_PREGUNTA, date: { gte: inicioDelDiaBogota(ahora) } } });
      if (hoy >= MAX_PREGUNTAS_POR_DIA_SIN_PLAN) {
        return { permitido: false, ilimitado: true, porcentajeRestante: null, mensaje: `Llegaste al máximo de ${MAX_PREGUNTAS_POR_DIA_SIN_PLAN} preguntas de hoy a tus reuniones. Intenta mañana.` };
      }
      return SIN_TOPE;
    }
    if (uso.estado.agotado) {
      return { permitido: false, ilimitado: false, porcentajeRestante: 0, mensaje: mensajeDeAgotado(uso.estado, ahora) };
    }
    return { permitido: true, ilimitado: false, porcentajeRestante: uso.estado.porcentajeRestante, mensaje: null };
  } catch (e) {
    console.error("[meetings/cupo-preguntas] no se pudo comprobar el cupo; se deja pasar", e);
    return SIN_TOPE;
  }
}
