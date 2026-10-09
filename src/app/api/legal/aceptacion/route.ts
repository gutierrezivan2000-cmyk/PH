export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { datosDeAceptacion, debeAceptar } from "@/lib/legal/aceptacion";
import { LEGAL_VERSION } from "@/lib/legal/empresa";

const DEMO = process.env.DEMO_MODE === "true";

/** ¿La cuenta ya aceptó la versión vigente de los documentos legales? */
export async function GET() {
  if (DEMO) return NextResponse.json({ version: LEGAL_VERSION, debeAceptar: false });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const u = await db.user.findUnique({ where: { id: session.user.id }, select: { termsVersion: true } });
    return NextResponse.json({ version: LEGAL_VERSION, debeAceptar: debeAceptar(u) });
  } catch (e) {
    console.error("[legal/aceptacion] GET:", e);
    // Ante un fallo no se molesta a la persona con un aviso que no podría guardar.
    return NextResponse.json({ version: LEGAL_VERSION, debeAceptar: false });
  }
}

/** Registra que la persona aceptó la versión vigente (fecha y versión quedan en su cuenta). */
export async function POST() {
  if (DEMO) return NextResponse.json({ ok: true });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    await db.user.update({ where: { id: session.user.id }, data: datosDeAceptacion() });
    return NextResponse.json({ ok: true, version: LEGAL_VERSION });
  } catch (e) {
    console.error("[legal/aceptacion] POST:", e);
    return NextResponse.json({ error: "No pudimos guardar tu aceptación. Intenta de nuevo." }, { status: 500 });
  }
}
