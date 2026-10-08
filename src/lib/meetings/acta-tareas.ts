/**
 * Las tareas del acta. Cada acta es una `Generation` (con `meetingId`) y tres tipos de tarea con claves que llevan su
 * identificador (`acta-orquestador.ts` las encola, en este orden):
 *
 *  1. `acta_calentar`: escribe en la caché de 1 h del servicio la transcripción COMPLETA (~100–200 mil tokens). Si no se
 *     hiciera, las secciones —que van en paralelo— la escribirían todas a la vez y se pagaría una vez por sección.
 *  2. `acta_seccion` (una por tema, hasta 12): la IA redacta una sección con la transcripción completa delante (leída de
 *     la caché) y el pedido de esa sección. Lo que devuelve se limpia (sin HTML, sin marcadores inventados) y se guarda en el
 *     `result` de la tarea: una sección hecha no se paga otra vez si otra falla y se reintenta.
 *  3. `acta_final`: junta las secciones con lo que se arma con reglas (`armarActa`), verifica que cada decisión y compromiso
 *     quedó recogido, sube `acta.html`, `acta.md` y `acta-referencias.md`, revisa los requisitos legales y deja la
 *     `Generation` «completed» con sus costos.
 *
 * A diferencia del análisis (que omite lo que la IA no pudo y deja la reunión lista), aquí un fallo SÍ detiene el acta: un
 * acta con una sección que falta no sirve. Se reintenta solo (30 s, 2 min, 10 min) y, si no hay arreglo, el acta queda en
 * error con su mensaje y «Intentar de nuevo» retoma desde lo que falló (`reanudarActa`).
 *
 * El esfuerzo del modelo y el sistema son los mismos en todas las llamadas del acta, también en los reintentos: cambiarlos
 * invalida la caché y se volvería a pagar la transcripción.
 */
import { db } from "@/lib/db";
import { TIPOS } from "@/lib/consumo/funciones";
import { conConsumo, registrarConsumo } from "@/lib/consumo/registrar";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { iaDe, timeoutDe } from "./analisis";
import {
  SISTEMA_DE_ACTA, armarActa, construirPedidoDeSeccion, construirPrefijoDeActa, desescaparHtml, fechaDelActa, leerSeccion, limpiarSeccion,
  type SeccionRedactada,
} from "./acta";
import type { TareaReclamada } from "./cola";
import { cargarContextoDeReunion, transcripcionParaIA, type ContextoDeReunion } from "./contexto-reunion";
import { ErrorTarea, type DepsProceso, type Manejador } from "./contratos";
import { ErrorIA, USO_VACIO, aErrorIA, esfuerzoDeReuniones, modeloDeReuniones, sumarUso, tokensDeUso, type RespuestaTexto, type UsoIA } from "./ia";
import { MAX_INTENTOS_TAREA } from "./tipos";
import { KIND_ACTA_CALENTAR, KIND_ACTA_SECCION, generacionDeClaveDeActa, prefijoDeActa } from "./transcripcion/claves";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** El `uso` guardado en el `result` de una tarea (con tolerancia: lo que no cuadra cuenta como cero). */
export function leerUsoGuardado(v: unknown): UsoIA {
  if (!esObjeto(v)) return USO_VACIO;
  const n = (x: unknown) => (esNumero(x) && x > 0 ? x : 0);
  return { entrada: n(v.entrada), salida: n(v.salida), cacheLectura: n(v.cacheLectura), cacheEscritura: n(v.cacheEscritura), costoUsd: n(v.costoUsd) };
}

/* ════════════════════════════════════════════════════════════════════
   Lo común
   ════════════════════════════════════════════════════════════════════ */

type ActaEnCurso = { generationId: string; userId: string; propertyId: string };

/**
 * El acta a la que pertenece la tarea, o el resultado con el que la tarea termina sin hacer nada (el acta ya está lista o ya
 * no existe). Si el acta se detuvo por un fallo, la tarea no se ejecuta: queda «fallida» y se retoma con «Intentar de nuevo».
 */
