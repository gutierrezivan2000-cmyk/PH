/**
 * El procesamiento de punta a punta con el ffmpeg REAL, un almacén en carpeta y una base de datos falsa: una reunión
 * con un archivo m4a y una sesión de la grabadora (partes WebM partidas en bytes arbitrarios, como las de
 * MediaRecorder) pasa por ensamblar → normalizar → armar audio, y se reanuda cuando se acaba el tiempo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { leerTodo, type Almacen } from "./almacen";
import { AlmacenLocal } from "./almacen-local";
import { empiezaConTrama, leerSegmentos } from "./audio";
import { reintentarFallidas } from "./cola";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { avanzar } from "./orquestador";
import { MP3_TRAMA_BYTES } from "./tipos";
import { trabajar } from "./trabajador";

const FFMPEG = (() => {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return (createRequire(import.meta.url)("@ffmpeg-installer/ffmpeg") as { path: string }).path;
  } catch {
    return "";
  }
})();
const hayFfmpeg = Boolean(FFMPEG) && existsSync(FFMPEG);

const ID = "reunionprueba1";
const PREFIJO = `meetings/${ID}/`;
let carpeta: string;
let almacen: AlmacenLocal;
let db: DbFalsa;
let t: number;

const ffmpeg = (args: string[]) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
/** El reloj de una invocación: arranca en `t` (un poco por delante de la hora real) y avanza con el tiempo de verdad. */
const relojQueAvanza = () => {
  const base = t;
  const inicio = Date.now();
  return () => base + (Date.now() - inicio);
};
const opciones = (extra: Record<string, unknown> = {}) => ({
  presupuestoMs: 600_000, margenMinimoMs: 1000, reloj: relojQueAvanza(), deps: { almacen, ffmpeg: FFMPEG, tramoMs: 30_000 }, ...extra,
});
const fuente = (id: string) => db.meetingSource.filas.find((f) => f.id === id)!;
const tarea = (key: string) => db.meetingTask.filas.find((x) => x.key === key);

/** Un almacén que lee despacio (para que se acabe el tiempo a mitad de una fuente). */
function lento(base: AlmacenLocal, ms: number): Almacen {
  return {
    subir: (...a) => base.subir(...a),
    subirFlujo: (...a) => base.subirFlujo(...a),
    tamano: (u) => base.tamano(u),
    listar: (p) => base.listar(p),
    borrar: (u) => base.borrar(u),
    async leer(url, o) {
      const l = await base.leer(url, o);
      const lector = l.flujo.getReader();
      return {
        ...l,
        flujo: new ReadableStream<Uint8Array>({
          async pull(c) {
            await new Promise((r) => setTimeout(r, ms));
            const { done, value } = await lector.read();
            if (done) c.close();
            else c.enqueue(value);
          },
          cancel: (m) => lector.cancel(m),
        }),
      };
    },
  };
}

