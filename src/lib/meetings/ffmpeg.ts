/**
 * ffmpeg: normalizar una fuente a MP3 CBR 32 kbps, mono, 16 kHz, en tramos de 10 minutos.
 *
 * ffmpeg no lee de Vercel Blob directamente: los blobs son privados (piden `Authorization`), el ffmpeg estático
 * (2018) se conecta por HTTPS con una raíz de certificados que el entorno de Vercel quizá no tenga, y un `-headers`
 * con el token se vería en la lista de procesos. En su lugar se sirve el archivo por un servidor HTTP local
 * (127.0.0.1, puerto libre) que responde `Range` leyendo del almacén. Así ffmpeg salta (`-ss`) y relee con rangos
 * igual que sobre cualquier URL, y todo es comprobable en local con una carpeta como almacén.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Almacen } from "./almacen";
import { MP3_TRAMA_BYTES, TRAMO_MS, duracionMp3Cbr } from "./tipos";

/* ════════════════════════════════════════════════════════════════════
   Errores
   ════════════════════════════════════════════════════════════════════ */

export type TipoErrorAudio = "fuente_invalida" | "sin_audio" | "transitorio";

export class ErrorAudio extends Error {
  readonly tipo: TipoErrorAudio;
  constructor(mensaje: string, tipo: TipoErrorAudio) {
    super(mensaje);
    this.name = "ErrorAudio";
    this.tipo = tipo;
  }
}

/**
 * Qué salió mal, según lo que escribió ffmpeg. Un archivo dañado o de un formato que no entiende NO se arregla
 * reintentando; un corte de red o del servicio sí.
 */
export function clasificarSalidaFfmpeg(stderr: string): ErrorAudio {
  const cola = stderr.trim().split("\n").slice(-6).join(" ").slice(-400);
  if (/does not contain any stream|Output file is empty|no audio|Stream map .* matches no streams/i.test(stderr)) {
    return new ErrorAudio("El archivo no tiene audio que podamos leer.", "sin_audio");
  }
  if (/Invalid data found|moov atom not found|Unsupported codec|could not find codec|Header missing|Error while decoding|Invalid argument/i.test(stderr)) {
    return new ErrorAudio("No pudimos leer este archivo: parece dañado o no es un audio o video compatible.", "fuente_invalida");
  }
  return new ErrorAudio(`No pudimos preparar el audio (${cola || "sin detalle"}).`, "transitorio");
}

/** `Duration: 03:40:12.34, start: …` → milisegundos (null si el contenedor no la trae: «N/A»). */
export function leerDuracionDeFfmpeg(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(stderr);
  if (!m) return null;
  const ms = m[4] ? Math.round(Number(`0.${m[4]}`) * 1000) : 0;
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + ms;
}

/** Una línea de la lista de segmentos (`seg_0007.mp3,20.016000,22.069063`). */
export function leerLineaDeSegmento(linea: string): { nombre: string; n: number } | null {
  const m = /^(seg_(\d+)\.mp3),[\d.]+,[\d.]+$/.exec(linea.trim());
  return m ? { nombre: m[1], n: Number(m[2]) } : null;
}

