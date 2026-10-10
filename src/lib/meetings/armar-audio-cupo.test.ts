/** `armar_audio` con el cupo: si la reunión no cabe en las horas del plan, el audio se conserva y la reunión espera en «sin_cupo». */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fake, cupo, forzar } = vi.hoisted(() => ({ fake: { db: null as unknown }, cupo: vi.fn(), forzar: { ms: null as number | null } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
// La duración sale de las tramas reales de mp3; para probar reuniones de muchas horas se fuerza la que devuelve `armarAudio`.
vi.mock("./audio", async (original) => {
  const real = await original<typeof import("./audio")>();
  return { ...real, armarAudio: async (...a: Parameters<typeof real.armarAudio>) => {
    const r = await real.armarAudio(...a);
    return forzar.ms === null ? r : { ...r, durationMs: forzar.ms };
  } };
});
vi.mock("./cupos", () => ({ comprobarCupoDeReuniones: (...a: unknown[]) => cupo(...a) }));

import { AlmacenLocal } from "./almacen-local";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { armarAudioTarea, type ContextoTarea } from "./manejadores";
import { avanzar } from "./orquestador";

const ID = "reunionprueba1";
const carpeta = mkdtempSync(join(tmpdir(), "reunion-cupo-"));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));
let db: DbFalsa;
let almacen: AlmacenLocal;
const ctx = (): ContextoTarea => ({
  tarea: { id: "t", meetingId: ID, kind: "armar_audio", key: "armar_audio", payload: {}, attempts: 1 },
  presupuestoMs: 230_000,
  senal: new AbortController().signal,
  deps: { almacen, ahora: () => new Date() },
});

beforeEach(async () => {
  forzar.ms = null;
  db = crearDbFalsa();
  fake.db = db;
  cupo.mockReset();
  almacen = new AlmacenLocal(join(carpeta, `a-${Math.random().toString(36).slice(2, 8)}`));
  await db.meeting.create({ data: { id: ID, userId: "u1", status: "procesando", stage: "preparando_audio", progress: 92, durationMs: null, audioUrl: null } });
  const tramas = new Uint8Array(144 * 100);
  for (let i = 0; i < 100; i++) { tramas[i * 144] = 0xff; tramas[i * 144 + 1] = 0xf3; }
  const s = await almacen.subir(`meetings/${ID}/norm/a/0000.mp3`, tramas, "audio/mpeg");
  await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a", status: "normalizada", segments: [{ n: 0, url: s.url, durationMs: 3600, bytes: 144 * 100 }] } });
});

describe("armar_audio y el máximo por reunión (12 h, para todas las cuentas)", () => {
  const H = 3_600_000;

  it("una reunión de 13 h pasa a «sin_cupo» con el motivo, aunque el cupo del plan sea ilimitado", async () => {
    cupo.mockResolvedValue({ permitido: true, ilimitado: true, mensaje: null });
    forzar.ms = 13 * H;
    const r = await armarAudioTarea(ctx());
    expect(r).toMatchObject({ resultado: { sinCupo: true } });
    expect(db.meeting.filas[0]).toMatchObject({ status: "sin_cupo", errorMessage: expect.stringContaining("el máximo por reunión es 12 h") });
  });

  it("una reunión de 8 h (la del diseño) sigue su camino", async () => {
    cupo.mockResolvedValue({ permitido: true, ilimitado: true, mensaje: null });
    forzar.ms = 8 * H;
    const r = await armarAudioTarea(ctx());
    expect(r).toMatchObject({ resultado: { durationMs: 8 * H } });
    expect(JSON.stringify(r)).not.toContain("sinCupo");
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando" });
  });

  it("justo 12 h todavía se transcribe", async () => {
    cupo.mockResolvedValue({ permitido: true, ilimitado: true, mensaje: null });
    forzar.ms = 12 * H;
    await armarAudioTarea(ctx());
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando" });
  });
});

describe("armar_audio y el cupo", () => {
  it("con cupo, sigue como siempre: audio y duración guardados, la reunión sigue en proceso", async () => {
    cupo.mockResolvedValue({ permitido: true, ilimitado: false, mensaje: null });
    const r = await armarAudioTarea(ctx());
    expect(cupo).toHaveBeenCalledWith("u1", 3600, ID);
    expect(r).toEqual({ resultado: { durationMs: 3600, bytes: 144 * 100 } });
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando", durationMs: 3600, audioUrl: almacen.urlDe(`meetings/${ID}/audio.mp3`) });
  });

  it("sin cupo, el audio se conserva y la reunión pasa a «sin_cupo» con el mensaje: no se transcribe nada", async () => {
    cupo.mockResolvedValue({ permitido: false, ilimitado: false, mensaje: "Esta reunión dura 8 h y te quedan 2 h este mes." });
    const r = await armarAudioTarea(ctx());
    expect(r).toEqual({ resultado: { durationMs: 3600, bytes: 144 * 100, sinCupo: true } });
    expect(db.meeting.filas[0]).toMatchObject({
      status: "sin_cupo", stage: null, progress: 0, errorMessage: "Esta reunión dura 8 h y te quedan 2 h este mes.", durationMs: 3600, audioUrl: almacen.urlDe(`meetings/${ID}/audio.mp3`),
    });
    // El orquestador ya no la toca: no encola transcripción.
    db.meetingTask.filas.push({ id: "t0", meetingId: ID, kind: "armar_audio", key: "armar_audio", status: "hecha" });
    expect(await avanzar(ID)).toBeNull();
    expect(db.meetingTask.filas.map((x) => x.key)).toEqual(["armar_audio"]);
  });
});
