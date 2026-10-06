import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, put, empujar } = vi.hoisted(() => ({
  auth: vi.fn(),
  fake: { db: null as unknown },
  put: vi.fn(),
  empujar: vi.fn(),
}));
vi.mock("@/lib/meetings/empujon", () => ({ empujar: (...a: unknown[]) => empujar(...a) }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@vercel/blob", () => ({ put: (...a: unknown[]) => put(...a), head: vi.fn(), del: vi.fn() }));

import { POST as registrarParte } from "@/app/api/meetings/[id]/live/route";
import { POST as nuevaSesion } from "@/app/api/meetings/[id]/live/sesion/route";
import { POST as marcar } from "@/app/api/meetings/[id]/markers/route";
import { POST as procesar } from "@/app/api/meetings/[id]/process/route";
import { GET as leerReunion } from "@/app/api/meetings/[id]/route";
import { crearDbFalsa, errorUnico, type DbFalsa } from "./db-falsa";
import { MAX_MARCADORES, MAX_SESIONES_VIVO } from "./tipos";

let db: DbFalsa;
const ID = "mreunion1";

const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });
const pedir = (cuerpo?: unknown) =>
  new NextRequest("http://localhost/api/x", { method: "POST", ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } } : {}) });
const pedirParte = (o: { session?: number; seq?: number; durMs?: number; bytes?: number; tipo?: string } = {}) => {
  const { session = 1, seq = 0, durMs = 30_000, bytes = 1000, tipo = "audio/webm;codecs=opus" } = o;
  return new NextRequest("http://localhost/api/x", {
    method: "POST",
    body: new Uint8Array(bytes),
    headers: { "content-type": tipo, "x-sesion": String(session), "x-secuencia": String(seq), "x-duracion-ms": String(durMs) },
  });
};

const sesion = (id = "u1") => auth.mockResolvedValue({ user: { id, email: `${id}@x.com`, role: "admin" } });
const nuevaReunion = (extra: Record<string, unknown> = {}) =>
  db.meeting.create({
    data: {
      id: ID, userId: "u1", propertyId: "c1", type: "consejo", title: "R", status: "borrador", errorMessage: null,
      date: new Date("2026-10-02T19:00:00Z"), consentAt: new Date(), stage: null, progress: 0, durationMs: null, property: { name: "Los Pinos" },
      sources: [], speakers: [], markers: [], ...extra,
    },
  });
const poner = (session: number, seq: number, durationMs = 30_000, bytes = 1000) =>
  db.meetingLivePart.create({ data: { meetingId: ID, session, seq, url: `https://x/${session}/${seq}`, bytes, durationMs, mimeType: "audio/webm" } });