async function actaDeLaTarea(tarea: TareaReclamada): Promise<{ acta: ActaEnCurso } | { omitir: string }> {
  const generationId = generacionDeClaveDeActa(tarea.key);
  if (!generationId) throw new ErrorTarea("Esta tarea no dice de qué acta es.", { reintentable: false });
  const g = await db.generation.findFirst({ where: { id: generationId, meetingId: tarea.meetingId }, select: { id: true, userId: true, propertyId: true, status: true } });
  if (!g) return { omitir: "el acta ya no existe" };
  if (g.status === "completed") return { omitir: "el acta ya está lista" };
  if (g.status === "failed") throw new ErrorTarea("El acta se detuvo antes de terminar.", { reintentable: false });
  return { acta: { generationId, userId: g.userId, propertyId: g.propertyId } };
}

/** Lo que comparte todo el acta con la IA (byte a byte igual en cada llamada: así la caché del servicio lo reutiliza). */
export function prefijoDe(c: ContextoDeReunion): string {
  return construirPrefijoDeActa({
    datos: { propiedad: c.propiedad, tipo: c.tipo, fecha: c.fecha, duracionMs: c.duracionMs },
    voces: c.voces,
    ficha: c.ficha,
    transcripcion: transcripcionParaIA(c.lineas),
  });
}

/* ════════════════════════════════════════════════════════════════════
   acta_calentar
   ════════════════════════════════════════════════════════════════════ */

/**
 * Pone la transcripción en la caché del servicio. Nunca detiene el acta por sí sola: si falla, se reintenta mientras valga la
 * pena y, si ya no, el acta sigue SIN caché (el orquestador entonces redacta una sección primero para escribirla y las demás
 * la leen). Un fallo que no se arregla (credenciales, saldo) lo dirán las secciones con su propio mensaje.
 */
export const calentarActaTarea: Manejador = async ({ tarea, presupuestoMs, senal, deps }) => {
  const r = await actaDeLaTarea(tarea);
  if ("omitir" in r) return { resultado: { omitida: r.omitir } };
  const contexto = await cargarContextoDeReunion(tarea.meetingId);
  if (!contexto) return { resultado: { omitida: "la reunión ya no existe" } };

  try {
    const calentado = await iaDe(deps).calentar({
      etiqueta: "el acta",
      sistema: SISTEMA_DE_ACTA,
      compartido: prefijoDe(contexto),
      esfuerzo: esfuerzoDeReuniones(),
      timeoutMs: timeoutDe(presupuestoMs),
      senal,
    });
    return { resultado: { calentada: true, uso: calentado.uso, modelo: calentado.modelo } };
  } catch (e) {
    const error = aErrorIA(e);
    if (error.reintentable && tarea.attempts < MAX_INTENTOS_TAREA) throw error;
    console.error(`[meetings/acta] no se pudo calentar la caché (${tarea.key}): ${error.message}`);
    return { resultado: { calentada: false, motivo: error.message, uso: USO_VACIO } };
  }
};

/* ════════════════════════════════════════════════════════════════════
   acta_seccion
   ════════════════════════════════════════════════════════════════════ */

export type ResultadoDeSeccionDeActa = {
  k: number;
  markdown: string;
  /** Marcadores que la IA escribió y no existen (se quitaron). */
  ignorados: string[];
  uso: UsoIA;
  modelo?: string;
};

/** El `result` de una tarea `acta_seccion`, leído con tolerancia; null si no se puede usar. */
export function leerResultadoDeSeccion(json: unknown): ResultadoDeSeccionDeActa | null {
  if (!esObjeto(json) || !esNumero(json.k) || typeof json.markdown !== "string" || !json.markdown.trim()) return null;
  return {
    k: json.k,
    markdown: json.markdown,
    ignorados: Array.isArray(json.ignorados) ? json.ignorados.filter((x): x is string => typeof x === "string") : [],
    uso: leerUsoGuardado(json.uso),
    modelo: typeof json.modelo === "string" ? json.modelo : undefined,
  };
}

