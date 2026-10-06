/**
 * Validación de lo que llega a la API de Reuniones.
 *
 * Funciones puras (sin Prisma ni Next) para poder probarlas a fondo: cada una
 * devuelve el valor ya limpio o un mensaje en español que la pantalla puede
 * mostrar tal cual.
 */
import { isAllowedBlobUrl } from "@/lib/blob-url";
import { esArchivoDeReunion, esTipoDeReunionPermitido, formatoTamano, tipoDeArchivoReunion } from "@/lib/upload-limits";
import { esRutaDeFuente, urlCorrespondeARuta } from "./almacen";
import { extensionDeGrabacion, mimeBase, parteCabe } from "./grabadora-partes";
import type { PedidoDeHablante } from "./nombres";
import {
  MAX_DURACION_PARTE_MS, MAX_FUENTE_BYTES, MAX_MS_REUNION, MAX_NOTA_MARCADOR, MAX_SECUENCIA_VIVO, MAX_SESIONES_VIVO, VIVO_PARTE_MAX_BYTES,
  esRolPersona, esTipoMarcador, esTipoReunion, type RolPersona, type TipoMarcador, type TipoReunion,
} from "./tipos";

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

/* ── Archivos de la reunión (subida directa y reanudable) ────────────── */

const MAX_NOMBRE_ARCHIVO = 200;

type DatosArchivo = { nombre: string; tamano: number; tipo: string };

/** Lo común al pedir el token y al registrar: nombre, tamaño y tipo de una grabación de audio o video. */
function leerArchivo(body: Record<string, unknown>): Validacion<DatosArchivo> {
  const nombre = limpiarTexto(body.nombre);
  if (!nombre) return { ok: false, error: "Falta el nombre del archivo." };
  if (nombre.length > MAX_NOMBRE_ARCHIVO) return { ok: false, error: "El nombre del archivo es demasiado largo." };
  if (!esArchivoDeReunion(nombre)) {
    return { ok: false, error: `«${nombre}» no parece una grabación. Sube audio o video (MP3, M4A, WAV, MP4, MOV…).` };
  }

  const tamano = body.tamano;
  if (typeof tamano !== "number" || !Number.isFinite(tamano) || !Number.isInteger(tamano) || tamano < 1) {
    return { ok: false, error: `«${nombre}» está vacío o su tamaño no es válido.` };
  }
  if (tamano > MAX_FUENTE_BYTES) {
    return {
      ok: false,
      error: `«${nombre}» pesa ${formatoTamano(tamano)} y el máximo por archivo es ${formatoTamano(MAX_FUENTE_BYTES)}. Si la grabación es más larga, pártela en varios archivos y súbelos todos: se unen en orden.`,
    };
  }

  // El tipo que manda el navegador se respeta si es de audio o video; si no (vacío, genérico), se deduce del nombre.
  const declarado = typeof body.tipo === "string" ? body.tipo : "";
  const tipo = esTipoDeReunionPermitido(declarado) ? declarado : tipoDeArchivoReunion({ name: nombre });
  if (!esTipoDeReunionPermitido(tipo)) {
    return { ok: false, error: `«${nombre}» no es un archivo de audio ni de video que podamos leer.` };
  }
  return { ok: true, valor: { nombre, tamano, tipo } };
}

export type PedidoToken = DatosArchivo & {
  /** Solo al reanudar: la ruta de la subida que ya empezó. null = subida nueva. */
  pathname: string | null;
};

export function validarPedidoToken(body: unknown, meetingId: string): Validacion<PedidoToken> {
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };
  const archivo = leerArchivo(body);
  if (!archivo.ok) return archivo;
  let pathname: string | null = null;
  if (!vacio(body.pathname)) {
    if (!esRutaDeFuente(meetingId, body.pathname)) return { ok: false, error: "La ruta de la subida no es válida." };
    pathname = body.pathname;
  }
  return { ok: true, valor: { ...archivo.valor, pathname } };
}

export type RegistroFuente = DatosArchivo & { url: string; pathname: string };

