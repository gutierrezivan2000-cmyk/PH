/**
 * Almacén en una carpeta: para las pruebas (y para probar el procesamiento sin Vercel Blob). Las «URL» son
 * `local://<ruta>`; la ruta no puede salir de la carpeta.
 */
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { ErrorAlmacen, type Almacen, type ObjetoAlmacen } from "./almacen";

const PREFIJO = "local://";

export class AlmacenLocal implements Almacen {
  readonly raiz: string;
  /** Cuántas lecturas por rango se hicieron (las pruebas comprueban que se usan rangos y no archivos enteros). */
  lecturas: Array<{ url: string; desde: number; hasta: number | undefined }> = [];
  /** El tipo con el que se subió cada archivo (para comprobar que el procesamiento declara el correcto). */
  tipos = new Map<string, string>();

  constructor(raiz: string) {
    this.raiz = resolve(raiz);
  }

  private ruta(pathname: string): string {
    const r = resolve(this.raiz, pathname);
    if (r !== this.raiz && !r.startsWith(this.raiz + sep)) throw new ErrorAlmacen("Ruta fuera del almacén.", "fatal");
    return r;
  }
  private pathnameDe(url: string): string {
    if (!url.startsWith(PREFIJO)) throw new ErrorAlmacen(`URL que no es de este almacén: ${url.slice(0, 40)}`, "fatal");
    return url.slice(PREFIJO.length);
  }
  urlDe(pathname: string): string {
    return PREFIJO + pathname;
  }

  async subir(pathname: string, cuerpo: Uint8Array, contentType = "application/octet-stream") {
    const destino = this.ruta(pathname);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, cuerpo);
    this.tipos.set(pathname, contentType);
    return { url: this.urlDe(pathname), pathname };
  }

  async subirFlujo(pathname: string, flujo: ReadableStream<Uint8Array>, contentType = "application/octet-stream") {
    this.tipos.set(pathname, contentType);
    const destino = this.ruta(pathname);
    await mkdir(dirname(destino), { recursive: true });
    const trozos: Uint8Array[] = [];
    const lector = flujo.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value);
    }
    await writeFile(destino, Buffer.concat(trozos));
    return { url: this.urlDe(pathname), pathname };
  }

  async leer(url: string, opciones?: { rango?: { desde: number; hasta?: number }; senal?: AbortSignal }) {
    const destino = this.ruta(this.pathnameDe(url));
    let total: number;
    try {
      total = (await stat(destino)).size;
    } catch {
      throw new ErrorAlmacen("El archivo no existe.", "no_encontrado");
    }
    const desde = opciones?.rango?.desde ?? 0;
    const hasta = Math.min(opciones?.rango?.hasta ?? total - 1, total - 1);
    this.lecturas.push({ url, desde, hasta: opciones?.rango?.hasta });
    if (desde > hasta || total === 0) {
      return { flujo: new ReadableStream<Uint8Array>({ start: (c) => c.close() }), desde, hasta: desde - 1, total };
    }
    const flujo = Readable.toWeb(createReadStream(destino, { start: desde, end: hasta })) as unknown as ReadableStream<Uint8Array>;
    return { flujo, desde, hasta, total };
  }

  async tamano(url: string) {
    try {
      return (await stat(this.ruta(this.pathnameDe(url)))).size;
    } catch {
      throw new ErrorAlmacen("El archivo no existe.", "no_encontrado");
    }
  }

  async listar(prefijo: string): Promise<ObjetoAlmacen[]> {
    const salida: ObjetoAlmacen[] = [];
    const recorrer = async (dir: string, rel: string) => {
      let entradas;
      try {
        entradas = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entradas) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await recorrer(join(dir, e.name), r);
        else if (r.startsWith(prefijo)) salida.push({ url: this.urlDe(r), pathname: r, size: (await stat(join(dir, e.name))).size });
      }
    };
    await recorrer(this.raiz, "");
    return salida.sort((a, b) => a.pathname.localeCompare(b.pathname));
  }

  async borrar(urls: string[]) {
    for (const u of urls) await rm(this.ruta(this.pathnameDe(u)), { force: true });
  }
}
