export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible } from "@/lib/meetings/acceso";
import { demoIntervenciones, demoReunion } from "@/lib/meetings/demo";
import { leerRangos } from "@/lib/meetings/mapeo";
import { encabezadoDeTranscripcion, nombreDeArchivoDeTranscripcion } from "@/lib/meetings/transcripcion/descarga";
import { formatearTranscripcion } from "@/lib/meetings/transcripcion/unir";
import { ZONA_HORARIA, cortoTipoReunion, formatearDuracion } from "@/lib/meetings/tipos";

type Contexto = { params: Promise<{ id: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
const NO_LISTA = () => NextResponse.json({ error: "La transcripción todavía no está lista." }, { status: 409 });
/** Cuántas intervenciones se leen por vuelta (una reunión de 8 h tiene miles). */
const LOTE = 2_000;

function respuestaDeTexto(texto: string, titulo: string): NextResponse {
  return new NextResponse(texto, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreDeArchivoDeTranscripcion(titulo)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

const fechaDeLaReunion = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA_HORARIA }).format(new Date(iso));

/**
 * GET /api/meetings/[id]/transcript → la transcripción completa en un .txt, con los nombres que ya tengan las voces.
 *
 * Una línea por intervención: `[01:23:45] V1 (Martha López): texto`; los silencios largos van intercalados. Se arma
 * con lo que hay en la base (no con el archivo guardado), así los nombres puestos después salen siempre.
 */
export async function GET(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const detalle = demoReunion(ctx.userId, id);
    const items = demoIntervenciones(ctx.userId, id);
    if (!detalle || !items) return NO_ENCONTRADA();
    if (detalle.meeting.status !== "lista") return NO_LISTA();
    const m = detalle.meeting;
    const nombres = Object.fromEntries(detalle.speakers.flatMap((h) => (h.name ? [[h.label, h.name]] : [])));
    const encabezado = encabezadoDeTranscripcion({
      titulo: m.title,
      detalle: [m.propertyName, cortoTipoReunion(m.type), fechaDeLaReunion(m.date), formatearDuracion(m.durationMs)].filter((x) => x && x !== "—").join(" · "),
      cobertura: m.coverage,
    });
    return respuestaDeTexto(
      `${encabezado}${formatearTranscripcion(items.map((u) => ({ inicioMs: u.startMs, hablante: u.speaker, texto: u.text })), nombres, detalle.silences)}\n`,
      m.title,
    );
  }

  try {
    await ensureMeetingsSchema();
    const m = await db.meeting.findFirst({
      where: { id, userId: ctx.userId },
      select: { title: true, type: true, date: true, status: true, durationMs: true, coverage: true, silences: true, property: { select: { name: true } } },
    });
    if (!m) return NO_ENCONTRADA();
    if (m.status !== "lista") return NO_LISTA();

    const hablantes = await db.meetingSpeaker.findMany({ where: { meetingId: id }, select: { label: true, name: true } });
    const nombres = Object.fromEntries(hablantes.flatMap((h) => (h.name && h.name.trim() ? [[h.label, h.name.trim()]] : [])));

    const lineas: Array<{ inicioMs: number; hablante: string; texto: string }> = [];
    let ultimoIdx = -1;
    for (;;) {
      const lote = await db.meetingUtterance.findMany({
        where: { meetingId: id, idx: { gt: ultimoIdx } },
        orderBy: { idx: "asc" },
        take: LOTE,
        select: { idx: true, startMs: true, speaker: true, text: true },
      });
      for (const f of lote) lineas.push({ inicioMs: f.startMs, hablante: f.speaker, texto: f.text });
      if (lote.length < LOTE) break;
      ultimoIdx = lote[lote.length - 1].idx;
    }

    const encabezado = encabezadoDeTranscripcion({
      titulo: m.title,
      detalle: [m.property?.name, cortoTipoReunion(m.type), fechaDeLaReunion(m.date.toISOString()), formatearDuracion(m.durationMs)].filter((x) => x && x !== "—").join(" · "),
      cobertura: m.coverage,
    });
    return respuestaDeTexto(`${encabezado}${formatearTranscripcion(lineas, nombres, leerRangos(m.silences))}\n`, m.title);
  } catch (error) {
    console.error("[api/meetings/[id]/transcript GET]", error);
    return NextResponse.json({ error: "No pudimos preparar la transcripción." }, { status: 500 });
  }
}
