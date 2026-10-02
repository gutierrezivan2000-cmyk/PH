/**
 * Cliente de la API de Reuniones para las pantallas.
 *
 * Cada función devuelve datos ya tipados o lanza `ErrorApi` con un mensaje en
 * español listo para mostrar: el que mandó el servidor, o uno por defecto según
 * el estado (una respuesta HTML de un 504 de la plataforma no se puede leer, y
 * «Unexpected token <» no es un mensaje para una persona).
 */
import type { PersonaDTO, ReunionDetalle, ReunionResumen } from "./dto";

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
