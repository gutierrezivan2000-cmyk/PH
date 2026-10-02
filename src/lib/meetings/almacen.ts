/**
 * Archivos de Reuniones en Vercel Blob (privado).
 *
 * Todo cuelga de `meetings/{id}/`: originales, partes en vivo, audio normalizado
 * y transcripción. Borrar una reunión es borrar ese prefijo. (M4 amplía este
 * módulo con lectura por rango y subida en flujo.)
 */

export const PREFIJO_REUNIONES = "meetings/";

/** Las ids de reunión son cuid (o `reunion-demo-001`): letras, números, guion y guion bajo. */
const ID_REUNION = /^[A-Za-z0-9_-]{8,64}$/;
/** Un prefijo borrable es EXACTAMENTE `meetings/<id>/`. */
const PREFIJO_BORRABLE = /^meetings\/[A-Za-z0-9_-]{8,64}\/$/;

export function prefijoDeReunion(meetingId: string): string {
  if (!ID_REUNION.test(meetingId)) throw new Error("Identificador de reunión no válido.");
  return `${PREFIJO_REUNIONES}${meetingId}/`;
}

/**
 * Borra todos los blobs bajo un prefijo y devuelve cuántos. Solo acepta
 * `meetings/<id>/`: un prefijo vacío o demasiado corto vaciaría el almacenamiento
 * entero (incluidos los documentos de otros módulos).
 */
export async function borrarPrefijo(prefijo: string): Promise<number> {
  if (!PREFIJO_BORRABLE.test(prefijo)) {
    throw new Error(`Prefijo de borrado no permitido: «${prefijo.slice(0, 40)}».`);
  }
  const { list, del } = await import("@vercel/blob");
  let borrados = 0;
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix: prefijo, cursor, limit: 1000 });
    if (pagina.blobs.length > 0) {
      await del(pagina.blobs.map((b) => b.url));
      borrados += pagina.blobs.length;
    }
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);
  return borrados;
}

/** Borra los archivos de una reunión (originales, partes en vivo, audio y transcripción). */
export function borrarArchivosDeReunion(meetingId: string): Promise<number> {
  return borrarPrefijo(prefijoDeReunion(meetingId));
}

/* ════════════════════════════════════════════════════════════════════
   Rutas de los originales subidos
   ════════════════════════════════════════════════════════════════════ */

/**
 * Nombre apto para una ruta de Blob: sin tildes, sin espacios ni símbolos, con su
 * extensión, de hasta 120 caracteres. «Reunión consejo (1).m4a» → «Reunion-consejo-1.m4a».
 */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+\./g, ".") // «1-.m4a» → «1.m4a»
    .replace(/\.-+/g, ".")
    .replace(/\.{2,}/g, ".") // sin «..»: esRutaDeFuente lo rechaza
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!limpio) return "grabacion";
  if (limpio.length <= 120) return limpio;
  // Recorta el cuerpo, no la extensión.
  const punto = limpio.lastIndexOf(".");
  const ext = punto > 0 && limpio.length - punto <= 10 ? limpio.slice(punto) : "";
  return limpio.slice(0, 120 - ext.length) + ext;
}

/** `meetings/<id>/fuentes/<aleatorio de 8>-<nombre seguro>` */
export function rutaDeFuente(meetingId: string, nombre: string, aleatorio: string): string {
  if (!/^[a-z0-9]{8}$/.test(aleatorio)) throw new Error("Sufijo de ruta no válido.");
  return `${prefijoDeReunion(meetingId)}fuentes/${aleatorio}-${nombreSeguro(nombre)}`;
}

/**
 * ¿Es esta ruta un original de ESTA reunión? El cliente puede mandar una ruta al
 * reanudar una subida: solo se acepta con la forma exacta que genera `rutaDeFuente`
 * (nunca otra carpeta, ni otra reunión, ni `..`).
 */
export function esRutaDeFuente(meetingId: string, pathname: unknown): pathname is string {
  if (typeof pathname !== "string" || !ID_REUNION.test(meetingId)) return false;
  const base = `${PREFIJO_REUNIONES}${meetingId}/fuentes/`;
  if (!pathname.startsWith(base)) return false;
  return /^[a-z0-9]{8}-[A-Za-z0-9._-]{1,120}$/.test(pathname.slice(base.length)) && !pathname.includes("..");
}

/**
 * `meetings/<id>/vivo/<sesión>/<seq>.<ext>`: una parte de la grabadora. La ruta es SIEMPRE la misma para la
 * misma parte, así reenviarla (la respuesta se perdió) la sobrescribe en vez de duplicarla.
 */
export function rutaDeParteViva(meetingId: string, session: number, seq: number, ext: "webm" | "mp4" | "ogg"): string {
  if (!Number.isInteger(session) || session < 1 || !Number.isInteger(seq) || seq < 0) throw new Error("Parte no válida.");
  return `${prefijoDeReunion(meetingId)}vivo/${session}/${seq}.${ext}`;
}

/** Sufijo aleatorio de 8 caracteres [a-z0-9] para una ruta nueva. */
export function sufijoAleatorio(): string {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/** ¿Esta URL de Blob corresponde a esta ruta? (la URL lleva la ruta tras el dominio) */
export function urlCorrespondeARuta(url: string, pathname: string): boolean {
  try {
    return decodeURIComponent(new URL(url).pathname) === `/${pathname}`;
  } catch {
    return false;
  }
}
