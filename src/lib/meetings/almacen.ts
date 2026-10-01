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
