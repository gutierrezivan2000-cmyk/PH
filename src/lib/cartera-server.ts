import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canUseCartera } from "@/lib/cartera";

/**
 * Whether an ARBITRARY user (the property owner) currently has the plan that
 * covers resident-facing modules. Used by the PUBLIC portal routes: without
 * this, a Business admin who downgrades to Pro keeps receiving PQRS and
 * payments that they can no longer see — the resident's request would vanish
 * into a black hole. Fails OPEN on infra errors (never block a resident
 * because our DB hiccuped).
 */
export async function ownerHasCarteraPlan(userId: string): Promise<boolean> {
  try {
    const { checkSubscriptionAccess } = await import("@/lib/usage");
    const { db } = await import("@/lib/db");
    const { normalizePlanId } = await import("@/lib/plan");
    const access = await checkSubscriptionAccess(userId);
    if (!access.allowed) return false;
    const sub = await db.subscription.findUnique({
      where: { userId },
      select: { planId: true },
    });
    return canUseCartera(access.status, normalizePlanId(sub?.planId));
  } catch {
    return true;
  }
}

/**
 * Gate for all cartera endpoints: active session + active access (trial,
 * beta or paid) + Business/Élite plan (Pro sees the upgrade path).
 * Callers handle DEMO_MODE before invoking this.
 */
export async function requireCartera(): Promise<
  { userId: string; accessStatus: string } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  const { checkSubscriptionAccess } = await import("@/lib/usage");
  const access = await checkSubscriptionAccess(session.user.id);
  if (!access.allowed) {
    return {
      error: NextResponse.json(
        { error: access.reason || "Necesitas una suscripción activa." },
        { status: 403 }
      ),
    };
  }

  let plan: string | null = null;
  try {
    const { db } = await import("@/lib/db");
    const { normalizePlanId } = await import("@/lib/plan");
    const sub = await db.subscription.findUnique({
      where: { userId: session.user.id },
      select: { planId: true },
    });
    plan = normalizePlanId(sub?.planId);
  } catch {
    // plan stays null → gate decides from access status alone
  }

  if (!canUseCartera(access.status, plan)) {
    return {
      error: NextResponse.json(
        {
          error:
            "La gestión de cartera está disponible en los planes Business y Élite. Sube de plan en Suscripción para activarla.",
          code: "plan_upgrade",
        },
        { status: 403 }
      ),
    };
  }

  const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
  await ensureAdminSchema();

  return { userId: session.user.id, accessStatus: access.status };
}
