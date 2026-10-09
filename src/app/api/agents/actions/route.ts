export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ETIQUETA_DE_ACCION, type TipoDeAccion } from "@/lib/agentes/acciones";
import { decidirAccion } from "@/lib/agentes/acciones-ejecutar";
import { modulosDeLaCuenta } from "@/lib/modulos-acceso";

const DEMO = process.env.DEMO_MODE === "true";

/** Las acciones que los agentes propusieron en un chat (para volver a mostrar las tarjetas al reabrirlo). */
export async function GET(req: NextRequest) {
  if (DEMO) return NextResponse.json({ acciones: [] });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ acciones: [] });
  try {
    const { db } = await import("@/lib/db");
    const { ensureOperacionSchema } = await import("@/lib/ensure-operacion-schema");
    await ensureOperacionSchema();
    const filas = await db.agentAction.findMany({
      where: { userId: session.user.id, chatId },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, type: true, summary: true, status: true, result: true, createdAt: true, propertyId: true },
    });
    const propiedades = await db.property.findMany({ where: { id: { in: filas.map((f) => f.propertyId).filter((x): x is string => !!x) }, userId: session.user.id }, select: { id: true, name: true } });
    const nombre = new Map(propiedades.map((p) => [p.id, p.name]));
    return NextResponse.json({
      acciones: filas.map((f) => ({
        id: f.id, tipo: f.type, etiqueta: ETIQUETA_DE_ACCION[f.type as TipoDeAccion] ?? f.type, resumen: f.summary, estado: f.status,
        mensaje: (f.result as { mensaje?: string; error?: string } | null)?.mensaje ?? (f.result as { error?: string } | null)?.error ?? null,
        propiedad: f.propertyId ? nombre.get(f.propertyId) ?? "" : "", creada: f.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[agents/actions GET]", e);
    return NextResponse.json({ acciones: [] });
  }
}

/** La persona aprueba o rechaza una acción que propuso un agente. Aprobarla la ejecuta (una sola vez). */
export async function POST(req: NextRequest) {
  if (DEMO) return NextResponse.json({ error: "No disponible en el demo." }, { status: 400 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, decision } = body as { id?: string; decision?: string };
  if (!id || (decision !== "aprobar" && decision !== "rechazar")) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  try {
    const visibles = await modulosDeLaCuenta({ id: session.user.id, email: session.user.email, role: session.user.role });
    const r = await decidirAccion(session.user.id, id, decision, visibles);
    return NextResponse.json(r, { status: r.estado === "no_encontrada" ? 404 : r.estado === "ya_decidida" ? 409 : 200 });
  } catch (e) {
    console.error("[agents/actions POST]", e);
    return NextResponse.json({ ok: false, mensaje: "No se pudo completar. Intenta de nuevo." }, { status: 500 });
  }
}