export const seccionDeActaTarea: Manejador = async ({ tarea, presupuestoMs, senal, deps }) => {
  const seccion = leerSeccion(tarea.payload.seccion);
  const total = Number(tarea.payload.total);
  if (!seccion || !Number.isFinite(total) || total < 1) throw new ErrorTarea("Esta tarea no dice qué sección del acta redactar.", { reintentable: false });

  const r = await actaDeLaTarea(tarea);
  if ("omitir" in r) return { resultado: { omitida: r.omitir } };
  const contexto = await cargarContextoDeReunion(tarea.meetingId);
  if (!contexto) return { resultado: { omitida: "la reunión ya no existe" } };

  let respuesta: RespuestaTexto;
  try {
    respuesta = await iaDe(deps).generarTexto({
      etiqueta: `la sección ${seccion.k + 1} del acta`,
      sistema: SISTEMA_DE_ACTA,
      compartido: prefijoDe(contexto),
      turnos: [{ rol: "user", texto: construirPedidoDeSeccion({ seccion, total, ficha: contexto.ficha }) }],
      esfuerzo: esfuerzoDeReuniones(),
      timeoutMs: timeoutDe(presupuestoMs),
      senal,
    });
  } catch (e) {
    throw aErrorIA(e);
  }

  const ids = new Set([...(contexto.ficha?.decisiones ?? []).map((d) => d.id), ...(contexto.ficha?.compromisos ?? []).map((c) => c.id)]);
  const limpia = limpiarSeccion(respuesta.texto, { duracionS: Math.ceil(contexto.duracionMs / 1000), ids });
  if (!limpia.markdown) throw new ErrorIA(`La IA no devolvió texto para la sección ${seccion.k + 1} del acta. Se vuelve a intentar.`, { reintentable: true });

  return {
    resultado: { k: seccion.k, markdown: limpia.markdown, ignorados: limpia.ignorados, uso: respuesta.uso, modelo: respuesta.modelo } satisfies ResultadoDeSeccionDeActa,
  };
};

/* ════════════════════════════════════════════════════════════════════
   acta_final
   ════════════════════════════════════════════════════════════════════ */

/** Los archivos de un acta, en el almacén. */
export const rutaDeArchivoDeActa = (generationId: string, nombre: "acta.html" | "acta.md" | "acta-referencias.md"): string => `generations/${generationId}/${nombre}`;

