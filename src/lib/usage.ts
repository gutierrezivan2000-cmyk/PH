import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";

type PlanLimits = {
  generationsPerDay: number;
  generationsPerMonth: number;
  maxFileSizeMb: number;
  maxFilesPerGeneration: number;
  maxAudioMinutes: number;
};

function getPlanLimits(planId?: string | null): PlanLimits {
  if (planId === "plan-elite-ph") return { ...PLANS.elite.limits };
  return { ...PLANS.pro.limits };
}

export async function checkUsageLimits(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  dailyUsed: number;
  monthlyUsed: number;
}> {
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
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    limits = getPlanLimits(sub?.planId);
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
  };
}
