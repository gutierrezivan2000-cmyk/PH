export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { almacenBlob } from "@/lib/meetings/almacen-blob";
import { leerTodo } from "@/lib/meetings/almacen";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoRegistrarFuente } from "@/lib/meetings/demo";
import { aFuente } from "@/lib/meetings/mapeo";
import { MAX_FUENTES_POR_REUNION, puedeAgregarFuentes } from "@/lib/meetings/tipos";
import { validarRegistroFuente } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ id: string }> };

const NO_ES_AUDIO = "El archivo no parece un audio o video válido. Sube una grabación en un formato de audio o video común.";

const ascii = (b: Uint8Array, pos: number, txt: string) => [...txt].every((c, i) => b[pos + i] === c.charCodeAt(0));

/**
 * ¿Los primeros bytes son de un contenedor de audio/video conocido? Lista cerrada de firmas: un texto (p. ej. una lista
 * «#EXTM3U» de HLS, que ffmpeg seguiría descargando de la red del servidor) o cualquier otra cosa NO pasa.
 */
function esFirmaDeMedios(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  if (ascii(b, 0, "ID3") || ascii(b, 0, "OggS") || ascii(b, 0, "fLaC") || ascii(b, 4, "ftyp")) return true;
  if (ascii(b, 0, "RIFF") && (ascii(b, 8, "WAVE") || ascii(b, 8, "AVI "))) return true;
  if (ascii(b, 0, "FORM") && (ascii(b, 8, "AIFF") || ascii(b, 8, "AIFC"))) return true;
  if (ascii(b, 0, "#!AMR")) return true;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true; // EBML (webm / mkv)
  if (b[0] === 0x30 && b[1] === 0x26 && b[2] === 0xb2 && b[3] === 0x75) return true; // ASF (wma / wmv)
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && (b[3] === 0xba || b[3] === 0xb3)) return true; // MPEG-PS / video
  if (b[0] === 0x47 && b.length > 188 && b[188] === 0x47) return true; // MPEG-TS
  // Trama MPEG de audio o ADTS: sincronía de 11 bits y campos de cabecera válidos.
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 3) & 3) !== 1) {
    const adts = ((b[1] >> 1) & 3) === 0;
    if (adts) return true;
    return (b[2] >> 4) !== 0xf && ((b[2] >> 2) & 3) !== 3;
  }
  return false;
}

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

    // El mismo archivo (mismo nombre y tamaño) dos veces en la misma reunión es casi siempre una subida repetida: duplicaría el audio
    // (una grabación de 8 h pasaría a ser de 16 h) y gastaría el doble de transcripción y de horas del cupo.
    if (await db.meetingSource.findFirst({ where: { meetingId: id, name: nombre, sizeBytes: tamano }, select: { id: true } })) {
      return NextResponse.json({ error: "Este archivo ya está en la reunión." }, { status: 409 });
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

    // El archivo debe SER audio o video: ffmpeg detecta el formato por el contenido y un texto disfrazado (lista HLS/DASH)
    // le haría pedir URLs desde el servidor. Solo se leen los primeros bytes.
    let cabecera: Uint8Array;
    try {
      cabecera = await leerTodo(almacenBlob(), url, { desde: 0, hasta: 4095 });
    } catch {
      return NextResponse.json({ error: "No pudimos leer el archivo del almacenamiento. Vuelve a subirlo." }, { status: 400 });
    }
    if (!esFirmaDeMedios(cabecera)) return NextResponse.json({ error: NO_ES_AUDIO }, { status: 400 });

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
