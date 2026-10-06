/**
 * Lectura de un cuerpo binario con tope.
 *
 * `req.arrayBuffer()` trae TODO el cuerpo a memoria antes de poder mirar su tamaño, y la cabecera
 * `Content-Length` puede faltar (envío por trozos) o mentir. Aquí se lee de a poco y se corta apenas pasa el tope.
 */
export async function leerCuerpoAcotado(req: Request, maximo: number): Promise<Uint8Array | "excede" | null> {
  const lector = req.body?.getReader();
  if (!lector) return new Uint8Array(0);
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximo) {
        await lector.cancel().catch(() => {});
        return "excede";
      }
      trozos.push(value);
    }
  } catch {
    return null; // la conexión se cortó a medias
  }
  const cuerpo = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) {
    cuerpo.set(t, pos);
    pos += t.byteLength;
  }
  return cuerpo;
}
