/**
 * Cliente de la API de Reuniones para las pantallas.
 *
 * Cada función devuelve datos ya tipados o lanza `ErrorApi` con un mensaje en
 * español listo para mostrar: el que mandó el servidor, o uno por defecto según
 * el estado (una respuesta HTML de un 504 de la plataforma no se puede leer, y
 * «Unexpected token <» no es un mensaje para una persona).
 */
import type { ClienteDeActa } from "./controlador-acta";
import type { ActaDTO, EstadoProcesoDTO, HablanteDTO, PaginaDeIntervenciones, PersonaDTO, RespuestaActa, ReunionDetalle, ReunionResumen } from "./dto";
import type { PedidoDeHablante } from "./nombres";

export class ErrorApi extends Error {
  readonly status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = "ErrorApi";
    this.status = status;
  }
}

function mensajePorEstado(status: number): string {
  if (status === 401) return "Tu sesión terminó. Vuelve a iniciar sesión.";
  if (status === 404) return "No lo encontramos. Puede que ya no exista.";
  if (status === 413) return "El archivo es demasiado grande para enviarlo así.";
  if (status >= 500) return "Tuvimos un problema de nuestro lado. Inténtalo de nuevo en un momento.";
  return "Algo salió mal. Inténtalo de nuevo.";
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ErrorApi("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.", 0);
  }
  let cuerpo: unknown = null;
  try {
    cuerpo = await res.json();
  } catch {
    /* sin cuerpo JSON (por ejemplo, una página de error de la plataforma) */
  }
  if (!res.ok) {
    const mensaje = (cuerpo as { error?: unknown } | null)?.error;
    throw new ErrorApi(typeof mensaje === "string" && mensaje ? mensaje : mensajePorEstado(res.status), res.status);
  }
  return cuerpo as T;
}

