/**
 * El uso del plan con Reuniones: `/api/usage` trae las horas de reuniones solo a quien ve Reuniones, y `/api/agents/usage` trae el
 * porcentaje del chat, que incluye las preguntas a reuniones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, resumen, esquema } = vi.hoisted(() => ({
  auth: vi.fn(),
  fake: { db: null as unknown },
  resumen: vi.fn(),
  esquema: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
// Estas pruebas cubren la compuerta de acceso: se hacen con el piloto «solo admins» para que la puerta se pruebe de verdad
// (el valor publicado se prueba aparte, en `feature-flags.test.ts` y `acceso-publicado.test.ts`).
vi.mock("@/lib/feature-flags", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/feature-flags")>();
  return { ...real, puedeVerReuniones: (u: Parameters<typeof real.puedeVerReuniones>[0]) => real.reunionesVisibles("admins", u) };
});
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
import { TIPOS } from "@/lib/consumo/funciones";

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
    expect(cuerpo.reuniones).toEqual({ ilimitado: false, periodo: "mes", usadoMs: 6 * H, limiteMs: 8 * H, restanMs: 2 * H });
    expect(resumen).not.toHaveBeenCalled();
  });
});

describe("GET /api/agents/usage: el uso del chat (porcentaje) incluye las preguntas a reuniones", () => {
  const AHORA = new Date("2026-10-07T15:00:00Z"); // miércoles
  const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
  });

  it("suma el costo del chat y el de las preguntas a reuniones, y deja fuera lo que no es chat y lo de otras personas", async () => {
    await db.agentChat.create({ data: { id: "c1", userId: "u1" } });
    // Chat: US$0,0375 hace 1 h y otro tanto de una pregunta a una reunión hace 2 h: en la sesión de 5 h (cap US$0,15) queda 50 %.
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.agenteChat, costUsd: 0.0375, date: hace(1) } });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 0.0375, date: hace(2) } });
    // No cuentan: un acta de reunión, otra persona y un gasto de hace 8 días (antes del mes).
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.reunionActa, costUsd: 9, date: hace(1) } });
    await db.usageRecord.create({ data: { userId: "otra", type: TIPOS.agenteChat, costUsd: 9, date: hace(1) } });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.agenteChat, costUsd: 9, date: hace(24 * 8) } });

    const cuerpo = await (await usoDeAgentes()).json();
    expect(cuerpo.chat).toMatchObject({ ilimitado: false, presupuestoUsd: 0.75, porcentajeRestante: 50, ventana: "sesion", agotado: false });
  });

  it("sin consumo, el chat está al 100 %", async () => {
    const cuerpo = await (await usoDeAgentes()).json();
    expect(cuerpo.chat).toMatchObject({ porcentajeRestante: 100, agotado: false });
  });

  it("con la sesión agotada, lo dice (0 % y agotado)", async () => {
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.agenteChat, costUsd: 1, date: hace(1) } });
    const cuerpo = await (await usoDeAgentes()).json();
    expect(cuerpo.chat).toMatchObject({ porcentajeRestante: 0, agotado: true });
  });

  it("si no se puede leer el uso, el asistente sale igual, con el chat en null", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.usageRecord, "findMany").mockRejectedValue(new Error("conexión perdida"));
    const r = await usoDeAgentes();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ chat: null });
    expect(consola).toHaveBeenCalled();
  });
});
