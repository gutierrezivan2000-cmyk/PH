/**
 * Dueño de un blob, sin estado.
 *
 * Los archivos se suben directo desde el navegador con un token que entrega
 * /api/upload/token, y después el servidor recibe sus URLs de vuelta desde el
 * cliente (generar, corregir, chat, insumos del mes, documentos de la
 * copropiedad). Nada ataba un blob a quien lo subió: si la cuenta A llegaba a
 * conocer la URL de un archivo de la cuenta B, podía dárselo a la IA como si
 * fuera suyo, adjuntarlo a su propiedad o, con las rutas que limpian insumos,
 * borrarlo.
 *
 * La atadura va en la propia ruta: el token solo se emite para rutas
 * `subidas/<idDeUsuario>/…` y cada consumidor comprueba ese segmento antes de
 * leer, adjuntar, registrar o borrar. No hay tabla ni consulta: la ruta del
 * blob ES la prueba de quién lo subió, porque nadie más puede obtener un token
 * para ese prefijo.
 *
 * Este módulo es puro (sin base de datos ni SDK) para poder importarse tanto
 * en el servidor como en las pantallas que construyen la ruta de subida. Lo
 * que borra blobs vive en blob-owner-server.ts.
 */
import { isAllowedBlobUrl } from "@/lib/blob-url";

/** Primer segmento de toda ruta que el token de subida autoriza. */
export const PREFIJO_SUBIDAS = "subidas";

/**
 * Carpetas con las que se guardaba un archivo ANTES de existir el dueño en la
 * ruta, ambas colgando del id de la copropiedad: los insumos del mes del modo
 * Portafolio (`monthly/<propertyId>/<año-mes>/…`) y los documentos de la
 * copropiedad (`property-docs/<propertyId>/…`). Solo se reconocen para lo que
 * ya estaba guardado (ver blobLegadoDePropiedad).
 */
export type CarpetaLegada = "monthly" | "property-docs";

/** Respuesta común cuando una ruta recibe un archivo que no es de quien lo envía. */
export const MENSAJE_BLOB_AJENO =
  "Uno de los archivos no pertenece a tu cuenta. Vuelve a subirlo desde esta pantalla e inténtalo de nuevo.";

/**
 * Lo único que puede haber en un segmento de ruta. Los nombres de archivo se
 * sanean al construir la ruta (rutaDeSubida) y el sufijo que añade el
 * almacenamiento es alfanumérico, así que nada legítimo queda fuera. Lo que no
 * cabe aquí (barras, `%`, `:`, `?`, espacios, unicode, caracteres de control)
 * es justamente lo que sirve para esconder otra ruta.
 */
const SEGMENTO = /^[A-Za-z0-9_.-]+$/;
const MAX_SEGMENTOS = 12;
const MAX_LARGO_DE_ENTRADA = 2048;

function esSegmentoValido(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= 255 && s !== "." && s !== ".." && SEGMENTO.test(s);
}

/** Un id de usuario (o de propiedad) sirve como segmento de ruta solo si es uno válido. */
function esIdValido(id: unknown): id is string {
  return esSegmentoValido(id) && id.length <= 128;
}

/**
 * Ruta canónica del blob (sin barra inicial, ya decodificada) o `null` si la
 * entrada no es una ruta limpia.
 *
 * Acepta la URL completa del blob (solo https y solo hosts del almacenamiento)
 * o su ruta. Es deliberadamente estricta: se decodifica cada segmento UNA vez
 * y se rechaza todo lo que después no sea `[A-Za-z0-9_.-]`, así que una barra
 * codificada (`%2F`), un punto codificado (`%2e%2e`), una doble codificación
 * (`%252e`), una barra invertida, una doble barra, un segmento `.`/`..`, una
 * consulta o un fragmento no llegan a comparar nada. La comparación del dueño
 * se hace sobre esta ruta, nunca sobre el texto original.
 */
export function rutaDeBlob(entrada: unknown): string | null {
  if (typeof entrada !== "string" || entrada.length === 0 || entrada.length > MAX_LARGO_DE_ENTRADA) return null;
  // Nada de barras invertidas ni caracteres de control: `new URL` convierte `\` en `/` y eso movería la ruta.
  if (/[\\\u0000-\u001f\u007f]/.test(entrada)) return null;

  let cruda: string;
  if (/^[a-z][a-z0-9+.-]*:/i.test(entrada)) {
    // URL completa: solo el almacenamiento, por https, sin credenciales, puerto, consulta ni fragmento.
    if (!isAllowedBlobUrl(entrada)) return null;
    let u: URL;
    try {
      u = new URL(entrada);
    } catch {
      return null;
    }
    if (u.username || u.password || u.port || entrada.includes("?") || entrada.includes("#")) return null;
    // La ruta se toma del texto original, no de `u.pathname`: `new URL` colapsa los `..` (también `%2e%2e`) y
    // convertiría una URL con trampa en una ruta que parece limpia.
    const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)$/i.exec(entrada);
    if (!m) return null;
    cruda = m[1].slice(1);
  } else {
    // Ruta sola (la que llega al token de subida): sin barra inicial y sin nada de URL.
    cruda = entrada;
  }

  const segmentos = cruda.split("/");
  if (segmentos.length > MAX_SEGMENTOS) return null;
  const limpios: string[] = [];
  for (const segmento of segmentos) {
    let decodificado: string;
    try {
      decodificado = decodeURIComponent(segmento);
    } catch {
      return null;
    }
    // Segmento vacío (doble barra, barra final), `.`/`..`, o algo que tras decodificar ya no es un nombre limpio
    // (barra o `%` codificados, unicode, espacios…).
    if (!esSegmentoValido(decodificado)) return null;
    limpios.push(decodificado);
  }
  return limpios.join("/");
}

