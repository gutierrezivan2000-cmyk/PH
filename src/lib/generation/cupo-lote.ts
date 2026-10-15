import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";

/**
 * Tope mensual de generaciones del modo Portafolio (Élite).
 *
 * Una sola definición del conteo para que alta y reintento de un lote no se desvíen: antes el reintento no miraba el
 * cupo y bastaba reencolar fallidas para pasarse del tope.
 *
 * Regla (la misma para un intento nuevo y para un reintento):
 *  - Gastan cupo las generaciones del usuario creadas este mes que están completadas, en proceso o pendientes.
 *  - Las FALLIDAS no gastan cupo: lo que no salió no se descuenta.
 *  - Reintentar una fallida la pasa a pendiente, y ahí empieza a contar UNA vez (es la misma fila: no hay doble cobro).
 *  - Como todo intento nuevo, un reintento solo entra si queda cupo.
 */
const ESTADOS_QUE_GASTAN_CUPO = ["completed", "processing", "pending"];

/** Colombia es UTC-5 todo el año (sin horario de verano). */
const DESFASE_BOGOTA_MS = 5 * 60 * 60 * 1000;

/** Primer instante del mes en hora de Bogotá, el mismo criterio de los cupos de usage.ts. */
export function inicioDeMesBogota(ahora: Date = new Date()): Date {
  const local = new Date(ahora.getTime() - DESFASE_BOGOTA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DESFASE_BOGOTA_MS);
}

/** Tope mensual del plan Élite. */
export function topeMensualElite(): number {
  return PLANS.elite.limits.generationsPerMonth;
}

/** Generaciones que ya gastaron el cupo del mes. */
export async function generacionesDelMes(
  userId: string,
  desde: Date = inicioDeMesBogota(),
  cliente: Pick<typeof db, "generation"> = db
): Promise<number> {
  return cliente.generation.count({
    where: { userId, createdAt: { gte: desde }, status: { in: ESTADOS_QUE_GASTAN_CUPO } },
  });
}

/** Cupo mensual que queda (nunca negativo). */
export async function cupoMensualRestante(
  userId: string,
  desde: Date = inicioDeMesBogota(),
  cliente: Pick<typeof db, "generation"> = db
): Promise<number> {
  return Math.max(0, topeMensualElite() - (await generacionesDelMes(userId, desde, cliente)));
}
