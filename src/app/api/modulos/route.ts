export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { modulosVisiblesDe } from "@/lib/modulos-acceso";

/** Qué módulos en lanzamiento gradual puede usar la cuenta que pregunta (los usan el menú y las pantallas). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ modulos: await modulosVisiblesDe({ email: session.user.email, role: session.user.role }) });
}
