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
