/**
 * Las tareas del análisis con IA:
 *
 *  - `analizar_bloque` (clave `bloque:<k>`): manda a Claude un bloque de ~25 min de la transcripción y guarda lo que extrae
 *    (temas, decisiones, compromisos, votaciones, cifras y pistas de quién es quién), validado, en el `result` de la tarea.
 *  - `ficha` (clave `ficha`): junta lo de todos los bloques con reglas, pide a Claude el resumen, el orden del día, los
 *    asistentes y los nombres sugeridos de los hablantes, y guarda la ficha en `Meeting.digest` y las sugerencias en cada
 *    `MeetingSpeaker`.
 *
 * **La IA nunca tumba una reunión.** La transcripción ya está completa y es lo principal: si Claude no está disponible,
 * un fallo del momento se reintenta (la cola espera 30 s, 2 min, 10 min) y, si ya no quedan intentos o el fallo no tiene
 * arreglo (credenciales, saldo, un rechazo), el paso se OMITE y se anota. Un bloque omitido queda como pendiente en la
 * ficha; si la última llamada falla, la ficha se arma con lo que ya salió de los bloques (que está pagado) y sin resumen.
 * Solo los fallos de la base de datos o del código pueden terminar en error.
 */
import { db } from "@/lib/db";
import type { TareaReclamada } from "./cola";
import { ErrorTarea, type DepsProceso, type Manejador } from "./contratos";
import {
  ESQUEMA_BLOQUE, ESQUEMA_FICHA, armarFicha, bloqueVacio, consolidar, construirPromptDeBloque, construirPromptDeFicha, fichaSinIA, leerBloque,
  leerSalidaDeFicha, pendienteDeFragmento, type BloqueAnalizado, type DatosDeReunion, type IntervencionParaIA,
} from "./ficha";
import {
  ErrorIA, USO_VACIO, aErrorIA, crearClienteIA, esfuerzoDeReuniones, type ClienteIA, type Esfuerzo, type UsoIA,
} from "./ia";
import { MAX_INTENTOS_TAREA, ZONA_HORARIA, esTipoMarcador, nombreRolPersona, nombreTipoReunion } from "./tipos";
import { KIND_BLOQUE } from "./transcripcion/claves";
import { textoDeMarca } from "./transcripcion/presentacion";

/** El tiempo máximo de una llamada: el de la plataforma menos lo que hace falta para guardar. */
const TIMEOUT_MAXIMO_MS = 200_000;
const TIMEOUT_MINIMO_MS = 30_000;
const RESERVA_DE_CIERRE_MS = 25_000;
const timeoutDe = (presupuestoMs: number) => Math.min(TIMEOUT_MAXIMO_MS, Math.max(TIMEOUT_MINIMO_MS, presupuestoMs - RESERVA_DE_CIERRE_MS));

const ORDEN_DE_ESFUERZO: readonly Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * El primer intento va con el esfuerzo configurado; si falla, los siguientes bajan a «medium»: una respuesta que se corta o
 * tarda de más suele arreglarse pensando menos, y un fallo del servicio no depende del esfuerzo.
 */
export function esfuerzoParaIntento(base: Esfuerzo, intento: number): Esfuerzo {
  if (intento <= 1) return base;
  return ORDEN_DE_ESFUERZO.indexOf(base) > ORDEN_DE_ESFUERZO.indexOf("medium") ? "medium" : base;
}

let clientePorDefecto: ClienteIA | null = null;
const iaDe = (deps: DepsProceso): ClienteIA => deps.ia ?? (clientePorDefecto ??= crearClienteIA());

/* ════════════════════════════════════════════════════════════════════
   Contexto de la reunión
   ════════════════════════════════════════════════════════════════════ */

type ContextoDeReunion = { duracionMs: number | null; datos: DatosDeReunion };

