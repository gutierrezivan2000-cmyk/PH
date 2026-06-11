import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";
import { normalizePlanId, hasActiveAccess, TRIAL_DAYS, type AccessCheck } from "@/lib/plan";

const IS_DEMO = process.env.DEMO_MODE === "true";

/**
 * Central access gate: does this user have an active plan or a live trial?
 *
 * Lazy trial creation: a user with NO Subscription row gets a fresh
 * "trialing" subscription for TRIAL_DAYS starting now. This both implements
 * the advertised 7-day trial for new signups and soft-migrates existing
 * users (who previously had unlimited free Pro access) instead of hard-
 * locking them out.
 */
export async function checkSubscriptionAccess(userId: string): Promise<AccessCheck> {
  if (IS_DEMO) return { allowed: true, status: "active" };

  try {
    let sub = await db.subscription.findUnique({ where: { userId } });
    if (!sub) {
      const now = new Date();
      const ends = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      sub = await db.subscription.create({
        data: {
          userId,
          status: "trialing",
          planId: "pro",
          currentPeriodStart: now,
          currentPeriodEnd: ends,
        },
      });
    }
    return hasActiveAccess(sub);
  } catch (e) {
    // Fail-open on infrastructure errors so a DB blip doesn't lock everyone
    // out; usage limits below still apply.
    console.error("[usage] checkSubscriptionAccess failed:", e);
    return { allowed: true, status: "unknown" };
  }
}

type PlanLimits = {
  generationsPerDay: number;
  generationsPerMonth: number;
  maxFileSizeMb: number;
  maxFilesPerGeneration: number;
  maxAudioMinutes: number;
};

function getPlanLimits(planId?: string | null): PlanLimits {
  if (normalizePlanId(planId) === "elite") return { ...PLANS.elite.limits };
  return { ...PLANS.pro.limits };
}

export async function checkUsageLimits(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  dailyUsed: number;
  monthlyUsed: number;
}> {
  // Gate on subscription/trial status first — without an active plan or a
  // live trial, no generations at all.
  const access = await checkSubscriptionAccess(userId);
  if (!access.allowed) {
    return { allowed: false, reason: access.reason, dailyUsed: 0, monthlyUsed: 0 };
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get user's plan
  let limits: PlanLimits = { ...PLANS.pro.limits };
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    limits = getPlanLimits(sub?.planId);
  } catch {
    // default to pro limits
  }

  const [dailyCount, monthlyCount] = await Promise.all([
    db.generation.count({
      where: {
        userId,
        createdAt: { gte: startOfDay },
        status: { in: ["completed", "processing", "pending"] },
      },
    }),
    db.generation.count({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
        status: { in: ["completed", "processing", "pending"] },
      },
    }),
  ]);

  if (dailyCount >= limits.generationsPerDay) {
    return {
      allowed: false,
      reason: `Has alcanzado el l\u00edmite diario de ${limits.generationsPerDay} generaciones.`,
      dailyUsed: dailyCount,
      monthlyUsed: monthlyCount,
    };
  }

  if (monthlyCount >= limits.generationsPerMonth) {
    return {
      allowed: false,
      reason: `Has alcanzado el l\u00edmite mensual de ${limits.generationsPerMonth} generaciones.`,
      dailyUsed: dailyCount,
      monthlyUsed: monthlyCount,
    };
  }

  return { allowed: true, dailyUsed: dailyCount, monthlyUsed: monthlyCount };
}

export async function recordUsage(
  userId: string,
  tokens: number,
  costUsd: number,
  type: string
) {
  await db.usageRecord.create({
    data: { userId, tokens, costUsd, type },
  });
}

export async function getUsageSummary(userId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let limits: PlanLimits = { ...PLANS.pro.limits };
  let planStatus = "none";
  let planName: "pro" | "elite" | null = null;
  let trialEndsAt: string | null = null;
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    limits = getPlanLimits(sub?.planId);
    planName = normalizePlanId(sub?.planId);
    const access = hasActiveAccess(sub);
    planStatus = access.status;
    trialEndsAt = access.trialEndsAt ? access.trialEndsAt.toISOString() : null;
  } catch {
    // default
  }

  const [monthlyGenerations, dailyGenerations, monthlyTokens] = await Promise.all([
    db.generation.count({
      where: { userId, createdAt: { gte: startOfMonth }, status: "completed" },
    }),
    db.generation.count({
      where: { userId, createdAt: { gte: startOfDay }, status: "completed" },
    }),
    db.usageRecord.aggregate({
      where: { userId, date: { gte: startOfMonth } },
      _sum: { tokens: true, costUsd: true },
    }),
  ]);

  return {
    monthlyGenerations,
    dailyGenerations,
    monthlyTokens: monthlyTokens._sum.tokens ?? 0,
    monthlyCost: monthlyTokens._sum.costUsd ?? 0,
    limits,
    planStatus,
    planName,
    trialEndsAt,
  };
}
