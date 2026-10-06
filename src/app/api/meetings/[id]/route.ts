export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { borrarArchivosDeReunion } from "@/lib/meetings/almacen";
import { INCLUIR_DETALLE, SELECCION_RESUMEN } from "@/lib/meetings/consultas";
import { demoActualizarReunion, demoEliminarReunion, demoReunion } from "@/lib/meetings/demo";
import { aDetalle, aResumen } from "@/lib/meetings/mapeo";
import { validarCambiosReunion } from "@/lib/meetings/validar";
import { resumenVivo } from "@/lib/meetings/vivo";

type Contexto = { params: Promise<{ id: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });

/** GET /api/meetings/[id] → ReunionDetalle { meeting, sources, speakers, markers, digest, silences, live }. */
export async function GET(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const detalle = demoReunion(ctx.userId, id);
    return detalle ? NextResponse.json(detalle) : NO_ENCONTRADA();
  }

  try {
    await ensureMeetingsSchema();
    const fila = await db.meeting.findFirst({ where: { id, userId: ctx.userId }, include: INCLUIR_DETALLE });
    if (!fila) return NO_ENCONTRADA();
    // Mientras graba, la página muestra cuánto audio ya llegó al servidor.
    const vivo = fila.status === "grabando" ? await resumenVivo(id) : null;
    return NextResponse.json(aDetalle(fila, undefined, vivo));
  } catch (error) {
    console.error("[api/meetings/[id] GET]", error);
    return NextResponse.json({ error: "No pudimos cargar la reunión." }, { status: 500 });
  }
}

/** PATCH /api/meetings/[id] { title?, type?, date?, consentAt? } → { meeting }. Nunca cambia el estado. */
export async function PATCH(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const valida = validarCambiosReunion(await req.json().catch(() => null));
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });

  if (ctx.demo) {
    const r = demoActualizarReunion(ctx.userId, id, valida.valor);
    return r ? NextResponse.json({ meeting: r }) : NO_ENCONTRADA();
  }

  try {
    await ensureMeetingsSchema();
    if (!(await reunionDelUsuario(id, ctx.userId))) return NO_ENCONTRADA();
    // Solo las columnas validadas: el cuerpo nunca llega entero a la base de datos.
    const fila = await db.meeting.update({ where: { id }, data: valida.valor, select: SELECCION_RESUMEN });
    return NextResponse.json({ meeting: aResumen(fila) });
  } catch (error) {
    console.error("[api/meetings/[id] PATCH]", error);
    return NextResponse.json({ error: "No pudimos guardar los cambios." }, { status: 500 });
  }
}

/**
 * DELETE /api/meetings/[id]: borra primero los archivos (audio, originales, transcripción) y
 * después las filas. Si los archivos no se pueden borrar, la reunión se conserva para reintentar:
 * eliminarla dejando la grabación guardada sería lo peor. Las actas ya redactadas no se borran;
 * solo pierden el vínculo con la reunión.
 */
export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) return demoEliminarReunion(ctx.userId, id) ? NextResponse.json({ ok: true }) : NO_ENCONTRADA();

  try {
    await ensureMeetingsSchema();
    if (!(await reunionDelUsuario(id, ctx.userId))) return NO_ENCONTRADA();
  } catch (error) {
    console.error("[api/meetings/[id] DELETE lookup]", error);
    return NextResponse.json({ error: "No pudimos eliminar la reunión." }, { status: 500 });
  }

  try {
    await borrarArchivosDeReunion(id);
  } catch (error) {
    console.error("[api/meetings/[id] DELETE blobs]", error);
    return NextResponse.json(
      { error: "No pudimos borrar los archivos de la grabación. La reunión sigue guardada: intenta de nuevo en unos minutos." },
      { status: 502 },
    );
  }

  try {
    await db.$transaction([
      db.generation.updateMany({ where: { meetingId: id }, data: { meetingId: null } }),
      db.meeting.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/meetings/[id] DELETE rows]", error);
    return NextResponse.json({ error: "No pudimos eliminar la reunión." }, { status: 500 });
  }
}
