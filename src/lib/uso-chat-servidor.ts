/**
 * El uso del chat de una cuenta, leído de la base: el porcentaje que le queda (ver `uso-chat.ts`). Lo usan el chat de los
 * agentes, «Preguntar» en Reuniones y el panel de uso del asistente, para que los tres digan lo mismo.
 *
 * Cuenta lo que la persona hace con los agentes por chat: los mensajes, el título, las imágenes que lee, los audios que se
 * transcriben en el chat y las preguntas a sus reuniones. NO cuentan los documentos (informes, actas, cartas), que tienen sus
 * propios cupos, ni las reuniones (cuentan horas).
 */
import { db } from "@/lib/db";
import { PLANS, TRIAL_LIMITS } from "@/lib/epayco";
import { normalizePlanId } from "@/lib/plan";
import { TIPOS } from "@/lib/consumo/funciones";
import { contextoDeConsumo } from "@/lib/consumo/registrar";
import { checkSubscriptionAccess } from "@/lib/usage";
import { estadoDeUso, fechaBogota, periodoMensualBogota, type EstadoDeUso } from "@/lib/uso-chat";

/** Los tipos de consumo (UsageRecord.type) que se suman al porcentaje del chat. */
export const TIPOS_DEL_CHAT: readonly string[] = [TIPOS.agenteChat, TIPOS.agenteTitulo, TIPOS.agenteLectura, TIPOS.audioEnAgente, TIPOS.reunionPregunta];

const SIETE_DIAS_MS = 7 * 24 * 3_600_000;

/** Los límites del plan de la cuenta (el que no se reconoce cuenta como Pro). Business y Élite tienen los suyos. */
export function limitesDelPlan(planId?: string | null) {
  const plan = normalizePlanId(planId);
  return plan === "elite" ? PLANS.elite.limits : plan === "business" ? PLANS.business.limits : PLANS.pro.limits;
}

export type UsoDelChat =
  | { ilimitado: true }
  | { ilimitado: false; presupuestoUsd: number; estado: EstadoDeUso };

/**
 * El uso del chat de la cuenta. Sin tope para las cuentas beta y mientras dure la fase de pruebas. Devuelve null si no se puede
 * saber: una falla al consultar NO bloquea (como el resto de los topes de la plataforma).
 */
export async function usoDelChat(userId: string, ahora: Date = new Date()): Promise<UsoDelChat | null> {
  try {
    const acceso = await checkSubscriptionAccess(userId);
    if (acceso.status === "beta" || acceso.status === "testing") return { ilimitado: true };

    const sub = await db.subscription.findUnique({
      where: { userId },
      select: { planId: true, currentPeriodStart: true, currentPeriodEnd: true },
    });
    const prueba = acceso.status === "trialing";
    const presupuestoUsd = prueba ? TRIAL_LIMITS.chatBudgetUsd : limitesDelPlan(sub?.planId).chatBudgetUsd;

    // La prueba dura su propio periodo (7 días desde que empezó); los planes pagos, el mes calendario en Bogotá.
    const periodo =
      prueba && sub?.currentPeriodStart && sub?.currentPeriodEnd
        ? { inicio: sub.currentPeriodStart, fin: sub.currentPeriodEnd }
        : periodoMensualBogota(ahora);

    // Hace falta lo gastado desde el inicio del periodo y, para las ventanas móviles, los últimos 7 días.
    const desde = new Date(Math.min(periodo.inicio.getTime(), ahora.getTime() - SIETE_DIAS_MS));
    const filas = await db.usageRecord.findMany({
      where: { userId, type: { in: [...TIPOS_DEL_CHAT] }, date: { gte: desde } },
      select: { date: true, costUsd: true },
    });

    const estado = estadoDeUso({
      presupuestoUsd,
      periodo,
      consumos: filas.map((f) => ({ fecha: f.date, costUsd: f.costUsd })),
      ahora,
    });
    return { ilimitado: false, presupuestoUsd, estado };
  } catch (e) {
    console.error("[uso-chat] no se pudo calcular el uso del chat; se deja pasar", e);
    return null;
  }
}

