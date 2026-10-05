/**
 * El acta en el modo demo (DEMO_MODE=true).
 *
 * Sin base de datos ni claves: el acta se «redacta» con el MISMO motor de verdad (`acta.ts`: secciones por tema, pedido de cada
 * sección, limpieza, ensamblado y verificación) y el modelo simulado (`ia-simulada.ts`), así que lo que se ve es un acta real:
 * con su encabezado, asistentes, desarrollo con minutos enlazables al audio, decisiones, votaciones, compromisos y firmas.
 *
 * El avance es por tiempo (como el procesamiento simulado de la reunión): preparar, una sección cada ~2 s y armar. Aparece en
 * el Historial como cualquier otra generación. La reunión «agosto» falla la primera vez en una sección, para poder ver el
 * error y «Intentar de nuevo» (que conserva lo ya hecho).
 */
import { DEMO_USER, checkUsageLimitDemo, createGeneration, getPropertyById, saveFileBuffers, updateGeneration } from "@/lib/demo-store";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import {
  armarActa, construirPedidoDeSeccion, construirPrefijoDeActa, desescaparHtml, fechaDelActa, limpiarSeccion, planificarSecciones,
  type SeccionDeActa, type SeccionRedactada,
} from "./acta";
import { aActaDTO, type FilaDeActa } from "./acta-estado";
import { mensajeDeFallo } from "./cola";
import { asistentesDeReunion, vocesDeReunion, transcripcionParaIA } from "./contexto-reunion";
import { demoContextoDeActa, type ContextoDeActaDemo } from "./demo";
import type { ActaDTO, RequisitoActaDTO, RespuestaActa } from "./dto";
import { textoDeSeccionSimulado } from "./ia-simulada";

/** Cuánto dura cada paso simulado. */
const CALENTAR_MS = 1_500;
const SECCION_MS = 1_800;
const ARMAR_MS = 1_500;

/** La reunión de ejemplo cuyo acta falla la primera vez (para ver el error y «Intentar de nuevo»). */
export const REUNION_DEMO_QUE_FALLA = "reunion-demo-006";

type Estado = "procesando" | "lista" | "error";

type ActaDemo = {
  id: string;
  meetingId: string;
  userId: string;
  /** Desde cuándo «avanza» (ms). Al retomar, se corre hacia atrás para que lo ya hecho siga hecho. */
  inicio: number;
  creadaEn: number;
  /** Cuántas secciones tiene el plan. */
  total: number;
  /** La sección donde se detiene (la primera vez, en la reunión que falla); null si no falla. */
  fallaEnSeccion: number | null;
  estado: Estado;
  error: string | null;
  terminadaEn: number | null;
  /** Lo que sale al terminar. */
  conMarcadores: string | null;
  pendientes: string[];
  requisitos: RequisitoActaDTO[] | null;
};

type Almacen = { actas: ActaDemo[]; yaFallaron: string[] };
const global = globalThis as unknown as { __demoActas?: Almacen };
const almacen = (): Almacen => (global.__demoActas ??= { actas: [], yaFallaron: [] });

/** Solo para pruebas: olvida las actas del demo. */
export function reiniciarDemoActas(): void {
  global.__demoActas = undefined;
}

/* ── El tiempo ────────────────────────────────────────────────────────── */

/** Cuánto lleva «hecho» el acta a los `t` ms de avance: el progreso (0-100) y las secciones terminadas. */
export function avanceDeActaDemo(t: number, total: number): { progreso: number; hechas: number } {
  const calentar = Math.min(1, Math.max(0, t / CALENTAR_MS));
  const secciones = total > 0 ? Math.min(1, Math.max(0, (t - CALENTAR_MS) / (total * SECCION_MS))) : 1;
  const armar = Math.min(1, Math.max(0, (t - CALENTAR_MS - total * SECCION_MS) / ARMAR_MS));
  const hechas = t < CALENTAR_MS ? 0 : Math.min(total, Math.floor((t - CALENTAR_MS) / SECCION_MS));
  return { progreso: Math.round(5 * calentar + 85 * secciones + 10 * armar), hechas };
}