/** El valor de una cabecera `Range` de HTTP contra un archivo de `total` bytes. null = no hay rango; «invalido» = 416. */
export function leerRangoHttp(valor: string | undefined, total: number): { desde: number; hasta: number } | null | "invalido" {
  if (!valor) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(valor.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null; // otra forma (varios rangos…): se sirve el archivo entero
  if (m[1] === "") {
    const sufijo = Number(m[2]);
    if (sufijo === 0) return "invalido";
    return { desde: Math.max(0, total - sufijo), hasta: total - 1 };
  }
  const desde = Number(m[1]);
  if (desde >= total) return "invalido";
  const hasta = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  return hasta < desde ? "invalido" : { desde, hasta };
}

/* ════════════════════════════════════════════════════════════════════
   El archivo, servido por HTTP local con Range
   ════════════════════════════════════════════════════════════════════ */

export type FuenteServida = {
  /** Dónde la ve ffmpeg: http://127.0.0.1:<puerto>/<ruta al azar> */
  url: string;
  total: number;
  /** El byte más alto que ffmpeg ha pedido hasta ahora: sirve de avance. */
  posicion: () => number;
  cerrar: () => Promise<void>;
};

export async function servirFuente(almacen: Almacen, urlAlmacen: string): Promise<FuenteServida> {
  const total = await almacen.tamano(urlAlmacen);
  let posicion = 0;
  const abiertas = new Set<AbortController>();
  // Solo escucha en 127.0.0.1, y además exige una ruta al azar: nada más que ffmpeg sabe cómo pedir el archivo.
  const ruta = `/${randomUUID()}`;

  async function atender(req: IncomingMessage, res: ServerResponse) {
    if (req.url !== ruta) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const rango = leerRangoHttp(req.headers.range, total);
    if (rango === "invalido") {
      res.writeHead(416, { "Content-Range": `bytes */${total}` }).end();
      return;
    }
    const desde = rango?.desde ?? 0;
    const hasta = rango?.hasta ?? total - 1;
    res.writeHead(rango ? 206 : 200, {
      "Accept-Ranges": "bytes",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(Math.max(0, hasta - desde + 1)),
      ...(rango ? { "Content-Range": `bytes ${desde}-${hasta}/${total}` } : {}),
    });
    if (req.method === "HEAD" || total === 0) {
      res.end();
      return;
    }
    const control = new AbortController();
    abiertas.add(control);
    res.on("close", () => {
      control.abort();
      abiertas.delete(control);
    });
    try {
      const lectura = await almacen.leer(urlAlmacen, { rango: { desde, hasta }, senal: control.signal });
      const nodo = Readable.fromWeb(lectura.flujo as import("node:stream/web").ReadableStream<Uint8Array>);
      let enviados = 0;
      nodo.on("data", (c: Buffer) => {
        enviados += c.length;
        posicion = Math.max(posicion, desde + enviados);
      });
      // Si el almacén falla a mitad, se corta la conexión: ffmpeg (con -reconnect) vuelve a pedir desde donde iba.
      nodo.on("error", () => res.destroy());
      nodo.pipe(res);
    } catch {
      res.destroy();
    }
  }

  const servidor = createServer((req, res) => void atender(req, res));
  await new Promise<void>((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(0, "127.0.0.1", () => resolver());
  });
  const direccion = servidor.address();
  if (!direccion || typeof direccion === "string") throw new ErrorAudio("No pudimos preparar la lectura del archivo.", "transitorio");

  return {
    url: `http://127.0.0.1:${direccion.port}${ruta}`,
    total,
    posicion: () => posicion,
    cerrar: () =>
      new Promise<void>((resolver) => {
        for (const c of abiertas) c.abort();
        servidor.closeAllConnections?.();
        servidor.close(() => resolver());
      }),
  };
}

/* ════════════════════════════════════════════════════════════════════
   Normalizar
   ════════════════════════════════════════════════════════════════════ */

export async function rutaFfmpeg(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const modulo = (await import("@ffmpeg-installer/ffmpeg")) as { path?: string; default?: { path?: string } };
  const ruta = modulo.path ?? modulo.default?.path;
  if (!ruta) throw new ErrorAudio("No encontramos el programa que prepara el audio.", "transitorio");
  return ruta;
}

export type SegmentoNormalizado = { n: number; datos: Uint8Array; duracionMs: number };

/** Lo que sabe la pasada mientras entrega segmentos: sirve para estimar cuánto falta. */
export type ContextoSegmento = {
  /** La duración que dice el contenedor (null si no la trae). */
  duracionContenedorMs: number | null;
  /** Qué parte del archivo (en bytes) ya se leyó, de 0 a 1. */
  fraccion: number;
};

export type ResultadoNormalizacion = {
  /** true = se llegó al final de la fuente; false = se paró por el presupuesto (la sigue otra tarea). */
  completo: boolean;
  /** Cuántos segmentos se entregaron en esta pasada. */
  segmentos: number;
  /** La duración que dice el contenedor (null si no la trae). */
  duracionContenedorMs: number | null;
};

export type OpcionesNormalizar = {
  almacen: Almacen;
  /** URL de la fuente en el almacén. */
  url: string;
  /** Desde dónde seguir (0 = desde el principio). */
  desdeMs: number;
  /** Número del primer segmento de esta pasada. */
  numeroInicial: number;
  /** Cuánto tiempo puede tardar esta pasada. Pasado esto se detiene de forma limpia y se entrega lo hecho. */
  presupuestoMs: number;
  /** Se llama, en orden, con cada segmento terminado; aquí se sube y se anota. Si falla, se aborta la pasada. */
  alTerminarSegmento: (s: SegmentoNormalizado, contexto: ContextoSegmento) => Promise<void>;
  alProgreso?: (fraccion: number) => void;
  senal?: AbortSignal;
  /** Para pruebas: otro tamaño de segmento. */
  tramoMs?: number;
  ffmpeg?: string;
};

/** Cuánto esperar a que ffmpeg cierre limpio tras pedirle que pare, antes de matarlo. */
const GRACIA_AL_DETENER_MS = 10_000;

export function argumentosDeNormalizacion(o: { url: string; desdeMs: number; numeroInicial: number; tramoMs: number; carpeta: string }): string[] {
  return [
    "-hide_banner", "-nostdin", "-nostats", "-loglevel", "info",
    // Entrada por HTTP local: si se corta, se vuelve a pedir desde donde iba (y no se queda colgado en silencio).
    "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "4", "-rw_timeout", "30000000",
    ...(o.desdeMs > 0 ? ["-ss", (o.desdeMs / 1000).toFixed(3)] : []),
    "-i", o.url,
    "-vn", "-map_metadata", "-1", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
    // Las opciones del MP3 van DENTRO de segment_format_options: sueltas las recibiría el muxer «segment». Sin Xing ni
    // ID3, un segmento es solo tramas y concatenar segmentos da un MP3 válido.
    "-f", "segment", "-segment_format", "mp3", "-segment_format_options", "id3v2_version=0:write_xing=0",
    "-segment_time", String(o.tramoMs / 1000), "-reset_timestamps", "1", "-segment_start_number", String(o.numeroInicial),
    "-segment_list", "pipe:1", "-segment_list_type", "csv",
    join(o.carpeta, "seg_%04d.mp3"),
  ];
}

export async function normalizarFuente(o: OpcionesNormalizar): Promise<ResultadoNormalizacion> {
  const tramoMs = o.tramoMs ?? TRAMO_MS;
  const ffmpeg = o.ffmpeg ?? (await rutaFfmpeg());
  const carpeta = await mkdtemp(join(tmpdir(), "reunion-norm-"));
  const fuente = await servirFuente(o.almacen, o.url).catch(async (e) => {
    await rm(carpeta, { recursive: true, force: true });
    throw e;
  });

  let detenidoPor: "presupuesto" | "senal" | "fallo" | null = null;
  let falloDeSegmento: unknown = null;
  let entregados = 0;
  let duracionContenedorMs: number | null = null;
  let stderr = "";
  let pendiente = Buffer.alloc(0);
  let cola: Promise<void> = Promise.resolve();

  const hijo = spawn(ffmpeg, argumentosDeNormalizacion({ url: fuente.url, desdeMs: o.desdeMs, numeroInicial: o.numeroInicial, tramoMs, carpeta }), {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const detener = (motivo: "presupuesto" | "senal" | "fallo") => {
    if (detenidoPor) return;
    detenidoPor = motivo;
    hijo.kill("SIGINT"); // limpio: ffmpeg cierra el segmento en curso y lo entrega completo (más corto)
    setTimeout(() => hijo.kill("SIGKILL"), GRACIA_AL_DETENER_MS).unref();
  };
  const temporizador = setTimeout(() => detener("presupuesto"), Math.max(1000, o.presupuestoMs));
  const alAbortar = () => detener("senal");
  o.senal?.addEventListener("abort", alAbortar, { once: true });
  if (o.senal?.aborted) detener("senal");
  const avance = o.alProgreso ? setInterval(() => o.alProgreso?.(Math.min(1, fuente.posicion() / Math.max(1, fuente.total))), 2000) : null;

  const entregar = async (nombre: string) => {
    const ruta = join(carpeta, nombre);
    const datos = await readFile(ruta);
    const n = Number(/seg_(\d+)\.mp3/.exec(nombre)?.[1]);
    await o.alTerminarSegmento(
      { n, datos: new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength), duracionMs: duracionMp3Cbr(datos.byteLength) },
      { duracionContenedorMs, fraccion: Math.min(1, fuente.posicion() / Math.max(1, fuente.total)) },
    );
    entregados++;
    await unlink(ruta).catch(() => {});
  };

  hijo.stdout.on("data", (trozo: Buffer) => {
    pendiente = Buffer.concat([pendiente, trozo]);
    let i: number;
    while ((i = pendiente.indexOf(10)) >= 0) {
      const linea = pendiente.subarray(0, i).toString("utf8");
      pendiente = pendiente.subarray(i + 1);
      const seg = leerLineaDeSegmento(linea);
      if (!seg) continue;
      // Uno tras otro y en orden; si la entrega falla (no se pudo subir), no tiene sentido seguir.
      cola = cola.then(async () => {
        if (falloDeSegmento) return;
        try {
          await entregar(seg.nombre);
        } catch (e) {
          falloDeSegmento = e;
          detener("fallo");
        }
      });
    }
  });
  hijo.stderr.on("data", (trozo: Buffer) => {
    stderr = (stderr + trozo.toString("utf8")).slice(-12_000);
    if (duracionContenedorMs === null) duracionContenedorMs = leerDuracionDeFfmpeg(stderr);
  });

  const codigo = await new Promise<number | null>((resolver) => {
    hijo.once("error", (e) => {
      stderr += String(e);
      resolver(-1);
    });
    hijo.once("close", (c) => resolver(c));
  });
  clearTimeout(temporizador);
  if (avance) clearInterval(avance);
  o.senal?.removeEventListener("abort", alAbortar);
  await cola;
  await fuente.cerrar();
  await rm(carpeta, { recursive: true, force: true });

  if (falloDeSegmento) throw falloDeSegmento;
  const completo = codigo === 0 && detenidoPor === null;
  if (!completo && detenidoPor === null) throw clasificarSalidaFfmpeg(stderr);
  if (completo && entregados === 0 && o.desdeMs === 0) throw new ErrorAudio("El archivo no tiene audio que podamos leer.", "sin_audio");
  return { completo, segmentos: entregados, duracionContenedorMs };
}

/** Bytes de una trama MP3 a 32 kbps / 16 kHz (re-exportado para quien arma rangos). */
export const BYTES_POR_TRAMA = MP3_TRAMA_BYTES;