/** Revisa qué requisitos legales cumple el acta (Haiku). Si falla, el acta sale igual, sin esa revisión. */
async function revisarRequisitos(
  deps: DepsProceso,
  actaMarkdown: string,
  contexto?: { userId: string; ref: { tipo: "reunion"; id: string } },
): Promise<unknown[] | null> {
  try {
    const revisar = deps.requisitosDeActa ?? (async (texto: string) => (await import("@/lib/ai/acta-requirements")).analyzeActaRequirements(texto));
    // La revisión se carga a quien pidió el acta y a su reunión (la llamada toma ambos del contexto).
    const requisitos = await (contexto ? conConsumo(contexto, () => revisar(actaMarkdown)) : revisar(actaMarkdown));
    return requisitos.length > 0 ? requisitos : null;
  } catch (e) {
    console.error("[meetings/acta] no se pudieron revisar los requisitos del acta:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const actaFinalTarea: Manejador = async ({ tarea, deps }) => {
  const r = await actaDeLaTarea(tarea);
  if ("omitir" in r) return { resultado: { omitida: r.omitir } };
  const { generationId, userId } = r.acta;
  const total = Number(tarea.payload.total);

  const contexto = await cargarContextoDeReunion(tarea.meetingId);
  if (!contexto) return { resultado: { omitida: "la reunión ya no existe" } };

  // Lo que hicieron las demás tareas del acta: las secciones redactadas y lo que costó todo.
  const hechas = await db.meetingTask.findMany({
    where: { meetingId: tarea.meetingId, status: "hecha", key: { startsWith: prefijoDeActa(generationId) } },
    select: { kind: true, key: true, payload: true, result: true },
  });
  let uso = USO_VACIO;
  const secciones: SeccionRedactada[] = [];
  for (const t of hechas) {
    if (t.kind === KIND_ACTA_CALENTAR) uso = sumarUso(uso, leerUsoGuardado(esObjeto(t.result) ? t.result.uso : null));
    if (t.kind !== KIND_ACTA_SECCION) continue;
    const seccion = leerSeccion(esObjeto(t.payload) ? t.payload.seccion : null);
    const resultado = leerResultadoDeSeccion(t.result);
    if (!seccion || !resultado) continue;
    uso = sumarUso(uso, resultado.uso);
    secciones.push({ seccion, markdown: resultado.markdown });
  }
  secciones.sort((a, b) => a.seccion.k - b.seccion.k);
  if (Number.isFinite(total) && secciones.length !== total) {
    throw new ErrorTarea(`Faltan secciones del acta (${secciones.length} de ${total}).`, { reintentable: true });
  }

  const armada = armarActa({
    datos: { propiedad: contexto.propiedad, tipo: contexto.tipo, fecha: contexto.fecha, duracionMs: contexto.duracionMs },
    ficha: contexto.ficha,
    secciones,
    asistentes: contexto.asistentes,
  });

  const marca = await db.user.findUnique({ where: { id: userId }, select: { company: true, logoUrl: true, brandColor: true } }).catch(() => null);
  const html = generatePdfHtml({
    title: "Acta de reunión",
    propertyName: contexto.propiedad,
    period: fechaDelActa(contexto.fecha),
    content: armada.limpio,
    type: "acta",
    companyName: marca?.company ?? null,
    logoUrl: marca?.logoUrl ?? null,
    brandColor: marca?.brandColor ?? null,
  });

  const texto = (contenido: string) => new TextEncoder().encode(contenido);
  const [archivoHtml, archivoMd, archivoReferencias] = await Promise.all([
    deps.almacen.subir(rutaDeArchivoDeActa(generationId, "acta.html"), texto(html), "text/html; charset=utf-8"),
    // El markdown que se descarga es texto plano: lo que se escapó para el HTML vuelve a ser `&`, `<` y `>`.
    deps.almacen.subir(rutaDeArchivoDeActa(generationId, "acta.md"), texto(desescaparHtml(armada.limpio)), "text/markdown; charset=utf-8"),
    // Con marcadores: lo que lee la vista de la app (cada minuto es un enlace al audio, cada decisión se ve recogida).
    deps.almacen.subir(rutaDeArchivoDeActa(generationId, "acta-referencias.md"), texto(armada.conMarcadores), "text/markdown; charset=utf-8"),
  ]);

  const requisitos = await revisarRequisitos(deps, desescaparHtml(armada.limpio), { userId, ref: { tipo: "reunion", id: tarea.meetingId } });

  const salida: Record<string, string> = {
    actaHtml: archivoHtml.url,
    actaMarkdown: archivoMd.url,
    actaReferencias: archivoReferencias.url,
    actaPendientes: JSON.stringify(armada.pendientes),
    ...(requisitos ? { actaRequirements: JSON.stringify(requisitos) } : {}),
  };
  const tokens = Math.round(tokensDeUso(uso));
  // Solo quien la deja «completed» registra el uso: un reintento tras una muerte a medias no lo duplica.
  const cierre = await db.generation.updateMany({
    where: { id: generationId, status: { in: ["processing", "pending"] } },
    data: { status: "completed", progress: 100, outputFiles: salida, tokensUsed: tokens, costUsd: uso.costoUsd, completedAt: deps.ahora(), errorMessage: null },
  });
  if (cierre.count === 1 && tokens > 0) {
    await registrarConsumo({
      tipo: TIPOS.reunionActa, proveedor: "anthropic", modelo: modeloDeReuniones(), tokens: uso, costoUsd: uso.costoUsd,
      tokensDelRegistro: tokens, userId, ref: { tipo: "reunion", id: tarea.meetingId },
    });
  }

  return {
    resultado: {
      secciones: secciones.length,
      pendientes: armada.pendientes.length,
      requisitos: requisitos ? requisitos.length : 0,
      tokens,
      costoUsd: uso.costoUsd,
    },
  };
};