export function validarRegistroFuente(body: unknown, meetingId: string): Validacion<RegistroFuente> {
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };
  const archivo = leerArchivo(body);
  if (!archivo.ok) return archivo;
  if (!esRutaDeFuente(meetingId, body.pathname)) return { ok: false, error: "La ruta del archivo no es válida." };
  if (!isAllowedBlobUrl(body.url) || !urlCorrespondeARuta(body.url as string, body.pathname)) {
    return { ok: false, error: "La dirección del archivo no es válida." };
  }
  return { ok: true, valor: { ...archivo.valor, url: body.url as string, pathname: body.pathname } };
}

/* ── Grabadora en vivo ───────────────────────────────────────────────── */

/** Entero decimal sin signo ni ceros de relleno raros («007» no): lo que mandan las cabeceras. */
function leerEntero(valor: string | null, min: number, max: number): number | null {
  if (valor === null || !/^(0|[1-9]\d{0,9})$/.test(valor)) return null;
  const n = Number(valor);
  return n >= min && n <= max ? n : null;
}

export type ParteViva = { session: number; seq: number; durMs: number; mime: string; ext: "webm" | "mp4" | "ogg" };

/** Cabeceras de `POST /live` y tamaño del cuerpo ya leído. */
export function validarParteViva(
  cabeceras: { tipo: string | null; sesion: string | null; secuencia: string | null; duracionMs: string | null },
  bytes: number,
): Validacion<ParteViva> {
  const ext = cabeceras.tipo ? extensionDeGrabacion(cabeceras.tipo) : null;
  if (!ext || !cabeceras.tipo) return { ok: false, error: "El tipo de audio no es válido." };
  const session = leerEntero(cabeceras.sesion, 1, MAX_SESIONES_VIVO);
  if (session === null) return { ok: false, error: "El número de sesión no es válido." };
  const seq = leerEntero(cabeceras.secuencia, 0, MAX_SECUENCIA_VIVO);
  if (seq === null) return { ok: false, error: "El número de parte no es válido." };
  const durMs = leerEntero(cabeceras.duracionMs, 1, MAX_DURACION_PARTE_MS);
  if (durMs === null) return { ok: false, error: "La duración de la parte no es válida." };
  if (!parteCabe(bytes)) {
    return { ok: false, error: bytes <= 0 ? "La parte de audio llegó vacía." : `La parte de audio supera los ${VIVO_PARTE_MAX_BYTES / (1024 * 1024)} MB.` };
  }
  return { ok: true, valor: { session, seq, durMs, mime: mimeBase(cabeceras.tipo), ext } };
}

export type NuevaMarca = { id: string | null; atMs: number; kind: TipoMarcador; note: string | null };

export function validarMarca(body: unknown): Validacion<NuevaMarca> {
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };
  if (!esTipoMarcador(body.kind)) return { ok: false, error: "El tipo de marca no es válido." };
  const atMs = body.atMs;
  if (typeof atMs !== "number" || !Number.isInteger(atMs) || atMs < 0 || atMs > MAX_MS_REUNION) {
    return { ok: false, error: "El minuto de la marca no es válido." };
  }
  let note: string | null = null;
  if (!vacio(body.note)) {
    if (typeof body.note !== "string") return { ok: false, error: "La nota no es válida." };
    const limpia = limpiarTexto(body.note);
    if (limpia.length > MAX_NOTA_MARCADOR) return { ok: false, error: `La nota admite hasta ${MAX_NOTA_MARCADOR} caracteres.` };
    note = limpia || null;
  }
  // El identificador lo pone el dispositivo para que reenviar la misma marca no la duplique.
  let id: string | null = null;
  if (!vacio(body.id)) {
    if (typeof body.id !== "string" || !/^[A-Za-z0-9_-]{6,60}$/.test(body.id)) return { ok: false, error: "El identificador de la marca no es válido." };
    id = body.id;
  }
  return { ok: true, valor: { id, atMs, kind: body.kind, note } };
}

export type SesionDeCierre = { session: number; ultimaSecuencia: number; mimeType: string; duracionMs: number };

/**
 * Cuerpo de `POST /process`. Sin cuerpo (o `{}`) = cerrar con lo que haya; con `sesiones` = lo que el
 * dispositivo declara haber grabado, para comprobar que no falte ninguna parte.
 */
