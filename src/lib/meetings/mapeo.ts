/**
 * De filas de la base de datos a los DTO que ve la interfaz.
 *
 * Funciones puras con tipos estructurales (no importan Prisma), así se prueban
 * sin base de datos. Dos reglas que no se rompen aquí:
 *
 *  1. Las URLs de Blob (audio, transcripción, originales) son PRIVADAS: no
 *     salen de este módulo. La interfaz solo sabe si hay audio (`hasAudio`) y lo
 *     pide por /api/meetings/[id]/audio, que comprueba al dueño.
 *  2. Los campos JSON (ficha, silencios, sugerencias) los escribió una IA o un
 *     proceso: se leen con tolerancia y lo que no cuadra se descarta en vez de
 *     romper la pantalla.
 */
import type {
  Ficha, FichaVotacion, FuenteDTO, HablanteDTO, MarcadorDTO, PersonaDTO, RangoMs, ReunionDetalle, ReunionResumen,
  SugerenciaHablante, VivoDTO,
} from "./dto";
import { TIPOS_MARCADOR } from "./tipos";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const texto = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const numero = (v: unknown): number | undefined => (esNumero(v) ? v : undefined);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/* ── Lectores tolerantes de JSON ─────────────────────────────────────── */

export function leerRangos(json: unknown): RangoMs[] {
  return lista(json).flatMap((r) =>
    esObjeto(r) && esNumero(r.desdeMs) && esNumero(r.hastaMs) && r.hastaMs > r.desdeMs
      ? [{ desdeMs: r.desdeMs, hastaMs: r.hastaMs }]
      : [],
  );
}

const CONFIANZAS = ["alta", "media", "baja"] as const;
type Confianza = (typeof CONFIANZAS)[number];
const confianza = (v: unknown): Confianza | undefined => CONFIANZAS.find((c) => c === v);

export function leerSugerencia(json: unknown): SugerenciaHablante | null {
  if (!esObjeto(json)) return null;
  const evidencia = texto(json.evidencia);
  if (!evidencia) return null;
  return {
    nombre: texto(json.nombre),
    rol: texto(json.rol),
    evidencia,
    t: numero(json.t),
    igualA: texto(json.igualA),
    confianza: confianza(json.confianza),
  };
}

function leerVotacion(v: unknown): FichaVotacion[] {
  if (!esObjeto(v)) return [];
  const asunto = texto(v.asunto);
  const resultado = texto(v.resultado);
  if (!asunto || !resultado || !esNumero(v.t)) return [];
  return [{ t: v.t, asunto, resultado, aFavor: numero(v.aFavor), enContra: numero(v.enContra), abstenciones: numero(v.abstenciones) }];
}

/** La ficha guardada en `Meeting.digest`. null si no hay nada utilizable. */
export function leerFicha(json: unknown): Ficha | null {
  if (!esObjeto(json)) return null;
  const ficha: Ficha = {
    resumen: typeof json.resumen === "string" ? json.resumen.trim() : "",
    ordenDelDia: lista(json.ordenDelDia).flatMap((o) =>
      esObjeto(o) && texto(o.titulo) && esNumero(o.inicioS) ? [{ titulo: o.titulo as string, inicioS: o.inicioS }] : [],
    ),
    asistentes: lista(json.asistentes).flatMap((a) =>
      esObjeto(a) && texto(a.nombre) ? [{ nombre: a.nombre as string, rol: texto(a.rol) }] : [],
    ),
    decisiones: lista(json.decisiones).flatMap((d) =>
      esObjeto(d) && texto(d.id) && texto(d.texto) && esNumero(d.t) ? [{ id: d.id as string, texto: d.texto as string, t: d.t }] : [],
    ),
    compromisos: lista(json.compromisos).flatMap((c) =>
      esObjeto(c) && texto(c.id) && texto(c.texto) && esNumero(c.t)
        ? [{ id: c.id as string, texto: c.texto as string, responsable: texto(c.responsable), fecha: texto(c.fecha), t: c.t }]
        : [],
    ),
    votaciones: lista(json.votaciones).flatMap(leerVotacion),
    pendientes: lista(json.pendientes).flatMap((p) => (texto(p) ? [p as string] : [])),
    hablantes: lista(json.hablantes).flatMap((h) =>
      esObjeto(h) && texto(h.etiqueta) && texto(h.evidencia)
        ? [{
            etiqueta: h.etiqueta as string,
            nombreSugerido: texto(h.nombreSugerido),
            rol: texto(h.rol),
            confianza: confianza(h.confianza) ?? "baja",
            evidencia: h.evidencia as string,
            igualA: texto(h.igualA),
          }]
        : [],
    ),
  };
  const vacia =
    !ficha.resumen && !ficha.ordenDelDia.length && !ficha.decisiones.length && !ficha.compromisos.length && !ficha.votaciones.length;
  return vacia ? null : ficha;
}

