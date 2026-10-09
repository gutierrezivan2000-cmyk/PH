/**
 * El uso del chat de los agentes (el porcentaje, en dólares de costo) lo comparten el chat y «Preguntar»: una pregunta a una
 * reunión gasta del mismo uso que un mensaje al agente. Los documentos y las reuniones (horas) no entran en ese porcentaje.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, acceso } = vi.hoisted(() => ({ auth: vi.fn(), fake: { db: null as unknown }, acceso: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: (...a: unknown[]) => acceso(...a) }));
// Si el chat pasa la compuerta del uso llega hasta la IA: que ahí se detenga, sin red.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      throw new Error("sin red en las pruebas");
    }
  },
}));

import { POST } from "@/app/api/agents/[agentId]/chat/route";
import { TIPOS } from "@/lib/consumo/funciones";
import { TIPO_DE_USO_PREGUNTA } from "@/lib/meetings/cupo-preguntas";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

const H = 3_600_000;
const AHORA = new Date("2026-10-07T15:00:00Z"); // miércoles
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);
// Plan Pro: US$0,75 al mes. Ventanas: sesión 20 % (US$0,15 en 5 h), semana 40 % (US$0,30 en 7 días).
let db: DbFalsa;

const escribir = () =>
  POST(new NextRequest("http://localhost/api/agents/themis/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hola" }) }), {
    params: Promise.resolve({ agentId: "themis" }),
  });
const gastar = async (usd: number, haceHoras: number, extra: Record<string, unknown> = {}) => {
  await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.agenteChat, costUsd: usd, date: hace(haceHoras), ...extra } });
};
const sinUso = async (r: Response) => ({ status: r.status, cuerpo: (await r.json()) as { error?: string } });
/** El chat pasó la compuerta del uso y llegó hasta la IA, donde las pruebas lo detienen. */
const llegaALaIA = async (r: Response) => {
  expect(await sinUso(r)).toEqual({ status: 502, cuerpo: { error: "Error del servicio de IA: sin red en las pruebas" } });
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

describe("el chat se mide por el uso que le queda a la cuenta (porcentaje, en dólares de costo)", () => {
  it("con la sesión de 5 horas agotada (US$0,2 de los 0,15 de la sesión), el chat no deja escribir y dice cuándo vuelve el uso", async () => {
    await gastar(0.2, 1);
    const r = await sinUso(await escribir());
    expect(r.status).toBe(429);
    expect(r.cuerpo.error).toContain("sesión de 5 horas");
    expect(r.cuerpo.error).toContain("Vuelve a tener uso");
  });

  it("con poco gastado (US$0,05), todavía queda uso: el chat pasa la compuerta (se detiene después, en la IA)", async () => {
    await gastar(0.05, 1);
    await llegaALaIA(await escribir());
  });

  it("la semana también se agota: US$0,35 en los últimos 6 días (tope de la semana: 0,30), sin agotar el mes", async () => {
    await gastar(0.2, 6 * 24);
    await gastar(0.15, 5 * 24);
    const r = await sinUso(await escribir());
    expect(r.status).toBe(429);
    expect(r.cuerpo.error).toContain("esta semana");
  });

  it("las preguntas a las reuniones gastan del mismo uso que el chat", async () => {
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 0.2, date: hace(1) } });
    const r = await sinUso(await escribir());
    expect(r.status).toBe(429);
    expect(r.cuerpo.error).toContain("sesión de 5 horas");
  });

  it("no cuenta lo que no es chat (un acta de reunión) ni lo de otras personas", async () => {
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.reunionActa, costUsd: 5, date: hace(1) } });
    await gastar(5, 1, { userId: "otra" });
    await llegaALaIA(await escribir());
  });

  it("lo gastado hace más de 5 horas ya no cuenta en la sesión (la semana, con US$0,1, queda en 67 %)", async () => {
    await gastar(0.1, 6);
    await llegaALaIA(await escribir());
  });

  it("las cuentas beta no tienen tope de uso", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "beta" });
    await gastar(100, 1);
    await llegaALaIA(await escribir());
  });

  it("si no se puede leer el uso, no se tumba el chat", async () => {
    await gastar(1, 1);
    vi.spyOn(db.usageRecord, "findMany").mockRejectedValue(new Error("conexión perdida"));
    await llegaALaIA(await escribir());
  });
});
