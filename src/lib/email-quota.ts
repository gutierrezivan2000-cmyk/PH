import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { normalizePlanId } from "@/lib/plan";

/**
 * Monthly outbound-email quotas per plan (comunicados).
 *
 * Cost model (Resend): free tier 3.000 emails/mes; paid USD $20/mes → 50.000.
 * Worst-case marginal cost ≈ USD $0.0004/email, so even a Pro user exhausting
 * their quota costs ~USD $0.20/mes against a COP $99.900 plan. The quota's job
 * is to keep AGGREGATE volume predictable, not to protect margin per user.
 */
export const EMAIL_QUOTAS: Record<"pro" | "business" | "elite", number> = {
  pro: 500,
  business: 3000,
  elite: 15000,
};

/** Beta/grandfathered users get the Business quota (bounded — email is an external cost). */
export const BETA_EMAIL_QUOTA = EMAIL_QUOTAS.business;

// Colombia is UTC-5 year-round; quota months roll over at Bogotá midnight.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
function bogotaMonthKey(now: Date = new Date()): string {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quotaKey(userId: string, now: Date = new Date()): string {
  return `emails:${userId}:${bogotaMonthKey(now)}`;
}

export async function getEmailQuota(userId: string, isBeta: boolean): Promise<number> {
  if (isBeta) return BETA_EMAIL_QUOTA;
  try {
    const sub = await db.subscription.findUnique({
      where: { userId },
      select: { planId: true },
    });
    const p = normalizePlanId(sub?.planId);
    if (p === "elite") return EMAIL_QUOTAS.elite;
    if (p === "business") return EMAIL_QUOTAS.business;
    return EMAIL_QUOTAS.pro;
  } catch {
    return EMAIL_QUOTAS.pro;
  }
}

/**
 * Correos ya enviados (o reservados) este mes. Si la lectura falla devuelve un valor
 * enorme: la cuota se trata como agotada (fail CLOSED). Antes devolvía 0 y una caída
 * de la base dejaba enviar sin límite.
 */
export async function getEmailsSentThisMonth(userId: string): Promise<number> {
  try {
    const rec = await db.rateLimit.findUnique({ where: { key: quotaKey(userId) } });
    return rec?.count ?? 0;
  } catch (e) {
    console.error("[email-quota] no se pudo leer el contador; se trata la cuota como agotada:", e);
    return Number.MAX_SAFE_INTEGER;
  }
}

function mensajeDeCuota(count: number, used: number, quota: number): string {
  return `Este envío (${count}) supera tu cuota mensual de correos (${used}/${quota} usados). ${
    quota < EMAIL_QUOTAS.elite
      ? "Sube de plan en Suscripción para ampliar la cuota."
      : "La cuota se reinicia el primer día del mes."
  }`;
}

export async function checkEmailQuota(
  userId: string,
  count: number,
  isBeta: boolean
): Promise<{ allowed: boolean; used: number; quota: number; reason?: string }> {
  const [quota, used] = await Promise.all([
    getEmailQuota(userId, isBeta),
    getEmailsSentThisMonth(userId),
  ]);
  if (used + count > quota) {
    return { allowed: false, used, quota, reason: mensajeDeCuota(count, Math.min(used, quota), quota) };
  }
  return { allowed: true, used, quota };
}

/**
 * Reserva `count` correos del mes de forma ATÓMICA (una sola sentencia): suma al contador
 * solo si el total sigue dentro de la cuota. Dos envíos simultáneos no pueden pasarse de la
 * cuota, porque se serializan sobre la fila. Reservar ANTES de enviar y devolver con
 * `liberarEmails` lo que no se pudo enviar. Si la base falla, deniega (fail closed).
 */
export async function reservarEmails(
  userId: string,
  count: number,
  quota: number
): Promise<{ allowed: boolean; used: number; quota: number; reason?: string; unavailable?: boolean }> {
  if (count <= 0) return { allowed: true, used: 0, quota };
  // El INSERT inicial no pasa por el WHERE del conflicto: se descarta aquí lo que ya excede la cuota.
  if (count > quota) {
    return { allowed: false, used: 0, quota, reason: mensajeDeCuota(count, 0, quota) };
  }
  const key = quotaKey(userId);
  try {
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimit" ("id", "key", "count", "windowStart")
      VALUES (${randomUUID()}, ${key}, ${count}::int, (NOW() AT TIME ZONE 'UTC'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = "RateLimit"."count" + ${count}::int,
        "windowStart" = (NOW() AT TIME ZONE 'UTC')
      WHERE "RateLimit"."count" + ${count}::int <= ${quota}::int
      RETURNING "count"
    `;
    if (rows[0]) return { allowed: true, used: Number(rows[0].count), quota };
    const used = await getEmailsSentThisMonth(userId);
    return { allowed: false, used, quota, reason: mensajeDeCuota(count, Math.min(used, quota), quota) };
  } catch (e) {
    console.error("[email-quota] no se pudo reservar la cuota; se deniega:", e);
    return { allowed: false, used: quota, quota, unavailable: true, reason: "Servicio temporalmente no disponible. Intenta de nuevo en unos segundos." };
  }
}

/** Devuelve a la cuota los correos reservados que al final no se enviaron (mejor esfuerzo). */
export async function liberarEmails(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  try {
    await db.$executeRaw`
      UPDATE "RateLimit"
      SET "count" = GREATEST("count" - ${count}::int, 0)
      WHERE "key" = ${quotaKey(userId)}
    `;
  } catch (e) {
    console.error("[email-quota] no se pudo liberar la reserva:", e);
  }
}

/** Increment the monthly counter after a successful send (best-effort). */
export async function recordEmailsSent(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  const key = quotaKey(userId);
  try {
    await db.rateLimit.upsert({
      where: { key },
      create: { key, count, windowStart: new Date() },
      update: { count: { increment: count }, windowStart: new Date() },
    });
  } catch (e) {
    console.error("[email-quota] record failed:", e);
  }
}
