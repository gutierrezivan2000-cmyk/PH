/**
 * Integración del audio con el ffmpeg REAL del proyecto (se salta si no está): 25 minutos sintéticos en un
 * m4a (con el «moov» al final: ffmpeg tiene que SALTAR por rangos para leerlo), servidos desde una carpeta por el
 * mismo servidor HTTP local que usa producción.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AlmacenLocal } from "./almacen-local";
import { leerTodo, type Almacen } from "./almacen";
import {
  armarAudio, empiezaConTrama, esMultiploDeTrama, leerSegmentos, normalizadoMs, rangoDeBytes, recortar, rutaDeSegmento, siguienteSegmento,
  type SegmentoGuardado,
} from "./audio";
import { ErrorAudio, normalizarFuente, servirFuente } from "./ffmpeg";
import { MP3_TRAMA_BYTES } from "./tipos";

const FFMPEG = (() => {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return (createRequire(import.meta.url)("@ffmpeg-installer/ffmpeg") as { path: string }).path;
  } catch {
    return "";
  }
})();
const hayFfmpeg = Boolean(FFMPEG) && existsSync(FFMPEG);

const MIN = 60_000;
const DURACION_MS = 25 * MIN;
const PREFIJO = "meetings/reunion-prueba/";

let carpeta: string;
let almacen: AlmacenLocal;
let urlFuente: string;

const ffmpeg = (args: string[]) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });

/** Normaliza una fuente entera y guarda los segmentos en el almacén, como hace el trabajador. */
async function normalizarYGuardar(url: string, sourceId: string, previos: SegmentoGuardado[] = [], extra: { presupuestoMs?: number } = {}) {
  const segmentos = [...previos];
  const sig = siguienteSegmento(previos);
  const r = await normalizarFuente({
    almacen, url, desdeMs: sig.desdeMs, numeroInicial: sig.numero, presupuestoMs: extra.presupuestoMs ?? 120_000, ffmpeg: FFMPEG,
    alTerminarSegmento: async (s) => {
      const subido = await almacen.subir(rutaDeSegmento(PREFIJO, sourceId, s.n), s.datos, "audio/mpeg");
      segmentos.push({ n: s.n, url: subido.url, durationMs: s.duracionMs, bytes: s.datos.byteLength });
    },
  });
  return { ...r, segmentos };
}

/** Un almacén que lee despacio, para que ffmpeg no pueda terminar antes de que se acabe el presupuesto. */
function almacenLento(base: AlmacenLocal, retrasoPorTrozoMs: number): Almacen {
  return {
    subir: (...a) => base.subir(...a),
    subirFlujo: (...a) => base.subirFlujo(...a),
    tamano: (u) => base.tamano(u),
    listar: (p) => base.listar(p),
    borrar: (u) => base.borrar(u),
    async leer(url, opciones) {
      const l = await base.leer(url, opciones);
      const lector = l.flujo.getReader();
      const flujo = new ReadableStream<Uint8Array>({
        async pull(control) {
          await new Promise((r) => setTimeout(r, retrasoPorTrozoMs));
          const { done, value } = await lector.read();
          if (done) control.close();
          else control.enqueue(value);
        },
        cancel: (m) => lector.cancel(m),
      });
      return { ...l, flujo };
    },
  };
}

