/**
 * Validación de lo que llega a la API de Reuniones.
 *
 * Funciones puras (sin Prisma ni Next) para poder probarlas a fondo: cada una
 * devuelve el valor ya limpio o un mensaje en español que la pantalla puede
 * mostrar tal cual.
 */
import { esRolPersona, esTipoReunion, type RolPersona, type TipoReunion } from "./tipos";

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

export const MAX_TITULO = 140;
export const MAX_NOMBRE_PERSONA = 100;
const ANIO_MINIMO = 2000;
const ANIOS_HACIA_ADELANTE = 5;
/** La constancia del aviso de grabación no puede estar «en el futuro» (margen por relojes desajustados). */
const MARGEN_CONSTANCIA_MS = 5 * 60_000;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Espacios y saltos repetidos → un espacio; fuera caracteres de control. Un valor que no es texto da "". */
export function limpiarTexto(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Fecha ISO válida y razonable (de 2000 a 5 años hacia adelante), o null. */
export function leerFecha(valor: unknown, ahora: Date): Date | null {
  if (typeof valor !== "string" || valor.length < 8 || valor.length > 40) return null;
  const ms = Date.parse(valor);
  if (!Number.isFinite(ms)) return null;
  const fecha = new Date(ms);
  const tope = new Date(ahora);
  tope.setFullYear(tope.getFullYear() + ANIOS_HACIA_ADELANTE);
  if (fecha.getUTCFullYear() < ANIO_MINIMO || fecha.getTime() > tope.getTime()) return null;
  return fecha;
}

const vacio = (v: unknown) => v === undefined || v === null || v === "";

/* ── Reuniones ───────────────────────────────────────────────────────── */

export type NuevaReunion = {
  propertyId: string;
  type: TipoReunion;
  /** null = que el servidor proponga el título. */
  title: string | null;
  date: Date;
};

export function validarNuevaReunion(body: unknown, ahora: Date = new Date()): Validacion<NuevaReunion> {
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };

  const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
  if (!propertyId || propertyId.length > 100) return { ok: false, error: "Elige la copropiedad de la reunión." };

  let type: TipoReunion = "consejo";
  if (!vacio(body.type)) {
    if (!esTipoReunion(body.type)) return { ok: false, error: "El tipo de reunión no es válido." };
    type = body.type;
  }

  let title: string | null = null;
  if (body.title !== undefined && body.title !== null) {
    if (typeof body.title !== "string") return { ok: false, error: "El título no es válido." };
    const limpio = limpiarTexto(body.title);
    if (limpio.length > MAX_TITULO) return { ok: false, error: `El título admite hasta ${MAX_TITULO} caracteres.` };
    title = limpio || null;
  }

  let date = ahora;
  if (!vacio(body.date)) {
    const d = leerFecha(body.date, ahora);
    if (!d) return { ok: false, error: "La fecha de la reunión no es válida." };
    date = d;
  }

  return { ok: true, valor: { propertyId, type, title, date } };
}

export type CambiosReunion = {
  title?: string;
  type?: TipoReunion;
  date?: Date;
  /** null = quitar la constancia. */
  consentAt?: Date | null;
};

export function validarCambiosReunion(body: unknown, ahora: Date = new Date()): Validacion<CambiosReunion> {
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };
  const cambios: CambiosReunion = {};

  if ("title" in body) {
    const limpio = limpiarTexto(body.title);
    if (!limpio) return { ok: false, error: "El título no puede quedar vacío." };
    if (limpio.length > MAX_TITULO) return { ok: false, error: `El título admite hasta ${MAX_TITULO} caracteres.` };
    cambios.title = limpio;
  }
  if ("type" in body) {
    if (!esTipoReunion(body.type)) return { ok: false, error: "El tipo de reunión no es válido." };
    cambios.type = body.type;
  }
  if ("date" in body) {
    const d = leerFecha(body.date, ahora);
    if (!d) return { ok: false, error: "La fecha de la reunión no es válida." };
    cambios.date = d;
  }
  if ("consentAt" in body) {
    const v = body.consentAt;
    if (v === null) cambios.consentAt = null;
    else if (v === "now") cambios.consentAt = ahora;
    else {
      const d = leerFecha(v, ahora);
      if (!d || d.getTime() > ahora.getTime() + MARGEN_CONSTANCIA_MS) {
        return { ok: false, error: "La constancia del aviso de grabación no es válida." };
      }
      cambios.consentAt = d;
    }
  }

  if (Object.keys(cambios).length === 0) return { ok: false, error: "No hay nada que cambiar." };
  return { ok: true, valor: cambios };
}

/* ── Personas de la copropiedad ──────────────────────────────────────── */

function leerRol(v: unknown): Validacion<RolPersona | null> {
  if (vacio(v)) return { ok: true, valor: null };
  if (!esRolPersona(v)) return { ok: false, error: "El rol no es válido." };
  return { ok: true, valor: v };
}

function leerNombre(v: unknown): Validacion<string> {
  const nombre = limpiarTexto(v);
  if (nombre.length < 2) return { ok: false, error: "Escribe el nombre de la persona." };
  if (nombre.length > MAX_NOMBRE_PERSONA) {
    return { ok: false, error: `El nombre admite hasta ${MAX_NOMBRE_PERSONA} caracteres.` };
  }
  return { ok: true, valor: nombre };
}

export type NuevaPersona = { name: string; role: RolPersona | null };

export function validarPersona(body: unknown): Validacion<NuevaPersona> {
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };
  const nombre = leerNombre(body.name);
  if (!nombre.ok) return nombre;
  const rol = leerRol(body.role);
  if (!rol.ok) return rol;
  return { ok: true, valor: { name: nombre.valor, role: rol.valor } };
}

export type CambiosPersona = { name?: string; role?: RolPersona | null; active?: boolean };

export function validarCambiosPersona(body: unknown): Validacion<CambiosPersona> {
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };
  const cambios: CambiosPersona = {};
  if ("name" in body) {
    const nombre = leerNombre(body.name);
    if (!nombre.ok) return nombre;
    cambios.name = nombre.valor;
  }
  if ("role" in body) {
    const rol = leerRol(body.role);
    if (!rol.ok) return rol;
    cambios.role = rol.valor;
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") return { ok: false, error: "El estado no es válido." };
    cambios.active = body.active;
  }
  if (Object.keys(cambios).length === 0) return { ok: false, error: "No hay nada que cambiar." };
  return { ok: true, valor: cambios };
}
