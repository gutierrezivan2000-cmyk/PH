/**
 * El uso del plan con Reuniones: `/api/usage` trae las horas de reuniones solo a quien ve Reuniones, y `/api/agents/usage` suma las
 * preguntas a reuniones a los mensajes de agente (es una sola bolsa).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, resumen, esquema } = vi.hoisted(() => ({
  auth: vi.fn(),
  fake: { db: null as unknown },
  resumen: vi.fn(),
  esquema: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: (...a: unknown[]) => esquema(...a) }));
vi.mock("@/lib/usage", () => ({
  getUsageSummary: async () => ({ monthlyGenerations: 2, dailyGenerations: 1, monthlyTokens: 26_000, monthlyCost: 0.34, limits: { generationsPerDay: 3, generationsPerMonth: 15 } }),
  getGenerationFileLimits: async () => ({ maxFiles: 20, maxFileSizeMb: 50 }),
  checkSubscriptionAccess: async () => ({ allowed: true, status: "active" }),
}));
vi.mock("./cupos", async (importOriginal) => ({ ...(await importOriginal<typeof import("./cupos")>()), resumenDeHoras: (...a: unknown[]) => resumen(...a) }));

import { GET as usoDelPlan } from "@/app/api/usage/route";
import { GET as usoDeAgentes } from "@/app/api/agents/usage/route";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { TIPO_DE_USO_PREGUNTA } from "./cupo-preguntas";

const H = 3_600_000;
const HORAS = { ilimitado: false, periodo: "mes", usadoMs: 3.5 * H, limiteMs: 10 * H, restanMs: 6.5 * H };
let db: DbFalsa;

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  resumen.mockReset();
  esquema.mockReset();
  resumen.mockResolvedValue(HORAS);
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("ADMIN_EMAILS", "");
  auth.mockResolvedValue({ user: { id: "u1", email: "admin@x.com", role: "admin" } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/usage: las horas de reuniones", () => {
  it("sin sesión: 401", async () => {
    auth.mockResolvedValue(null);
    expect((await usoDelPlan()).status).toBe(401);
    expect(resumen).not.toHaveBeenCalled();
  });

  it("un administrador recibe las horas de reuniones junto con el uso de siempre", async () => {
    const r = await usoDelPlan();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      monthlyGenerations: 2, limits: { generationsPerDay: 3, generationsPerMonth: 15 }, fileLimits: { maxFiles: 20, maxFileSizeMb: 50 }, reuniones: HORAS,
    });
    expect(resumen).toHaveBeenCalledWith("u1");
    expect(esquema).toHaveBeenCalledTimes(1);
  });

  it("quien no ve Reuniones no recibe nada de ellas: ni la clave, ni una consulta a la base de datos", async () => {
    auth.mockResolvedValue({ user: { id: "u2", email: "otra@x.com", role: "user" } });
    const cuerpo = await (await usoDelPlan()).json();
    expect(cuerpo).not.toHaveProperty("reuniones");
    expect(cuerpo.monthlyGenerations).toBe(2);
    expect(resumen).not.toHaveBeenCalled();
    expect(esquema).not.toHaveBeenCalled();
  });

  it("un administrador de ADMIN_EMAILS también las recibe, aunque su rol sea el común", async () => {
    vi.stubEnv("ADMIN_EMAILS", "jefa@x.com, otra@x.com");
    auth.mockResolvedValue({ user: { id: "u3", email: "JEFA@x.com", role: "user" } });
    expect(await (await usoDelPlan()).json()).toMatchObject({ reuniones: HORAS });
  });

  it("si las horas no se pueden decir (null) o fallan, el uso sale igual, sin ellas", async () => {
    resumen.mockResolvedValue(null);
    expect(await (await usoDelPlan()).json()).not.toHaveProperty("reuniones");
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    resumen.mockRejectedValue(new Error("conexión perdida"));
    const r = await usoDelPlan();
    expect(r.status).toBe(200);
    expect(await r.json()).not.toHaveProperty("reuniones");
    expect(consola).toHaveBeenCalledTimes(1);
    esquema.mockRejectedValue(new Error("no se pudo preparar el esquema"));
    resumen.mockResolvedValue(HORAS);
    expect(await (await usoDelPlan()).json()).not.toHaveProperty("reuniones");
  });

  it("en el demo siempre vienen, coherentes con la reunión «sin horas» del ejemplo (dura 8 h y quedan 2 h), sin tocar la base de datos", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.resetModules();
    const { GET } = await import("@/app/api/usage/route");
    const cuerpo = await (await GET()).json();
    expect(cuerpo.reuniones).toEqual({ ilimitado: false, periodo: "mes", usadoMs: 8 * H, limiteMs: 10 * H, restanMs: 2 * H });
    expect(resumen).not.toHaveBeenCalled();
  });
});

describe("GET /api/agents/usage: las preguntas a reuniones cuentan como mensajes", () => {
  const AHORA = new Date("2026-10-07T15:00:00Z"); // miércoles
  const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
  });

  it("suma a los mensajes que le escribió a los agentes las preguntas que le hizo a sus reuniones, por día y por semana", async () => {
    await db.agentChat.create({ data: { id: "c1", userId: "u1" } });
    // Mensajes a los agentes: 2 hoy, 1 ayer (misma semana), 1 de la semana pasada, 1 del agente (no cuenta).
    await db.agentMessage.create({ data: { chatId: "c1", role: "user", createdAt: hace(1) } });
    await db.agentMessage.create({ data: { chatId: "c1", role: "user", createdAt: hace(2) } });
    await db.agentMessage.create({ data: { chatId: "c1", role: "user", createdAt: hace(26) } });
    await db.agentMessage.create({ data: { chatId: "c1", role: "user", createdAt: hace(24 * 8) } });
    await db.agentMessage.create({ data: { chatId: "c1", role: "assistant", createdAt: hace(1) } });
    // Preguntas a reuniones: 3 hoy, 1 ayer, 1 de la semana pasada; y un uso de otro tipo y de otra persona, que no cuentan.
    for (const h of [0.5, 1, 3, 26, 24 * 8]) await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, date: hace(h) } });
    await db.usageRecord.create({ data: { userId: "u1", type: "reunion_acta", date: hace(1) } });
    await db.usageRecord.create({ data: { userId: "otra", type: TIPO_DE_USO_PREGUNTA, date: hace(1) } });

    const cuerpo = await (await usoDeAgentes()).json();
    expect(cuerpo.daily).toBe(2 + 3);
    expect(cuerpo.weekly).toBe(3 + 4);
  });

  it("sin chats con los agentes igual cuentan las preguntas a reuniones", async () => {
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, date: hace(1) } });
    const cuerpo = await (await usoDeAgentes()).json();
    expect(cuerpo).toMatchObject({ daily: 1, weekly: 1 });
  });

  it("si no se pueden contar las preguntas, el uso de los agentes sale igual (solo con sus mensajes)", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.agentChat.create({ data: { id: "c1", userId: "u1" } });
    await db.agentMessage.create({ data: { chatId: "c1", role: "user", createdAt: hace(1) } });
    vi.spyOn(db.usageRecord, "count").mockRejectedValue(new Error("conexión perdida"));
    const r = await usoDeAgentes();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ daily: 1, weekly: 1 });
    expect(consola).toHaveBeenCalled();
  });
});
