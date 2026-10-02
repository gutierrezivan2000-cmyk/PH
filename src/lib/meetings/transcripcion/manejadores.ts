/**
 * Las tareas de transcripción de la cola:
 *
 *  - `transcribir_tramo` (clave `tramo:<i>`): recorta del `audio.mp3` el audio del tramo (una lectura por rango, sin
 *    ffmpeg), lo manda al proveedor y guarda los segmentos, con tiempos relativos al tramo, en el `result` de la tarea.
 *    El tramo 0 va sin voces conocidas; los demás llevan las muestras que eligió `voces`.
 *  - `voces`: con el resultado del tramo 0 elige hasta 4 voces de referencia (V1…V4) y las guarda en `Meeting.speakerRefs`.
 *    Hasta que termina, el orquestador no encola los demás tramos.
 *  - `unir`: cose los tramos en una transcripción, la guarda (intervenciones, hablantes, archivo de texto) y anota la
 *    cobertura y los silencios.
 *
 * Todas son idempotentes: repetirlas deja el mismo resultado sin duplicar nada.
 */
import { db } from "@/lib/db";
import { prefijoDeReunion, type Almacen } from "../almacen";
import { rangoDeBytes, recortar } from "../audio";
import { ErrorTarea, type Manejador } from "../contratos";
import { MP3_BYTES_POR_MS } from "../tipos";
import { KIND_TRAMO, claveTramo } from "./claves";
import { leerReferenciasElegidas, leerResultadoDeTramo, tramoDeResultado } from "./guardado";
import { elegirVoces } from "./hablantes";
import { elegirProveedor } from "./elegir";
import { DURACION_MINIMA_MS } from "./openai";
import type { ResultadoDeTramo, VozDeReferencia } from "./tipos";
import { aAbsolutos } from "./tramos";
import { calcularCobertura, formatearTranscripcion, unirTramos, type TramoParaUnir } from "./unir";

/** El tiempo máximo de la llamada al proveedor: el de la plataforma menos lo que hace falta para guardar. */
const TIMEOUT_MAXIMO_MS = 150_000;
const TIMEOUT_MINIMO_MS = 20_000;
const RESERVA_DE_CIERRE_MS = 30_000;
/** Cuántas intervenciones se insertan por lote. */
const LOTE_INTERVENCIONES = 1_000;

/* ════════════════════════════════════════════════════════════════════
   transcribir_tramo
   ════════════════════════════════════════════════════════════════════ */

/** Corta del audio de la reunión las muestras de las voces conocidas, listas para mandarlas con el tramo. */
async function cargarVoces(almacen: Almacen, audioUrl: string, totalBytes: number, speakerRefs: unknown): Promise<VozDeReferencia[]> {
  const refs = leerReferenciasElegidas(speakerRefs);
  return Promise.all(
    refs.map(async (r) => ({ nombre: r.nombre, audio: await recortar(almacen, audioUrl, r.desdeMs, r.hastaMs, totalBytes), mime: "audio/mpeg" })),
  );
}

export const transcribirTramoTarea: Manejador = async ({ tarea, presupuestoMs, senal, deps }) => {
  const i = tarea.payload.i;
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0) throw new ErrorTarea("Esta tarea no dice qué tramo transcribir.", { reintentable: false });

  const reunion = await db.meeting.findFirst({ where: { id: tarea.meetingId }, select: { audioUrl: true, durationMs: true, speakerRefs: true } });
  if (!reunion) return { resultado: { omitida: "la reunión ya no existe" } };
  if (!reunion.audioUrl || !reunion.durationMs) throw new ErrorTarea("El audio de la reunión todavía no está listo.", { reintentable: true });

  const proveedor = deps.proveedor ?? elegirProveedor();
  const p = tarea.payload;
  const tramo = {
    i,
    desdeMs: Number(p.desdeMs),
    hastaMs: Number(p.hastaMs),
    nucleoDesdeMs: Number(p.nucleoDesdeMs),
    nucleoHastaMs: Number(p.nucleoHastaMs),
  };
  if (![tramo.desdeMs, tramo.hastaMs, tramo.nucleoDesdeMs, tramo.nucleoHastaMs].every(Number.isFinite) || tramo.hastaMs <= tramo.desdeMs) {
    throw new ErrorTarea(`El tramo ${i} no tiene los tiempos que hacen falta.`, { reintentable: false });
  }

  if (tramo.hastaMs - tramo.desdeMs < DURACION_MINIMA_MS) {
    const omitido: ResultadoDeTramo = { ...tramo, proveedor: proveedor.nombre, segmentos: [], costoUsd: 0, omitido: "dura menos de un segundo" };
    return { resultado: omitido };
  }

  // El audio se corta por tramas de 36 ms: lo que se transcribe empieza en la trama que contiene el inicio pedido (hasta
  // 35 ms antes). Los tiempos que devuelve el proveedor son relativos a ESE inicio, así que es el que se guarda.
  const totalBytes = reunion.durationMs * MP3_BYTES_POR_MS;
  const rango = rangoDeBytes(tramo.desdeMs, tramo.hastaMs, totalBytes);
  const audio = await recortar(deps.almacen, reunion.audioUrl, tramo.desdeMs, tramo.hastaMs, totalBytes);
  const desdeMs = rango.desde / MP3_BYTES_POR_MS;
  const duracionMs = (rango.hasta + 1) / MP3_BYTES_POR_MS - desdeMs;

  const referencias = i === 0 ? [] : await cargarVoces(deps.almacen, reunion.audioUrl, totalBytes, reunion.speakerRefs);
  const segmentos = await proveedor.transcribirTramo(audio, {
    referencias,
    desdeMs,
    duracionMs,
    timeoutMs: Math.min(TIMEOUT_MAXIMO_MS, Math.max(TIMEOUT_MINIMO_MS, presupuestoMs - RESERVA_DE_CIERRE_MS)),
    senal,
  });
  const resultado: ResultadoDeTramo = {
    ...tramo,
    desdeMs,
    hastaMs: desdeMs + duracionMs,
    proveedor: proveedor.nombre,
    segmentos,
    costoUsd: (duracionMs / 60_000) * proveedor.costoUsdPorMinuto,
  };
  return { resultado };
};

