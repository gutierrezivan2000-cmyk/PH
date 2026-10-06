export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoQuitarFuente } from "@/lib/meetings/demo";
import { puedeAgregarFuentes } from "@/lib/meetings/tipos";

type Contexto = { params: Promise<{ id: string; sourceId: string }> };

/**
 * DELETE /api/meetings/[id]/sources/[sourceId]: quita un archivo subido por error (borra el original y
 * renumera el orden). Solo antes de procesar. Si el original no se puede borrar, se conserva la fila
 * para reintentar: dejar la grabación guardada después de «quitarla» sería lo peor.
 */
export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id, sourceId } = await params;

  if (ctx.demo) {
    const r = demoQuitarFuente(ctx.userId, id, sourceId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "cerrada" ? 409 : 404 });
    return NextResponse.json({ ok: true });
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    if (!puedeAgregarFuentes(reunion.status)) {
      return NextResponse.json({ error: "Esta reunión ya no admite cambios en sus archivos: se está procesando o ya está lista." }, { status: 409 });
    }
    const fuente = await db.meetingSource.findFirst({ where: { id: sourceId, meetingId: id } });
    if (!fuente) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });

    if (fuente.url) {
      try {
        const { del } = await import("@vercel/blob");
        await del(fuente.url);
      } catch (error) {
        console.error("[api/meetings/[id]/sources DELETE blob]", error);
        return NextResponse.json({ error: "No pudimos borrar el archivo del almacenamiento. Inténtalo de nuevo en unos minutos." }, { status: 502 });
      }
    }

    const restantes = await db.meetingSource.findMany({
      where: { meetingId: id, NOT: { id: sourceId } },
      orderBy: [{ idx: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await db.$transaction([
      db.meetingSource.delete({ where: { id: sourceId } }),
      ...restantes.map((f, n) => db.meetingSource.update({ where: { id: f.id }, data: { idx: n } })),
      ...(restantes.length === 0
        ? [db.meeting.updateMany({ where: { id, status: "subiendo" }, data: { status: "borrador" } })]
        : []),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/meetings/[id]/sources DELETE]", error);
    return NextResponse.json({ error: "No pudimos quitar el archivo." }, { status: 500 });
  }
}
