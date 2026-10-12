/**
 * Ruta de subida desde el navegador.
 *
 * El token de /api/upload/token solo autoriza rutas `subidas/<id del usuario>/…`
 * (ver blob-owner), así que cada pantalla que sube un archivo necesita el id de
 * la sesión para construirla. `useSession` lo entrega, pero queda vacío un
 * instante al cargar la página; en ese caso se pide a la sesión del servidor.
 */
import { getSession } from "next-auth/react";
import { rutaDeSubida } from "@/lib/blob-owner";

/** Id del usuario con sesión: el conocido (de `useSession`) si lo hay; si no, el de /api/auth/session. */
export async function idDeUsuarioActual(conocido?: string | null): Promise<string> {
  if (conocido) return conocido;
  const sesion = await getSession().catch(() => null);
  const id = sesion?.user?.id;
  if (!id) {
    throw new Error("No se pudo identificar tu sesión para subir el archivo. Recarga la página e inicia sesión de nuevo.");
  }
  return id;
}

/** `rutaDeSubida` con el id de la sesión actual. En un ciclo de archivos, resuelve el id una vez y pásalo en `idConocido`. */
export async function rutaDeSubidaActual(nombre: string, carpeta?: string, idConocido?: string | null): Promise<string> {
  return rutaDeSubida(await idDeUsuarioActual(idConocido), nombre, carpeta);
}