const duracionTotalMs = (total: number): number => CALENTAR_MS + total * SECCION_MS + ARMAR_MS;

/* ── El contenido ─────────────────────────────────────────────────────── */

type Contenido = { conMarcadores: string; limpio: string; pendientes: string[]; html: string };

/** Redacta el acta de verdad con el motor de `acta.ts`, con el modelo simulado en lugar de Claude. */
function redactarActaDemo(c: ContextoDeActaDemo): Contenido {
  const voces = vocesDeReunion(c.hablantes);
  const prefijo = construirPrefijoDeActa({
    datos: { propiedad: c.propiedad, tipo: c.tipo, fecha: c.fecha, duracionMs: c.duracionMs },
    voces,
    ficha: c.ficha,
    transcripcion: transcripcionParaIA(c.intervenciones.map((u) => ({ startMs: u.startMs, speaker: u.speaker, text: u.text }))),
  });
  const secciones = planificarSecciones(c.ficha, c.duracionMs);
  const ids = new Set([...(c.ficha?.decisiones ?? []).map((d) => d.id), ...(c.ficha?.compromisos ?? []).map((x) => x.id)]);
  const redactadas: SeccionRedactada[] = secciones.map((seccion) => {
    const pedido = construirPedidoDeSeccion({ seccion, total: secciones.length, ficha: c.ficha });
    const limpia = limpiarSeccion(textoDeSeccionSimulado(prefijo, pedido), { duracionS: Math.ceil(c.duracionMs / 1000), ids });
    return { seccion, markdown: limpia.markdown };
  });
  const armada = armarActa({
    datos: { propiedad: c.propiedad, tipo: c.tipo, fecha: c.fecha, duracionMs: c.duracionMs },
    ficha: c.ficha,
    secciones: redactadas,
    asistentes: asistentesDeReunion(c.ficha, voces),
  });
  const html = generatePdfHtml({ title: "Acta de reunión", propertyName: c.propiedad, period: fechaDelActa(c.fecha), content: armada.limpio, type: "acta" });
  return { conMarcadores: armada.conMarcadores, limpio: armada.limpio, pendientes: armada.pendientes, html };
}

/** La revisión de requisitos de ejemplo: cada pendiente «de dato» del acta (lugar, convocatoria, firmas) queda marcado. */
function requisitosDeEjemplo(limpio: string): RequisitoActaDTO[] {
  const falta = (clave: string) => limpio.includes(clave);
  const requisito = (item: string, pendiente: boolean, completo: string, faltante: string): RequisitoActaDTO => ({
    item, status: pendiente ? "pendiente" : "completo", detail: pendiente ? faltante : completo,
  });
  return [
    requisito("Tipo de reunión", false, "Reunión del consejo de administración.", ""),
    requisito("Fecha, hora y lugar de la reunión", falta("**Lugar:** [PENDIENTE"), "Fecha, hora y lugar aparecen.", "Falta el lugar de la reunión."),
    requisito("Convocatoria previa", falta("**Convocatoria:** [PENDIENTE"), "Se dice quién convocó y con cuánta anticipación.", "No se dice quién convocó ni con cuántos días de anticipación."),
    requisito("Lista de asistentes", falta("Listar asistentes"), "Los asistentes están listados con su cargo.", "No se pudo listar a los asistentes."),
    requisito("Verificación de quórum", true, "", "No se menciona el porcentaje de coeficientes presentes."),
    requisito("Orden del día", false, "El orden del día se desarrolla punto por punto.", ""),
    requisito("Votaciones con resultados numéricos", !limpio.includes("VOTACIONES"), "Las votaciones traen sus cifras.", "No hay votaciones registradas."),
    requisito("Compromisos con responsables", !limpio.includes("COMPROMISOS"), "Los compromisos traen responsable y fecha.", "No hay compromisos registrados."),
    requisito("Hora de cierre", false, "Se calcula con la duración de la grabación: hay que confirmarla.", ""),
    requisito("Datos para la firma", falta("Nombre: [PENDIENTE"), "Presidente y secretario aparecen para firmar.", "Falta el nombre de quien firma como secretario."),
  ];
}

/* ── Las generaciones del Historial ───────────────────────────────────── */