const enJson = (metodo: string, cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

/* ── Reuniones ───────────────────────────────────────────────────────── */

export async function listarReuniones(propertyId?: string): Promise<ReunionResumen[]> {
  const q = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : "";
  return (await pedir<{ items: ReunionResumen[] }>(`/api/meetings${q}`)).items;
}

export async function crearReunion(datos: {
  propertyId: string;
  type?: string;
  title?: string;
  date?: string;
}): Promise<ReunionResumen> {
  return (await pedir<{ meeting: ReunionResumen }>("/api/meetings", enJson("POST", datos))).meeting;
}

export function obtenerReunion(id: string): Promise<ReunionDetalle> {
  return pedir<ReunionDetalle>(`/api/meetings/${encodeURIComponent(id)}`);
}

export async function actualizarReunion(
  id: string,
  cambios: { title?: string; type?: string; date?: string; consentAt?: string | null },
): Promise<ReunionResumen> {
  return (await pedir<{ meeting: ReunionResumen }>(`/api/meetings/${encodeURIComponent(id)}`, enJson("PATCH", cambios))).meeting;
}

export async function eliminarReunion(id: string): Promise<void> {
  await pedir<{ ok: true }>(`/api/meetings/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ── Personas de la copropiedad ──────────────────────────────────────── */

export async function listarPersonas(propertyId: string): Promise<PersonaDTO[]> {
  return (await pedir<{ items: PersonaDTO[] }>(`/api/properties/${encodeURIComponent(propertyId)}/people`)).items;
}

export async function crearPersona(propertyId: string, datos: { name: string; role?: string | null }): Promise<PersonaDTO> {
  return (await pedir<{ person: PersonaDTO }>(`/api/properties/${encodeURIComponent(propertyId)}/people`, enJson("POST", datos))).person;
}

/* ── Archivos de la reunión ──────────────────────────────────────────── */

export async function quitarFuente(meetingId: string, sourceId: string): Promise<void> {
  await pedir<{ ok: true }>(`/api/meetings/${encodeURIComponent(meetingId)}/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
}

/** Cierra la captura y manda la reunión a procesar (idempotente en el servidor). */
export async function procesarReunion(meetingId: string): Promise<{ status: string }> {
  return pedir<{ status: string }>(`/api/meetings/${encodeURIComponent(meetingId)}/process`, { method: "POST" });
}

/** Cómo va el procesamiento (liviano: la página lo consulta cada pocos segundos). Además empuja el trabajo en el servidor. */
export function obtenerEstado(meetingId: string): Promise<EstadoProcesoDTO> {
  return pedir<EstadoProcesoDTO>(`/api/meetings/${encodeURIComponent(meetingId)}/status`);
}

/** «Reintentar» una reunión en error: vuelve a intentar solo lo que falló. */
export async function reintentarReunion(meetingId: string): Promise<{ status: string }> {
  return pedir<{ status: string }>(`/api/meetings/${encodeURIComponent(meetingId)}/retry`, { method: "POST" });
}

/**
 * «Generar el resumen otra vez»: vuelve a analizar solo los fragmentos que la IA no pudo (y rehace la ficha). La reunión pasa
 * a «procesando» mientras tanto; la transcripción sigue a la vista.
 */
export async function reanalizarResumen(meetingId: string): Promise<{ status: string; fragmentos: number }> {
  return pedir<{ status: string; fragmentos: number }>(`/api/meetings/${encodeURIComponent(meetingId)}/reanalyze`, { method: "POST" });
}

/* ── Transcripción ───────────────────────────────────────────────────── */

/**
 * Una página de la transcripción: las intervenciones que empiezan en `[desdeMs, hastaMs)` (30 min como mucho) o, con `q`,
 * las coincidencias de toda la reunión. `siguienteMs` dice desde dónde pedir lo que sigue (null: no hay más).
 */
export function listarIntervenciones(
  meetingId: string,
  { desdeMs, hastaMs, q }: { desdeMs?: number; hastaMs?: number; q?: string } = {},
): Promise<PaginaDeIntervenciones> {
  const params = new URLSearchParams();
  if (desdeMs !== undefined) params.set("desde", String(Math.max(0, Math.round(desdeMs))));
  if (hastaMs !== undefined) params.set("hasta", String(Math.round(hastaMs)));
  if (q) params.set("q", q);
  const qs = params.toString();
  return pedir<PaginaDeIntervenciones>(`/api/meetings/${encodeURIComponent(meetingId)}/utterances${qs ? `?${qs}` : ""}`);
}

/** Dirección de la descarga de la transcripción completa (.txt). */
export const urlDeTranscripcion = (meetingId: string): string => `/api/meetings/${encodeURIComponent(meetingId)}/transcript`;

/** Dirección del audio de la reunión (el reproductor lo pide por rangos). */
export const urlDeAudio = (meetingId: string): string => `/api/meetings/${encodeURIComponent(meetingId)}/audio`;

/**
 * Guarda los nombres de las voces. Dos voces con el mismo nombre se fusionan en una (la que más habla); la respuesta trae las
 * voces que quedan, para que la pantalla se ponga al día.
 */
export async function guardarHablantes(meetingId: string, hablantes: PedidoDeHablante[]): Promise<HablanteDTO[]> {
  return (await pedir<{ speakers: HablanteDTO[] }>(`/api/meetings/${encodeURIComponent(meetingId)}/speakers`, enJson("PUT", { hablantes }))).speakers;
}

/* ── Acta ────────────────────────────────────────────────────────────── */

/** El acta más reciente de la reunión; con `texto`, también el acta con sus marcadores (solo si está lista). */
export function obtenerActa(meetingId: string, { texto = false }: { texto?: boolean } = {}): Promise<RespuestaActa> {
  return pedir<RespuestaActa>(`/api/meetings/${encodeURIComponent(meetingId)}/acta${texto ? "?texto=1" : ""}`);
}

/** Pide el acta de la reunión (si ya hay una en curso, devuelve esa). */
export function pedirActa(meetingId: string): Promise<{ acta: ActaDTO | null; yaEnCurso: boolean }> {
  return pedir(`/api/meetings/${encodeURIComponent(meetingId)}/acta`, enJson("POST", {}));
}

/** «Intentar de nuevo» de un acta con error: lo ya redactado se conserva y solo se repite lo que falló. */
export function reanudarActa(meetingId: string, actaId: string): Promise<{ acta: ActaDTO | null; yaEnCurso: boolean }> {
  return pedir(`/api/meetings/${encodeURIComponent(meetingId)}/acta`, enJson("POST", { reanudar: actaId }));
}

/** Lo que usa el controlador del acta para hablar con el servidor. */
export const clienteDeActa = (meetingId: string): ClienteDeActa => ({
  obtener: (o) => obtenerActa(meetingId, o),
  pedir: () => pedirActa(meetingId),
  reanudar: (actaId) => reanudarActa(meetingId, actaId),
});
