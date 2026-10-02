/**
 * Quién puede entrar a Reuniones, del lado del servidor.
 *
 * Toda ruta de /api/meetings (y las personas de la copropiedad) empieza por
 * `exigirVisible()`: 401 sin sesión y 404 —no 403, para no revelar que existe—
 * si la bandera de piloto (`REUNIONES_PARA`) no deja verla a esta cuenta. Las
 * páginas usan `sesionVeReuniones()` para responder 404 igual.
 *
 * En modo demo la identidad es la del demo y las rutas contestan desde memoria
 * ANTES de tocar `db` (que en demo lanza error a propósito).
 */
import { NextResponse } from "next/server";
import { isEnvAdmin } from "@/lib/admin-auth";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMO_USER } from "@/lib/demo-store";
import { puedeVerReuniones } from "@/lib/feature-flags";

export type ContextoReuniones = { userId: string; demo: boolean };

type Identidad = { userId: string; email: string | null; role: string | null; demo: boolean };

async function identidad(): Promise<Identidad | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const demo = process.env.DEMO_MODE === "true";
  return {
    userId: demo ? DEMO_USER.id : session.user.id,
    email: session.user.email ?? null,
    role: session.user.role ?? null,
    demo,
  };
}

const visible = (i: Identidad) => puedeVerReuniones({ role: i.role, demo: i.demo, adminDeEntorno: isEnvAdmin(i.email) });

/** Puerta de entrada de la API. Devuelve el contexto o la respuesta de error lista para enviar. */
export async function exigirVisible(): Promise<{ ctx: ContextoReuniones } | { error: NextResponse }> {
  const i = await identidad();
  if (!i) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!visible(i)) return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
  return { ctx: { userId: i.userId, demo: i.demo } };
}

/** Para las páginas: ¿ve esta sesión «Reuniones»? */
export async function sesionVeReuniones(): Promise<boolean> {
  const i = await identidad();
  return i ? visible(i) : false;
}

/* ── Pertenencia (solo con base de datos real) ───────────────────────── */

export function propiedadDelUsuario(propertyId: string, userId: string) {
  return db.property.findFirst({ where: { id: propertyId, userId }, select: { id: true, name: true } });
}

export function reunionDelUsuario(id: string, userId: string) {
  return db.meeting.findFirst({
    where: { id, userId },
    select: { id: true, propertyId: true, status: true, title: true, consentAt: true },
  });
}
