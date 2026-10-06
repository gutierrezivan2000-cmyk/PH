export const runtime = "nodejs";

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { rutaDeFuente, sufijoAleatorio } from "@/lib/meetings/almacen";
import { demoPrepararSubida } from "@/lib/meetings/demo";
import { MAX_FUENTE_BYTES, MAX_FUENTES_POR_REUNION, PARTE_SUBIDA_BYTES, puedeAgregarFuentes } from "@/lib/meetings/tipos";
import { validarPedidoToken } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Un día: una grabación de varios GB por una conexión lenta puede tardar horas, y
 * al reanudar al día siguiente se pide un token nuevo para la misma ruta.
 */
const VALIDEZ_TOKEN_MS = 24 * 60 * 60 * 1000;

const ERROR_DE_ESTADO: Record<string, { status: number; error: string }> = {
  no_existe: { status: 404, error: "Reunión no encontrada" },
  cerrada: { status: 409, error: "Esta reunión ya no admite más archivos: se está procesando o ya está lista." },
  tope: { status: 400, error: `Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.` },
};

/**
 * POST /api/meetings/[id]/upload-token { nombre, tamano, tipo, pathname? }
 *  → { token, pathname, contentType, partSize }
 *
 * El archivo NO pasa por el servidor (una función de Vercel admite 4,5 MB de cuerpo): el navegador lo
 * sube directo a Blob, por partes, con este token. El token solo vale para UNA ruta de esta reunión,
 * para el tipo de archivo declarado y por un día. Al reanudar, el cliente manda la ruta que ya tenía
 * (se acepta solo con la forma exacta que genera `rutaDeFuente`).
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const valida = validarPedidoToken(await req.json().catch(() => null), id);
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });
  const { nombre, tipo } = valida.valor;
  const pathname = valida.valor.pathname ?? rutaDeFuente(id, nombre, sufijoAleatorio());

  if (ctx.demo) {
    const r = demoPrepararSubida(ctx.userId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: ERROR_DE_ESTADO[r.codigo]?.status ?? 400 });
    return NextResponse.json({ demo: true, token: "demo", pathname, contentType: tipo, partSize: PARTE_SUBIDA_BYTES });
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: ERROR_DE_ESTADO.no_existe.error }, { status: ERROR_DE_ESTADO.no_existe.status });
    if (!puedeAgregarFuentes(reunion.status)) {
      return NextResponse.json({ error: ERROR_DE_ESTADO.cerrada.error }, { status: ERROR_DE_ESTADO.cerrada.status });
    }
    if ((await db.meetingSource.count({ where: { meetingId: id } })) >= MAX_FUENTES_POR_REUNION) {
      return NextResponse.json({ error: ERROR_DE_ESTADO.tope.error }, { status: ERROR_DE_ESTADO.tope.status });
    }

    const token = await generateClientTokenFromReadWriteToken({
      pathname,
      allowedContentTypes: [tipo],
      // El tamaño exacto no se fija: el tope del producto es MAX_FUENTE_BYTES por archivo (y un archivo que
      // cambia de tamaño entre el pedido y la subida no debe fallar al final de varias horas).
      maximumSizeInBytes: MAX_FUENTE_BYTES,
      validUntil: Date.now() + VALIDEZ_TOKEN_MS,
      addRandomSuffix: false,
      // Completar de nuevo la misma subida (tras un corte justo al terminar) no debe fallar por «ya existe».
      allowOverwrite: true,
    });

    // «Subiendo» desde el primer token: si la persona abandona a medias, la reunión lo dice con verdad.
    await db.meeting.updateMany({
      where: { id, userId: ctx.userId, status: { in: ["borrador", "error"] } },
      data: { status: "subiendo", errorMessage: null },
    });
    return NextResponse.json({ token, pathname, contentType: tipo, partSize: PARTE_SUBIDA_BYTES });
  } catch (error) {
    console.error("[api/meetings/[id]/upload-token]", error);
    return NextResponse.json({ error: "No pudimos preparar la subida. Inténtalo de nuevo." }, { status: 500 });
  }
}
