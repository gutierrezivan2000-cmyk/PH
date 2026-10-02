import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, empujar, trabajar } = vi.hoisted(() => ({
  auth: vi.fn(),
  fake: { db: null as unknown },
  empujar: vi.fn(),
  trabajar: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/meetings/empujon", () => ({ empujar: (...a: unknown[]) => empujar(...a) }));
vi.mock("@/lib/meetings/trabajador", () => ({ trabajar: (...a: unknown[]) => trabajar(...a) }));

import { GET as cron } from "@/app/api/cron/process-meetings/route";
import { POST as reintentar } from "@/app/api/meetings/[id]/retry/route";
import { GET as estado } from "@/app/api/meetings/[id]/status/route";
import { TAREA_MUERTA_MS } from "./tipos";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

let db: DbFalsa;
const ID = "mreunion1";
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });
const pedir = (metodo = "GET", cabeceras: Record<string, string> = {}) => new NextRequest("http://localhost/api/x", { method: metodo, headers: cabeceras });
const raiz = ctx({ id: ID });

const reunion = (extra: Record<string, unknown> = {}) =>
  db.meeting.create({ data: { id: ID, userId: "u1", status: "procesando", stage: "preparando_audio", progress: 40, errorMessage: null, durationMs: null, coverage: null, ...extra } });
const tarea = (key: string, kind: string, status: string, extra: Record<string, unknown> = {}) =>
  db.meetingTask.create({ data: { meetingId: ID, kind, key, status, runAfter: new Date(Date.now() - 1000), lockedAt: null, attempts: 0, ...extra } });

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  empujar.mockReset();
  trabajar.mockReset();
  vi.stubEnv("DEMO_MODE", "false");
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com", role: "admin" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET status", () => {
  it("dice dónde va: estado, etapa, avance y cuántas tareas de la etapa están hechas", async () => {
    await reunion();
    await tarea("normalizar:a", "normalizar", "hecha");
    await tarea("normalizar:b", "normalizar", "en_curso", { lockedAt: new Date() });
    await tarea("armar_audio", "armar_audio", "pendiente");
    await tarea("tramo:0", "transcribir_tramo", "pendiente");
    const r = await json(await estado(pedir(), raiz));
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({
      status: "procesando", stage: "preparando_audio", progress: 40, errorMessage: null, durationMs: null, coverage: null,
      tareas: { hechas: 1, total: 3 },
    });
  });

  it("fuera del procesamiento no consulta tareas ni empuja", async () => {
    await reunion({ status: "lista", stage: null, progress: 100, durationMs: 8_000_000, coverage: 1 });
    const consulta = vi.spyOn(db.meetingTask, "findMany");
    const r = await json(await estado(pedir(), raiz));
    expect(r.cuerpo).toMatchObject({ status: "lista", durationMs: 8_000_000, coverage: 1, tareas: { hechas: null, total: null } });
    expect(consulta).not.toHaveBeenCalled();
    expect(empujar).not.toHaveBeenCalled();
  });

  it("empuja al trabajador si hay tareas listas y nadie las atiende", async () => {
    await reunion({ status: "en_cola", stage: null, progress: 0 });
    await tarea("normalizar:a", "normalizar", "pendiente");
    await estado(pedir(), raiz);
    expect(empujar).toHaveBeenCalledTimes(1);
  });

  it("no empuja si alguien trabaja y avisó hace poco", async () => {
    await reunion();
    await tarea("normalizar:a", "normalizar", "pendiente");
    await tarea("normalizar:b", "normalizar", "en_curso", { lockedAt: new Date(Date.now() - 10_000) });
    await estado(pedir(), raiz);
    expect(empujar).not.toHaveBeenCalled();
  });

  it("sí empuja si quien trabajaba lleva más de 45 s sin avisar", async () => {
    await reunion();
    await tarea("normalizar:a", "normalizar", "pendiente");
    await tarea("normalizar:b", "normalizar", "en_curso", { lockedAt: new Date(Date.now() - 60_000) });
    await estado(pedir(), raiz);
    expect(empujar).toHaveBeenCalledTimes(1);
  });

  it("no empuja si lo pendiente está programado para después (espera de un reintento)", async () => {
    await reunion();
    await tarea("normalizar:a", "normalizar", "pendiente", { runAfter: new Date(Date.now() + 120_000) });
    await estado(pedir(), raiz);
    expect(empujar).not.toHaveBeenCalled();
  });

  it("una reunión de otro usuario o inexistente: 404 y sin empujar", async () => {
    await reunion({ userId: "otro" });
    await tarea("normalizar:a", "normalizar", "pendiente");
    expect((await estado(pedir(), raiz)).status).toBe(404);
    expect((await estado(pedir(), ctx({ id: "no-existe" }))).status).toBe(404);
    expect(empujar).not.toHaveBeenCalled();
  });

  it("un fallo de la base de datos es un 500 sin detalles internos", async () => {
    await reunion();
    db.meeting.findFirst = async () => {
      throw new Error("connection refused: postgres://secreto");
    };
    const r = await json(await estado(pedir(), raiz));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/postgres|secreto/);
  });
});