const raiz = ctx({ id: ID });

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  empujar.mockReset();
  put.mockReset();
  put.mockImplementation(async (pathname: string) => ({ url: `https://abc.private.blob.vercel-storage.com/${pathname}`, pathname }));
  vi.stubEnv("DEMO_MODE", "false");
  sesion();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST live/sesion", () => {
  it("reserva el número con una fila de reserva y la siguiente sesión recibe el siguiente", async () => {
    await nuevaReunion();
    expect(await json(await nuevaSesion(pedir(), raiz))).toEqual({ status: 200, cuerpo: { session: 1, offsetMs: 0 } });
    expect(db.meetingLivePart.filas).toEqual([expect.objectContaining({ meetingId: ID, session: 1, seq: -1, bytes: 0 })]);
    expect((await json(await nuevaSesion(pedir(), raiz))).cuerpo.session).toBe(2);
  });

  it("dice dónde empieza: la duración de las sesiones anteriores, sin contar las reservas", async () => {
    await nuevaReunion();
    await poner(1, 0, 30_000);
    await poner(1, 1, 25_000);
    expect((await json(await nuevaSesion(pedir(), raiz))).cuerpo).toEqual({ session: 2, offsetMs: 55_000 });
  });

  it("continúa la numeración de las sesiones ya cerradas (una reunión con error se puede seguir grabando)", async () => {
    await nuevaReunion({ status: "error" });
    await db.meetingSource.create({ data: { meetingId: ID, idx: 0, kind: "grabacion", session: 3, durationMs: 90_000, status: "recibida" } });
    expect((await json(await nuevaSesion(pedir(), raiz))).cuerpo).toEqual({ session: 4, offsetMs: 90_000 });
  });

  it("si otro dispositivo se queda con el número justo antes, toma el siguiente", async () => {
    await nuevaReunion();
    const original = db.meetingLivePart.create.bind(db.meetingLivePart);
    let primera = true;
    db.meetingLivePart.create = async (args: { data: Record<string, unknown> }) => {
      if (primera) {
        primera = false;
        await original({ data: { ...args.data } }); // el otro dispositivo gana la carrera
        throw errorUnico();
      }
      return original(args);
    };
    expect((await json(await nuevaSesion(pedir(), raiz))).cuerpo.session).toBe(2);
    expect(db.meetingLivePart.filas.map((f) => f.session)).toEqual([1, 2]);
  });

  it("exige la constancia del aviso, una reunión abierta a la captura y que sea del usuario", async () => {
    await nuevaReunion({ consentAt: null });
    const sin = await json(await nuevaSesion(pedir(), raiz));
    expect(sin.status).toBe(409);
    expect(sin.cuerpo.error).toMatch(/avisaste a los asistentes/);

    db.meeting.filas[0].consentAt = new Date();
    for (const status of ["en_cola", "procesando", "lista", "sin_cupo"]) {
      db.meeting.filas[0].status = status;
      expect((await nuevaSesion(pedir(), raiz)).status, status).toBe(409);
    }
    db.meeting.filas[0].status = "borrador";
    db.meeting.filas[0].userId = "otro";
    expect((await nuevaSesion(pedir(), raiz)).status).toBe(404);
    expect(db.meetingLivePart.filas).toEqual([]);
  });

  it("pone un tope al número de sesiones", async () => {
    await nuevaReunion();
    await poner(MAX_SESIONES_VIVO, 0);
    const r = await json(await nuevaSesion(pedir(), raiz));
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/demasiadas sesiones/);
  });

  it("un fallo de la base de datos es un 500 con mensaje claro", async () => {
    await nuevaReunion();
    db.meetingLivePart.aggregate = async () => { throw new Error("connection refused: postgres://secreto"); };
    const r = await json(await nuevaSesion(pedir(), raiz));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/postgres|secreto/);
  });
});

