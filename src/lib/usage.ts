import { db } from "@/lib/db";
import { PLANS, TRIAL_LIMITS } from "@/lib/epayco";
import { normalizePlanId, hasActiveAccess, TRIAL_DAYS, type AccessCheck } from "@/lib/plan";

const IS_DEMO = process.env.DEMO_MODE === "true";

// ── Beta grandfathering ──────────────────────────────────────────────────────
// We're in a testing phase: every account that already existed as of the cutoff
// gets UNLIMITED access (no generation/property/file caps, no expiration). Only
// signups AFTER the cutoff go through the trial → paid flow. Zero migration —
// it's decided from User.createdAt. Extend BETA_GRANDFATHER_BEFORE (ISO date)
// to keep grandfathering later testers; set it in the past to end the beta.
const GRANDFATHER_BEFORE = new Date(
  process.env.BETA_GRANDFATHER_BEFORE || "2026-07-15T00:00:00Z"
);

async function isGrandfathered(userId: string): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    return !!user && user.createdAt < GRANDFATHER_BEFORE;
  } catch {
    return false;
  }
}

// Colombia is UTC-5 all year (no DST). Compute daily/monthly quota windows in
// Bogotá local time so the "day" doesn't reset at 7 p.m. for our users.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
function bogotaStartOfDay(now: Date): Date {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnight + BOGOTA_OFFSET_MS);
}
function bogotaStartOfMonth(now: Date): Date {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const first = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return new Date(first + BOGOTA_OFFSET_MS);
}

