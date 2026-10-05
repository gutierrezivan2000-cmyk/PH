/** El audio del demo: bytes por posición, tramas completas y —con el ffmpeg real— un MP3 que se decodifica sin errores. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BYTES_POR_TRAMA, MS_POR_TRAMA, bytesDeAudioDemo, flujoDeAudioDemo, leerAudioDemo } from "./audio-demo";
import { leerRango } from "./audio-http";

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
const HORA = 60 * MIN;

async function juntar(flujo: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const lector = flujo.getReader();
  const trozos: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
  }
  return Buffer.concat(trozos);
}

describe("audio del demo", () => {
  it("mide tramas completas: 8 h a 32 kbps son 115 MB", () => {
    expect(bytesDeAudioDemo(8 * HORA) % BYTES_POR_TRAMA).toBe(0);
    expect(bytesDeAudioDemo(8 * HORA)).toBe((8 * HORA) / MS_POR_TRAMA * BYTES_POR_TRAMA);
    expect(bytesDeAudioDemo(8_040_000)).toBe(Math.ceil(8_040_000 / MS_POR_TRAMA) * BYTES_POR_TRAMA);
    // una duración que no es múltiplo de 36 ms se redondea hacia arriba
    expect(bytesDeAudioDemo(37)).toBe(2 * BYTES_POR_TRAMA);
    expect(bytesDeAudioDemo(0)).toBe(BYTES_POR_TRAMA);
  });

  it("cada trama empieza con FF F3 48 C4 y el resto son ceros", () => {
    const todo = leerAudioDemo(1_000, 0, bytesDeAudioDemo(1_000) - 1);
    expect(todo.byteLength).toBe(bytesDeAudioDemo(1_000));
    for (let pos = 0; pos < todo.byteLength; pos += BYTES_POR_TRAMA) {
      expect([...todo.subarray(pos, pos + 4)]).toEqual([0xff, 0xf3, 0x48, 0xc4]);
      expect(todo.subarray(pos + 4, pos + BYTES_POR_TRAMA).every((b) => b === 0)).toBe(true);
    }
  });

  it("un rango cualquiera sale igual que ese trozo del archivo entero (también si parte una cabecera por la mitad)", () => {
    const duracion = 20_000;
    const total = bytesDeAudioDemo(duracion);
    const todo = leerAudioDemo(duracion, 0, total - 1);
    for (const [desde, hasta] of [[0, 0], [2, 5], [143, 144], [145, 146], [1000, 1999], [total - 3, total - 1], [BYTES_POR_TRAMA * 7 + 3, BYTES_POR_TRAMA * 9 + 1]]) {
      expect(Buffer.from(leerAudioDemo(duracion, desde, hasta)).equals(Buffer.from(todo.subarray(desde, hasta + 1)))).toBe(true);
    }
  });

  it("fuera de rango: vacío o acotado al final", () => {
    const total = bytesDeAudioDemo(1_000);
    expect(leerAudioDemo(1_000, 10, 5).byteLength).toBe(0);
    expect(leerAudioDemo(1_000, total + 5, total + 9).byteLength).toBe(0);
    expect(leerAudioDemo(1_000, total - 2, total + 99).byteLength).toBe(2);
  });

  it("el flujo entrega los mismos bytes, en trozos", async () => {
    const duracion = 30_000;
    const total = bytesDeAudioDemo(duracion);
    const flujo = await juntar(flujoDeAudioDemo(duracion, 100, total - 50, 1_000));
    expect(Buffer.from(flujo).equals(Buffer.from(leerAudioDemo(duracion, 100, total - 50)))).toBe(true);
    expect((await juntar(flujoDeAudioDemo(duracion, total + 1, total + 9))).byteLength).toBe(0);
  });

  it("servido por rangos (como lo pide el navegador) reconstruye el archivo entero", async () => {
    const duracion = 45_000;
    const total = bytesDeAudioDemo(duracion);
    const partes: Uint8Array[] = [];
    let desde = 0;
    while (desde < total) {
      const r = leerRango(`bytes=${desde}-`, total, 5_000);
      if (r.tipo !== "rango") throw new Error("se esperaba un rango");
      partes.push(await juntar(flujoDeAudioDemo(duracion, r.desde, r.hasta)));
      desde = r.hasta + 1;
    }
    expect(partes.length).toBeGreaterThan(1);
    expect(Buffer.concat(partes).equals(Buffer.from(leerAudioDemo(duracion, 0, total - 1)))).toBe(true);
  });
});

describe.skipIf(!hayFfmpeg)("audio del demo con ffmpeg real", () => {
  it("es un MP3 válido: se decodifica sin un solo error y dura lo que dice (mono, 16 kHz)", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "audio-demo-"));
    try {
      const duracion = 60_000;
      const archivo = join(carpeta, "demo.mp3");
      const wav = join(carpeta, "demo.wav");
      writeFileSync(archivo, leerAudioDemo(duracion, 0, bytesDeAudioDemo(duracion) - 1));
      // `-v error`: una trama dañada o desincronizada sale por stderr y con un código distinto de 0.
      const r = spawnSync(FFMPEG, ["-v", "error", "-y", "-i", archivo, "-f", "wav", wav], { encoding: "utf8" });
      expect(r.stderr.trim()).toBe("");
      expect(r.status).toBe(0);
      // WAV de 16 bits, mono, 16 kHz: 32.000 bytes por segundo (más 44 de cabecera).
      const segundos = (statSync(wav).size - 44) / 32_000;
      expect(Math.abs(segundos - 60)).toBeLessThanOrEqual(0.1);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it("un trozo servido por rangos (a mitad de archivo) también se decodifica", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "audio-demo-"));
    try {
      const duracion = 8 * HORA;
      // El minuto 5:12:40 de una reunión de 8 h: el reproductor pide desde ahí, alineado a trama.
      const desde = Math.floor((5 * HORA + 12 * MIN + 40_000) / MS_POR_TRAMA) * BYTES_POR_TRAMA;
      const archivo = join(carpeta, "trozo.mp3");
      writeFileSync(archivo, leerAudioDemo(duracion, desde, desde + 40 * BYTES_POR_TRAMA - 1));
      const r = spawnSync(FFMPEG, ["-v", "error", "-i", archivo, "-f", "null", "-"], { encoding: "utf8" });
      expect(r.stderr.trim()).toBe("");
      expect(r.status).toBe(0);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
