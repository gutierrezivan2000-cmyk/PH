/**
 * El almacén de producción: Vercel Blob privado.
 *
 * Las lecturas privadas llevan `Authorization: Bearer <token>` (lo pone el SDK). Se piden SIN caché: lo que se lee
 * acaba de escribirse o se sobrescribe en los reintentos, y una copia vieja del borde daría datos mezclados.
 * Los mensajes del SDK están en inglés: aquí se clasifican y salen en español.
 */
import { ErrorAlmacen, type Almacen, type LecturaAlmacen, type ObjetoAlmacen, type RangoBytes } from "./almacen";

/** Un corte de red, un 5xx o un límite de uso se reintenta; lo demás (permiso, almacén suspendido) no. */
function clasificar(e: unknown): ErrorAlmacen {
  if (e instanceof ErrorAlmacen) return e;
  const mensaje = e instanceof Error ? e.message : String(e);
  if (/not found|does not exist|\b404\b/i.test(mensaje)) return new ErrorAlmacen("El archivo no existe en el almacenamiento.", "no_encontrado");
  if (/store (does not exist|has been suspended)|access denied|invalid token|unauthorized|forbidden/i.test(mensaje)) {
    return new ErrorAlmacen("El almacenamiento de grabaciones no está disponible. Avisa a soporte.", "fatal");
  }
  return new ErrorAlmacen(`No pudimos acceder al almacenamiento (${mensaje.slice(0, 120)}).`, "transitorio");
}

/** `content-range: bytes 100-199/1000` → { desde: 100, hasta: 199, total: 1000 }. */
export function leerContentRange(valor: string | null): { desde: number; hasta: number; total: number } | null {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(valor ?? "");
  return m ? { desde: Number(m[1]), hasta: Number(m[2]), total: Number(m[3]) } : null;
}

const cabeceraRango = (r: RangoBytes) => `bytes=${r.desde}-${r.hasta ?? ""}`;

/** Descarta los primeros `n` bytes de un flujo (por si el servicio ignora el rango y manda el archivo entero). */
function saltar(flujo: ReadableStream<Uint8Array>, n: number): ReadableStream<Uint8Array> {
  let pendiente = n;
  const lector = flujo.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(control) {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) return control.close();
        if (pendiente >= value.byteLength) {
          pendiente -= value.byteLength;
          continue;
        }
        control.enqueue(pendiente > 0 ? value.subarray(pendiente) : value);
        pendiente = 0;
        return;
      }
    },
    cancel: (motivo) => lector.cancel(motivo),
  });
}

export class AlmacenBlob implements Almacen {
  async subir(pathname: string, cuerpo: Uint8Array, contentType: string) {
    try {
      const { put } = await import("@vercel/blob");
      const r = await put(pathname, Buffer.from(cuerpo.buffer, cuerpo.byteOffset, cuerpo.byteLength), {
        access: "private", addRandomSuffix: false, allowOverwrite: true, contentType,
      });
      return { url: r.url, pathname: r.pathname };
    } catch (e) {
      throw clasificar(e);
    }
  }

  async subirFlujo(pathname: string, flujo: ReadableStream<Uint8Array>, contentType: string) {
    try {
      const { put } = await import("@vercel/blob");
      const r = await put(pathname, flujo, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType, multipart: true });
      return { url: r.url, pathname: r.pathname };
    } catch (e) {
      throw clasificar(e);
    }
  }

  async leer(url: string, opciones?: { rango?: RangoBytes; senal?: AbortSignal }): Promise<LecturaAlmacen> {
    let r;
    try {
      const { get } = await import("@vercel/blob");
      r = await get(url, {
        access: "private",
        useCache: false,
        abortSignal: opciones?.senal,
        ...(opciones?.rango ? { headers: { Range: cabeceraRango(opciones.rango) } } : {}),
      });
    } catch (e) {
      if (opciones?.senal?.aborted) throw e;
      throw clasificar(e);
    }
    if (!r || r.statusCode !== 200) throw new ErrorAlmacen("El archivo no existe en el almacenamiento.", "no_encontrado");

    const rango = leerContentRange(r.headers.get("content-range"));
    if (rango) return { flujo: r.stream, ...rango };

    // Sin «content-range» el servicio mandó el archivo entero: se salta lo que sobra del principio (y se corta al final).
    const total = r.blob.size;
    const desde = opciones?.rango?.desde ?? 0;
    const hasta = Math.min(opciones?.rango?.hasta ?? total - 1, total - 1);
    if (desde === 0 && hasta === total - 1) return { flujo: r.stream, desde, hasta, total };
    console.warn("[meetings/almacen] el almacenamiento no respondió al rango; se lee el archivo entero y se recorta");
    const lector = saltar(r.stream, desde).getReader();
    let restante = hasta - desde + 1;
    const flujo = new ReadableStream<Uint8Array>({
      async pull(control) {
        const { done, value } = await lector.read();
        if (done || restante <= 0) return control.close();
        const parte = value.byteLength > restante ? value.subarray(0, restante) : value;
        restante -= parte.byteLength;
        control.enqueue(parte);
        if (restante <= 0) {
          await lector.cancel().catch(() => {});
          control.close();
        }
      },
      cancel: (motivo) => lector.cancel(motivo),
    });
    return { flujo, desde, hasta, total };
  }

  async tamano(url: string) {
    try {
      const { head } = await import("@vercel/blob");
      return (await head(url)).size;
    } catch (e) {
      throw clasificar(e);
    }
  }

  async listar(prefijo: string): Promise<ObjetoAlmacen[]> {
    try {
      const { list } = await import("@vercel/blob");
      const salida: ObjetoAlmacen[] = [];
      let cursor: string | undefined;
      do {
        const pagina = await list({ prefix: prefijo, cursor, limit: 1000 });
        for (const b of pagina.blobs) salida.push({ url: b.url, pathname: b.pathname, size: b.size });
        cursor = pagina.hasMore ? pagina.cursor : undefined;
      } while (cursor);
      return salida;
    } catch (e) {
      throw clasificar(e);
    }
  }

  async borrar(urls: string[]) {
    if (urls.length === 0) return;
    try {
      const { del } = await import("@vercel/blob");
      for (let i = 0; i < urls.length; i += 500) await del(urls.slice(i, i + 500));
    } catch (e) {
      throw clasificar(e);
    }
  }
}

let unico: AlmacenBlob | null = null;
export const almacenBlob = (): AlmacenBlob => (unico ??= new AlmacenBlob());
