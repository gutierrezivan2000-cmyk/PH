/**
 * El cupo de «Preguntar»: cada pregunta a una reunión es un gasto del chat y cuenta en el mismo porcentaje de uso que el chat de
 * los agentes (ver `uso-chat-servidor.ts`). Sin tope para las cuentas beta y mientras dure la fase de pruebas (`OPEN_TESTING`).
 * Una falla al consultar NO bloquea: se deja pasar y se registra, como el resto de los topes de la plataforma.
 */
import { TIPOS } from "@/lib/consumo/funciones";
import { checkSubscriptionAccess } from "@/lib/usage";
import { usoDelChat } from "@/lib/uso-chat-servidor";
import { mensajeDeAgotado } from "@/lib/uso-chat";

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

const SIN_TOPE: CupoDePreguntas = { permitido: true, ilimitado: true, porcentajeRestante: null, mensaje: null };

export async function comprobarCupoDePreguntas(userId: string, ahora: Date = new Date()): Promise<CupoDePreguntas> {
  try {
    const acceso = await checkSubscriptionAccess(userId);
    if (!acceso.allowed) {
      return { permitido: false, ilimitado: false, porcentajeRestante: null, mensaje: acceso.reason ?? "Necesitas una suscripción activa para preguntarle a una reunión." };
    }
    const uso = await usoDelChat(userId, ahora);
    if (!uso) return { permitido: true, ilimitado: false, porcentajeRestante: null, mensaje: null };
    if (uso.ilimitado) return SIN_TOPE;
    if (uso.estado.agotado) {
      return { permitido: false, ilimitado: false, porcentajeRestante: 0, mensaje: mensajeDeAgotado(uso.estado, ahora) };
    }
    return { permitido: true, ilimitado: false, porcentajeRestante: uso.estado.porcentajeRestante, mensaje: null };
  } catch (e) {
    console.error("[meetings/cupo-preguntas] no se pudo comprobar el cupo; se deja pasar", e);
    return SIN_TOPE;
  }
}
