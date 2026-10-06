/**
 * «Procesar de nuevo» una reunión en «sin_cupo»: se vuelve a mirar el cupo; si alcanza, sigue desde el audio que se conservó.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import type { Cupo } from "./cupos";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { reprocesarSinCupo } from "./sin-cupo";

const ID = "reunionprueba1";
const DURACION_MS = 8 * 3_600_000;
let db: DbFalsa;

const cupo = (extra: Partial<Cupo> = {}): Cupo => ({ permitido: true, ilimitado: false, periodo: "mes", usadoMs: 0, limiteMs: 10 * 3_600_000, restanMs: 10 * 3_600_000, mensaje: null, ...extra });
const alcanza = vi.fn<(userId: string, duracionMs: number, excluirReunionId?: string) => Promise<Cupo>>(async () => cupo());

/** Una reunión que quedó esperando horas: el audio ya está armado (`armar_audio` hecha), solo falta transcribir. */
async function sembrar(extra: Record<string, unknown> = {}) {
  await db.meeting.create({
    data: {
      id: ID, userId: "u1", status: "sin_cupo", stage: null, progress: 0, durationMs: DURACION_MS, audioUrl: "https://blob/audio.mp3",
      errorMessage: "Esta reunión dura 8 h y te quedan 2 h este mes.", ...extra,
    },
  });
  await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a", status: "normalizada", durationMs: DURACION_MS } });
  await db.meetingTask.create({ data: { meetingId: ID, kind: "armar_audio", key: "armar_audio", status: "hecha", result: { durationMs: DURACION_MS, sinCupo: true } } });
}
const claves = () => db.meetingTask.filas.map((t) => t.key).sort();

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  alcanza.mockClear();
  alcanza.mockImplementation(async () => cupo());
});

describe("reprocesarSinCupo", () => {
  it("con horas disponibles, la reunión pasa a «en_cola» y sigue desde el audio guardado: encola la transcripción, no vuelve a armar el audio", async () => {
    await sembrar();
    expect(await reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza })).toEqual({ ok: true, status: "en_cola" });
    expect(db.meeting.filas[0]).toMatchObject({ status: "en_cola", stage: null, progress: 0, errorMessage: null, durationMs: DURACION_MS, audioUrl: "https://blob/audio.mp3" });
    expect(claves()).toEqual(["armar_audio", "tramo:0"]);
    expect(db.meetingTask.filas.find((t) => t.key === "armar_audio")).toMatchObject({ status: "hecha" });
  });

  it("vuelve a mirar el cupo con la duración que ya se midió, sin contar a la propia reunión", async () => {
    await sembrar();
    await reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza });
    expect(alcanza).toHaveBeenCalledTimes(1);
    expect(alcanza).toHaveBeenCalledWith("u1", DURACION_MS, ID);
  });

  it("si todavía no alcanza: dice por qué y no toca nada (la reunión sigue esperando, sin encolar)", async () => {
    await sembrar();
    alcanza.mockImplementation(async () => cupo({ permitido: false, restanMs: 2 * 3_600_000, mensaje: "Esta reunión dura 8 h y te quedan 2 h este mes." }));
    expect(await reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza })).toEqual({
      ok: false, codigo: "sin_cupo", error: "Esta reunión dura 8 h y te quedan 2 h este mes.",
    });
    expect(db.meeting.filas[0]).toMatchObject({ status: "sin_cupo", errorMessage: "Esta reunión dura 8 h y te quedan 2 h este mes." });
    expect(claves()).toEqual(["armar_audio"]);
  });

  it("si el cupo no trae motivo, igual se dice algo claro", async () => {
    await sembrar();
    alcanza.mockImplementation(async () => cupo({ permitido: false, mensaje: null }));
    const r = await reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza });
    expect(r).toMatchObject({ ok: false, codigo: "sin_cupo" });
    expect((r as { error: string }).error).toMatch(/horas disponibles/);
  });

  it("una reunión de otra persona o que no existe: «no existe», sin mirar el cupo ni tocar nada", async () => {
    await sembrar();
    expect(await reprocesarSinCupo({ meetingId: ID, userId: "otra", comprobarCupo: alcanza })).toMatchObject({ ok: false, codigo: "no_existe" });
    expect(await reprocesarSinCupo({ meetingId: "no-existe", userId: "u1", comprobarCupo: alcanza })).toMatchObject({ ok: false, codigo: "no_existe" });
    expect(alcanza).not.toHaveBeenCalled();
    expect(db.meeting.filas[0].status).toBe("sin_cupo");
    expect(claves()).toEqual(["armar_audio"]);
  });

  it("solo una reunión que espera horas se puede procesar de nuevo: un borrador, una con error o una grabándose, no", async () => {
    for (const status of ["borrador", "grabando", "subiendo", "error"]) {
      db = crearDbFalsa();
      fake.db = db;
      await sembrar({ status });
      expect(await reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza }), status).toEqual({
        ok: false, codigo: "no_esta_en_espera", error: "Esta reunión no está esperando horas.",
      });
      expect(db.meeting.filas[0].status, status).toBe(status);
    }
    expect(alcanza).not.toHaveBeenCalled();
  });

  it("si ya se está procesando o ya está lista (un segundo clic), dice dónde va sin tocar nada ni mirar el cupo", async () => {
    for (const status of ["en_cola", "procesando", "lista"]) {
      db = crearDbFalsa();
      fake.db = db;
      await sembrar({ status, errorMessage: null });
      expect(await reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza }), status).toEqual({ ok: true, status });
      expect(db.meeting.filas[0].status, status).toBe(status);
      expect(claves(), status).toEqual(["armar_audio"]);
    }
    expect(alcanza).not.toHaveBeenCalled();
  });

  it("dos clics casi a la vez la pasan a «en_cola» una sola vez y encolan lo que sigue una sola vez", async () => {
    await sembrar();
    const [a, b] = await Promise.all([
      reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza }),
      reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza }),
    ]);
    expect(a).toEqual({ ok: true, status: "en_cola" });
    expect(b).toEqual({ ok: true, status: "en_cola" });
    expect(db.meeting.filas[0].status).toBe("en_cola");
    expect(claves()).toEqual(["armar_audio", "tramo:0"]);
  });

  it("si mientras se miraba el cupo otro clic ya la puso en marcha, no la devuelve a «en_cola» ni reinicia su avance", async () => {
    await sembrar();
    alcanza.mockImplementation(async () => {
      // Otro clic ganó y el trabajador ya la tiene en proceso.
      await db.meeting.updateMany({ where: { id: ID }, data: { status: "procesando", stage: "transcribiendo", progress: 37 } });
      return cupo();
    });
    expect(await reprocesarSinCupo({ meetingId: ID, userId: "u1", comprobarCupo: alcanza })).toEqual({ ok: true, status: "en_cola" });
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando", stage: "transcribiendo", progress: 37 });
  });
});