// A generation only counts against quota if it succeeded or is still genuinely
// in flight. Rows stuck in "processing"/"pending" past this window are treated
// as dead (the serverless function died) and never consume the user's quota.
const STUCK_MS = 15 * 60 * 1000;
function activeGenerationWhere(userId: string, since: Date) {
  return {
    userId,
    createdAt: { gte: since },
    OR: [
      { status: "completed" },
      { status: { in: ["processing", "pending"] }, createdAt: { gte: new Date(Date.now() - STUCK_MS) } },
    ],
  };
}

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

  // Beta testers (existing accounts) get unrestricted access, no trial row.
  if (await isGrandfathered(userId)) return { allowed: true, status: "beta" };

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
  const p = normalizePlanId(planId);
  if (p === "elite") return { ...PLANS.elite.limits };
  if (p === "business") return { ...PLANS.business.limits };
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

  // Beta testers: no generation caps.
  if (access.status === "beta") {
    return { allowed: true, dailyUsed: 0, monthlyUsed: 0 };
  }

  // Reap dead "processing" rows before counting, so a generation whose backend
  // died never permanently consumes quota (especially the trial's TOTAL cap,
  // which — unlike the daily/monthly windows — can't be escaped by waiting).
  await failStuckGenerations(userId);

  const now = new Date();
  const startOfDay = bogotaStartOfDay(now);
  const startOfMonth = bogotaStartOfMonth(now);

  // ── Trial: strict TOTAL caps (not monthly), so a 7-day trial can't be milked.
  if (access.status === "trialing") {
    let trialStart: Date | undefined;
    try {
      const sub = await db.subscription.findUnique({
        where: { userId },
        select: { currentPeriodStart: true },
      });
      trialStart = sub?.currentPeriodStart ?? undefined;
    } catch {
      /* fall through: counts all-time, still bounded by the total cap */
    }

    const [trialDaily, trialTotal] = await Promise.all([
      db.generation.count({ where: activeGenerationWhere(userId, startOfDay) }),
      db.generation.count({
        where: {
          userId,
          ...(trialStart ? { createdAt: { gte: trialStart } } : {}),
          status: { in: ["completed", "processing", "pending"] },
        },
      }),
    ]);

    if (trialTotal >= TRIAL_LIMITS.totalGenerations) {
      return {
        allowed: false,
        reason: `Tu prueba gratis incluye ${TRIAL_LIMITS.totalGenerations} generaciones. Elige un plan en Suscripción para seguir.`,
        dailyUsed: trialDaily,
        monthlyUsed: trialTotal,
      };
    }
    if (trialDaily >= TRIAL_LIMITS.generationsPerDay) {
      return {
        allowed: false,
        reason: `En la prueba gratis puedes generar ${TRIAL_LIMITS.generationsPerDay} documentos por día. Vuelve mañana o elige un plan.`,
        dailyUsed: trialDaily,
        monthlyUsed: trialTotal,
      };
    }
    return { allowed: true, dailyUsed: trialDaily, monthlyUsed: trialTotal };
  }

  // Get user's plan
  let limits: PlanLimits = { ...PLANS.pro.limits };
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    limits = getPlanLimits(sub?.planId);
  } catch {
    // default to pro limits
  }

  const [dailyCount, monthlyCount] = await Promise.all([
    db.generation.count({ where: activeGenerationWhere(userId, startOfDay) }),
    db.generation.count({ where: activeGenerationWhere(userId, startOfMonth) }),
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

/**
 * Watchdog: mark generations stuck in "processing"/"pending" past the dead
 * window as failed, so the UI stops polling forever and the row stops
 * pretending to be in flight. Called from the job-status path.
 */
export async function failStuckGenerations(userId: string): Promise<void> {
  try {
    await db.generation.updateMany({
      where: {
        userId,
        status: { in: ["processing", "pending"] },
        createdAt: { lt: new Date(Date.now() - STUCK_MS) },
      },
      data: {
        status: "failed",
        errorMessage: "La generación excedió el tiempo máximo y se canceló.",
      },
    });
  } catch (e) {
    console.error("[usage] failStuckGenerations:", e);
  }
}

/**
 * Per-generation file caps for the user (trial is stricter than any paid plan).
 * Enforced server-side in the generation route so a trialer can't drive Whisper
 * cost with 20×25 MB of audio.
 */
export async function getGenerationFileLimits(
  userId: string
): Promise<{ maxFiles: number; maxFileSizeMb: number }> {
  try {
    const access = await checkSubscriptionAccess(userId);
    if (access.status === "beta") {
      return { maxFiles: 20, maxFileSizeMb: 25 };
    }
    if (access.status === "trialing") {
      return {
        maxFiles: TRIAL_LIMITS.maxFilesPerGeneration,
        maxFileSizeMb: TRIAL_LIMITS.maxFileSizeMb,
      };
    }
    const sub = await db.subscription.findUnique({ where: { userId } });
    const limits = getPlanLimits(sub?.planId);
    return { maxFiles: limits.maxFilesPerGeneration, maxFileSizeMb: limits.maxFileSizeMb };
  } catch {
    return {
      maxFiles: PLANS.pro.limits.maxFilesPerGeneration,
      maxFileSizeMb: PLANS.pro.limits.maxFileSizeMb,
    };
  }
}

/** Max properties allowed for the user's current plan (trial = Pro level). */
export async function getMaxProperties(userId: string): Promise<number> {
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    const p = normalizePlanId(sub?.planId);
    if (p === "elite") return PLANS.elite.maxProperties;
    if (p === "business") return PLANS.business.maxProperties;
    return PLANS.pro.maxProperties;
  } catch {
    return PLANS.pro.maxProperties;
  }
}

/** Whether the user can create another property under their plan's cap. */
export async function checkPropertyLimit(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  limit: number;
  current: number;
}> {
  // Beta testers: unlimited properties.
  const access = await checkSubscriptionAccess(userId);
  if (access.status === "beta") return { allowed: true, limit: 999, current: 0 };

  const limit = await getMaxProperties(userId);
  // Elite is effectively unlimited — don't even count.
  if (limit >= 999) return { allowed: true, limit, current: 0 };

  let current = 0;
  try {
    current = await db.property.count({ where: { userId } });
  } catch {
    // If we can't count, don't block creation on an infra blip.
    return { allowed: true, limit, current: 0 };
  }
  if (current >= limit) {
    return {
      allowed: false,
      reason: `Tu plan permite hasta ${limit} propiedades. Sube de plan en Suscripción para agregar más.`,
      limit,
      current,
    };
  }
  return { allowed: true, limit, current };
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
  const startOfMonth = bogotaStartOfMonth(now);
  const startOfDay = bogotaStartOfDay(now);

  let limits: PlanLimits = { ...PLANS.pro.limits };
  let planStatus = "none";
  let planName: "pro" | "business" | "elite" | null = null;
  let trialEndsAt: string | null = null;
  const grandfathered = await isGrandfathered(userId);
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    limits = getPlanLimits(sub?.planId);
    planName = normalizePlanId(sub?.planId);
    if (grandfathered) {
      planStatus = "beta";
    } else {
      const access = hasActiveAccess(sub);
      planStatus = access.status;
      trialEndsAt = access.trialEndsAt ? access.trialEndsAt.toISOString() : null;
    }
  } catch {
    if (grandfathered) planStatus = "beta";
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