/* ════════════════════════════════════════════════════════════════════
   voces
   ════════════════════════════════════════════════════════════════════ */

export const vocesTarea: Manejador = async ({ tarea }) => {
  const primera = await db.meetingTask.findFirst({ where: { meetingId: tarea.meetingId, key: claveTramo(0) }, select: { status: true, result: true } });
  if (!primera || primera.status !== "hecha") throw new ErrorTarea("Todavía no está listo el primer tramo.", { reintentable: true });
  const r0 = leerResultadoDeTramo(primera.result);
  if (!r0) throw new ErrorTarea("No pudimos leer el resultado del primer tramo. Reintenta.", { reintentable: false });

  const referencias = elegirVoces(aAbsolutos(tramoDeResultado(r0), r0.segmentos));
  await db.meeting.updateMany({ where: { id: tarea.meetingId }, data: { speakerRefs: referencias as object[] } });
  return { resultado: { voces: referencias.length } };
};

/* ════════════════════════════════════════════════════════════════════
   unir
   ════════════════════════════════════════════════════════════════════ */

export const unirTarea: Manejador = async ({ tarea, deps }) => {
  const meetingId = tarea.meetingId;
  const reunion = await db.meeting.findFirst({ where: { id: meetingId }, select: { durationMs: true, speakerRefs: true } });
  if (!reunion) return { resultado: { omitida: "la reunión ya no existe" } };
  if (!reunion.durationMs) throw new ErrorTarea("La reunión no tiene duración: falta el audio.", { reintentable: true });

  const filas = await db.meetingTask.findMany({ where: { meetingId, kind: KIND_TRAMO, status: "hecha" }, select: { key: true, result: true } });
  const resultados = filas.flatMap((f) => {
    const r = leerResultadoDeTramo(f.result);
    return r ? [r] : [];
  });
  const cobertura = calcularCobertura(resultados.map((r) => ({ desdeMs: r.nucleoDesdeMs, hastaMs: r.nucleoHastaMs })), reunion.durationMs);
  if (cobertura < 1) {
    throw new ErrorTarea(`Todavía faltan tramos por transcribir (cobertura ${Math.round(cobertura * 100)} %).`, { reintentable: true });
  }

  const referencias = leerReferenciasElegidas(reunion.speakerRefs);
  const tramos: TramoParaUnir[] = resultados.map((r) => ({ tramo: tramoDeResultado(r), segmentos: r.segmentos }));
  const union = unirTramos(tramos, reunion.durationMs, referencias);

  // Las intervenciones: se reemplazan todas (así repetir la tarea no duplica nada).
  await db.meetingUtterance.deleteMany({ where: { meetingId } });
  for (let desde = 0; desde < union.segmentos.length; desde += LOTE_INTERVENCIONES) {
    const lote = union.segmentos.slice(desde, desde + LOTE_INTERVENCIONES);
    await db.meetingUtterance.createMany({
      data: lote.map((s, k) => ({ meetingId, idx: desde + k, startMs: s.inicioMs, endMs: s.finMs, speaker: s.hablante, text: s.texto })),
    });
  }

  // Los hablantes: se conserva lo que ya se haya nombrado y se quitan las etiquetas que ya no existen.
  for (const e of union.etiquetas) {
    await db.meetingSpeaker.upsert({
      where: { meetingId_label: { meetingId, label: e.etiqueta } },
      create: { meetingId, label: e.etiqueta, talkMs: e.talkMs, sampleStartMs: e.muestra?.desdeMs ?? null, sampleEndMs: e.muestra?.hastaMs ?? null },
      update: { talkMs: e.talkMs, sampleStartMs: e.muestra?.desdeMs ?? null, sampleEndMs: e.muestra?.hastaMs ?? null },
    });
  }
  await db.meetingSpeaker.deleteMany({ where: { meetingId, NOT: { label: { in: union.etiquetas.map((e) => e.etiqueta) } } } });

  // El texto completo, con los nombres que haya.
  const hablantes = await db.meetingSpeaker.findMany({ where: { meetingId }, select: { label: true, name: true } });
  const nombres = Object.fromEntries(hablantes.flatMap((h) => (h.name ? [[h.label as string, h.name as string]] : [])));
  const texto = formatearTranscripcion(union.segmentos, nombres, union.silencios);
  const subido = await deps.almacen.subir(`${prefijoDeReunion(meetingId)}transcripcion.txt`, new TextEncoder().encode(texto), "text/plain; charset=utf-8");

  const costoUsd = resultados.reduce((suma, r) => suma + r.costoUsd, 0);
  await db.meeting.update({
    where: { id: meetingId },
    data: {
      coverage: union.cobertura,
      silences: union.silencios as object[],
      transcriptUrl: subido.url,
      provider: resultados[0]?.proveedor ?? null,
      costUsd: costoUsd,
    },
  });
  return {
    resultado: {
      intervenciones: union.segmentos.length,
      hablantes: union.etiquetas.length,
      cobertura: union.cobertura,
      silencios: union.silencios.length,
      costoUsd,
    },
  };
};