async function cargarContexto(meetingId: string): Promise<ContextoDeReunion | null> {
  const reunion = await db.meeting.findFirst({
    where: { id: meetingId },
    select: { propertyId: true, type: true, date: true, durationMs: true, property: { select: { name: true } } },
  });
  if (!reunion) return null;
  const personas = await db.propertyPerson.findMany({ where: { propertyId: reunion.propertyId, active: true }, select: { name: true, role: true } });
  return {
    duracionMs: reunion.durationMs,
    datos: {
      propiedad: reunion.property?.name ?? "Copropiedad",
      tipo: nombreTipoReunion(reunion.type),
      fecha: new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA_HORARIA }).format(reunion.date),
      personas: personas.map((p) => ({ nombre: p.name, rol: nombreRolPersona(p.role) || null })),
    },
  };
}

/**
 * Hace una llamada a la IA sin dejar que tumbe la reunión: un fallo que se puede reintentar sube a la cola mientras queden
 * intentos; si ya no quedan, o no tiene arreglo, devuelve el motivo para que el paso se omita.
 */
async function sinTumbarLaReunion<T>(tarea: TareaReclamada, hacer: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; motivo: string }> {
  try {
    return { ok: true, valor: await hacer() };
  } catch (e) {
    const error = aErrorIA(e);
    if (error.reintentable && tarea.attempts < MAX_INTENTOS_TAREA) throw error;
    console.error(`[meetings/analisis] ${tarea.kind} (${tarea.key}) se omite: ${error.message}`);
    return { ok: false, motivo: error.message };
  }
}

/* ════════════════════════════════════════════════════════════════════
   Lo que guarda cada tarea
   ════════════════════════════════════════════════════════════════════ */

