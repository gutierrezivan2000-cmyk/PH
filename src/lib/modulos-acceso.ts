/**
 * Quién puede usar cada módulo en lanzamiento gradual, del lado del servidor (ver `feature-flags.ts`).
 *
 * - `exigirModulo(clave)` es la puerta de las rutas de la API de un administrador: 401 sin sesión y 404 (no 403, para no
 *   revelar que existe) si el módulo no está abierto para esa cuenta.
 * - `moduloAbiertoParaPropietario(clave, userId)` es para las rutas PÚBLICAS del portal de residentes: el módulo está abierto
 *   si lo está para la cuenta del administrador dueño de la copropiedad (el residente no tiene cuenta).
 * - `modulosVisiblesDe(...)` alimenta `/api/modulos`, que usan el menú y las pantallas.
 */
import { NextResponse } from "next/server";
import { isEnvAdmin } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import {
  MODO_DE_MODULO,
  MODULOS_PAUSADOS,
  esDePiloto,
  moduloVisible,
  type ComingSoonKey,
  type UsuarioDeModulo,
} from "@/lib/feature-flags";

const DEMO = () => process.env.DEMO_MODE === "true";

export function usuarioDeModulo(u: { email?: string | null; role?: string | null }): UsuarioDeModulo {
  return { role: u.role ?? null, adminDeEntorno: isEnvAdmin(u.email), enPiloto: esDePiloto(u.email) };
}

export async function exigirModulo(clave: ComingSoonKey): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  // El demo muestra «Próximamente» en estos módulos: no hay nada que servir.
  if (DEMO() || !moduloVisible(clave, usuarioDeModulo({ email: session.user.email, role: session.user.role }))) {
    return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
  }
  return { userId: session.user.id };
}

export async function modulosVisiblesDe(u: { email?: string | null; role?: string | null }): Promise<Record<ComingSoonKey, boolean>> {
  const usuario = usuarioDeModulo(u);
  return Object.fromEntries(MODULOS_PAUSADOS.map((k) => [k, !DEMO() && moduloVisible(k, usuario)])) as Record<ComingSoonKey, boolean>;
}

/** Para las rutas públicas del portal: ¿está abierto el módulo para el administrador dueño de la copropiedad? */
export async function moduloAbiertoParaPropietario(clave: ComingSoonKey, ownerUserId: string): Promise<boolean> {
  if (DEMO()) return false;
  try {
    const { db } = await import("@/lib/db");
    const u = await db.user.findUnique({ where: { id: ownerUserId }, select: { email: true, role: true } });
    return Boolean(u) && moduloVisible(clave, usuarioDeModulo(u!));
  } catch {
    // Ante una falla de la base de datos no se abre nada: mejor «no disponible» que mover dinero sin control.
    return false;
  }
}

/** Módulos que requieren plan Business/Élite (los que pasan por requireCartera). */
const MODULOS_CON_PLAN = ["cartera", "presupuesto", "pqrs"] as const;

/**
 * Lo que la cuenta puede usar AHORA, contando su plan: mientras un módulo está en piloto no se exige plan (es para probar);
 * al abrirlo a todos, cartera, presupuesto y PQRS exigen Business/Élite o un periodo de prueba/beta. Si no se puede comprobar
 * el plan, se cierran esos módulos (los que mueven dinero o datos de residentes no se abren por un fallo).
 */
export async function modulosDeLaCuenta(u: { id: string; email?: string | null; role?: string | null }): Promise<Record<ComingSoonKey, boolean>> {
  const visibles = await modulosVisiblesDe({ email: u.email, role: u.role });
  if (DEMO()) return visibles;
  try {
    const { db } = await import("@/lib/db");
    const { checkSubscriptionAccess } = await import("@/lib/usage");
    const { canUseCartera } = await import("@/lib/cartera");
    const { normalizePlanId } = await import("@/lib/plan");
    const acceso = await checkSubscriptionAccess(u.id);
    const sub = await db.subscription.findUnique({ where: { userId: u.id }, select: { planId: true } });
    const planCubre = acceso.allowed && canUseCartera(acceso.status, normalizePlanId(sub?.planId));
    for (const k of MODULOS_CON_PLAN) if (MODO_DE_MODULO[k] !== "piloto" && !planCubre) visibles[k] = false;
    return visibles;
  } catch (e) {
    console.error("[modulos-acceso] no se pudo comprobar el plan; se cierran los módulos con plan:", e instanceof Error ? e.message : e);
    for (const k of MODULOS_CON_PLAN) if (MODO_DE_MODULO[k] !== "piloto") visibles[k] = false;
    return visibles;
  }
}
