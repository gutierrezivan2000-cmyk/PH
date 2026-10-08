/**
 * Lo que el panel de consumo lee de la base de datos (servidor). El cálculo está en `reporte.ts` (puro).
 */
import { db } from "@/lib/db";
import { normalizePlanId } from "@/lib/plan";
import { asegurarColumnasDeConsumo } from "./registrar";
import type { Periodo, RegistroDeConsumo } from "./reporte";

/** Tope de registros que se leen de una vez: con más, el informe lo dice (`truncado`) y conviene acortar el periodo. */
export const TOPE_DE_REGISTROS = 200_000;

export async function registrosDelPeriodo(periodo: Periodo): Promise<{ registros: RegistroDeConsumo[]; truncado: boolean }> {
  await asegurarColumnasDeConsumo();
  const filas = await db.usageRecord.findMany({
    where: { date: { gte: periodo.desde, lt: periodo.hasta } },
    orderBy: { date: "asc" },
    take: TOPE_DE_REGISTROS + 1,
    select: {
      userId: true, type: true, date: true, costUsd: true, tokens: true, provider: true, model: true, inputTokens: true, outputTokens: true,
      cacheReadTokens: true, cacheWriteTokens: true, audioSeconds: true, refType: true, refId: true,
    },
  });
  return { registros: filas.slice(0, TOPE_DE_REGISTROS), truncado: filas.length > TOPE_DE_REGISTROS };
}

export type PersonaDeConsumo = { email: string; nombre: string; plan: string };

/** Correo, nombre y plan de cada cuenta (para leer el informe y para el CSV). */
export async function personas(userIds: readonly string[]): Promise<Map<string, PersonaDeConsumo>> {
  if (userIds.length === 0) return new Map();
  const [usuarios, suscripciones] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, email: true, name: true } }),
    db.subscription.findMany({ where: { userId: { in: [...userIds] } }, select: { userId: true, planId: true, status: true } }),
  ]);
  const planes = new Map(suscripciones.map((s) => [s.userId, `${normalizePlanId(s.planId) ?? s.planId ?? "sin plan"}${s.status && s.status !== "active" ? ` (${s.status})` : ""}`]));
  return new Map(usuarios.map((u) => [u.id, { email: u.email ?? "", nombre: u.name ?? "", plan: planes.get(u.id) ?? "sin plan" }]));
}