export function validarCierre(body: unknown): Validacion<{ sesiones: SesionDeCierre[] | null }> {
  if (body === null || body === undefined) return { ok: true, valor: { sesiones: null } };
  if (!esObjeto(body)) return { ok: false, error: "Solicitud no válida." };
  if (body.sesiones === undefined || body.sesiones === null) return { ok: true, valor: { sesiones: null } };
  if (!Array.isArray(body.sesiones) || body.sesiones.length > MAX_SESIONES_VIVO) return { ok: false, error: "La lista de sesiones no es válida." };

  const vistas = new Set<number>();
  const sesiones: SesionDeCierre[] = [];
  for (const s of body.sesiones) {
    if (!esObjeto(s)) return { ok: false, error: "La lista de sesiones no es válida." };
    const { session, ultimaSecuencia, duracionMs, mimeType } = s;
    const sesionValida = typeof session === "number" && Number.isInteger(session) && session >= 1 && session <= MAX_SESIONES_VIVO;
    const ultimaValida = typeof ultimaSecuencia === "number" && Number.isInteger(ultimaSecuencia) && ultimaSecuencia >= 0 && ultimaSecuencia <= MAX_SECUENCIA_VIVO;
    const duracionValida = typeof duracionMs === "number" && Number.isFinite(duracionMs) && duracionMs >= 0 && duracionMs <= MAX_MS_REUNION;
    if (!sesionValida || !ultimaValida || !duracionValida || typeof mimeType !== "string" || !extensionDeGrabacion(mimeType)) {
      return { ok: false, error: "Los datos de una sesión no son válidos." };
    }
    if (vistas.has(session)) return { ok: false, error: "Una sesión está repetida." };
    vistas.add(session);
    sesiones.push({ session, ultimaSecuencia, mimeType: mimeBase(mimeType), duracionMs: Math.round(duracionMs) });
  }
  return { ok: true, valor: { sesiones } };
}

/* ── Nombres de las voces ────────────────────────────────────────────── */

export const MAX_ROL_HABLANTE = 60;
export const MAX_HABLANTES_POR_PEDIDO = 60;

/** `{ hablantes: [{ label, name, role?, personId? }] }`: un nombre vacío es «sin nombre». */
export function validarHablantes(body: unknown): Validacion<{ hablantes: PedidoDeHablante[] }> {
  if (!esObjeto(body) || !Array.isArray(body.hablantes)) return { ok: false, error: "Falta la lista de voces." };
  if (body.hablantes.length === 0 || body.hablantes.length > MAX_HABLANTES_POR_PEDIDO) return { ok: false, error: "La lista de voces no es válida." };
  const vistas = new Set<string>();
  const hablantes: PedidoDeHablante[] = [];
  for (const x of body.hablantes) {
    if (!esObjeto(x)) return { ok: false, error: "Una de las voces no es válida." };
    const label = typeof x.label === "string" ? x.label.trim() : "";
    if (!/^[VH]\d{1,3}$/.test(label)) return { ok: false, error: "Una de las voces no tiene una etiqueta válida." };
    if (vistas.has(label)) return { ok: false, error: `La voz ${label} está repetida.` };
    vistas.add(label);

    const name = vacio(x.name) ? null : limpiarTexto(x.name);
    if (name !== null && name.length > MAX_NOMBRE_PERSONA) return { ok: false, error: `El nombre es demasiado largo (máximo ${MAX_NOMBRE_PERSONA} caracteres).` };
    const role = vacio(x.role) ? null : limpiarTexto(x.role);
    if (role !== null && role.length > MAX_ROL_HABLANTE) return { ok: false, error: `El rol es demasiado largo (máximo ${MAX_ROL_HABLANTE} caracteres).` };
    let personId: string | null = null;
    if (!vacio(x.personId)) {
      if (typeof x.personId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(x.personId)) return { ok: false, error: "Una de las personas no es válida." };
      personId = x.personId;
    }
    hablantes.push({ label, name: name || null, role: role || null, personId });
  }
  return { ok: true, valor: { hablantes } };
}