/** Los tipos de consumo que transcriben audio: el chat (`transcription`) y los documentos generados (`generacion_audio`). */
export const TIPOS_DE_AUDIO: readonly string[] = [TIPOS.audioEnAgente, TIPOS.audioEnGeneracion];

/** Minutos de audio transcritos desde `desde`, del chat y de los documentos juntos (UsageRecord.tokens guarda los segundos). */
export async function minutosDeAudioDesde(userId: string, desde: Date): Promise<number> {
  const suma = await db.usageRecord.aggregate({
    where: { userId, type: { in: [...TIPOS_DE_AUDIO] }, date: { gte: desde } },
    _sum: { tokens: true },
  });
  return Math.ceil((suma._sum.tokens ?? 0) / 60);
}

/**
 * El tope mensual de minutos de audio. Lo comparten el chat y los documentos con audio: los dos transcriben con el mismo proveedor.
 * La prueba gratis tiene su total (`transcriptionMinutesTotal`) en vez de uno mensual. Sin tope para beta y pruebas. No bloquea
 * si no se puede contar.
 */
export async function cupoDeAudioMensual(userId: string, minutosPedidos: number, ahora: Date = new Date()): Promise<{ bloqueado: boolean; mensaje: string | null }> {
  try {
    const acceso = await checkSubscriptionAccess(userId);
    if (acceso.status === "beta" || acceso.status === "testing") return { bloqueado: false, mensaje: null };
    const sub = await db.subscription.findUnique({ where: { userId }, select: { planId: true, currentPeriodStart: true, currentPeriodEnd: true } });
    const prueba = acceso.status === "trialing";
    const periodo =
      prueba && sub?.currentPeriodStart && sub?.currentPeriodEnd
        ? { inicio: sub.currentPeriodStart, fin: sub.currentPeriodEnd }
        : periodoMensualBogota(ahora);
    const tope = prueba ? TRIAL_LIMITS.transcriptionMinutesTotal : limitesDelPlan(sub?.planId).transcriptionMinutesPerMonth;
    const usados = await minutosDeAudioDesde(userId, periodo.inicio);
    if (usados + minutosPedidos <= tope) return { bloqueado: false, mensaje: null };
    const restan = Math.max(0, tope - usados);
    const mensaje = prueba
      ? `Tu prueba gratis incluye ${tope} minutos de audio y te quedan ${restan}. Elige un plan para transcribir más.`
      : `Tu cupo mensual de audio (chat y documentos) es de ${tope} minutos y te quedan ${restan}. Se renueva el ${fechaBogota(periodo.fin)}.`;
    return { bloqueado: true, mensaje };
  } catch (e) {
    console.error("[uso-chat] no se pudo revisar el cupo de audio; se deja pasar", e);
    return { bloqueado: false, mensaje: null };
  }
}

/** El audio no cabe en el cupo mensual de minutos (lo que se dice a la persona está en el mensaje). */
export class CupoDeAudioAgotado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "CupoDeAudioAgotado";
  }
}

/**
 * Antes de mandar un audio a transcribir: ¿cabe en el cupo mensual de minutos? Usa el tamaño REAL del archivo (no el que declara el
 * cliente) y la cuenta de la operación en curso (`conConsumo`), así que cubre también el lote y los reintentos, que no pasan por la
 * comprobación de la ruta. Lanza `CupoDeAudioAgotado` si no cabe. Sin cuenta en el contexto no comprueba. Estima 1 MB ≈ 1 minuto.
 */
export async function exigirCupoDeAudio(file: Pick<File, "size">): Promise<void> {
  const userId = contextoDeConsumo()?.userId;
  if (!userId) return;
  const minutos = Math.max(1, Math.ceil(file.size / (1024 * 1024)));
  const cupo = await cupoDeAudioMensual(userId, minutos);
  if (cupo.bloqueado) throw new CupoDeAudioAgotado(cupo.mensaje ?? "Se agotó tu cupo mensual de audio.");
}

