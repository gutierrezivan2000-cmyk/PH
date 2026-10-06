export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoRegistrarFuente } from "@/lib/meetings/demo";
import { aFuente } from "@/lib/meetings/mapeo";
import { MAX_FUENTES_POR_REUNION, puedeAgregarFuentes } from "@/lib/meetings/tipos";
import { validarRegistroFuente } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ id: string }> };

const CERRADA = "Esta reunión ya no admite más archivos: se está procesando o ya está lista.";

/**
 * POST /api/meetings/[id]/sources { url, pathname, nombre, tamano, tipo } → { source }
 *
 * El cliente avisa que un archivo terminó de subir. Se comprueba que la ruta es de esta reunión, que la
 * URL es de Blob y corresponde a esa ruta, y que el archivo EXISTE de verdad con el tamaño que se dijo
 * (el tamaño que cuenta es el del almacenamiento, no el del cliente). Es idempotente por ruta: si la
 * respuesta se perdió y el cliente reintenta, devuelve el mismo archivo (200) en vez de duplicarlo.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const valida = validarRegistroFuente(await req.json().catch(() => null), id);
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });
  const { url, pathname, nombre, tamano, tipo } = valida.valor;

  if (ctx.demo) {
    const r = demoRegistrarFuente(ctx.userId, id, { nombre, tamano, tipo, pathname });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : r.codigo === "cerrada" ? 409 : 400 });
    return NextResponse.json({ source: r.valor.fuente }, { status: r.valor.creada ? 201 : 200 });
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });

    const existente = await db.meetingSource.findFirst({ where: { meetingId: id, pathname } });
    if (existente) return NextResponse.json({ source: aFuente(existente) }, { status: 200 });

    if (!puedeAgregarFuentes(reunion.status)) return NextResponse.json({ error: CERRADA }, { status: 409 });
    if ((await db.meetingSource.count({ where: { meetingId: id } })) >= MAX_FUENTES_POR_REUNION) {
      return NextResponse.json({ error: `Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.` }, { status: 400 });
    }

    const { head } = await import("@vercel/blob");
    let almacenado: { size: number };
    try {
      almacenado = await head(url);
    } catch {
      return NextResponse.json({ error: "No encontramos el archivo en el almacenamiento. Vuelve a subirlo." }, { status: 400 });
    }
    if (almacenado.size !== tamano) {
      return NextResponse.json({ error: "El archivo no llegó completo. Vuelve a subirlo." }, { status: 409 });
    }

    const ultimo = await db.meetingSource.aggregate({ where: { meetingId: id }, _max: { idx: true } });
    const fila = await db.meetingSource.create({
      data: {
        meetingId: id,
        idx: (ultimo._max.idx ?? -1) + 1,
        kind: "archivo",
        name: nombre,
        url,
        pathname,
        mimeType: tipo,
        sizeBytes: almacenado.size,
        status: "recibida",
      },
    });
    await db.meeting.updateMany({
      where: { id, userId: ctx.userId, status: { in: ["borrador", "error"] } },
      data: { status: "subiendo", errorMessage: null },
    });
    return NextResponse.json({ source: aFuente(fila) }, { status: 201 });
  } catch (error) {
    console.error("[api/meetings/[id]/sources POST]", error);
    return NextResponse.json({ error: "No pudimos registrar el archivo. Inténtalo de nuevo." }, { status: 500 });
  }
}
