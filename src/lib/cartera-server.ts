import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canUseCartera } from "@/lib/cartera";
import { MODO_DE_MODULO, type ComingSoonKey } from "@/lib/feature-flags";

/**
 * ¿El plan cubre el módulo? Mientras un módulo esté en piloto (solo admins y testers invitados) no se exige Business/Élite:
 * el piloto sirve justamente para probarlo con cuentas que aún no tienen ese plan. Al abrirlo a todos vuelve a exigirse.
 */
function planCubre(modulo: ComingSoonKey | undefined, accessStatus: string, plan: string | null): boolean {
  if (modulo && MODO_DE_MODULO[modulo] === "piloto") return true;
  return canUseCartera(accessStatus, plan);
}

/**
 * Whether an ARBITRARY user (the property owner) currently has the plan that
 * covers resident-facing modules. Used by the PUBLIC portal routes: without
 * this, a Business admin who downgrades to Pro keeps receiving PQRS and
 * payments that they can no longer see — the resident's request would vanish
 * into a black hole. Fails OPEN on infra errors (never block a resident
 * because our DB hiccuped).
 */
export async function ownerHasCarteraPlan(userId: string, modulo?: ComingSoonKey): Promise<boolean> {
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
    return planCubre(modulo, access.status, normalizePlanId(sub?.planId));
  } catch {
    return true;
  }
}

/**
 * Gate for all cartera endpoints: active session + active access (trial,
 * beta or paid) + Business/Élite plan (Pro sees the upgrade path).
 * Callers handle DEMO_MODE before invoking this.
 */
export async function requireCartera(modulo?: ComingSoonKey): Promise<
  { userId: string; accessStatus: string } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  // Módulo en lanzamiento gradual (ver feature-flags.ts): solo los admins y los testers del piloto lo usan. Las rutas del
  // portal de residentes y de la configuración de pagos no pasan `modulo` porque no son un módulo pausado.
  if (modulo) {
    const { moduloVisible } = await import("@/lib/feature-flags");
    const { usuarioDeModulo } = await import("@/lib/modulos-acceso");
    if (!moduloVisible(modulo, usuarioDeModulo({ email: session.user.email, role: session.user.role }))) {
      return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
    }
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

  if (!planCubre(modulo, access.status, plan)) {
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
