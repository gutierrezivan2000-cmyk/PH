/**
 * Borrado de blobs que llegan desde el cliente.
 *
 * Las URLs de los insumos las manda el navegador, y varias rutas las borran
 * cuando el trabajo termina o se rechaza. Sin filtro, bastaba pegar la URL de
 * un archivo ajeno (o de un documento de la copropiedad) para que el servidor lo
 * borrara con su propia credencial de escritura.
 *
 * Vive aparte de blob-owner.ts porque toca la base de datos y el SDK, y ese
 * módulo también lo importan las pantallas.
 */
import { blobAutorizado, type OpcionesDeDueno } from "@/lib/blob-owner";

export interface ResultadoDeBorrado {
  borradas: string[];
  omitidas: string[];
}

/**
 * Borra, de la lista, SOLO los blobs que son del usuario y que no están
 * registrados como documento de una copropiedad. Nunca lanza: es una limpieza
 * de mejor esfuerzo, y ante cualquier duda (no poder consultar la base de datos
 * incluido) no borra nada.
 */
export async function borrarBlobsPropios(
  urls: ReadonlyArray<unknown>,
  userId: string | readonly string[],
  opciones: OpcionesDeDueno & { etiqueta?: string } = {}
): Promise<ResultadoDeBorrado> {
  const etiqueta = opciones.etiqueta ?? "blob-owner";
  const unicas = [...new Set(urls.filter((u): u is string => typeof u === "string"))];
  const propias = unicas.filter((u) => blobAutorizado(u, userId, opciones));
  const resultado: ResultadoDeBorrado = { borradas: [], omitidas: unicas.filter((u) => !propias.includes(u)) };
  if (propias.length === 0) return resultado;

  try {
    // Un documento de la copropiedad (manual, reglamento…) puede haberse usado además como insumo de una generación:
    // al terminar, ese blob NO se borra o el documento se quedaría sin archivo.
    const { db } = await import("@/lib/db");
    const registradas = await db.propertyDocument.findMany({ where: { url: { in: propias } }, select: { url: true } });
    const protegidas = new Set(registradas.map((d: { url: string }) => d.url));
    const aBorrar = propias.filter((u) => !protegidas.has(u));
    resultado.omitidas.push(...propias.filter((u) => protegidas.has(u)));
    if (aBorrar.length === 0) return resultado;

    const { del } = await import("@vercel/blob");
    await del(aBorrar);
    resultado.borradas = aBorrar;
  } catch (e) {
    console.error(`[${etiqueta}] no se pudieron borrar los archivos:`, e);
    resultado.omitidas = unicas;
    resultado.borradas = [];
  }
  return resultado;
}