const salidaDeGeneracion = (id: string, c: Contenido): Record<string, string> => ({
  actaHtml: `/api/demo/files/${id}/acta`,
  actaMarkdown: `/api/demo/files/${id}/acta-markdown`,
  actaPendientes: JSON.stringify(c.pendientes),
});

function completar(a: ActaDemo, ahora: number): void {
  const ctx = demoContextoDeActa(a.userId, a.meetingId);
  if (!ctx) return;
  const contenido = redactarActaDemo(ctx);
  a.estado = "lista";
  a.terminadaEn = ahora;
  a.conMarcadores = contenido.conMarcadores;
  a.pendientes = contenido.pendientes;
  a.requisitos = requisitosDeEjemplo(contenido.limpio);
  saveFileBuffers(a.id, { actaHtml: contenido.html, actaMarkdown: desescaparHtml(contenido.limpio) });
  const tokens = Math.round(contenido.conMarcadores.length / 3) + a.total * 9_000;
  updateGeneration(a.id, {
    status: "completed",
    outputFiles: { ...salidaDeGeneracion(a.id, contenido), actaRequirements: JSON.stringify(a.requisitos) },
    tokensUsed: tokens,
    costUsd: Math.round(tokens * 0.000009 * 100) / 100,
    completedAt: new Date(ahora),
    errorMessage: null,
  });
}

function fallar(a: ActaDemo, seccion: SeccionDeActa | undefined): void {
  a.estado = "error";
  a.error = mensajeDeFallo("acta_seccion", { titulo: seccion?.titulo }, "El servicio de IA no respondió.", true);
  updateGeneration(a.id, { status: "failed", errorMessage: a.error });
}

/** Pone el acta en el estado que le toca según el tiempo que lleva. */
function avanzar(a: ActaDemo, ahora: number = Date.now()): void {
  if (a.estado !== "procesando") return;
  const t = ahora - a.inicio;
  if (a.fallaEnSeccion !== null && t >= CALENTAR_MS + (a.fallaEnSeccion + 1) * SECCION_MS) {
    const ctx = demoContextoDeActa(a.userId, a.meetingId);
    fallar(a, ctx ? planificarSecciones(ctx.ficha, ctx.duracionMs)[a.fallaEnSeccion] : undefined);
    return;
  }
  if (t >= duracionTotalMs(a.total)) completar(a, ahora);
}

function aDTO(a: ActaDemo, ahora: number = Date.now()): ActaDTO {
  avanzar(a, ahora);
  const t = ahora - a.inicio;
  const { progreso, hechas } = avanceDeActaDemo(t, a.total);
  const fila: FilaDeActa = {
    id: a.id,
    status: a.estado === "lista" ? "completed" : a.estado === "error" ? "failed" : "processing",
    // Como en la cola: un acta con error vuelve a 0 y una lista, a 100.
    progress: a.estado === "error" ? 0 : a.estado === "lista" ? 100 : Math.min(progreso, 99),
    createdAt: new Date(a.creadaEn),
    completedAt: a.terminadaEn ? new Date(a.terminadaEn) : null,
    errorMessage: a.error,
    outputFiles: a.estado === "lista"
      ? { actaHtml: `/api/demo/files/${a.id}/acta`, actaPendientes: JSON.stringify(a.pendientes), ...(a.requisitos ? { actaRequirements: JSON.stringify(a.requisitos) } : {}) }
      : null,
  };
  return aActaDTO(fila, { hechas: Math.min(hechas, a.total), total: a.total });
}

/* ── Lo que usan las rutas ────────────────────────────────────────────── */

/** Las actas de la reunión, la más reciente primero (a igual hora, la que se creó después). */
const delUsuario = (userId: string, meetingId: string): ActaDemo[] =>
  almacen().actas.filter((a) => a.userId === userId && a.meetingId === meetingId).reverse().sort((x, y) => y.creadaEn - x.creadaEn);

/** La acta más reciente de la reunión; con `conTexto`, también el acta con sus marcadores. */
export function demoActa(userId: string, meetingId: string, opciones: { conTexto?: boolean } = {}): RespuestaActa | null {
  if (!demoContextoDeActa(userId, meetingId)) return null;
  const a = delUsuario(userId, meetingId)[0];
  if (!a) return { acta: null, texto: null };
  const acta = aDTO(a);
  return { acta, texto: opciones.conTexto && a.estado === "lista" ? a.conMarcadores : null };
}

