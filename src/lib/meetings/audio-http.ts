/**
 * Servir el audio de una reunión con `Range` (todo puro: la ruta, el demo y las pruebas usan lo mismo).
 *
 * El reproductor del navegador no baja 100 MB para saltar al minuto 5:12:40: pide un trozo con `Range: bytes=a-b`, y el
 * servidor responde 206 con `Content-Range`. Safari además exige que `Content-Range` y `Content-Length` sean exactos y que
 * la primera respuesta (`bytes=0-1`) sea un 206.
 *
 * Una respuesta nunca pasa de `MAX_BYTES_POR_RESPUESTA`: si piden `bytes=0-` (hasta el final) se entrega un trozo y el
 * navegador pide el siguiente cuando lo necesita. Así ninguna función se queda abierta una hora sirviendo un audio de 8 h.
 */

/**
 * 4 MiB: unos 17 min de audio a 32 kbps. Por debajo de los 4,5 MB que Vercel deja en el cuerpo de una respuesta de función
 * (una respuesta en flujo no tiene ese tope, pero no hace falta apostarle: pedir el siguiente trozo cuesta una petición
 * más cada 17 min de audio).
 */
export const MAX_BYTES_POR_RESPUESTA = 4 * 1024 * 1024;

export type RangoPedido =
  /** Sin `Range` (o uno que se ignora): el archivo entero. */
  | { tipo: "completo" }
  /** Ya acotado al archivo y al tope. `hasta` es inclusive. */
  | { tipo: "rango"; desde: number; hasta: number }
  /** Pide algo que está más allá del final: 416. */
  | { tipo: "insatisfacible" };

const UN_RANGO = /^bytes=(\d*)-(\d*)$/i;

/**
 * Lee la cabecera `Range` de una petición. Solo se entiende UN rango de bytes: una unidad que no es `bytes`, varios rangos
 * o una cabecera mal escrita se ignoran y se responde el archivo entero (lo que manda la norma, RFC 9110 §14.2).
 */
export function leerRango(cabecera: string | null | undefined, total: number, tope: number = MAX_BYTES_POR_RESPUESTA): RangoPedido {
  const texto = cabecera?.trim();
  if (!texto) return { tipo: "completo" };
  const m = UN_RANGO.exec(texto);
  if (!m || (m[1] === "" && m[2] === "")) return { tipo: "completo" };

  if (m[1] === "") {
    // «los últimos n bytes»
    const n = Number(m[2]);
    if (!(n > 0) || total <= 0) return { tipo: "insatisfacible" };
    const desde = Math.max(0, total - n);
    return { tipo: "rango", desde, hasta: Math.min(total - 1, desde + tope - 1) };
  }

  const desde = Number(m[1]);
  const pedidoHasta = m[2] === "" ? Number.POSITIVE_INFINITY : Number(m[2]);
  if (pedidoHasta < desde) return { tipo: "completo" }; // «bytes=10-5» está mal escrito: se ignora
  if (!(desde < total)) return { tipo: "insatisfacible" };
  return { tipo: "rango", desde, hasta: Math.min(pedidoHasta, total - 1, desde + tope - 1) };
}

export type EncabezadosDeAudio = {
  status: 200 | 206 | 416;
  headers: Record<string, string>;
  /** Los bytes que lleva el cuerpo (inclusive); en un 416 no hay. */
  cuerpo: { desde: number; hasta: number } | null;
};

/** El estado y las cabeceras de la respuesta para un rango ya resuelto. */
export function encabezadosDeAudio(rango: RangoPedido, total: number): EncabezadosDeAudio {
  const comunes = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    // Privado (hay sesión) y por poco tiempo: si se vuelve a procesar el audio, no queda una copia vieja mucho rato.
    "Cache-Control": "private, max-age=600",
  };
  if (rango.tipo === "insatisfacible") {
    return { status: 416, headers: { ...comunes, "Content-Range": `bytes */${total}`, "Content-Length": "0" }, cuerpo: null };
  }
  if (rango.tipo === "completo") {
    return { status: 200, headers: { ...comunes, "Content-Length": String(total) }, cuerpo: total > 0 ? { desde: 0, hasta: total - 1 } : null };
  }
  return {
    status: 206,
    headers: { ...comunes, "Content-Range": `bytes ${rango.desde}-${rango.hasta}/${total}`, "Content-Length": String(rango.hasta - rango.desde + 1) },
    cuerpo: { desde: rango.desde, hasta: rango.hasta },
  };
}