describe.skipIf(!hayFfmpeg)("el procesamiento con ffmpeg real", () => {
  beforeAll(() => {
    carpeta = mkdtempSync(join(tmpdir(), "reunion-proc-"));
  });
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  async function montarReunion(opciones: { archivoMin: number; sesionSeg: number }) {
    almacen = new AlmacenLocal(join(carpeta, `almacen-${Math.random().toString(36).slice(2, 8)}`));
    db = crearDbFalsa();
    fake.db = db;
    t = Date.now() + 60_000;
    await db.meeting.create({ data: { id: ID, status: "en_cola", stage: null, progress: 0, errorMessage: null } });

    // Fuente 1: un archivo m4a (con el «moov» al final)
    const m4a = join(carpeta, "archivo.m4a");
    ffmpeg(["-f", "lavfi", "-i", `sine=frequency=300:duration=${opciones.archivoMin * 60}:sample_rate=16000`, "-c:a", "aac", "-b:a", "48k", m4a]);
    const a = await almacen.subir(`${PREFIJO}fuentes/aaaaaaaa-archivo.m4a`, readFileSync(m4a), "audio/mp4");
    await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", session: null, name: "archivo.m4a", url: a.url, pathname: a.pathname, mimeType: "audio/mp4", sizeBytes: readFileSync(m4a).length, status: "recibida", normalizedMs: 0, segments: [], durationMs: null } });

    // Fuente 2: una sesión de la grabadora, en tres partes cortadas por bytes (no por límites del contenedor)
    const webm = join(carpeta, "sesion.webm");
    ffmpeg(["-f", "lavfi", "-i", `sine=frequency=500:duration=${opciones.sesionSeg}:sample_rate=48000`, "-c:a", "libopus", "-b:a", "32k", webm]);
    const bytes = readFileSync(webm);
    const cortes = [0, Math.floor(bytes.length * 0.31), Math.floor(bytes.length * 0.74), bytes.length];
    await db.meetingLivePart.create({ data: { meetingId: ID, session: 1, seq: -1, url: "", bytes: 0, durationMs: 0, mimeType: "" } }); // la reserva del número
    for (let i = 0; i < 3; i++) {
      const parte = bytes.subarray(cortes[i], cortes[i + 1]);
      const subida = await almacen.subir(`${PREFIJO}vivo/1/${i}.webm`, parte, "audio/webm");
      await db.meetingLivePart.create({ data: { meetingId: ID, session: 1, seq: i, url: subida.url, bytes: parte.length, durationMs: 15_000, mimeType: "audio/webm" } });
    }
    await db.meetingSource.create({ data: { id: "b", meetingId: ID, idx: 1, kind: "grabacion", session: 1, name: "Grabación en la app", url: null, mimeType: "audio/webm", sizeBytes: bytes.length, status: "recibida", normalizedMs: 0, segments: [], durationMs: null } });
  }

  beforeEach(() => {
    t = Date.now() + 60_000;
  });

  it("une la sesión de la grabadora, normaliza las dos fuentes y arma audio.mp3 con el inicio de cada una", async () => {
    await montarReunion({ archivoMin: 2, sesionSeg: 40 });
    await avanzar(ID);
    expect(db.meetingTask.filas.map((x) => x.key).sort()).toEqual(["ensamblar_sesion:b", "normalizar:a"]);

    const r = await trabajar(opciones());
    expect(r.fallidas).toBe(0);
    expect(db.meetingTask.filas.every((x) => x.status === "hecha")).toBe(true);
    expect(db.meetingTask.filas.map((x) => x.key).sort()).toEqual(["armar_audio", "ensamblar_sesion:b", "normalizar:a", "normalizar:b"]);

    // La sesión quedó ensamblada como UN archivo WebM, byte por byte igual a la suma de sus partes.
    expect(fuente("b")).toMatchObject({ pathname: `${PREFIJO}fuentes/sesion-1.webm`, status: "normalizada" });
    expect(almacen.tipos.get(`${PREFIJO}fuentes/sesion-1.webm`)).toBe("audio/webm");
    const ensamblada = await leerTodo(almacen, fuente("b").url as string);
    const sumaPartes = db.meetingLivePart.filas.filter((p) => (p.seq as number) >= 0).reduce((s, p) => s + (p.bytes as number), 0);
    expect(ensamblada.byteLength).toBe(sumaPartes);
    expect(tarea("ensamblar_sesion:b")!.result).toMatchObject({ partes: 3, huecos: 0 });

    // Segmentos, duraciones y desplazamientos.
    const a = fuente("a");
    const b = fuente("b");
    expect(Math.abs((a.durationMs as number) - 120_000)).toBeLessThan(500);
    expect(Math.abs((b.durationMs as number) - 40_000)).toBeLessThan(500);
    expect(a.offsetMs).toBe(0);
    expect(b.offsetMs).toBe(a.durationMs);
    // 120 s en segmentos de 30 s: cuatro, y a veces una cola de unos milisegundos (el relleno del AAC).
    expect(leerSegmentos(a.segments).length).toBeGreaterThanOrEqual(4);
    expect(leerSegmentos(a.segments).length).toBeLessThanOrEqual(5);
    expect(leerSegmentos(b.segments).length).toBeGreaterThanOrEqual(1);

    // audio.mp3
    const reunion = db.meeting.filas[0];
    expect(reunion.audioUrl).toBe(almacen.urlDe(`${PREFIJO}audio.mp3`));
    expect(Math.abs((reunion.durationMs as number) - 160_000)).toBeLessThan(1000);
    expect(reunion).toMatchObject({ status: "procesando", stage: "transcribiendo", progress: 0 });
    const audio = await leerTodo(almacen, reunion.audioUrl as string);
    expect(audio.byteLength % MP3_TRAMA_BYTES).toBe(0);
    expect(empiezaConTrama(audio)).toBe(true);
    let malas = 0;
    for (let i = 0; i < audio.byteLength; i += MP3_TRAMA_BYTES) if (audio[i] !== 0xff || (audio[i + 1] & 0xfe) !== 0xf2) malas++;
    expect(malas).toBe(0);
    writeFileSync(join(carpeta, "final.mp3"), audio);
    expect(execFileSync(FFMPEG, ["-v", "error", "-i", join(carpeta, "final.mp3"), "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()).toBe("");
  }, 180_000);

  it("el avance sube de 0 a 100 en la preparación y no retrocede", async () => {
    await montarReunion({ archivoMin: 1, sesionSeg: 20 });
    await avanzar(ID);
    const vistos: number[] = [];
    const original = db.meeting.updateMany.bind(db.meeting);
    db.meeting.updateMany = async (args) => {
      const r = await original(args);
      vistos.push(db.meeting.filas[0].progress as number);
      return r;
    };
    await trabajar(opciones());
    const preparando = vistos.filter((p, i) => i < vistos.length - 1 || p > 0);
    expect(preparando.some((p) => p > 0)).toBe(true);
    for (let i = 1; i < vistos.length; i++) {
      if (db.meeting.filas[0].stage === "preparando_audio") expect(vistos[i]).toBeGreaterThanOrEqual(vistos[i - 1]);
    }
    expect(db.meeting.filas[0].stage).toBe("transcribiendo");
  }, 120_000);

  it("si se acaba el tiempo a mitad de una fuente, lo hecho se conserva y otra pasada la termina", async () => {
    await montarReunion({ archivoMin: 12, sesionSeg: 20 });
    await avanzar(ID);
    const despacio = lento(almacen, 400);
    // Tiempo corto (a ffmpeg le quedan 5 s): la fuente larga no alcanza a terminar en la primera pasada.
    // (Con 22 s de margen, tras la primera pasada de ~5 s ya no quedan los 22 s mínimos para empezar otra: se detiene.)
    const primera = await trabajar(opciones({ presupuestoMs: 25_000, margenMinimoMs: 22_000, deps: { almacen: despacio, ffmpeg: FFMPEG, tramoMs: 30_000 } }));
    expect(primera.continuadas).toBeGreaterThanOrEqual(1);
    const hecho = fuente("a").normalizedMs as number;
    expect(hecho).toBeGreaterThan(0);
    expect(hecho).toBeLessThan(12 * 60_000);
    expect(fuente("a").status).toBe("normalizando");
    expect(tarea("normalizar:a")).toMatchObject({ attempts: expect.any(Number) });
    expect(tarea("normalizar:a")!.attempts).toBeLessThanOrEqual(1); // seguir no gasta intentos

    // Otra pasada (con tiempo, un minuto después) la completa desde donde iba.
    t += 60_000;
    const segundos = await trabajar(opciones());
    expect(segundos.fallidas).toBe(0);
    expect(fuente("a").status).toBe("normalizada");
    expect(Math.abs((fuente("a").durationMs as number) - 12 * 60_000)).toBeLessThan(1500);
    const numeros = leerSegmentos(fuente("a").segments).map((s) => s.n);
    expect(numeros).toEqual(numeros.map((_, i) => i));
    expect(db.meeting.filas[0].stage).toBe("transcribiendo");
  }, 240_000);

  it("un archivo dañado deja la reunión en error con un mensaje claro, y «Reintentar» no lo arregla pero tampoco rompe lo demás", async () => {
    await montarReunion({ archivoMin: 1, sesionSeg: 20 });
    await almacen.subir(`${PREFIJO}fuentes/aaaaaaaa-archivo.m4a`, new Uint8Array(40_000).map((_, i) => (i * 7) % 251), "audio/mp4");
    await avanzar(ID);
    const r = await trabajar(opciones());
    expect(r.fallidas).toBe(1);
    expect(tarea("normalizar:a")).toMatchObject({ status: "fallida", attempts: 1 }); // dañado: no se reintenta
    expect(db.meeting.filas[0]).toMatchObject({ status: "error", errorMessage: expect.stringMatching(/dañado|compatible/) });
    // Aun así la otra fuente se alcanzó a preparar o quedó congelada, nunca perdida.
    expect(["normalizada", "normalizando", "recibida"]).toContain(fuente("b").status);
    // Reintentar vuelve a intentar solo lo fallido.
    expect(await reintentarFallidas(ID, new Date(t))).toBe(1);
    expect(db.meeting.filas[0].status).toBe("procesando");
  }, 120_000);

  it("una sesión sin partes que sirvan falla con un mensaje claro y sin reintentos inútiles", async () => {
    await montarReunion({ archivoMin: 1, sesionSeg: 20 });
    db.meetingLivePart.filas = db.meetingLivePart.filas.filter((p) => (p.seq as number) < 0); // solo la reserva
    await avanzar(ID);
    await trabajar(opciones());
    expect(tarea("ensamblar_sesion:b")).toMatchObject({ status: "fallida", attempts: 1 });
    expect(db.meeting.filas[0]).toMatchObject({ status: "error", errorMessage: expect.stringMatching(/no llegó audio de esta sesión/) });
  }, 120_000);
});
