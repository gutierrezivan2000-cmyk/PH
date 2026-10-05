export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible } from "@/lib/meetings/acceso";
import { ErrorAlmacen } from "@/lib/meetings/almacen";
import { almacenBlob } from "@/lib/meetings/almacen-blob";
import { bytesDeAudioDemo, flujoDeAudioDemo } from "@/lib/meetings/audio-demo";
import { encabezadosDeAudio, leerRango } from "@/lib/meetings/audio-http";
import { demoReunion } from "@/lib/meetings/demo";

type Contexto = { params: Promise<{ id: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
const SIN_AUDIO = () => NextResponse.json({ error: "Esta reunión no tiene audio disponible." }, { status: 404 });

/**
 * GET /api/meetings/[id]/audio → el `audio.mp3` de la reunión, con `Range`.
 *
 * El reproductor pide trozos (`Range: bytes=a-b`) y la ruta responde 206 con `Content-Range`, `Accept-Ranges` y
 * `Content-Length` exactos (Safari los exige). Una respuesta no pasa de 4 MiB aunque pidan «hasta el final»: el navegador
 * pide el siguiente trozo cuando lo necesita. El audio vive en un Blob privado: nunca se entrega su URL, se entrega el
 * contenido, y solo a la persona dueña de la reunión.
 */
async function responder(req: NextRequest, { params }: Contexto, conCuerpo: boolean): Promise<Response> {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const d = demoReunion(ctx.userId, id);
    if (!d) return NO_ENCONTRADA();
    if (!d.meeting.hasAudio || !d.meeting.durationMs) return SIN_AUDIO();
    const duracionMs = d.meeting.durationMs;
    const total = bytesDeAudioDemo(duracionMs);
    const e = encabezadosDeAudio(leerRango(req.headers.get("range"), total), total);
    if (!conCuerpo || !e.cuerpo) return new Response(null, { status: e.status, headers: e.headers });
    return new Response(flujoDeAudioDemo(duracionMs, e.cuerpo.desde, e.cuerpo.hasta), { status: e.status, headers: e.headers });
  }

  try {
    await ensureMeetingsSchema();
    const m = await db.meeting.findFirst({ where: { id, userId: ctx.userId }, select: { audioUrl: true } });
    if (!m) return NO_ENCONTRADA();
    if (!m.audioUrl) return SIN_AUDIO();

    const almacen = almacenBlob();
    const total = await almacen.tamano(m.audioUrl);
    const rango = leerRango(req.headers.get("range"), total);
    const previsto = encabezadosDeAudio(rango, total);
    if (!conCuerpo || !previsto.cuerpo) return new Response(null, { status: previsto.status, headers: previsto.headers });

    const lectura = await almacen.leer(m.audioUrl, { rango: { desde: previsto.cuerpo.desde, hasta: previsto.cuerpo.hasta }, senal: req.signal });
    // Manda lo que el almacén entregó de verdad (el archivo pudo cambiar entre pedir el tamaño y leerlo): así
    // `Content-Range` y `Content-Length` siempre dicen lo que viaja.
    const real = encabezadosDeAudio(rango.tipo === "completo" ? rango : { tipo: "rango", desde: lectura.desde, hasta: lectura.hasta }, lectura.total);
    return new Response(lectura.flujo, { status: real.status, headers: real.headers });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof ErrorAlmacen && error.tipo === "no_encontrado") {
      return NextResponse.json({ error: "La grabación ya no está disponible." }, { status: 404 });
    }
    if (error instanceof ErrorAlmacen && error.tipo === "transitorio") {
      return NextResponse.json({ error: "No pudimos leer la grabación ahora. Inténtalo de nuevo en un momento." }, { status: 503, headers: { "Retry-After": "5" } });
    }
    console.error("[api/meetings/[id]/audio]", error);
    return NextResponse.json({ error: "No pudimos leer la grabación." }, { status: 500 });
  }
}

export const GET = (req: NextRequest, ctx: Contexto) => responder(req, ctx, true);
export const HEAD = (req: NextRequest, ctx: Contexto) => responder(req, ctx, false);
