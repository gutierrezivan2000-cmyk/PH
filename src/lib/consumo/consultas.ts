/**
 * Lo que el panel de consumo lee de la base de datos (servidor). El cálculo está en `reporte.ts` (puro).
 */
import { db } from "@/lib/db";
import { normalizePlanId } from "@/lib/plan";
import { codigoDeUsuario } from "@/lib/admin/identidad";
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

/** Quién es cada cuenta del informe: código, nombre, correo, empresa y plan (ver lib/admin/identidad.ts). */
export type PersonaDeConsumo = { codigo: string; nombre: string; email: string; empresa: string; plan: string };

export async function personas(userIds: readonly string[]): Promise<Map<string, PersonaDeConsumo>> {
  if (userIds.length === 0) return new Map();
  const [usuarios, suscripciones] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, email: true, company: true } }),
    db.subscription.findMany({ where: { userId: { in: [...userIds] } }, select: { userId: true, planId: true, status: true } }),
  ]);
  const quien = new Map(usuarios.map((u) => [u.id, u]));
  const planes = new Map(suscripciones.map((s) => [s.userId, `${normalizePlanId(s.planId) ?? s.planId ?? "sin plan"}${s.status && s.status !== "active" ? ` (${s.status})` : ""}`]));
  return new Map(
    userIds.map((id) => {
      const u = quien.get(id);
      return [id, { codigo: codigoDeUsuario(id), nombre: u?.name ?? "", email: u?.email ?? "", empresa: u?.company ?? "", plan: planes.get(id) ?? "sin plan" }];
    }),
  );
}