export type ResultadoDeActaDemo =
  | { ok: true; valor: { acta: ActaDTO; yaEnCurso: boolean } }
  | { ok: false; codigo: "no_existe" | "no_lista" | "sin_transcripcion" | "sin_cupo" | "no_en_error"; error: string };

/** Pide el acta de una reunión de ejemplo, o retoma la que falló (`reanudar`). */
export function demoIniciarActa(userId: string, meetingId: string, opciones: { reanudar?: string } = {}): ResultadoDeActaDemo {
  const c = demoContextoDeActa(userId, meetingId);
  if (!c) return { ok: false, codigo: "no_existe", error: "Reunión no encontrada" };
  if (!c.lista) return { ok: false, codigo: "no_lista", error: "Esta reunión todavía se está procesando." };
  if (!c.tieneTranscripcion) return { ok: false, codigo: "sin_transcripcion", error: "Esta reunión no tiene transcripción: no hay de dónde redactar el acta." };

  const ahora = Date.now();
  const propias = delUsuario(userId, meetingId);
  const cupo = () => checkUsageLimitDemo(userId);

  if (opciones.reanudar) {
    const a = propias.find((x) => x.id === opciones.reanudar);
    if (a) avanzar(a, ahora);
    if (!a || a.estado !== "error") return { ok: false, codigo: "no_en_error", error: "Esta acta no está en error." };
    const permiso = cupo();
    if (!permiso.allowed) return { ok: false, codigo: "sin_cupo", error: permiso.reason ?? "Llegaste al límite de generaciones de tu plan." };
    // Lo ya redactado se conserva: sigue desde donde se quedó.
    const hechasAntes = a.fallaEnSeccion ?? 0;
    a.estado = "procesando";
    a.error = null;
    a.fallaEnSeccion = null;
    a.inicio = ahora - (CALENTAR_MS + hechasAntes * SECCION_MS);
    updateGeneration(a.id, { status: "processing", errorMessage: null });
    return { ok: true, valor: { acta: aDTO(a, ahora), yaEnCurso: false } };
  }

  const enCurso = propias.find((x) => (avanzar(x, ahora), x.estado === "procesando"));
  if (enCurso) return { ok: true, valor: { acta: aDTO(enCurso, ahora), yaEnCurso: true } };

  const permiso = cupo();
  if (!permiso.allowed) return { ok: false, codigo: "sin_cupo", error: permiso.reason ?? "Llegaste al límite de generaciones de tu plan." };

  const propiedad = getPropertyById(c.propertyId, userId);
  if (!propiedad) return { ok: false, codigo: "no_existe", error: "Reunión no encontrada" };
  const secciones = planificarSecciones(c.ficha, c.duracionMs);
  const generacion = createGeneration({
    userId: DEMO_USER.id,
    propertyId: c.propertyId,
    type: "acta",
    status: "processing",
    month: c.fecha.getMonth() + 1,
    year: c.fecha.getFullYear(),
    inputFiles: [],
    inputText: `Desde la reunión «${c.titulo}»`,
    outputFiles: null,
    tokensUsed: 0,
    costUsd: 0,
    errorMessage: null,
    meetingId,
    property: propiedad,
  });
  const falla = meetingId === REUNION_DEMO_QUE_FALLA && !almacen().yaFallaron.includes(meetingId);
  if (falla) almacen().yaFallaron.push(meetingId);
  const a: ActaDemo = {
    id: generacion.id,
    meetingId,
    userId,
    inicio: ahora,
    creadaEn: ahora,
    total: secciones.length,
    fallaEnSeccion: falla ? Math.min(1, secciones.length - 1) : null,
    estado: "procesando",
    error: null,
    terminadaEn: null,
    conMarcadores: null,
    pendientes: [],
    requisitos: null,
  };
  almacen().actas.push(a);
  return { ok: true, valor: { acta: aDTO(a, ahora), yaEnCurso: false } };
}