describe.skipIf(!hayFfmpeg)("audio con ffmpeg real", () => {
  beforeAll(() => {
    carpeta = mkdtempSync(join(tmpdir(), "reunion-int-"));
    almacen = new AlmacenLocal(join(carpeta, "almacen"));
    // 25 min de un tono con un hueco de silencio de 30 s cada 5 min, en AAC dentro de un MP4 con el «moov» AL FINAL.
    const fuente = join(carpeta, "fuente.m4a");
    ffmpeg(["-f", "lavfi", "-i", `sine=frequency=300:duration=${DURACION_MS / 1000}:sample_rate=16000`, "-af", "volume=0:enable='between(mod(t,300),200,230)'", "-c:a", "aac", "-b:a", "48k", fuente]);
    urlFuente = almacen.urlDe(`${PREFIJO}fuentes/fuente.m4a`);
    execFileSync("bash", ["-c", `mkdir -p ${join(carpeta, "almacen", PREFIJO, "fuentes")} && cp ${fuente} ${join(carpeta, "almacen", PREFIJO, "fuentes", "fuente.m4a")}`]);
  }, 120_000);
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  describe("el servidor local con Range", () => {
    it("responde 206 con el trozo pedido, 200 sin rango, HEAD y 416 fuera del archivo", async () => {
      const total = await almacen.tamano(urlFuente);
      const f = await servirFuente(almacen, urlFuente);
      try {
        const original = readFileSync(join(carpeta, "fuente.m4a"));
        const completo = await fetch(f.url);
        expect(completo.status).toBe(200);
        expect(completo.headers.get("accept-ranges")).toBe("bytes");
        expect(Buffer.from(await completo.arrayBuffer()).equals(original)).toBe(true);

        const trozo = await fetch(f.url, { headers: { Range: "bytes=1000-1999" } });
        expect(trozo.status).toBe(206);
        expect(trozo.headers.get("content-range")).toBe(`bytes 1000-1999/${total}`);
        expect(Buffer.from(await trozo.arrayBuffer()).equals(original.subarray(1000, 2000))).toBe(true);

        const abierto = await fetch(f.url, { headers: { Range: `bytes=${total - 10}-` } });
        expect(abierto.headers.get("content-range")).toBe(`bytes ${total - 10}-${total - 1}/${total}`);
        expect((await abierto.arrayBuffer()).byteLength).toBe(10);

        const sufijo = await fetch(f.url, { headers: { Range: "bytes=-5" } });
        expect(Buffer.from(await sufijo.arrayBuffer()).equals(original.subarray(total - 5))).toBe(true);

        const head = await fetch(f.url, { method: "HEAD" });
        expect(head.headers.get("content-length")).toBe(String(total));
        expect((await fetch(f.url, { headers: { Range: `bytes=${total}-` } })).status).toBe(416);
        expect((await fetch(f.url, { method: "POST" })).status).toBe(405);
        expect((await fetch(f.url.replace(/\/[^/]+$/, "/otra-ruta"))).status).toBe(404); // sin la ruta al azar no hay archivo
        expect((await fetch(new URL(f.url).origin + "/")).status).toBe(404);
        expect(f.posicion()).toBeGreaterThanOrEqual(total);
      } finally {
        await f.cerrar();
      }
    });
  });

  describe("normalizar → armar → recortar (25 minutos)", () => {
    let segmentos: SegmentoGuardado[];
    let audioUrl: string;
    let audioBytes: number;

    it("da 3 segmentos de tramas completas, que empiezan con una cabecera de trama, y suman 25 min", async () => {
      const r = await normalizarYGuardar(urlFuente, "s1");
      expect(r.completo).toBe(true);
      expect(r.segmentos).toHaveLength(3);
      expect(r.duracionContenedorMs).toBeGreaterThan(24 * MIN);
      segmentos = r.segmentos;
      expect(segmentos.map((s) => s.n)).toEqual([0, 1, 2]);
      for (const s of segmentos) {
        expect(esMultiploDeTrama(s.bytes), `segmento ${s.n}`).toBe(true);
        expect(empiezaConTrama(await leerTodo(almacen, s.url, { desde: 0, hasta: 1 })), `segmento ${s.n}`).toBe(true);
      }
      expect(segmentos[0].bytes).toBeGreaterThan(2_390_000);
      expect(segmentos[0].bytes).toBeLessThan(2_410_000);
      expect(Math.abs(normalizadoMs(segmentos) - DURACION_MS)).toBeLessThan(1000);
      expect(almacen.lecturas.some((l) => l.desde > 0), "ffmpeg tuvo que saltar por rangos para leer el moov").toBe(true);
    }, 120_000);

    it("audio.mp3 dura 25 min ± 1 s, pesa un múltiplo de 144 y CADA trama empieza con FF F3 (sin ID3 ni Xing en las uniones)", async () => {
      const armado = await armarAudio(almacen, `${PREFIJO}audio.mp3`, [{ id: "s1", idx: 0, segmentos }]);
      audioUrl = armado.url;
      audioBytes = armado.bytes;
      expect(Math.abs(armado.durationMs - DURACION_MS)).toBeLessThan(1000);
      expect(armado.bytes % MP3_TRAMA_BYTES).toBe(0);
      expect(armado.offsets.get("s1")).toBe(0);
      const todo = await leerTodo(almacen, audioUrl);
      expect(todo.byteLength).toBe(armado.bytes);
      let malas = 0;
      for (let b = 0; b < todo.byteLength; b += MP3_TRAMA_BYTES) if (todo[b] !== 0xff || (todo[b + 1] & 0xfe) !== 0xf2) malas++;
      expect(malas).toBe(0);
      // ffmpeg lo decodifica entero sin un solo error.
      writeFileSync(join(carpeta, "audio.mp3"), todo);
      const salida = execFileSync(FFMPEG, ["-v", "error", "-i", join(carpeta, "audio.mp3"), "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      expect(salida.trim()).toBe("");
    }, 120_000);

    it("recortar devuelve la duración pedida por rango, y ffmpeg la decodifica sin errores", async () => {
      const lecturasAntes = almacen.lecturas.length;
      const corte = await recortar(almacen, audioUrl, 9.5 * MIN, 20.5 * MIN, audioBytes);
      const nuevas = almacen.lecturas.slice(lecturasAntes);
      expect(nuevas).toHaveLength(1); // una sola lectura, por rango: no se baja el audio entero
      expect(nuevas[0].desde).toBe(rangoDeBytes(9.5 * MIN, 20.5 * MIN).desde);
      expect(corte.byteLength).toBeLessThan(audioBytes / 2);
      expect(empiezaConTrama(corte)).toBe(true);
      expect(esMultiploDeTrama(corte.byteLength)).toBe(true);
      const archivo = join(carpeta, "corte.mp3");
      writeFileSync(archivo, corte);
      const info = execFileSync("bash", ["-c", `${FFMPEG} -v error -i ${archivo} -f null - 2>&1; ${FFMPEG} -i ${archivo} -f null - 2>&1 | grep -o 'time=[0-9:.]*' | tail -1`], { encoding: "utf8" });
      expect(info).not.toMatch(/error|Invalid|Header missing/i);
      const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(info);
      const segundos = Number(m![1]) * 3600 + Number(m![2]) * 60 + Number(m![3]);
      expect(Math.abs(segundos - 11 * 60)).toBeLessThan(0.2);
    }, 120_000);
  });

  describe("reanudar tras quedarse sin presupuesto", () => {
    it("lo hecho se conserva, la siguiente pasada sigue desde `normalizedMs`, y el resultado es un audio continuo", async () => {
      const lento = almacenLento(almacen, 40);
      const porSegmento: SegmentoGuardado[] = [];
      const sig0 = siguienteSegmento([]);
      const primera = await normalizarFuente({
        almacen: lento, url: urlFuente, desdeMs: sig0.desdeMs, numeroInicial: sig0.numero, presupuestoMs: 4000, ffmpeg: FFMPEG, tramoMs: 60_000,
        alTerminarSegmento: async (s) => {
          const subido = await almacen.subir(rutaDeSegmento(PREFIJO, "s2", s.n), s.datos, "audio/mpeg");
          porSegmento.push({ n: s.n, url: subido.url, durationMs: s.duracionMs, bytes: s.datos.byteLength });
        },
      });
      expect(primera.completo).toBe(false);
      expect(primera.segmentos).toBeGreaterThan(0);
      expect(normalizadoMs(porSegmento)).toBeLessThan(DURACION_MS);
      // Los segmentos se entregaron completos y de a uno; aunque el último quedó más corto por la parada, es válido.
      for (const s of porSegmento) expect(esMultiploDeTrama(s.bytes)).toBe(true);

      const hecho = normalizadoMs(porSegmento);
      const sig = siguienteSegmento(porSegmento);
      expect(sig.desdeMs).toBe(hecho);
      expect(sig.numero).toBe(porSegmento.length);
      const resto = await normalizarFuente({
        almacen, url: urlFuente, desdeMs: sig.desdeMs, numeroInicial: sig.numero, presupuestoMs: 120_000, ffmpeg: FFMPEG, tramoMs: 60_000,
        alTerminarSegmento: async (s) => {
          const subido = await almacen.subir(rutaDeSegmento(PREFIJO, "s2", s.n), s.datos, "audio/mpeg");
          porSegmento.push({ n: s.n, url: subido.url, durationMs: s.duracionMs, bytes: s.datos.byteLength });
        },
      });
      expect(resto.completo).toBe(true);
      const numeros = porSegmento.map((s) => s.n);
      expect(numeros).toEqual(numeros.map((_, i) => i)); // sin huecos ni repetidos
      // La suma de lo normalizado en dos pasadas cubre la fuente (cada reanudación puede sumar o restar una trama de ajuste).
      expect(Math.abs(normalizadoMs(porSegmento) - DURACION_MS)).toBeLessThan(1500);

      const armado = await armarAudio(almacen, `${PREFIJO}audio-reanudado.mp3`, [{ id: "s2", idx: 0, segmentos: porSegmento }]);
      const todo = await leerTodo(almacen, armado.url);
      let malas = 0;
      for (let b = 0; b < todo.byteLength; b += MP3_TRAMA_BYTES) if (todo[b] !== 0xff || (todo[b + 1] & 0xfe) !== 0xf2) malas++;
      expect(malas).toBe(0);
      writeFileSync(join(carpeta, "reanudado.mp3"), todo);
      const salida = execFileSync(FFMPEG, ["-v", "error", "-i", join(carpeta, "reanudado.mp3"), "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      expect(salida.trim()).toBe("");
    }, 180_000);
  });

  describe("varias fuentes en una sola línea de tiempo", () => {
    it("calcula el desplazamiento de cada fuente a partir de la duración de las anteriores", async () => {
      const a = await normalizarYGuardar(urlFuente, "a");
      const b = await normalizarYGuardar(urlFuente, "b");
      const armado = await armarAudio(almacen, `${PREFIJO}dos.mp3`, [
        { id: "b", idx: 1, segmentos: b.segmentos },
        { id: "a", idx: 0, segmentos: a.segmentos },
      ]);
      expect(armado.offsets.get("a")).toBe(0);
      expect(armado.offsets.get("b")).toBe(normalizadoMs(a.segmentos));
      expect(Math.abs(armado.durationMs - 2 * DURACION_MS)).toBeLessThan(2000);
    }, 240_000);
  });

  describe("fuentes que no sirven", () => {
    it("un archivo dañado es un error de fuente (no se reintenta)", async () => {
      await almacen.subir(`${PREFIJO}fuentes/roto.m4a`, new Uint8Array(50_000).map((_, i) => (i * 31) % 251), "audio/mp4");
      const e = await normalizarFuente({ almacen, url: almacen.urlDe(`${PREFIJO}fuentes/roto.m4a`), desdeMs: 0, numeroInicial: 0, presupuestoMs: 60_000, ffmpeg: FFMPEG, alTerminarSegmento: async () => {} })
        .then(() => null, (err) => err as ErrorAudio);
      expect(e).toBeInstanceOf(ErrorAudio);
      expect(e!.tipo).toBe("fuente_invalida");
    }, 60_000);

    it("un video sin pista de audio dice que no hay audio", async () => {
      const mudo = join(carpeta, "mudo.mp4");
      ffmpeg(["-f", "lavfi", "-i", "testsrc=duration=3:size=160x120:rate=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", mudo]);
      await almacen.subir(`${PREFIJO}fuentes/mudo.mp4`, readFileSync(mudo), "video/mp4");
      const e = await normalizarFuente({ almacen, url: almacen.urlDe(`${PREFIJO}fuentes/mudo.mp4`), desdeMs: 0, numeroInicial: 0, presupuestoMs: 60_000, ffmpeg: FFMPEG, alTerminarSegmento: async () => {} })
        .then(() => null, (err) => err as ErrorAudio);
      expect(e).toBeInstanceOf(ErrorAudio);
      expect(e!.tipo).toBe("sin_audio");
    }, 60_000);

    it("si no se puede guardar un segmento, la pasada se aborta con ese error", async () => {
      const e = await normalizarFuente({
        almacen, url: urlFuente, desdeMs: 0, numeroInicial: 0, presupuestoMs: 60_000, ffmpeg: FFMPEG, tramoMs: 60_000,
        alTerminarSegmento: async () => {
          throw new Error("Blob no responde");
        },
      }).then(() => null, (err) => err as Error);
      expect(e?.message).toBe("Blob no responde");
    }, 60_000);

    it("una señal de cancelación detiene la pasada sin error", async () => {
      const control = new AbortController();
      setTimeout(() => control.abort(), 600);
      const lento = almacenLento(almacen, 60);
      const r = await normalizarFuente({ almacen: lento, url: urlFuente, desdeMs: 0, numeroInicial: 0, presupuestoMs: 60_000, ffmpeg: FFMPEG, tramoMs: 60_000, senal: control.signal, alTerminarSegmento: async () => {} });
      expect(r.completo).toBe(false);
    }, 60_000);
  });
});

describe("leerSegmentos", () => {
  it("lee lo que hay y descarta lo que no cuadra, en orden", () => {
    expect(leerSegmentos([{ n: 2, url: "u2", durationMs: 1, bytes: 144 }, { n: 0, url: "u0", durationMs: 1, bytes: 288 }, { n: "x" }, null, { n: 1, url: "u", durationMs: 1, bytes: 0 }])).toEqual([
      { n: 0, url: "u0", durationMs: 1, bytes: 288 },
      { n: 2, url: "u2", durationMs: 1, bytes: 144 },
    ]);
    expect(leerSegmentos(null)).toEqual([]);
    expect(leerSegmentos("no")).toEqual([]);
  });
});
