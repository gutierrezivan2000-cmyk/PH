/**
 * Eventos enviados por el servidor (SSE), lo justo para «Preguntar»: cómo se escribe un evento, cómo se arma el flujo de una ruta
 * (con su cancelación y su evento de error) y cómo se lee desde el navegador. Un evento es `event: nombre` y `data: {json}`, y
 * una línea en blanco; el JSON nunca lleva saltos de línea, así que una sola línea `data:` alcanza.
 */
export type EventoSSE = { evento: string; datos: unknown };

const codificador = new TextEncoder();

/** Un evento listo para enviar. */
export const codificarEvento = (evento: string, datos: unknown): Uint8Array => codificador.encode(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);

export type EnviarEvento = (evento: string, datos: unknown) => void;

/**
 * El flujo de una respuesta SSE. `ejecutar` hace el trabajo y va mandando eventos con `enviar`; cuando termina, el flujo se cierra.
 * Si falla, antes de cerrar se manda un evento `error` con `{ mensaje }` (el que diga `mensajeDelFallo`, que nunca debe llevar
 * detalles internos). Si quien lee se va (cierra la página), `senal` se cancela para que `ejecutar` deje de gastar, y lo que mande
 * después se descarta.
 */
export function crearFlujoSSE(
  ejecutar: (enviar: EnviarEvento, senal: AbortSignal) => Promise<void>,
  mensajeDelFallo: (e: unknown) => string = () => "No pudimos completar la respuesta. Inténtalo de nuevo.",
): ReadableStream<Uint8Array> {
  const control = new AbortController();
  let cerrado = false;
  return new ReadableStream<Uint8Array>({
    async start(flujo) {
      const enviar: EnviarEvento = (evento, datos) => {
        if (cerrado) return;
        try {
          flujo.enqueue(codificarEvento(evento, datos));
        } catch {
          cerrado = true; // el lector ya no está
        }
      };
      try {
        await ejecutar(enviar, control.signal);
      } catch (e) {
        if (!control.signal.aborted) enviar("error", { mensaje: mensajeDelFallo(e) });
      } finally {
        if (!cerrado) {
          cerrado = true;
          try {
            flujo.close();
          } catch {
            /* ya estaba cerrado */
          }
        }
      }
    },
    cancel() {
      cerrado = true;
      control.abort();
    },
  });
}

/** Un bloque de líneas (un evento) en su nombre y sus datos; null si no trae datos o no son JSON (un trozo roto no tumba la conversación). */
function leerBloque(bloque: string): EventoSSE | null {
  let evento = "message";
  const datos: string[] = [];
  for (const linea of bloque.split("\n")) {
    if (linea.startsWith(":")) continue; // comentario (latido)
    if (linea.startsWith("event:")) evento = linea.slice(6).trim();
    else if (linea.startsWith("data:")) datos.push(linea.slice(5).replace(/^ /, ""));
  }
  if (datos.length === 0) return null;
  try {
    return { evento, datos: JSON.parse(datos.join("\n")) };
  } catch {
    return null;
  }
}

/** Lee un flujo SSE: entrega cada evento apenas se completa, aunque llegue partido en trozos (también un carácter de varios bytes). */
export async function* leerEventosSSE(flujo: ReadableStream<Uint8Array>): AsyncGenerator<EventoSSE> {
  const lector = flujo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      const bruto = resto + decodificador.decode(value, { stream: true });
      // Un «\r» al final puede ser la mitad de un «\r\n» que termina de llegar en el trozo siguiente: se deja pendiente.
      const pendiente = bruto.endsWith("\r") ? "\r" : "";
      resto = bruto.slice(0, bruto.length - pendiente.length).replace(/\r\n?/g, "\n") + pendiente;
      for (let fin = resto.indexOf("\n\n"); fin >= 0; fin = resto.indexOf("\n\n")) {
        const e = leerBloque(resto.slice(0, fin));
        resto = resto.slice(fin + 2);
        if (e) yield e;
      }
    }
    // Un último evento al que no le llegó la línea en blanco.
    resto = (resto + decodificador.decode()).replace(/\r\n?/g, "\n");
    const e = resto.trim() ? leerBloque(resto) : null;
    if (e) yield e;
  } finally {
    await lector.cancel().catch(() => {});
  }
}
