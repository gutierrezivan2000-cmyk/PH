/** Validación pura de «dar acceso»: qué plan y por cuántos días (el panel opera por código, ver anonimo.ts). */
export const PLANES_DE_ACCESO = ["pro", "business", "elite"] as const;
export type PlanDeAcceso = (typeof PLANES_DE_ACCESO)[number];
export const DIAS_MAXIMOS_DE_ACCESO = 365;

export type AccesoPedido = { planId: PlanDeAcceso; dias: number };

export function validarAcceso(entrada: unknown): { ok: true; acceso: AccesoPedido } | { ok: false; error: string } {
  const o = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const planId = o.planId;
  if (typeof planId !== "string" || !(PLANES_DE_ACCESO as readonly string[]).includes(planId)) {
    return { ok: false, error: `Plan inválido. Usa ${PLANES_DE_ACCESO.join(", ")}.` };
  }
  const dias = Number(o.dias);
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS_DE_ACCESO) {
    return { ok: false, error: `Los días deben ser un número entero entre 1 y ${DIAS_MAXIMOS_DE_ACCESO}.` };
  }
  return { ok: true, acceso: { planId: planId as PlanDeAcceso, dias } };
}

export function finDeAcceso(desde: Date, dias: number): Date {
  return new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000);
}
