/**
 * El chat de los agentes y «Preguntar» comparten una sola bolsa de mensajes del plan: el chat suma las preguntas a reuniones a
 * los mensajes que ya contaba (si no, se podrían gastar los dos cupos completos).
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, acceso } = vi.hoisted(() => ({ auth: vi.fn(), fake: { db: null as unknown }, acceso: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: (...a: unknown[]) => acceso(...a) }));
// Si el chat pasa la compuerta de los cupos llega hasta la IA: que ahí se detenga, sin red.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      throw new Error("sin red en las pruebas");
    }
  },
}));

import { POST } from "@/app/api/agents/[agentId]/chat/route";
import { PLANS } from "@/lib/epayco";
import { TIPO_DE_USO_PREGUNTA } from "./cupo-preguntas";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

const H = 3_600_000;
const AHORA = new Date("2026-10-07T15:00:00Z"); // miércoles
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);
const { agentMessagesPerDay: POR_DIA, agentMessagesPerWeek: POR_SEMANA } = PLANS.pro.limits;
let db: DbFalsa;

const escribir = () =>
  POST(new NextRequest("http://localhost/api/agents/themis/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hola" }) }), {
    params: Promise.resolve({ agentId: "themis" }),
  });
const mensajesAlAgente = async (n: number, haceHoras: number) => {
  for (let i = 0; i < n; i++) await db.agentMessage.create({ data: { chatId: "c1", role: "user", content: "x", createdAt: hace(haceHoras) } });
};
const preguntasAReuniones = async (n: number, haceHoras: number, extra: Record<string, unknown> = {}) => {
  for (let i = 0; i < n; i++) await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, date: hace(haceHoras), ...extra } });
};
const sinCupo = async (r: Response) => ({ status: r.status, cuerpo: (await r.json()) as { error?: string } });
/** El chat pasó la compuerta de los cupos y llegó hasta la IA, donde las pruebas lo detienen. */
const llegaALaIA = async (r: Response) => {
  expect(await sinCupo(r)).toEqual({ status: 502, cuerpo: { error: "Error del servicio de IA: sin red en las pruebas" } });
};

beforeEach(async () => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  acceso.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("ANTHROPIC_API_KEY", "clave-de-prueba");
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com" } });
  acceso.mockResolvedValue({ allowed: true, status: "active" });
  await db.agentChat.create({ data: { id: "c1", userId: "u1", agentId: "themis" } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("el chat de los agentes y las preguntas a reuniones comparten la bolsa de mensajes del plan", () => {
  it("con el tope del día a una pregunta de distancia, una pregunta a una reunión lo completa: el chat dice que se acabó", async () => {
    await mensajesAlAgente(POR_DIA - 1, 1);
    await preguntasAReuniones(1, 1);
    const r = await sinCupo(await escribir());
    expect(r.status).toBe(429);
    expect(r.cuerpo.error).toBe(`Has alcanzado el límite diario de ${POR_DIA} mensajes. Intenta mañana.`);
  });

  it("sin esa pregunta, todavía alcanza: el chat pasa la compuerta (se detiene después, en la IA)", async () => {
    await mensajesAlAgente(POR_DIA - 1, 1);
    await llegaALaIA(await escribir());
  });

  it("también cuenta por semana: lo de otros días de la semana suma", async () => {
    await mensajesAlAgente(POR_SEMANA - 50, 48); // el lunes
    await preguntasAReuniones(50, 48);
    const r = await sinCupo(await escribir());
    expect(r.status).toBe(429);
    expect(r.cuerpo.error).toBe(`Has alcanzado el límite semanal de ${POR_SEMANA} mensajes.`);
  });

  it("alguien que solo ha usado Preguntar (sin ningún chat con los agentes) también llega al tope", async () => {
    await db.agentChat.filas.splice(0);
    await preguntasAReuniones(POR_DIA, 1);
    const r = await sinCupo(await escribir());
    expect(r.status).toBe(429);
    expect(r.cuerpo.error).toMatch(/límite diario/);
  });

  it("no cuenta lo que no es una pregunta suya a una reunión: otros usos, otras personas, otros días", async () => {
    await mensajesAlAgente(POR_DIA - 1, 1);
    await preguntasAReuniones(5, 1, { type: "reunion_acta" });
    await preguntasAReuniones(5, 1, { userId: "otra" });
    await preguntasAReuniones(5, 24 * 9); // la semana pasada
    await llegaALaIA(await escribir());
  });

  it("las cuentas beta no tienen tope de mensajes, tampoco con las preguntas a reuniones", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "beta" });
    await preguntasAReuniones(POR_DIA + 5, 1);
    await llegaALaIA(await escribir());
  });

  it("si no se pueden contar las preguntas, no se tumba el chat: se cuenta solo lo del chat", async () => {
    await mensajesAlAgente(POR_DIA - 1, 1);
    vi.spyOn(db.usageRecord, "count").mockRejectedValue(new Error("conexión perdida"));
    await llegaALaIA(await escribir());
  });
});
