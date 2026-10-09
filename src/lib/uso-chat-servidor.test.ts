import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake, acceso } = vi.hoisted(() => ({ fake: { db: null as unknown }, acceso: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: (...a: unknown[]) => acceso(...a) }));

import { TIPOS } from "@/lib/consumo/funciones";
import { PLANS } from "@/lib/epayco";
import { cupoDeAudioMensual, limitesDelPlan, minutosDeAudioDesde, usoDelChat } from "./uso-chat-servidor";
import { crearDbFalsa, type DbFalsa } from "@/lib/meetings/db-falsa";

const H = 3_600_000;
const AHORA = new Date("2026-10-07T15:00:00Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);
let db: DbFalsa;

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  acceso.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("limitesDelPlan: cada plan tiene los suyos", () => {
  it("Business recibe sus límites, no los de Pro (antes recibía los de Pro en la transcripción)", () => {
    expect(limitesDelPlan("business").transcriptionMinutesPerDay).toBe(PLANS.business.limits.transcriptionMinutesPerDay);
    expect(limitesDelPlan("business").transcriptionMinutesPerDay).toBe(40);
    expect(limitesDelPlan("business").transcriptionMinutesPerMonth).toBe(300);
  });

  it("un plan que no se reconoce cuenta como Pro, y Élite tiene los suyos", () => {
    expect(limitesDelPlan("raro").chatBudgetUsd).toBe(PLANS.pro.limits.chatBudgetUsd);
    expect(limitesDelPlan(null).chatBudgetUsd).toBe(5);
    expect(limitesDelPlan("elite").chatBudgetUsd).toBe(40);
  });
});

describe("usoDelChat: el presupuesto y el periodo de cada cuenta", () => {
  it("un plan Business tiene US$15 al mes", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "active" });
    await db.subscription.create({ data: { userId: "u1", planId: "business" } });
    expect(await usoDelChat("u1", AHORA)).toMatchObject({ ilimitado: false, presupuestoUsd: 15 });
  });

  it("la prueba gratis tiene US$1 en su periodo de 7 días, y su gasto cuenta contra ese periodo", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "trialing" });
    await db.subscription.create({ data: { userId: "u1", planId: "pro", currentPeriodStart: hace(24), currentPeriodEnd: hace(-6 * 24) } });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.agenteChat, costUsd: 0.1, date: hace(1) } });
    const uso = await usoDelChat("u1", AHORA);
    // Sesión: 0,1 de 0,2 (20 % de US$1) → queda 50 %. Mes (el periodo de la prueba): 0,1 de 1 → 90 %. Manda el 50 %.
    expect(uso).toMatchObject({ ilimitado: false, presupuestoUsd: 1, estado: { porcentajeRestante: 50, ventana: "sesion" } });
  });

  it("una cuenta beta o en pruebas no tiene tope", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "beta" });
    expect(await usoDelChat("u1", AHORA)).toEqual({ ilimitado: true });
  });

  it("si no se puede leer, devuelve null (no bloquea)", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "active" });
    vi.spyOn(db.subscription, "findUnique").mockRejectedValue(new Error("conexión perdida"));
    expect(await usoDelChat("u1", AHORA)).toBeNull();
  });
});

describe("cupoDeAudioMensual: el audio del chat y de los documentos comparten el cupo del mes", () => {
  const SEG_POR_MIN = 60;

  it("suma los minutos del chat y de los documentos con audio, y deja fuera el resto", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "active" });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.audioEnAgente, tokens: 30 * SEG_POR_MIN, date: hace(2) } });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.audioEnGeneracion, tokens: 20 * SEG_POR_MIN, date: hace(3) } });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.reunionAudio, tokens: 500 * SEG_POR_MIN, date: hace(3) } });
    expect(await minutosDeAudioDesde("u1", hace(24 * 30))).toBe(50);
  });

  it("un plan Pro con 120 minutos al mes: con 110 usados, 10 más llegan justo a 120; 11 ya no caben", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "active" });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.audioEnGeneracion, tokens: 110 * SEG_POR_MIN, date: hace(2) } });
    expect(await cupoDeAudioMensual("u1", 10, AHORA)).toEqual({ bloqueado: false, mensaje: null });
    const bloq = await cupoDeAudioMensual("u1", 11, AHORA);
    expect(bloq.bloqueado).toBe(true);
    expect(bloq.mensaje).toContain("120 minutos");
    expect(bloq.mensaje).toContain("te quedan 10");
    expect(bloq.mensaje).toContain("Se renueva el 1 de noviembre");
  });

  it("la prueba gratis tiene su total de minutos (20), no uno mensual", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "trialing" });
    await db.subscription.create({ data: { userId: "u1", planId: "pro", currentPeriodStart: hace(24), currentPeriodEnd: hace(-6 * 24) } });
    const bloq = await cupoDeAudioMensual("u1", 25, AHORA);
    expect(bloq).toMatchObject({ bloqueado: true });
    expect(bloq.mensaje).toContain("prueba gratis incluye 20 minutos");
  });

  it("beta y pruebas no tienen tope de audio", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "beta" });
    expect(await cupoDeAudioMensual("u1", 9999, AHORA)).toEqual({ bloqueado: false, mensaje: null });
  });

  it("si no se puede contar, no bloquea", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "active" });
    vi.spyOn(db.usageRecord, "aggregate").mockRejectedValue(new Error("conexión perdida"));
    expect(await cupoDeAudioMensual("u1", 5, AHORA)).toEqual({ bloqueado: false, mensaje: null });
  });
});

