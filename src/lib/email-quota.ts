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

export async function getEmailsSentThisMonth(userId: string): Promise<number> {
  try {
    const rec = await db.rateLimit.findUnique({ where: { key: quotaKey(userId) } });
    return rec?.count ?? 0;
  } catch {
    return 0;
  }
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
    return {
      allowed: false,
      used,
      quota,
      reason: `Este envío (${count}) supera tu cuota mensual de correos (${used}/${quota} usados). ${
        quota < EMAIL_QUOTAS.elite
          ? "Sube de plan en Suscripción para ampliar la cuota."
          : "La cuota se reinicia el primer día del mes."
      }`,
    };
  }
  return { allowed: true, used, quota };
}

/** Increment the monthly counter after a successful send (best-effort). */
export async function recordEmailsSent(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  const key = quotaKey(userId);
  try {
    await db.rateLimit.upsert({
      where: { key },
      create: { key, count, windowStart: new Date() },
      update: { count: { increment: count } },
    });
  } catch (e) {
    console.error("[email-quota] record failed:", e);
  }
}
