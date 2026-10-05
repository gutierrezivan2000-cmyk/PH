/**
 * Los manejadores de las tareas de la cola: uno por tipo (`kind`). Cada uno recibe la tarea, cuánto tiempo tiene y
 * las dependencias (almacén, reloj), y devuelve su resultado, o `{ continuar: true }` si hizo una parte y sigue
 * en otra pasada. Si falla, lanza `ErrorTarea` diciendo si vale la pena reintentar.
 *
 * Todo es idempotente: una tarea puede ejecutarse dos veces (se murió la función, el vigilante la rescató) y debe
 * dejar el mismo resultado sin duplicar nada.
 */
import { db } from "@/lib/db";
import { prefijoDeReunion } from "./almacen";
import {
  armarAudio, ensamblarSesion, leerSegmentos, normalizadoMs, rutaDeSegmento, siguienteSegmento, type SegmentoGuardado,
} from "./audio";
import { ErrorTarea, type Manejador } from "./contratos";
import { normalizarFuente } from "./ffmpeg";
import { detectarHuecos, extensionDeGrabacion, mimeBase } from "./grabadora-partes";
import { actaFinalTarea, calentarActaTarea, seccionDeActaTarea } from "./acta-tareas";
import { analizarBloqueTarea, fichaTarea } from "./analisis";
import { comprobarCupoDeReuniones } from "./cupos";
import { avanzar } from "./orquestador";
import { KIND_ACTA_CALENTAR, KIND_ACTA_FINAL, KIND_ACTA_SECCION } from "./transcripcion/claves";
import { transcribirTramoTarea, unirTarea, vocesTarea } from "./transcripcion/manejadores";

// Los contratos viven en `contratos.ts` (para que los manejadores de otros módulos no dependan de este archivo).
export { ErrorTarea, aErrorTarea } from "./contratos";
export type { ContextoTarea, DepsProceso, Manejador, ResultadoManejador } from "./contratos";

/* ════════════════════════════════════════════════════════════════════
   ensamblar_sesion
   ════════════════════════════════════════════════════════════════════ */

/** Une las partes que llegaron de la grabadora en un solo archivo por sesión. */
export const ensamblarSesionTarea: Manejador = async ({ tarea, senal, deps }) => {
  const sourceId = String(tarea.payload.sourceId ?? "");
  const fuente = await db.meetingSource.findFirst({ where: { id: sourceId, meetingId: tarea.meetingId } });
  if (!fuente) return { resultado: { omitida: "la fuente ya no existe" } };
  if (fuente.url) return { resultado: { yaEnsamblada: true } }; // un reintento tras haber terminado

  const partes = await db.meetingLivePart.findMany({
    where: { meetingId: tarea.meetingId, session: fuente.session ?? -1, seq: { gte: 0 } },
    orderBy: { seq: "asc" },
  });
  if (partes.length === 0) {
    throw new ErrorTarea("No pudimos unir la grabación: no llegó audio de esta sesión. Vuelve a grabar o sube un archivo.", { reintentable: false });
  }
  const ext = extensionDeGrabacion(partes[0].mimeType) ?? "webm";
  const mime = mimeBase(partes[0].mimeType) || "audio/webm";
  const pathname = `${prefijoDeReunion(tarea.meetingId)}fuentes/sesion-${fuente.session}.${ext}`;
  const r = await ensamblarSesion(deps.almacen, partes.map((p) => ({ url: p.url, bytes: p.bytes })), pathname, mime, senal);

  await db.meetingSource.update({
    where: { id: fuente.id },
    data: { url: r.url, pathname: r.pathname, sizeBytes: r.bytes, mimeType: mime },
  });
  // Un hueco (una parte que nunca llegó) deja ~30 s sin audio; se anota para que se pueda decir.
  const huecos = detectarHuecos(partes.map((p) => p.seq)).length;
  return { resultado: { partes: partes.length, huecos, bytes: r.bytes } };
};

/* ════════════════════════════════════════════════════════════════════
   normalizar
   ════════════════════════════════════════════════════════════════════ */

/** Cuánto antes de que se acabe el tiempo hay que pedirle a ffmpeg que pare (cerrar con calma, subir el último segmento). */
const CIERRE_DE_FFMPEG_MS = 20_000;

/**
 * Convierte una fuente a MP3 normalizado en segmentos de 10 min, subiendo y anotando cada uno apenas termina. Si se
 * acaba el tiempo, para de forma limpia y la siguiente pasada sigue desde lo normalizado (`-ss`).
 */
