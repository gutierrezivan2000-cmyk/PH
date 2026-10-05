/**
 * Lo que la IA necesita saber de una reunión para redactar su acta o contestar preguntas: quién es la copropiedad, qué
 * reunión fue, quién es cada voz, la ficha y la transcripción COMPLETA. Se lee de la base de datos y se arma siempre igual
 * (el orden y el texto son deterministas): el prefijo que se manda a la IA tiene que ser byte a byte el mismo en cada llamada
 * para que la caché del servicio lo reutilice.
 */
import { db } from "@/lib/db";
import type { VozDeActa } from "./acta";
import type { Ficha } from "./dto";
import { leerFicha } from "./mapeo";
import { nombreRolPersona } from "./tipos";
import { formatearTranscripcion } from "./transcripcion/unir";

export type LineaDeReunion = { startMs: number; speaker: string; text: string };

export type ContextoDeReunion = {
  meetingId: string;
  userId: string;
  propertyId: string;
  propiedad: string;
  titulo: string;
  tipo: string;
  fecha: Date;
  status: string;
  duracionMs: number;
  ficha: Ficha | null;
  voces: VozDeActa[];
  lineas: LineaDeReunion[];
  /** Quiénes asistieron: los de la ficha o, si la ficha no los trae, las voces con nombre. */
  asistentes: Array<{ nombre: string; rol?: string | null }>;
};

/** Cuántas intervenciones se leen por vuelta (una reunión de 8 h tiene miles). */
const LOTE = 2_000;

/** La reunión con todo lo que hace falta; null si no existe (o no es de `userId`, cuando se pide). */
export async function cargarContextoDeReunion(meetingId: string, { userId }: { userId?: string } = {}): Promise<ContextoDeReunion | null> {
  const m = await db.meeting.findFirst({
    where: { id: meetingId, ...(userId ? { userId } : {}) },
    select: { id: true, userId: true, propertyId: true, title: true, type: true, date: true, status: true, durationMs: true, digest: true, property: { select: { name: true } } },
  });
  if (!m) return null;

  const hablantes = await db.meetingSpeaker.findMany({ where: { meetingId }, select: { label: true, name: true, role: true, talkMs: true } });
  const voces: VozDeActa[] = [...hablantes]
    .sort((a, b) => b.talkMs - a.talkMs || a.label.localeCompare(b.label, "es", { numeric: true }))
    .map((h) => ({
      etiqueta: h.label,
      nombre: h.name?.trim() || null,
      rol: h.role ? nombreRolPersona(h.role) || h.role : null,
    }));

  const lineas: LineaDeReunion[] = [];
  let ultimoIdx = -1;
  for (;;) {
    const lote = await db.meetingUtterance.findMany({
      where: { meetingId, idx: { gt: ultimoIdx } },
      orderBy: { idx: "asc" },
      take: LOTE,
      select: { idx: true, startMs: true, speaker: true, text: true },
    });
    for (const f of lote) lineas.push({ startMs: f.startMs, speaker: f.speaker, text: f.text });
    if (lote.length < LOTE) break;
    ultimoIdx = lote[lote.length - 1].idx;
  }

  const ficha = leerFicha(m.digest);
  const asistentes = ficha && ficha.asistentes.length
    ? ficha.asistentes.map((a) => ({ nombre: a.nombre, rol: a.rol ?? null }))
    : voces.flatMap((v) => (v.nombre ? [{ nombre: v.nombre, rol: v.rol ?? null }] : []));

  return {
    meetingId: m.id,
    userId: m.userId,
    propertyId: m.propertyId,
    propiedad: m.property?.name ?? "Copropiedad",
    titulo: m.title,
    tipo: m.type,
    fecha: m.date,
    status: m.status,
    duracionMs: m.durationMs ?? (lineas.length ? lineas[lineas.length - 1].startMs : 0),
    ficha,
    voces,
    lineas,
    asistentes,
  };
}

/** La transcripción como la ve la IA: `[hh:mm:ss] V1: texto`, una línea por intervención (los nombres, en la leyenda de voces). */
export const transcripcionParaIA = (lineas: readonly LineaDeReunion[]): string =>
  formatearTranscripcion(lineas.map((l) => ({ inicioMs: l.startMs, hablante: l.speaker, texto: l.text })));
