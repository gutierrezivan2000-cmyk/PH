export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoIntervenciones, demoReunion } from "@/lib/meetings/demo";
import type { IntervencionDTO, PaginaDeIntervenciones } from "@/lib/meetings/dto";
import {
  MAX_COINCIDENCIAS, coincideConBusqueda, leerConsulta, paginarEnMemoria, siguienteTrasPagina, terminosDeBusqueda,
  type ConsultaDeIntervenciones,
} from "@/lib/meetings/transcripcion/paginas";

type Contexto = { params: Promise<{ id: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
const SELECCION = { id: true, startMs: true, endMs: true, speaker: true, text: true } as const;
/** Cuántas filas se leen por vuelta al buscar (la búsqueda recorre la reunión entera). */
const LOTE_DE_BUSQUEDA = 2_000;

/** Cómo se llama cada voz que ya tiene nombre. */
async function nombresDe(meetingId: string): Promise<Record<string, string>> {
  const filas = await db.meetingSpeaker.findMany({ where: { meetingId }, select: { label: true, name: true } });
  return Object.fromEntries(filas.flatMap((f) => (f.name && f.name.trim() ? [[f.label, f.name.trim()]] : [])));
}

/** Sin búsqueda: las intervenciones que empiezan en `[desde, hasta)` y dónde sigue la próxima. */
async function pagina(meetingId: string, { desdeMs, hastaMs }: ConsultaDeIntervenciones): Promise<{ items: IntervencionDTO[]; siguienteMs: number | null }> {
  const limite = hastaMs as number; // sin búsqueda siempre hay final
  const items = await db.meetingUtterance.findMany({
    where: { meetingId, startMs: { gte: desdeMs, lt: limite } },
    orderBy: [{ startMs: "asc" }, { idx: "asc" }],
    select: SELECCION,
  });
  const proxima = await db.meetingUtterance.findFirst({ where: { meetingId, startMs: { gte: limite } }, orderBy: { startMs: "asc" }, select: { startMs: true } });
  return { items, siguienteMs: siguienteTrasPagina(limite, proxima ? proxima.startMs : null) };
}

/** Con búsqueda: recorre la reunión desde `desde` y junta hasta 200 coincidencias (más una, para saber si hay más). */
async function busqueda(meetingId: string, { desdeMs, hastaMs, q }: ConsultaDeIntervenciones): Promise<{ items: IntervencionDTO[]; siguienteMs: number | null }> {
  const terminos = terminosDeBusqueda(q);
  const coincidencias: IntervencionDTO[] = [];
  let ultimoIdx = -1;
  while (coincidencias.length <= MAX_COINCIDENCIAS) {
    const lote = await db.meetingUtterance.findMany({
      where: { meetingId, idx: { gt: ultimoIdx }, startMs: { gte: desdeMs, ...(hastaMs !== null ? { lt: hastaMs } : {}) } },
      orderBy: { idx: "asc" },
      take: LOTE_DE_BUSQUEDA,
      select: { ...SELECCION, idx: true },
    });
    for (const f of lote) {
      if (coincideConBusqueda(f.text, terminos)) coincidencias.push({ id: f.id, startMs: f.startMs, endMs: f.endMs, speaker: f.speaker, text: f.text });
    }
    if (lote.length < LOTE_DE_BUSQUEDA) break;
    ultimoIdx = lote[lote.length - 1].idx;
  }
  return {
    items: coincidencias.slice(0, MAX_COINCIDENCIAS),
    siguienteMs: coincidencias.length > MAX_COINCIDENCIAS ? coincidencias[MAX_COINCIDENCIAS].startMs : null,
  };
}

/**
 * GET /api/meetings/[id]/utterances?desde=&hasta=&q= → { items: [{ id, startMs, endMs, speaker, text }], nombres, siguienteMs }
 *
 * La transcripción por páginas de 30 minutos (las intervenciones que empiezan en `[desde, hasta)`), o, con `q`, las
 * coincidencias de toda la reunión (hasta 200). `nombres` dice cómo se llama cada etiqueta que ya tiene nombre y
 * `siguienteMs`, desde dónde pedir lo que sigue (null si no hay más).
 */
export async function GET(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const consulta = leerConsulta(req.nextUrl.searchParams);
  if (!consulta.ok) return NextResponse.json({ error: consulta.error }, { status: 400 });

  if (ctx.demo) {
    const todas = demoIntervenciones(ctx.userId, id);
    const detalle = demoReunion(ctx.userId, id);
    if (!todas || !detalle) return NO_ENCONTRADA();
    const nombres = Object.fromEntries(detalle.speakers.flatMap((h) => (h.name ? [[h.label, h.name]] : [])));
    const respuesta: PaginaDeIntervenciones = { ...paginarEnMemoria(todas, consulta.valor), nombres };
    return NextResponse.json(respuesta);
  }

  try {
    await ensureMeetingsSchema();
    if (!(await reunionDelUsuario(id, ctx.userId))) return NO_ENCONTRADA();
    const [{ items, siguienteMs }, nombres] = await Promise.all([
      consulta.valor.q ? busqueda(id, consulta.valor) : pagina(id, consulta.valor),
      nombresDe(id),
    ]);
    const respuesta: PaginaDeIntervenciones = { items, nombres, siguienteMs };
    return NextResponse.json(respuesta, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[api/meetings/[id]/utterances GET]", error);
    return NextResponse.json({ error: "No pudimos cargar la transcripción." }, { status: 500 });
  }
}
