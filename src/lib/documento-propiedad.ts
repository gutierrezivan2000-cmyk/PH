/**
 * ¿El archivo de un documento de la copropiedad es de quien administra esa copropiedad?
 *
 * El portal de residentes (/api/portal/doc) y el asistente del reglamento leen `PropertyDocument.url` con la credencial del
 * servidor, a pedido de una persona SIN sesión (el residente). Esa URL la guardó el administrador desde su navegador; aunque el
 * registro de documentos ya exige que el blob sea suyo (ruta `subidas/<su id>/…`), una fila anterior a esa regla o escrita por otro
 * camino podía apuntar al archivo de otra cuenta. Antes de leer se vuelve a comprobar, sin consultar nada más: la ruta del blob
 * es la prueba (ver lib/blob-owner).
 *
 * Valen dos rutas:
 *  - `subidas/<id del dueño de la copropiedad>/…`: lo que sube hoy cualquier pantalla.
 *  - `property-docs/<id de la copropiedad>/…`: lo que se guardaba ANTES de que el dueño fuera parte de la ruta. El id de una
 *    copropiedad no se adivina y la fila ya está colgada de ella, así que sigue siendo una prueba para lo ya guardado. El token de
 *    subida ya no emite esa ruta: no sirve para archivos nuevos.
 *
 * Puro (sin base de datos ni SDK) para poder probarlo solo.
 */
import { blobLegadoDePropiedad, blobPerteneceA } from "@/lib/blob-owner";

export function blobEsDeLaCopropiedad(
  url: unknown,
  propertyId: unknown,
  duenoId: string | null | undefined
): boolean {
  return blobPerteneceA(url, duenoId) || blobLegadoDePropiedad(url, propertyId, "property-docs");
}
