export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { rutaDeParteViva } from "@/lib/meetings/almacen";
import { leerCuerpoAcotado } from "@/lib/meetings/cuerpo";
import { demoRegistrarParteViva } from "@/lib/meetings/demo";
import { VIVO_PARTE_MAX_BYTES, puedeAgregarFuentes } from "@/lib/meetings/tipos";
import { validarParteViva } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ id: string }> };

const CERRADA = "Esta reunión ya no admite más audio: se está procesando o ya está lista.";
const SIN_CONSTANCIA = "Antes de grabar, confirma que avisaste a los asistentes.";

/**
 * POST /api/meetings/[id]/live → { ok: true }
 *
 * Una parte (~30 s) de la grabadora. Cuerpo binario de 2 MB como máximo; cabeceras `Content-Type` (el audio),
 * `X-Sesion`, `X-Secuencia` y `X-Duracion-Ms`. Idempotente por (sesión, parte): la ruta del blob es siempre la
 * misma y se sobrescribe, así que reenviar una parte cuya respuesta se perdió no la duplica. La primera parte
 * pasa la reunión a «grabando».
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  // Un cuerpo enorme no debe llegar a la memoria: se mira la cabecera y, además, se lee con tope (puede faltar o mentir).
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > VIVO_PARTE_MAX_BYTES) {
    return NextResponse.json({ error: "La parte de audio es demasiado grande." }, { status: 413 });
  }
  const leido = await leerCuerpoAcotado(req, VIVO_PARTE_MAX_BYTES);
  if (leido === "excede") return NextResponse.json({ error: "La parte de audio es demasiado grande." }, { status: 413 });
  if (leido === null) return NextResponse.json({ error: "No pudimos leer la parte de audio." }, { status: 400 });
  const cuerpo = leido;

  const valida = validarParteViva(
    {
      tipo: req.headers.get("content-type"),
      sesion: req.headers.get("x-sesion"),
      secuencia: req.headers.get("x-secuencia"),
      duracionMs: req.headers.get("x-duracion-ms"),
    },
    cuerpo.byteLength,
  );
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: cuerpo.byteLength > VIVO_PARTE_MAX_BYTES ? 413 : 400 });
  const parte = valida.valor;

  if (ctx.demo) {
    const r = demoRegistrarParteViva(ctx.userId, id, { ...parte, bytes: cuerpo.byteLength });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : r.codigo === "tope" ? 400 : 409 });
    return NextResponse.json({ ok: true });
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    if (!puedeAgregarFuentes(reunion.status)) return NextResponse.json({ error: CERRADA }, { status: 409 });
    if (!reunion.consentAt) return NextResponse.json({ error: SIN_CONSTANCIA }, { status: 409 });

    const { put } = await import("@vercel/blob");
    const blob = await put(rutaDeParteViva(id, parte.session, parte.seq, parte.ext), Buffer.from(cuerpo.buffer, cuerpo.byteOffset, cuerpo.byteLength), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: parte.mime,
    });
    const datos = { url: blob.url, bytes: cuerpo.byteLength, durationMs: parte.durMs, mimeType: parte.mime };
    await db.meetingLivePart.upsert({
      where: { meetingId_session_seq: { meetingId: id, session: parte.session, seq: parte.seq } },
      create: { meetingId: id, session: parte.session, seq: parte.seq, ...datos },
      update: datos,
    });
    if (reunion.status !== "grabando") {
      await db.meeting.updateMany({
        where: { id, userId: ctx.userId, status: { in: ["borrador", "subiendo", "error"] } },
        data: { status: "grabando", errorMessage: null },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/meetings/[id]/live POST]", error);
    return NextResponse.json({ error: "No pudimos guardar la parte de la grabación." }, { status: 500 });
  }
}
