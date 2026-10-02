export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoProcesar } from "@/lib/meetings/demo";
import { iniciarProcesamiento } from "@/lib/meetings/proceso";
import { estaEnMarcha, puedeAgregarFuentes } from "@/lib/meetings/tipos";

type Contexto = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/process → { status: "en_cola" }
 *
 * Cierra la captura y manda la reunión a procesar. Idempotente: si ya está en cola, procesándose o lista,
 * devuelve su estado sin tocar nada (el cliente puede reintentar sin miedo a duplicar el trabajo).
 */
export async function POST(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const r = demoProcesar(ctx.userId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : r.codigo === "cerrada" || r.codigo === "pendiente" ? 409 : 400 });
    return NextResponse.json(r.valor);
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    if (estaEnMarcha(reunion.status) || reunion.status === "lista") return NextResponse.json({ status: reunion.status });
    if (!puedeAgregarFuentes(reunion.status)) {
      return NextResponse.json({ error: "Esta reunión no se puede procesar en su estado actual." }, { status: 409 });
    }

    const fuentes = await db.meetingSource.findMany({ where: { meetingId: id }, select: { status: true } });
    if (fuentes.length === 0) {
      return NextResponse.json({ error: "Sube al menos un archivo antes de procesar la reunión." }, { status: 400 });
    }
    if (fuentes.some((f) => f.status !== "recibida")) {
      return NextResponse.json({ error: "Algún archivo todavía se está preparando. Espera un momento." }, { status: 409 });
    }

    await iniciarProcesamiento(id);
    return NextResponse.json({ status: "en_cola" });
  } catch (error) {
    console.error("[api/meetings/[id]/process]", error);
    return NextResponse.json({ error: "No pudimos enviar la reunión a procesar. Inténtalo de nuevo." }, { status: 500 });
  }
}