/**
 * ¿Este blob lo subió `userId`? Solo lo afirma la ruta `subidas/<userId>/…<archivo>`.
 * La comparación es exacta y sensible a mayúsculas (el almacenamiento distingue
 * `U1` de `u1`): ni el prefijo ni el dueño se normalizan.
 */
export function blobPerteneceA(entrada: unknown, userId: unknown): boolean {
  if (!esIdValido(userId)) return false;
  const ruta = rutaDeBlob(entrada);
  if (!ruta) return false;
  const partes = ruta.split("/");
  return partes.length >= 3 && partes[0] === PREFIJO_SUBIDAS && partes[1] === userId;
}

/**
 * Archivos de ANTES de este cambio: `<carpeta>/<propertyId>/…` (por omisión, los
 * insumos mensuales). El id de una copropiedad no se puede adivinar y su dueño
 * ya se comprobó contra la base de datos (`property.userId`), así que esa ruta
 * sigue siendo una prueba válida para lo que ya estaba guardado. NO sirve para
 * archivos nuevos: el token de subida ya no emite esas rutas.
 */
export function blobLegadoDePropiedad(entrada: unknown, propertyId: unknown, carpeta: CarpetaLegada = "monthly"): boolean {
  if (!esIdValido(propertyId)) return false;
  const ruta = rutaDeBlob(entrada);
  if (!ruta) return false;
  const partes = ruta.split("/");
  return partes.length >= 3 && partes[0] === carpeta && partes[1] === propertyId;
}

export interface OpcionesDeDueno {
  /** Copropiedad ya verificada como del usuario: habilita los insumos mensuales de antes (`monthly/<id>/`). */
  propertyId?: string;
}

/**
 * Decisión única para los consumidores: ¿puede este usuario (o cualquiera de
 * sus ids, si la sesión y la base de datos traen uno distinto) usar este blob?
 */
export function blobAutorizado(
  entrada: unknown,
  userId: string | readonly string[],
  opciones: OpcionesDeDueno = {}
): boolean {
  const ids = typeof userId === "string" ? [userId] : userId;
  if (ids.some((id) => blobPerteneceA(entrada, id))) return true;
  return opciones.propertyId ? blobLegadoDePropiedad(entrada, opciones.propertyId) : false;
}

/**
 * El primer archivo de la lista que no es del usuario (o `null` si todos lo
 * son). Un elemento que ni siquiera es un objeto con `url` cuenta como ajeno.
 */
export function primerBlobAjeno(
  archivos: ReadonlyArray<unknown>,
  userId: string | readonly string[],
  opciones: OpcionesDeDueno = {}
): { name?: unknown; url?: unknown } | null {
  for (const archivo of archivos) {
    const ref = archivo && typeof archivo === "object" ? (archivo as { name?: unknown; url?: unknown }) : null;
    if (!ref || !blobAutorizado(ref.url, userId, opciones)) return ref ?? {};
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════
   Construcción de la ruta (la usan las pantallas al subir)
   ════════════════════════════════════════════════════════════════════ */

const MAX_BASE_DEL_NOMBRE = 80;

function limpiarTrozo(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // «Señora» → «Senora», en vez de «Se_ora»
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Separa «informe.final.PDF» en base y extensión ya limpias; la extensión manda para el tope por tipo (upload-limits). */
function partirNombre(nombre: unknown): { base: string; ext: string } {
  const ultimo = String(nombre ?? "").split(/[\\/]/).pop() ?? "";
  const punto = ultimo.lastIndexOf(".");
  const extCruda = punto > 0 ? ultimo.slice(punto + 1) : "";
  const ext = /^[A-Za-z0-9]{1,10}$/.test(extCruda) ? extCruda.toLowerCase() : "";
  const base = limpiarTrozo(ext ? ultimo.slice(0, punto) : ultimo).slice(0, MAX_BASE_DEL_NOMBRE);
  return { base: base || "archivo", ext };
}

/** Nombre de archivo apto para una ruta de blob, conservando la extensión. */
export function nombreSeguroDeArchivo(nombre: unknown): string {
  const { base, ext } = partirNombre(nombre);
  return ext ? `${base}.${ext}` : base;
}

/** Sufijo corto y distinto en cada llamada: dos archivos con el mismo nombre no se pisan. */
function sufijoUnico(): string {
  let aleatorio = "";
  try {
    const bytes = new Uint8Array(5);
    globalThis.crypto.getRandomValues(bytes);
    aleatorio = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Contextos sin crypto (http en red local, pruebas viejas): el reloj ya separa, esto solo lo refuerza.
    aleatorio = Math.random().toString(16).slice(2, 12).padEnd(10, "0");
  }
  return `${Date.now().toString(36)}${aleatorio}`;
}

/**
 * Ruta con la que una pantalla sube un archivo: `subidas/<userId>/[carpeta/]<nombre>-<único>.<ext>`.
 * Es la ÚNICA forma que el token de subida autoriza. `carpeta` agrupa por uso
 * («uploads», «agent-files», «property-docs/<id>»…); cada trozo se sanea.
 */
export function rutaDeSubida(userId: string, nombre: string, carpeta?: string): string {
  if (!esIdValido(userId)) {
    throw new Error("No se pudo identificar tu sesión para subir el archivo. Recarga la página e inténtalo de nuevo.");
  }
  const trozos = (carpeta ?? "")
    .split("/")
    .map(limpiarTrozo)
    .filter((t) => t.length > 0)
    .slice(0, 4);
  const { base, ext } = partirNombre(nombre);
  return [PREFIJO_SUBIDAS, userId, ...trozos, `${base}-${sufijoUnico()}${ext ? `.${ext}` : ""}`].join("/");
}