export const normalizarTarea: Manejador = async ({ tarea, presupuestoMs, senal, deps }) => {
  const sourceId = String(tarea.payload.sourceId ?? "");
  const fuente = await db.meetingSource.findFirst({ where: { id: sourceId, meetingId: tarea.meetingId } });
  if (!fuente) return { resultado: { omitida: "la fuente ya no existe" } };
  if (fuente.status === "normalizada") return { resultado: { yaNormalizada: true } };
  if (!fuente.url) throw new ErrorTarea("La fuente todavía no está lista para prepararse.", { reintentable: true });

  const prefijo = prefijoDeReunion(tarea.meetingId);
  const segmentos: SegmentoGuardado[] = leerSegmentos(fuente.segments);
  const sig = siguienteSegmento(segmentos);
  await db.meetingSource.update({ where: { id: fuente.id }, data: { status: "normalizando" } });

  const r = await normalizarFuente({
    almacen: deps.almacen,
    url: fuente.url,
    desdeMs: sig.desdeMs,
    numeroInicial: sig.numero,
    presupuestoMs: Math.max(5_000, presupuestoMs - CIERRE_DE_FFMPEG_MS),
    senal,
    ffmpeg: deps.ffmpeg,
    tramoMs: deps.tramoMs,
    alTerminarSegmento: async (s, contexto) => {
      const subido = await deps.almacen.subir(rutaDeSegmento(prefijo, fuente.id, s.n), s.datos, "audio/mpeg");
      segmentos.push({ n: s.n, url: subido.url, durationMs: s.duracionMs, bytes: s.datos.byteLength });
      const hecho = normalizadoMs(segmentos);
      // La duración total: la del contenedor si la trae; si no, se estima por lo que se ha leído del archivo.
      const estimada = contexto.duracionContenedorMs ?? Math.round(hecho / Math.max(0.02, contexto.fraccion));
      await db.meetingSource.update({
        where: { id: fuente.id },
        data: { segments: segmentos as object[], normalizedMs: hecho, durationMs: Math.max(hecho, estimada), status: "normalizando" },
      });
      // El avance de la reunión se actualiza a cada segmento (si no, esperaría a que termine una tarea que puede durar minutos).
      await avanzar(tarea.meetingId).catch(() => {});
    },
  });

  if (r.completo) {
    const total = normalizadoMs(segmentos);
    await db.meetingSource.update({ where: { id: fuente.id }, data: { status: "normalizada", normalizedMs: total, durationMs: total, segments: segmentos as object[] } });
    return { resultado: { segmentos: segmentos.length, durationMs: total } };
  }
  // Se acabó el tiempo. Si en esta pasada no se avanzó nada, seguir igual daría vueltas en vano: cuenta como fallo.
  if (r.segmentos === 0) throw new ErrorTarea("El audio no avanzó en esta pasada.", { reintentable: true });
  return { continuar: true };
};

/* ════════════════════════════════════════════════════════════════════
   armar_audio
   ════════════════════════════════════════════════════════════════════ */

/** Une los segmentos de todas las fuentes en `audio.mp3` y fija la duración de la reunión y el inicio de cada fuente. */
export const armarAudioTarea: Manejador = async ({ tarea, senal, deps }) => {
  const fuentes = await db.meetingSource.findMany({ where: { meetingId: tarea.meetingId }, orderBy: { idx: "asc" } });
  const utiles = fuentes.filter((f) => f.status !== "error");
  if (utiles.length === 0) throw new ErrorTarea("No hay audio que unir.", { reintentable: false });
  if (utiles.some((f) => f.status !== "normalizada")) throw new ErrorTarea("Todavía hay audio por preparar.", { reintentable: true });

  const pathname = `${prefijoDeReunion(tarea.meetingId)}audio.mp3`;
  const armado = await armarAudio(
    deps.almacen,
    pathname,
    utiles.map((f) => ({ id: f.id, idx: f.idx, segmentos: leerSegmentos(f.segments) })),
    senal,
  );
  for (const f of utiles) {
    await db.meetingSource.update({ where: { id: f.id }, data: { offsetMs: Math.round(armado.offsets.get(f.id) ?? 0) } });
  }
  const duracionMs = Math.round(armado.durationMs);

  // El cupo de horas del plan: con la duración ya conocida. Si no alcanza, el audio se conserva y la reunión espera en
  // «sin_cupo» (con el motivo) en vez de gastar la transcripción.
  const dueno = await db.meeting.findFirst({ where: { id: tarea.meetingId }, select: { userId: true } });
  const cupo = dueno ? await comprobarCupoDeReuniones(dueno.userId, duracionMs, tarea.meetingId) : null;
  const sinCupo = cupo !== null && !cupo.permitido;
  await db.meeting.update({
    where: { id: tarea.meetingId },
    data: { audioUrl: armado.url, durationMs: duracionMs, ...(sinCupo ? { status: "sin_cupo", stage: null, progress: 0, errorMessage: cupo.mensaje } : {}) },
  });
  return { resultado: { durationMs: armado.durationMs, bytes: armado.bytes, ...(sinCupo ? { sinCupo: true } : {}) } };
};

/** Todos los manejadores de la cola. Cada hito agrega los suyos aquí. */
export const MANEJADORES: Record<string, Manejador> = {
  ensamblar_sesion: ensamblarSesionTarea,
  normalizar: normalizarTarea,
  armar_audio: armarAudioTarea,
  transcribir_tramo: transcribirTramoTarea,
  voces: vocesTarea,
  unir: unirTarea,
  analizar_bloque: analizarBloqueTarea,
  ficha: fichaTarea,
  [KIND_ACTA_CALENTAR]: calentarActaTarea,
  [KIND_ACTA_SECCION]: seccionDeActaTarea,
  [KIND_ACTA_FINAL]: actaFinalTarea,
};
