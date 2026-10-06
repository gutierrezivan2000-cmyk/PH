import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fake, normalizarFuente } = vi.hoisted(() => ({ fake: { db: null as unknown }, normalizarFuente: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("./ffmpeg", async (importar) => ({ ...(await importar<typeof import("./ffmpeg")>()), normalizarFuente: (...a: unknown[]) => normalizarFuente(...a) }));

import { ErrorAlmacen, leerTodo } from "./almacen";
import { AlmacenLocal } from "./almacen-local";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { ErrorAudio } from "./ffmpeg";
import {
  ErrorTarea, aErrorTarea, armarAudioTarea, ensamblarSesionTarea, normalizarTarea, type ContextoTarea, type DepsProceso,
} from "./manejadores";

let db: DbFalsa;
let almacen: AlmacenLocal;
const carpeta = mkdtempSync(join(tmpdir(), "reunion-man-"));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

const ID = "reunionprueba1";
const PREFIJO = `meetings/${ID}/`;
const deps = (): DepsProceso => ({ almacen, ahora: () => new Date() });
const ctx = (payload: Record<string, unknown>, extra: Partial<ContextoTarea> = {}): ContextoTarea => ({
  tarea: { id: "t1", meetingId: ID, kind: "x", key: "k", payload, attempts: 1 },
  presupuestoMs: 230_000,
  senal: new AbortController().signal,
  deps: deps(),
  ...extra,
});
const bytes = (n: number, valor: number) => new Uint8Array(n).fill(valor);
const fuenteDe = (id: string) => db.meetingSource.filas.find((f) => f.id === id)!;

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  almacen = new AlmacenLocal(join(carpeta, `a-${Math.random().toString(36).slice(2, 8)}`));
  normalizarFuente.mockReset();
});

describe("aErrorTarea", () => {
  it("un ErrorTarea pasa tal cual", () => {
    const e = new ErrorTarea("x", { reintentable: false });
    expect(aErrorTarea(e)).toBe(e);
  });
  it("un archivo dañado o sin audio no se reintenta; un fallo del momento sí", () => {
    expect(aErrorTarea(new ErrorAudio("No pudimos leer este archivo.", "fuente_invalida"))).toMatchObject({ reintentable: false, message: "No pudimos leer este archivo." });
    expect(aErrorTarea(new ErrorAudio("sin audio", "sin_audio")).reintentable).toBe(false);
    expect(aErrorTarea(new ErrorAudio("red", "transitorio")).reintentable).toBe(true);
  });
  it("del almacenamiento: un archivo que ya no está pide volver a subirlo; un corte se reintenta; un permiso no", () => {
    const faltante = aErrorTarea(new ErrorAlmacen("no existe", "no_encontrado"));
    expect(faltante).toMatchObject({ reintentable: false, message: expect.stringMatching(/Vuelve a subirlo/) });
    expect(aErrorTarea(new ErrorAlmacen("503", "transitorio")).reintentable).toBe(true);
    expect(aErrorTarea(new ErrorAlmacen("sin permiso", "fatal")).reintentable).toBe(false);
  });
  it("cualquier otra cosa se trata como un fallo del momento", () => {
    expect(aErrorTarea(new Error("rarísimo"))).toMatchObject({ reintentable: true, message: "rarísimo" });
    expect(aErrorTarea("texto suelto")).toMatchObject({ reintentable: true, message: "texto suelto" });
  });
});

describe("ensamblar_sesion", () => {
  async function sesion(partes: Array<{ seq: number; bytes: Uint8Array; mime?: string }>, extra: Record<string, unknown> = {}) {
    await db.meetingSource.create({ data: { id: "s1", meetingId: ID, idx: 0, kind: "grabacion", session: 2, name: "Grabación en la app", url: null, status: "recibida", ...extra } });
    await db.meetingLivePart.create({ data: { meetingId: ID, session: 2, seq: -1, url: "", bytes: 0, durationMs: 0, mimeType: "" } }); // reserva
    for (const p of partes) {
      const sub = await almacen.subir(`${PREFIJO}vivo/2/${p.seq}.webm`, p.bytes, p.mime ?? "audio/webm");
      await db.meetingLivePart.create({ data: { meetingId: ID, session: 2, seq: p.seq, url: sub.url, bytes: p.bytes.length, durationMs: 30_000, mimeType: p.mime ?? "audio/webm;codecs=opus" } });
    }
  }

  it("une las partes en orden de seq en un solo archivo y anota la fuente", async () => {
    await sesion([{ seq: 2, bytes: bytes(30, 3) }, { seq: 0, bytes: bytes(10, 1) }, { seq: 1, bytes: bytes(20, 2) }]);
    const r = await ensamblarSesionTarea(ctx({ sourceId: "s1" }));
    expect(r).toEqual({ resultado: { partes: 3, huecos: 0, bytes: 60 } });
    const f = fuenteDe("s1");
    expect(f).toMatchObject({ pathname: `${PREFIJO}fuentes/sesion-2.webm`, sizeBytes: 60, mimeType: "audio/webm" });
    expect(almacen.tipos.get(`${PREFIJO}fuentes/sesion-2.webm`)).toBe("audio/webm");
    const junto = await leerTodo(almacen, f.url as string);
    expect([...junto]).toEqual([...bytes(10, 1), ...bytes(20, 2), ...bytes(30, 3)]);
  });

  it("anota los huecos (partes que nunca llegaron) pero ensambla lo que hay", async () => {
    await sesion([{ seq: 0, bytes: bytes(5, 1) }, { seq: 3, bytes: bytes(5, 4) }]);
    expect(((await ensamblarSesionTarea(ctx({ sourceId: "s1" }))) as { resultado: Record<string, unknown> }).resultado).toMatchObject({ partes: 2, huecos: 2 });
  });

  it("las sesiones de Safari (MP4) quedan como .mp4", async () => {
    await sesion([{ seq: 0, bytes: bytes(8, 1), mime: "audio/mp4" }]);
    await ensamblarSesionTarea(ctx({ sourceId: "s1" }));
    expect(fuenteDe("s1").pathname).toBe(`${PREFIJO}fuentes/sesion-2.mp4`);
    expect(fuenteDe("s1").mimeType).toBe("audio/mp4");
  });

  it("es idempotente: repetirla tras haber terminado no vuelve a subir nada", async () => {
    await sesion([{ seq: 0, bytes: bytes(8, 1) }]);
    await ensamblarSesionTarea(ctx({ sourceId: "s1" }));
    const subidas = vi.spyOn(almacen, "subirFlujo");
    expect(await ensamblarSesionTarea(ctx({ sourceId: "s1" }))).toEqual({ resultado: { yaEnsamblada: true } });
    expect(subidas).not.toHaveBeenCalled();
  });

  it("sin partes que sirvan (solo la reserva) es un fallo definitivo con un mensaje claro", async () => {
    await sesion([]);
    const e = await ensamblarSesionTarea(ctx({ sourceId: "s1" })).then(() => null, (x) => x as ErrorTarea);
    expect(e).toBeInstanceOf(ErrorTarea);
    expect(e).toMatchObject({ reintentable: false, message: expect.stringMatching(/no llegó audio de esta sesión/) });
  });

  it("si falta el archivo de una parte, el error del almacén dice que se vuelva a grabar o subir", async () => {
    await sesion([{ seq: 0, bytes: bytes(8, 1) }]);
    await almacen.borrar([almacen.urlDe(`${PREFIJO}vivo/2/0.webm`)]);
    const e = await ensamblarSesionTarea(ctx({ sourceId: "s1" })).then(() => null, (x) => aErrorTarea(x));
    expect(e).toMatchObject({ reintentable: false, message: expect.stringMatching(/ya no está en el almacenamiento/) });
  });

  it("una fuente que ya no existe se omite sin fallar", async () => {
    expect(await ensamblarSesionTarea(ctx({ sourceId: "no-existe" }))).toEqual({ resultado: { omitida: "la fuente ya no existe" } });
  });
});

describe("normalizar", () => {
  const crear = (extra: Record<string, unknown> = {}) =>
    db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a.m4a", url: "local://x/a.m4a", status: "recibida", normalizedMs: 0, segments: [], durationMs: null, ...extra } });
  const segmento = (n: number, bytesDelSegmento: number) => ({ n, datos: new Uint8Array(bytesDelSegmento), duracionMs: bytesDelSegmento / 4 });

  it("sube y anota cada segmento, estima la duración y, al completar, deja la fuente «normalizada» con la duración exacta", async () => {
    await crear();
    normalizarFuente.mockImplementation(async (o) => {
      expect(o).toMatchObject({ desdeMs: 0, numeroInicial: 0, url: "local://x/a.m4a" });
      await o.alTerminarSegmento(segmento(0, 2_400_048), { duracionContenedorMs: 1_500_000, fraccion: 0.4 });
      expect(fuenteDe("a")).toMatchObject({ status: "normalizando", normalizedMs: 600_012, durationMs: 1_500_000 });
      await o.alTerminarSegmento(segmento(1, 1_200_000), { duracionContenedorMs: null, fraccion: 0.5 });
      return { completo: true, segmentos: 2, duracionContenedorMs: 1_500_000 };
    });
    const r = await normalizarTarea(ctx({ sourceId: "a" }));
    expect(r).toEqual({ resultado: { segmentos: 2, durationMs: 900_012 } });
    expect(fuenteDe("a")).toMatchObject({ status: "normalizada", normalizedMs: 900_012, durationMs: 900_012 });
    expect(fuenteDe("a").segments).toEqual([
      expect.objectContaining({ n: 0, bytes: 2_400_048, url: almacen.urlDe(`${PREFIJO}norm/a/0000.mp3`) }),
      expect.objectContaining({ n: 1, bytes: 1_200_000, url: almacen.urlDe(`${PREFIJO}norm/a/0001.mp3`) }),
    ]);
    expect(almacen.tipos.get(`${PREFIJO}norm/a/0000.mp3`)).toBe("audio/mpeg");
  });

  it("si el contenedor no trae duración, la estima por lo que ya se leyó del archivo", async () => {
    await crear();
    normalizarFuente.mockImplementation(async (o) => {
      await o.alTerminarSegmento(segmento(0, 2_400_000), { duracionContenedorMs: null, fraccion: 0.25 }); // 10 min = el 25 % → ~40 min
      expect(fuenteDe("a").durationMs).toBe(2_400_000);
      return { completo: false, segmentos: 1, duracionContenedorMs: null };
    });
    await normalizarTarea(ctx({ sourceId: "a" }));
  });

  it("si se acabó el tiempo pide seguir (continuar) y conserva lo hecho; la pasada siguiente retoma desde ahí", async () => {
    await crear();
    normalizarFuente.mockImplementationOnce(async (o) => {
      await o.alTerminarSegmento(segmento(0, 2_400_000), { duracionContenedorMs: 3_000_000, fraccion: 0.2 });
      return { completo: false, segmentos: 1, duracionContenedorMs: 3_000_000 };
    });
    expect(await normalizarTarea(ctx({ sourceId: "a" }))).toEqual({ continuar: true });
    expect(fuenteDe("a")).toMatchObject({ status: "normalizando", normalizedMs: 600_000 });

    normalizarFuente.mockImplementationOnce(async (o) => {
      expect(o).toMatchObject({ desdeMs: 600_000, numeroInicial: 1 });
      await o.alTerminarSegmento(segmento(1, 2_400_000), { duracionContenedorMs: 3_000_000, fraccion: 1 });
      return { completo: true, segmentos: 1, duracionContenedorMs: 3_000_000 };
    });
    await normalizarTarea(ctx({ sourceId: "a" }));
    expect(fuenteDe("a")).toMatchObject({ status: "normalizada", normalizedMs: 1_200_000 });
  });

  it("una pasada sin avance no se «continúa» para siempre: cuenta como fallo", async () => {
    await crear();
    normalizarFuente.mockResolvedValue({ completo: false, segmentos: 0, duracionContenedorMs: null });
    await expect(normalizarTarea(ctx({ sourceId: "a" }))).rejects.toMatchObject({ reintentable: true, message: expect.stringMatching(/no avanzó/) });
  });

  it("le da a ffmpeg el tiempo de la tarea menos lo que necesita para cerrar con calma", async () => {
    await crear();
    normalizarFuente.mockResolvedValue({ completo: true, segmentos: 1, duracionContenedorMs: 1 });
    await normalizarTarea(ctx({ sourceId: "a" }, { presupuestoMs: 230_000 }));
    expect(normalizarFuente.mock.calls[0][0].presupuestoMs).toBe(210_000);
    await db.meetingSource.update({ where: { id: "a" }, data: { status: "recibida" } });
    await normalizarTarea(ctx({ sourceId: "a" }, { presupuestoMs: 8_000 }));
    expect(normalizarFuente.mock.calls[1][0].presupuestoMs).toBe(5_000); // nunca menos de 5 s
  });

  it("ya normalizada o con la fuente desaparecida: no hace nada", async () => {
    await crear({ status: "normalizada" });
    expect(await normalizarTarea(ctx({ sourceId: "a" }))).toEqual({ resultado: { yaNormalizada: true } });
    expect(await normalizarTarea(ctx({ sourceId: "otra" }))).toEqual({ resultado: { omitida: "la fuente ya no existe" } });
    expect(normalizarFuente).not.toHaveBeenCalled();
  });

  it("una sesión sin ensamblar todavía se reintenta (no es un error de nadie)", async () => {
    await crear({ url: null });
    await expect(normalizarTarea(ctx({ sourceId: "a" }))).rejects.toMatchObject({ reintentable: true });
  });

  it("los errores de ffmpeg salen como errores de tarea clasificados", async () => {
    await crear();
    normalizarFuente.mockRejectedValue(new ErrorAudio("No pudimos leer este archivo: parece dañado.", "fuente_invalida"));
    const e = await normalizarTarea(ctx({ sourceId: "a" })).then(() => null, (x) => aErrorTarea(x));
    expect(e).toMatchObject({ reintentable: false, message: "No pudimos leer este archivo: parece dañado." });
  });
});

describe("armar_audio", () => {
  it("si todavía hay fuentes por preparar, se reintenta; sin fuentes, es un error definitivo", async () => {
    await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a", status: "normalizando", segments: [] } });
    await expect(armarAudioTarea(ctx({}))).rejects.toMatchObject({ reintentable: true, message: expect.stringMatching(/por preparar/) });
    db.meetingSource.filas.length = 0;
    await expect(armarAudioTarea(ctx({}))).rejects.toMatchObject({ reintentable: false });
  });

  it("une los segmentos de las fuentes en orden, fija la duración de la reunión y el inicio de cada fuente", async () => {
    await db.meeting.create({ data: { id: ID, status: "procesando", durationMs: null, audioUrl: null } });
    const trama = (n: number, rel: number) => {
      const b = new Uint8Array(144 * n).fill(rel);
      for (let i = 0; i < n; i++) {
        b[i * 144] = 0xff;
        b[i * 144 + 1] = 0xf3;
      }
      return b;
    };
    const s0 = await almacen.subir(`${PREFIJO}norm/a/0000.mp3`, trama(100, 1), "audio/mpeg");
    const s1 = await almacen.subir(`${PREFIJO}norm/b/0000.mp3`, trama(50, 2), "audio/mpeg");
    await db.meetingSource.create({ data: { id: "b", meetingId: ID, idx: 1, kind: "archivo", name: "b", status: "normalizada", segments: [{ n: 0, url: s1.url, durationMs: 1800, bytes: 144 * 50 }] } });
    await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a", status: "normalizada", segments: [{ n: 0, url: s0.url, durationMs: 3600, bytes: 144 * 100 }] } });
    const r = await armarAudioTarea(ctx({}));
    expect(r).toEqual({ resultado: { durationMs: 5400, bytes: 144 * 150 } });
    expect(fuenteDe("a").offsetMs).toBe(0);
    expect(fuenteDe("b").offsetMs).toBe(3600);
    expect(db.meeting.filas[0]).toMatchObject({ audioUrl: almacen.urlDe(`${PREFIJO}audio.mp3`), durationMs: 5400 });
    const audio = await leerTodo(almacen, db.meeting.filas[0].audioUrl as string);
    expect(audio.byteLength).toBe(144 * 150);
    expect(audio[2]).toBe(1); // los bytes de la fuente a…
    expect(audio[144 * 100]).toBe(0xff); // …y a los 100 cuadros empieza la fuente b, con su cabecera
    expect(audio[144 * 100 + 2]).toBe(2);
  });

  it("una unión sin cabecera de trama (quedó un ID3 en medio) se detecta aquí y no al reproducir", async () => {
    const buena = new Uint8Array(144 * 10).fill(0xaa);
    for (let i = 0; i < 10; i++) { buena[i * 144] = 0xff; buena[i * 144 + 1] = 0xf3; }
    const mala = new Uint8Array(144 * 10).fill(0xaa);
    mala[0] = 0x49; mala[1] = 0x44; // «ID3»
    const s0 = await almacen.subir(`${PREFIJO}norm/a/0000.mp3`, buena, "audio/mpeg");
    const s1 = await almacen.subir(`${PREFIJO}norm/a/0001.mp3`, mala, "audio/mpeg");
    await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a", status: "normalizada", segments: [{ n: 0, url: s0.url, durationMs: 360, bytes: 1440 }, { n: 1, url: s1.url, durationMs: 360, bytes: 1440 }] } });
    await expect(armarAudioTarea(ctx({}))).rejects.toThrow(/trama válida/);
  });

  it("un segmento que no es un múltiplo de trama se rechaza", async () => {
    const s0 = await almacen.subir(`${PREFIJO}norm/a/0000.mp3`, new Uint8Array(100), "audio/mpeg");
    await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a", status: "normalizada", segments: [{ n: 0, url: s0.url, durationMs: 25, bytes: 100 }] } });
    await expect(armarAudioTarea(ctx({}))).rejects.toThrow(/tramas completas/);
  });
});