describe("POST live (una parte de la grabadora)", () => {
  it("la guarda en una ruta fija y privada, anota la fila y pasa la reunión a «grabando»", async () => {
    await nuevaReunion();
    const r = await json(await registrarParte(pedirParte({ session: 2, seq: 7, durMs: 29_500, bytes: 1234 }), raiz));
    expect(r).toEqual({ status: 200, cuerpo: { ok: true } });

    expect(put).toHaveBeenCalledTimes(1);
    const [ruta, cuerpo, opciones] = put.mock.calls[0];
    expect(ruta).toBe(`meetings/${ID}/vivo/2/7.webm`);
    expect(cuerpo.length).toBe(1234);
    expect(opciones).toEqual({ access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "audio/webm" });

    expect(db.meetingLivePart.filas).toEqual([
      expect.objectContaining({ meetingId: ID, session: 2, seq: 7, bytes: 1234, durationMs: 29_500, mimeType: "audio/webm", url: expect.stringContaining("/vivo/2/7.webm") }),
    ]);
    expect(db.meeting.filas[0].status).toBe("grabando");
  });

  it("reenviar la misma parte la sobrescribe en vez de duplicarla", async () => {
    await nuevaReunion();
    await registrarParte(pedirParte({ seq: 3, bytes: 500 }), raiz);
    await registrarParte(pedirParte({ seq: 3, bytes: 800, durMs: 31_000 }), raiz);
    expect(db.meetingLivePart.filas).toHaveLength(1);
    expect(db.meetingLivePart.filas[0]).toMatchObject({ bytes: 800, durationMs: 31_000 });
    expect(put.mock.calls.map((c) => c[0])).toEqual([`meetings/${ID}/vivo/1/3.webm`, `meetings/${ID}/vivo/1/3.webm`]);
  });

  it("usa la extensión que corresponde al audio (Safari graba MP4)", async () => {
    await nuevaReunion();
    await registrarParte(pedirParte({ tipo: "audio/mp4" }), raiz);
    expect(put.mock.calls[0][0]).toBe(`meetings/${ID}/vivo/1/0.mp4`);
    expect(put.mock.calls[0][2].contentType).toBe("audio/mp4");
  });

  it("desde «subiendo» o «error» pasa a «grabando» y limpia el error; en «grabando» no toca el estado", async () => {
    for (const status of ["subiendo", "error"]) {
      db.meeting.filas.length = 0;
      await nuevaReunion({ status, errorMessage: "falló" });
      await registrarParte(pedirParte(), raiz);
      expect(db.meeting.filas[0], status).toMatchObject({ status: "grabando", errorMessage: null });
    }
    const actualizar = vi.spyOn(db.meeting, "updateMany");
    await registrarParte(pedirParte({ seq: 1 }), raiz);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("sin constancia, con la reunión cerrada o de otro usuario: no guarda nada", async () => {
    await nuevaReunion({ consentAt: null });
    expect((await registrarParte(pedirParte(), raiz)).status).toBe(409);

    db.meeting.filas[0].consentAt = new Date();
    for (const status of ["en_cola", "procesando", "lista", "sin_cupo"]) {
      db.meeting.filas[0].status = status;
      expect((await registrarParte(pedirParte(), raiz)).status, status).toBe(409);
    }
    db.meeting.filas[0].status = "borrador";
    db.meeting.filas[0].userId = "otro";
    expect((await registrarParte(pedirParte(), raiz)).status).toBe(404);
    expect(put).not.toHaveBeenCalled();
    expect(db.meetingLivePart.filas).toEqual([]);
  });

  it("un cuerpo que se pasa del tope sin declarar su tamaño (envío por trozos) se corta: 413 y sin Blob", async () => {
    await nuevaReunion();
    const trozos = new ReadableStream<Uint8Array>({
      pull(control) {
        control.enqueue(new Uint8Array(512 * 1024));
      },
    });
    const req = new NextRequest("http://localhost/api/x", {
      method: "POST", body: trozos, duplex: "half",
      headers: { "content-type": "audio/webm", "x-sesion": "1", "x-secuencia": "0", "x-duracion-ms": "30000" },
    } as unknown as ConstructorParameters<typeof NextRequest>[1]);
    expect((await registrarParte(req, raiz)).status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  it("rechaza lo inválido sin llamar a Blob", async () => {
    await nuevaReunion();
    for (const o of [{ tipo: "audio/mpeg" }, { session: 0 }, { seq: -3 }, { durMs: 0 }, { bytes: 0 }]) {
      expect((await registrarParte(pedirParte(o), raiz)).status, JSON.stringify(o)).toBe(400);
    }
    expect((await registrarParte(pedirParte({ bytes: 3 * 1024 * 1024 }), raiz)).status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  it("si Blob falla: 500 sin detalles internos, sin fila y sin cambiar el estado (el dispositivo reintenta)", async () => {
    await nuevaReunion();
    put.mockRejectedValue(new Error("BLOB_READ_WRITE_TOKEN missing"));
    const r = await json(await registrarParte(pedirParte(), raiz));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(db.meetingLivePart.filas).toEqual([]);
    expect(db.meeting.filas[0].status).toBe("borrador");
  });
});

describe("POST markers", () => {
  it("guarda la marca con un identificador atado a la reunión y no la duplica al reenviarla", async () => {
    await nuevaReunion();
    const a = await json(await marcar(pedir({ id: "marca-1-1", atMs: 61_000, kind: "votacion", note: "Cambio de contador" }), raiz));
    expect(a).toMatchObject({ status: 201, cuerpo: { marker: { id: `${ID}_marca-1-1`, atMs: 61_000, kind: "votacion", note: "Cambio de contador" } } });
    expect((await marcar(pedir({ id: "marca-1-1", atMs: 61_000, kind: "votacion" }), raiz)).status).toBe(200);
    expect(db.meetingMarker.filas).toHaveLength(1);
  });

  it("sin identificador del dispositivo igual guarda (cada una es nueva)", async () => {
    await nuevaReunion();
    expect((await marcar(pedir({ atMs: 1000, kind: "nota", note: "a" }), raiz)).status).toBe(201);
    expect((await marcar(pedir({ atMs: 2000, kind: "nota", note: "b" }), raiz)).status).toBe(201);
    expect(db.meetingMarker.filas).toHaveLength(2);
  });

  it("respeta el tope y la pertenencia; una marca tardía también se acepta en una reunión ya cerrada", async () => {
    await nuevaReunion({ status: "en_cola" });
    expect((await marcar(pedir({ id: "marca-tardia", atMs: 5, kind: "tema" }), raiz)).status).toBe(201);
    for (let n = 1; n < MAX_MARCADORES; n++) await db.meetingMarker.create({ data: { meetingId: ID, atMs: n, kind: "nota", note: null } });
    const r = await json(await marcar(pedir({ atMs: 9, kind: "tema" }), raiz));
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/Máximo 500 marcas/);

    db.meeting.filas[0].userId = "otro";
    expect((await marcar(pedir({ atMs: 9, kind: "tema" }), raiz)).status).toBe(404);
  });
});

describe("POST process con grabación en vivo", () => {
  const declarar = (session: number, ultimaSecuencia: number, duracionMs = 60_000) => ({ session, ultimaSecuencia, mimeType: "audio/webm;codecs=opus", duracionMs });

  it("cada sesión con audio pasa a ser una fuente más y la reunión queda «en cola»", async () => {
    await nuevaReunion({ status: "grabando" });
    for (const seq of [0, 1, 2]) await poner(1, seq, 30_000, 1000);
    await poner(1, -1, 0, 0);
    const r = await json(await procesar(pedir({ sesiones: [declarar(1, 2, 88_000)] }), raiz));
    expect(r).toEqual({ status: 200, cuerpo: { status: "en_cola" } });
    expect(db.meetingSource.filas).toEqual([
      expect.objectContaining({ meetingId: ID, idx: 0, kind: "grabacion", session: 1, name: "Grabación en la app", mimeType: "audio/webm", sizeBytes: 3000, durationMs: 88_000, status: "recibida" }),
    ]);
    expect(db.meeting.filas[0]).toMatchObject({ status: "en_cola", progress: 0 });
    // y queda encolada la primera etapa: unir la sesión de la grabadora (todavía sin archivo ensamblado)
    expect(db.meetingTask.filas.map((t) => [t.kind, t.status])).toEqual([["ensamblar_sesion", "pendiente"]]);
    expect(empujar).toHaveBeenCalledTimes(1);
  });

  it("si faltan partes responde 409 con cuáles y no cambia nada", async () => {
    await nuevaReunion({ status: "grabando" });
    await poner(1, 0);
    await poner(1, 2);
    const r = await json(await procesar(pedir({ sesiones: [declarar(1, 3)] }), raiz));
    expect(r.status).toBe(409);
    expect(r.cuerpo.faltan).toEqual([{ session: 1, seq: 1 }, { session: 1, seq: 3 }]);
    expect(db.meetingSource.filas).toEqual([]);
    expect(db.meeting.filas[0].status).toBe("grabando");
    expect(empujar).not.toHaveBeenCalled();
  });

  it("es idempotente: repetir el cierre tras perder la respuesta no duplica la fuente", async () => {
    await nuevaReunion({ status: "grabando" });
    await poner(1, 0);
    // Primer intento: se creó la fuente pero no llegó a pasar a «en cola» (falló justo después).
    await db.meetingSource.create({ data: { meetingId: ID, idx: 0, kind: "grabacion", session: 1, durationMs: 30_000, status: "recibida" } });
    const r = await json(await procesar(pedir({ sesiones: [declarar(1, 0)] }), raiz));
    expect(r.status).toBe(200);
    expect(db.meetingSource.filas).toHaveLength(1);
    expect(db.meeting.filas[0].status).toBe("en_cola");
    // Y ya en cola, contesta lo mismo sin tocar nada.
    expect(await json(await procesar(pedir({ sesiones: [declarar(1, 0)] }), raiz))).toEqual({ status: 200, cuerpo: { status: "en_cola" } });
    expect(db.meetingSource.filas).toHaveLength(1);
  });

  it("sigue la numeración de los archivos ya subidos", async () => {
    await nuevaReunion({ status: "subiendo" });
    await db.meetingSource.create({ data: { meetingId: ID, idx: 0, kind: "archivo", session: null, name: "parte-1.mp3", status: "recibida" } });
    await poner(1, 0);
    await procesar(pedir({ sesiones: [declarar(1, 0)] }), raiz);
    expect(db.meetingSource.filas.map((f) => [f.idx, f.kind])).toEqual([[0, "archivo"], [1, "grabacion"]]);
  });

  it("sin declarar sesiones cierra las que tengan audio, con lo que haya llegado", async () => {
    await nuevaReunion({ status: "grabando" });
    await poner(1, 0);
    await poner(1, 3); // un hueco: se tolera si nadie declaró la sesión
    await poner(2, 0);
    await poner(3, -1, 0, 0); // solo una reserva: no hay audio
    expect((await json(await procesar(pedir(), raiz))).status).toBe(200);
    expect(db.meetingSource.filas.map((f) => [f.session, f.name])).toEqual([
      [1, "Grabación en la app — sesión 1"],
      [2, "Grabación en la app — sesión 2"],
    ]);
  });

  it("un archivo que todavía se prepara frena el cierre (409) aunque la grabación esté completa", async () => {
    await nuevaReunion({ status: "grabando" });
    await db.meetingSource.create({ data: { meetingId: ID, idx: 0, kind: "archivo", name: "x.mp3", status: "subiendo" } });
    await poner(1, 0);
    expect((await procesar(pedir({ sesiones: [declarar(1, 0)] }), raiz)).status).toBe(409);
    expect(db.meetingSource.filas).toHaveLength(1);
  });

  it("sin audio ni archivos: 400 con el mensaje de siempre", async () => {
    await nuevaReunion({ status: "grabando" });
    await poner(1, -1, 0, 0);
    const r = await json(await procesar(pedir(), raiz));
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/al menos un archivo/);
  });
});

describe("GET /api/meetings/[id] mientras graba", () => {
  it("trae lo recibido hasta ahora (sin URLs ni rutas)", async () => {
    await nuevaReunion({ status: "grabando", audioUrl: null, coverage: null, readyAt: null, provider: null, costUsd: 0, digest: null, silences: null });
    await poner(1, 0, 30_000);
    await poner(1, 1, 30_000);
    await poner(2, 0, 12_000);
    await poner(3, -1, 0, 0); // la reserva no cuenta
    const r = await json(await leerReunion(pedir(), raiz));
    expect(r.status).toBe(200);
    expect(r.cuerpo.live).toMatchObject({ sesiones: 2, partes: 3, durMs: 72_000, ultimaParteEn: expect.any(String) });
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/blob|https:\/\/x\//);
  });

  it("fuera de «grabando» no consulta las partes (live es null)", async () => {
    await nuevaReunion({ status: "borrador", audioUrl: null, coverage: null, readyAt: null, provider: null, costUsd: 0, digest: null, silences: null });
    await poner(1, 0);
    expect((await json(await leerReunion(pedir(), raiz))).cuerpo.live).toBeNull();
  });
});