describe("POST retry", () => {
  it("vuelve a intentar solo lo fallido, deja la reunión «procesando» y empuja al trabajador", async () => {
    await reunion({ status: "error", errorMessage: "No pudimos preparar el audio…" });
    await tarea("normalizar:a", "normalizar", "fallida", { attempts: 3, error: "x" });
    await tarea("normalizar:b", "normalizar", "hecha");
    await tarea("armar_audio", "armar_audio", "pendiente", { runAfter: new Date("2099-01-01T00:00:00Z") });
    const r = await json(await reintentar(pedir("POST"), raiz));
    expect(r).toEqual({ status: 200, cuerpo: { status: "procesando" } });
    const fila = (key: string) => db.meetingTask.filas.find((t) => t.key === key)!;
    expect(fila("normalizar:a")).toMatchObject({ status: "pendiente", attempts: 0, error: null });
    expect(fila("normalizar:b").status).toBe("hecha");
    expect((fila("armar_audio").runAfter as Date).getTime()).toBeLessThan(Date.now() + 1000); // descongelada
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando", errorMessage: null });
    expect(empujar).toHaveBeenCalledTimes(1);
  });

  it("si la reunión no está en error, devuelve su estado sin tocar nada", async () => {
    await reunion({ status: "procesando" });
    await tarea("normalizar:a", "normalizar", "fallida");
    expect(await json(await reintentar(pedir("POST"), raiz))).toEqual({ status: 200, cuerpo: { status: "procesando" } });
    expect(db.meetingTask.filas[0].status).toBe("fallida");
    expect(empujar).not.toHaveBeenCalled();
  });

  it("en error pero sin nada fallido que reintentar: 409 claro", async () => {
    await reunion({ status: "error", errorMessage: "otra cosa" });
    const r = await json(await reintentar(pedir("POST"), raiz));
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toMatch(/nada que reintentar/);
    expect(empujar).not.toHaveBeenCalled();
  });

  it("una reunión ajena o inexistente: 404", async () => {
    await reunion({ status: "error", userId: "otro" });
    expect((await reintentar(pedir("POST"), raiz)).status).toBe(404);
    expect((await reintentar(pedir("POST"), ctx({ id: "no-existe" }))).status).toBe(404);
  });
});

describe("GET /api/cron/process-meetings", () => {
  it("sin el secreto correcto: 401 (y no trabaja)", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
    for (const cabeceras of [{}, { authorization: "Bearer otro" }, { authorization: "secreto-de-prueba" }] as Array<Record<string, string>>) {
      expect((await cron(pedir("GET", cabeceras))).status, JSON.stringify(cabeceras)).toBe(401);
    }
    expect(trabajar).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado: 401, nunca abierto", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron(pedir("GET", { authorization: "Bearer " }))).status).toBe(401);
    expect(trabajar).not.toHaveBeenCalled();
  });

  it("con el secreto: rescata tareas colgadas y trabaja la cola ~230 s", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
    await reunion();
    await tarea("normalizar:a", "normalizar", "en_curso", { attempts: 1, lockedAt: new Date(Date.now() - TAREA_MUERTA_MS - 5000) });
    trabajar.mockResolvedValue({ ejecutadas: 3, fallidas: 0, continuadas: 1 });
    const r = await json(await cron(pedir("GET", { authorization: "Bearer secreto-de-prueba" })));
    expect(r).toEqual({ status: 200, cuerpo: { ok: true, rescatadas: 1, ejecutadas: 3, fallidas: 0, continuadas: 1 } });
    expect(trabajar).toHaveBeenCalledWith({ presupuestoMs: 230_000 });
    expect(db.meetingTask.filas[0].status).toBe("pendiente"); // volvió a la cola
  });

  it("si el trabajo falla, un 500 sin detalles", async () => {
    vi.stubEnv("CRON_SECRET", "s");
    trabajar.mockRejectedValue(new Error("postgres://secreto"));
    const registrar = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await json(await cron(pedir("GET", { authorization: "Bearer s" })));
    registrar.mockRestore();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/postgres|secreto/);
  });
});
