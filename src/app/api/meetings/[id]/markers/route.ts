export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoRegistrarMarca } from "@/lib/meetings/demo";
import { aMarcador } from "@/lib/meetings/mapeo";
import { MAX_MARCADORES } from "@/lib/meetings/tipos";
import { validarMarca } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/markers { id?, atMs, kind, note? } → { marker }
 *
 * Una marca puesta a mano durante la grabación (nuevo tema, votación, compromiso, nota). El `id` lo pone el
 * dispositivo: reenviar la misma marca (la respuesta se perdió) devuelve la ya guardada en vez de duplicarla.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const valida = validarMarca(await req.json().catch(() => null));
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });
  const marca = valida.valor;

  if (ctx.demo) {
    const r = demoRegistrarMarca(ctx.userId, id, marca);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : 400 });
    return NextResponse.json({ marker: r.valor.marca }, { status: r.valor.creada ? 201 : 200 });
  }

  try {
    await ensureMeetingsSchema();
    if (!(await reunionDelUsuario(id, ctx.userId))) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });

    // El identificador del dispositivo se ata a la reunión: dos reuniones nunca comparten fila.
    const marcaId = marca.id ? `${id}_${marca.id}` : null;
    if (marcaId) {
      const existente = await db.meetingMarker.findFirst({ where: { id: marcaId, meetingId: id } });
      if (existente) return NextResponse.json({ marker: aMarcador(existente) }, { status: 200 });
    }
    if ((await db.meetingMarker.count({ where: { meetingId: id } })) >= MAX_MARCADORES) {
      return NextResponse.json({ error: `Máximo ${MAX_MARCADORES} marcas por reunión.` }, { status: 400 });
    }
    const fila = await db.meetingMarker.create({
      data: { ...(marcaId ? { id: marcaId } : {}), meetingId: id, atMs: marca.atMs, kind: marca.kind, note: marca.note },
    });
    return NextResponse.json({ marker: aMarcador(fila) }, { status: 201 });
  } catch (error) {
    console.error("[api/meetings/[id]/markers POST]", error);
    return NextResponse.json({ error: "No pudimos guardar la marca." }, { status: 500 });
  }
}
