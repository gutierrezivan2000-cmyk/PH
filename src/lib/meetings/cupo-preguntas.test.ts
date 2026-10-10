import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake, acceso } = vi.hoisted(() => ({ fake: { db: null as unknown }, acceso: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: (...a: unknown[]) => acceso(...a) }));

import { TIPOS } from "@/lib/consumo/funciones";
import { comprobarCupoDePreguntas, MAX_PREGUNTAS_POR_DIA_SIN_PLAN, TIPO_DE_USO_PREGUNTA } from "./cupo-preguntas";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

const H = 3_600_000;
const AHORA = new Date("2026-10-07T15:00:00Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);
let db: DbFalsa;

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  acceso.mockReset();
  acceso.mockResolvedValue({ allowed: true, status: "active" });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("comprobarCupoDePreguntas: «Preguntar» usa el mismo uso del chat", () => {
  it("sin suscripción activa, no deja preguntar y dice por qué", async () => {
    acceso.mockResolvedValue({ allowed: false, status: "expired", reason: "Tu prueba gratis terminó." });
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: false, mensaje: "Tu prueba gratis terminó." });
  });

  it("sin suscripción activa y sin razón dada, dice la razón de siempre", async () => {
    acceso.mockResolvedValue({ allowed: false, status: "none" });
    expect((await comprobarCupoDePreguntas("u1", AHORA)).mensaje).toBe("Necesitas una suscripción activa para preguntarle a una reunión.");
  });

  it("las cuentas beta y la fase de pruebas no tienen tope", async () => {
    for (const status of ["beta", "testing"]) {
      acceso.mockResolvedValue({ allowed: true, status });
      await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 100, date: hace(1) } });
      expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, ilimitado: true, mensaje: null });
    }
  });

  it("las cuentas beta y la fase de pruebas llevan un techo de seguridad de 60 preguntas al día", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "testing" });
    for (let i = 0; i < MAX_PREGUNTAS_POR_DIA_SIN_PLAN - 1; i++) await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 0.01, date: hace(1) } });
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, ilimitado: true });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 0.01, date: hace(1) } });
    const c = await comprobarCupoDePreguntas("u1", AHORA);
    expect(c.permitido).toBe(false);
    expect(c.mensaje).toContain("60 preguntas de hoy");
  });

  it("las preguntas de ayer no cuentan para el techo de hoy", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "testing" });
    for (let i = 0; i < 70; i++) await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 0.01, date: hace(30) } });
    expect((await comprobarCupoDePreguntas("u1", AHORA)).permitido).toBe(true);
  });

  it("con el uso agotado (la sesión de 5 h), no deja preguntar y dice cuándo vuelve", async () => {
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 0.2, date: hace(1) } });
    const c = await comprobarCupoDePreguntas("u1", AHORA);
    expect(c).toMatchObject({ permitido: false, ilimitado: false, porcentajeRestante: 0 });
    expect(c.mensaje).toContain("sesión de 5 horas");
  });

  it("con uso disponible, deja preguntar y dice cuánto queda", async () => {
    // Plan Pro: la sesión de 5 h tiene US$0,15; gastar US$0,0375 deja 75 %.
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, costUsd: 0.0375, date: hace(1) } });
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, ilimitado: false, porcentajeRestante: 75, mensaje: null });
  });

  it("un chat con los agentes gasta del mismo uso que una pregunta a una reunión", async () => {
    await db.usageRecord.create({ data: { userId: "u1", type: TIPOS.agenteChat, costUsd: 0.2, date: hace(1) } });
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: false, porcentajeRestante: 0 });
  });

  it("si no se puede leer el uso, se deja pasar (un tope no tumba la función)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.usageRecord, "findMany").mockRejectedValue(new Error("conexión perdida"));
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true });
  });
});
