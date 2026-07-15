import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePlanId } from "@/lib/plan";

const IS_DEMO = process.env.DEMO_MODE === "true";

export interface EliteSession {
  userId: string;
  email: string;
  name: string | null;
  /** Canonical plan, or "beta"/"demo" for grandfathered/demo access. */
  plan: "elite" | "beta" | "demo";
}

/**
 * Resolves the current session and returns it if the user may use the
 * enterprise "Portafolio" section. Access is granted to:
 *  - Elite-plan subscribers (normalizePlanId(planId) === "elite"),
 *  - beta/grandfathered testers (checkSubscriptionAccess → "beta"),
 *  - demo mode.
 * Returns null otherwise. Use in server components (via EmpresaGate) and API
 * routes.
 */
export async function requireElite(): Promise<EliteSession | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  if (IS_DEMO) {
    return { userId: session.user.id, email: session.user.email, name: session.user.name ?? null, plan: "demo" };
  }

  // Self-heal schema drift (subscription columns) before reading.
  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
  } catch { /* best effort */ }

  // Beta/grandfathered testers get access during the testing phase.
  const { checkSubscriptionAccess } = await import("@/lib/usage");
  const access = await checkSubscriptionAccess(session.user.id);
  if (access.status === "beta") {
    return { userId: session.user.id, email: session.user.email, name: session.user.name ?? null, plan: "beta" };
  }

  // Real Elite subscribers.
  const sub = await db.subscription.findUnique({
    where: { userId: session.user.id },
    select: { planId: true },
  });
  if (normalizePlanId(sub?.planId) === "elite") {
    return { userId: session.user.id, email: session.user.email, name: session.user.name ?? null, plan: "elite" };
  }

  return null;
}