/* ── Resumen (lista) ─────────────────────────────────────────────────── */

export type FilaResumen = {
  id: string;
  propertyId: string;
  type: string;
  title: string;
  date: Date;
  status: string;
  stage: string | null;
  progress: number;
  durationMs: number | null;
  errorMessage: string | null;
  property?: { name: string } | null;
};

export type ConteoTareas = { hechas: number | null; total: number | null };

export function aResumen(f: FilaResumen, conteo?: ConteoTareas): ReunionResumen {
  return {
    id: f.id,
    propertyId: f.propertyId,
    propertyName: f.property?.name ?? "Copropiedad",
    type: f.type,
    title: f.title,
    date: f.date.toISOString(),
    status: f.status,
    stage: f.stage,
    progress: f.progress,
    durationMs: f.durationMs,
    hechas: conteo?.hechas ?? null,
    total: conteo?.total ?? null,
    errorMessage: f.errorMessage,
  };
}

/* ── Detalle ─────────────────────────────────────────────────────────── */

export type FilaFuente = {
  id: string;
  idx: number;
  kind: string;
  name: string;
  sizeBytes: number;
  mimeType: string | null;
  status: string;
  durationMs: number | null;
  offsetMs: number | null;
};

export type FilaHablante = {
  label: string;
  name: string | null;
  role: string | null;
  personId: string | null;
  confirmed: boolean;
  suggestion: unknown;
  talkMs: number;
  sampleStartMs: number | null;
  sampleEndMs: number | null;
};

export type FilaMarcador = { id: string; atMs: number; kind: string; note: string | null };

export type FilaDetalle = FilaResumen & {
  coverage: number | null;
  consentAt: Date | null;
  readyAt: Date | null;
  provider: string | null;
  costUsd: number;
  /** Se usa solo para saber si hay audio; la URL no sale de aquí. */
  audioUrl: string | null;
  digest: unknown;
  silences: unknown;
  sources: FilaFuente[];
  speakers: FilaHablante[];
  markers: FilaMarcador[];
};

export function aFuente(f: FilaFuente): FuenteDTO {
  return {
    id: f.id,
    idx: f.idx,
    kind: f.kind === "grabacion" ? "grabacion" : "archivo",
    name: f.name,
    sizeBytes: f.sizeBytes,
    mimeType: f.mimeType,
    status: f.status,
    durationMs: f.durationMs,
    offsetMs: f.offsetMs,
  };
}

export function aHablante(f: FilaHablante): HablanteDTO {
  return {
    label: f.label,
    name: f.name,
    role: f.role,
    personId: f.personId,
    confirmed: f.confirmed,
    suggestion: leerSugerencia(f.suggestion),
    talkMs: f.talkMs,
    sampleStartMs: f.sampleStartMs,
    sampleEndMs: f.sampleEndMs,
  };
}

export function aMarcador(f: FilaMarcador): MarcadorDTO {
  return {
    id: f.id,
    atMs: f.atMs,
    kind: TIPOS_MARCADOR.find((k) => k === f.kind) ?? "nota",
    note: f.note,
  };
}

export function aDetalle(f: FilaDetalle, conteo?: ConteoTareas, vivo: VivoDTO | null = null): ReunionDetalle {
  return {
    meeting: {
      ...aResumen(f, conteo),
      coverage: f.coverage,
      consentAt: f.consentAt ? f.consentAt.toISOString() : null,
      readyAt: f.readyAt ? f.readyAt.toISOString() : null,
      provider: f.provider,
      costUsd: f.costUsd,
      hasAudio: Boolean(f.audioUrl),
    },
    sources: [...f.sources].sort((a, b) => a.idx - b.idx).map(aFuente),
    speakers: [...f.speakers].sort((a, b) => b.talkMs - a.talkMs || a.label.localeCompare(b.label)).map(aHablante),
    markers: [...f.markers].sort((a, b) => a.atMs - b.atMs).map(aMarcador),
    digest: leerFicha(f.digest),
    silences: leerRangos(f.silences),
    live: vivo,
  };
}

/* ── Personas de la copropiedad ──────────────────────────────────────── */

export type FilaPersona = { id: string; propertyId: string; name: string; role: string | null; active: boolean };

export function aPersona(f: FilaPersona): PersonaDTO {
  return { id: f.id, propertyId: f.propertyId, name: f.name, role: f.role, active: f.active };
}