export type ResultadoDeBloque = {
  k: number;
  desdeMs: number;
  hastaMs: number;
  /** Lo que salió del bloque. Falta si se omitió. */
  bloque?: BloqueAnalizado;
  /** Por qué no se analizó (se anota como pendiente en la ficha). */
  omitido?: string;
  uso: UsoIA;
  modelo?: string;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function leerUso(v: unknown): UsoIA {
  if (!esObjeto(v)) return USO_VACIO;
  const n = (x: unknown) => (esNumero(x) && x > 0 ? x : 0);
  return { entrada: n(v.entrada), salida: n(v.salida), cacheLectura: n(v.cacheLectura), cacheEscritura: n(v.cacheEscritura), costoUsd: n(v.costoUsd) };
}

/** El `result` de una tarea `analizar_bloque`, leído con tolerancia (lo que no cuadra se descarta). null si no se puede usar. */
export function leerResultadoDeBloque(json: unknown, etiquetas: ReadonlySet<string>): ResultadoDeBloque | null {
  if (!esObjeto(json) || !esNumero(json.k) || !esNumero(json.desdeMs) || !esNumero(json.hastaMs)) return null;
  let bloque: BloqueAnalizado | undefined;
  if (json.bloque !== undefined) {
    try {
      bloque = leerBloque(json.bloque, { desdeS: 0, hastaS: Number.MAX_SAFE_INTEGER, etiquetas });
    } catch {
      return null;
    }
  }
  return {
    k: json.k,
    desdeMs: json.desdeMs,
    hastaMs: json.hastaMs,
    bloque,
    omitido: typeof json.omitido === "string" ? json.omitido : undefined,
    uso: leerUso(json.uso),
    modelo: typeof json.modelo === "string" ? json.modelo : undefined,
  };
}

/* ════════════════════════════════════════════════════════════════════
   analizar_bloque
   ════════════════════════════════════════════════════════════════════ */

export const analizarBloqueTarea: Manejador = async ({ tarea, presupuestoMs, senal, deps }) => {
  const p = tarea.payload;
  const k = Number(p.k);
  const desdeMs = Number(p.desdeMs);
  const hastaMs = Number(p.hastaMs);
  const total = Number(p.total);
  if (![k, desdeMs, hastaMs, total].every(Number.isFinite) || hastaMs <= desdeMs) {
    throw new ErrorTarea("Esta tarea no dice qué fragmento analizar.", { reintentable: false });
  }

  const contexto = await cargarContexto(tarea.meetingId);
  if (!contexto) return { resultado: { omitida: "la reunión ya no existe" } };

  const [filas, marcas, hablantes] = await Promise.all([
    db.meetingUtterance.findMany({
      where: { meetingId: tarea.meetingId, startMs: { gte: desdeMs, lt: hastaMs } },
      orderBy: [{ startMs: "asc" }, { idx: "asc" }],
      select: { startMs: true, endMs: true, speaker: true, text: true },
    }),
    db.meetingMarker.findMany({ where: { meetingId: tarea.meetingId, atMs: { gte: desdeMs, lt: hastaMs } }, orderBy: { atMs: "asc" }, select: { atMs: true, kind: true, note: true } }),
    db.meetingSpeaker.findMany({ where: { meetingId: tarea.meetingId }, select: { label: true } }),
  ]);
  const base = { k, desdeMs, hastaMs };
  if (filas.length === 0) return { resultado: { ...base, bloque: bloqueVacio(), uso: USO_VACIO } satisfies ResultadoDeBloque };

  const intervenciones: IntervencionParaIA[] = filas.map((f) => ({ startMs: f.startMs, endMs: f.endMs, speaker: f.speaker, text: f.text }));
  const { sistema, usuario } = construirPromptDeBloque({
    reunion: contexto.datos,
    bloque: { k, desdeMs, hastaMs },
    total,
    intervenciones,
    marcas: marcas.map((m) => ({ atMs: m.atMs, texto: textoDeMarca({ kind: esTipoMarcador(m.kind) ? m.kind : "nota", note: m.note }) })),
  });
  const etiquetas = new Set(hablantes.map((h) => h.label));

  const r = await sinTumbarLaReunion(tarea, async () => {
    const respuesta = await iaDe(deps).generarJson({
      etiqueta: `el fragmento ${k + 1}`,
      sistema,
      usuario,
      esquema: ESQUEMA_BLOQUE,
      esfuerzo: esfuerzoParaIntento(esfuerzoDeReuniones(), tarea.attempts),
      timeoutMs: timeoutDe(presupuestoMs),
      senal,
    });
    let bloque: BloqueAnalizado;
    try {
      bloque = leerBloque(respuesta.json, { desdeS: Math.floor(desdeMs / 1000), hastaS: Math.ceil(hastaMs / 1000), etiquetas });
    } catch {
      throw new ErrorIA(`La IA devolvió el fragmento ${k + 1} en un formato que no se pudo leer. Se vuelve a intentar.`, { reintentable: true });
    }
    return { bloque, respuesta };
  });

  if (!r.ok) return { resultado: { ...base, omitido: r.motivo, uso: USO_VACIO } satisfies ResultadoDeBloque };
  return { resultado: { ...base, bloque: r.valor.bloque, uso: r.valor.respuesta.uso, modelo: r.valor.respuesta.modelo } satisfies ResultadoDeBloque };
};

/* ════════════════════════════════════════════════════════════════════
   ficha
   ════════════════════════════════════════════════════════════════════ */

const AVISO_SIN_RESUMEN = "El resumen con IA no se pudo generar: la transcripción está completa y puedes revisarla.";

export const fichaTarea: Manejador = async ({ tarea, presupuestoMs, senal, deps }) => {
  const meetingId = tarea.meetingId;
  const contexto = await cargarContexto(meetingId);
  if (!contexto) return { resultado: { omitida: "la reunión ya no existe" } };
  if (!contexto.duracionMs) throw new ErrorTarea("La reunión no tiene duración: falta el audio.", { reintentable: true });
  const duracionMs = contexto.duracionMs;

  const hablantes = await db.meetingSpeaker.findMany({ where: { meetingId }, select: { label: true, talkMs: true } });
  const etiquetas = new Set(hablantes.map((h) => h.label));
  const filas = await db.meetingTask.findMany({ where: { meetingId, kind: KIND_BLOQUE, status: "hecha" }, select: { result: true } });
  const resultados = filas.flatMap((f) => leerResultadoDeBloque(f.result, etiquetas) ?? []).sort((a, b) => a.k - b.k);
  const analizados = resultados.flatMap((r) => (r.bloque ? [r.bloque] : []));
  const omitidos = resultados.filter((r) => r.omitido);

  // Sin nada que consolidar (la IA no estuvo disponible en ningún bloque): la reunión queda lista sin ficha y con un aviso.
  if (analizados.length === 0) {
    const motivo = omitidos[0]?.omitido ?? "No había nada que analizar.";
    await db.meeting.update({ where: { id: meetingId }, data: { errorMessage: omitidos.length ? `No pudimos generar el resumen con IA: ${motivo}` : null } });
    return { resultado: { sinFicha: true, motivo, uso: USO_VACIO } };
  }

  const consolidado = consolidar(analizados);
  const pendientes = omitidos.map((o) => pendienteDeFragmento(o.desdeMs, o.hastaMs));
  const { sistema, usuario } = construirPromptDeFicha({
    reunion: contexto.datos,
    duracionMs,
    consolidado,
    hablantes: hablantes.map((h) => ({ etiqueta: h.label, talkMs: h.talkMs })),
    omitidos: omitidos.map((o) => ({ desdeMs: o.desdeMs, hastaMs: o.hastaMs })),
  });

  // Una conversación sin un solo tema, decisión, compromiso ni votación no da qué resumir: se deja lo poco que hay, sin gastar una llamada.
  const sinNadaQueResumir = !consolidado.temas.length && !consolidado.decisiones.length && !consolidado.compromisos.length && !consolidado.votaciones.length;

  const r = sinNadaQueResumir
    ? ({ ok: false, motivo: "" } as const)
    : await sinTumbarLaReunion(tarea, async () => {
    const respuesta = await iaDe(deps).generarJson({
      etiqueta: "la ficha de la reunión",
      sistema,
      usuario,
      esquema: ESQUEMA_FICHA,
      esfuerzo: esfuerzoParaIntento(esfuerzoDeReuniones(), tarea.attempts),
      timeoutMs: timeoutDe(presupuestoMs),
      senal,
    });
    try {
      return { salida: leerSalidaDeFicha(respuesta.json, { duracionS: Math.ceil(duracionMs / 1000), etiquetas }), respuesta };
    } catch {
      throw new ErrorIA("La IA devolvió la ficha en un formato que no se pudo leer. Se vuelve a intentar.", { reintentable: true });
    }
  });

  const base = r.ok
    ? armarFicha(consolidado, r.valor.salida, pendientes)
    : fichaSinIA(consolidado, [...pendientes, sinNadaQueResumir ? "No se identificaron temas, decisiones ni compromisos en la reunión." : AVISO_SIN_RESUMEN]);
  // Si quedaron fragmentos sin analizar, la ficha lo dice: la pantalla ofrece volver a analizar solo esos.
  const ficha = omitidos.length > 0 ? { ...base, fragmentosOmitidos: omitidos.length } : base;
  const uso = r.ok ? r.valor.respuesta.uso : USO_VACIO;
  const aviso = r.ok || sinNadaQueResumir ? null : AVISO_SIN_RESUMEN;

  await db.meeting.update({ where: { id: meetingId }, data: { digest: ficha as object, errorMessage: aviso } });

  // Las sugerencias de nombre quedan en cada hablante, sin confirmar: la persona decide.
  for (const h of ficha.hablantes) {
    await db.meetingSpeaker.updateMany({
      where: { meetingId, label: h.etiqueta },
      data: { suggestion: { nombre: h.nombreSugerido, rol: h.rol, evidencia: h.evidencia, t: h.t, igualA: h.igualA, confianza: h.confianza } },
    });
  }

  return {
    resultado: {
      decisiones: ficha.decisiones.length,
      compromisos: ficha.compromisos.length,
      votaciones: ficha.votaciones.length,
      sugerencias: ficha.hablantes.length,
      omitidos: omitidos.length,
      degradada: !r.ok && !sinNadaQueResumir,
      modelo: r.ok ? r.valor.respuesta.modelo : undefined,
      uso,
    },
  };
};
