/** El cupo de «Preguntar»: una bolsa con los mensajes de agente del plan, contada con los días y las semanas de Bogotá. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake, acceso } = vi.hoisted(() => ({ fake: { db: null as unknown }, acceso: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: (...a: unknown[]) => acceso(...a) }));

import { TIPO_DE_USO_PREGUNTA, comprobarCupoDePreguntas, inicioDeDia, inicioDeSemana, limitesDeMensajes } from "./cupo-preguntas";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

let db: DbFalsa;
// Lunes 5 de octubre de 2026, 3:00 p. m. en Bogotá.
const AHORA = new Date("2026-10-05T20:00:00Z");
const HORA = 3_600_000;

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  acceso.mockReset();
  acceso.mockResolvedValue({ allowed: true, status: "active" });
});

const plan = (planId: string) => db.subscription.create({ data: { userId: "u1", planId } });
const alAgente = async (n: number, extra: { role?: string; creadoHace?: number; chat?: string } = {}) => {
  const chat = extra.chat ?? "c1";
  if (!db.agentChat.filas.some((c) => c.id === chat)) await db.agentChat.create({ data: { id: chat, userId: "u1", agentId: "themis" } });
  for (let i = 0; i < n; i++) await db.agentMessage.create({ data: { chatId: chat, role: extra.role ?? "user", createdAt: new Date(AHORA.getTime() - (extra.creadoHace ?? HORA)) } });
};
const aReuniones = async (n: number, extra: { userId?: string; creadoHace?: number; tipo?: string } = {}) => {
  for (let i = 0; i < n; i++) await db.usageRecord.create({ data: { userId: extra.userId ?? "u1", type: extra.tipo ?? TIPO_DE_USO_PREGUNTA, tokens: 1, costUsd: 0.1, date: new Date(AHORA.getTime() - (extra.creadoHace ?? HORA)) } });
};

describe("el día y la semana son los de Bogotá", () => {
  it("el día empieza a las 00:00 de Bogotá (5:00 UTC), no a las 7 p. m. del día anterior", () => {
    expect(inicioDeDia(AHORA)).toEqual(new Date("2026-10-05T05:00:00Z"));
    // Domingo 4 a las 10 p. m. en Bogotá (lunes 03:00 UTC): sigue siendo el domingo.
    expect(inicioDeDia(new Date("2026-10-05T03:00:00Z"))).toEqual(new Date("2026-10-04T05:00:00Z"));
    // Justo a la medianoche de Bogotá empieza el día nuevo.
    expect(inicioDeDia(new Date("2026-10-05T05:00:00Z"))).toEqual(new Date("2026-10-05T05:00:00Z"));
    expect(inicioDeDia(new Date("2026-10-05T04:59:59Z"))).toEqual(new Date("2026-10-04T05:00:00Z"));
  });

  it("la semana empieza el lunes a las 00:00 de Bogotá", () => {
    expect(inicioDeSemana(AHORA)).toEqual(new Date("2026-10-05T05:00:00Z")); // hoy es lunes
    expect(inicioDeSemana(new Date("2026-10-08T15:00:00Z"))).toEqual(new Date("2026-10-05T05:00:00Z")); // jueves
    expect(inicioDeSemana(new Date("2026-10-05T03:00:00Z"))).toEqual(new Date("2026-09-28T05:00:00Z")); // el domingo 4 pertenece a la semana anterior
    expect(inicioDeSemana(new Date("2026-10-11T23:00:00Z"))).toEqual(new Date("2026-10-05T05:00:00Z")); // domingo 11
    expect(inicioDeSemana(new Date("2026-03-01T12:00:00Z"))).toEqual(new Date("2026-02-23T05:00:00Z")); // cruza de mes
  });
});

describe("limitesDeMensajes", () => {
  it("cada plan con los suyos; lo que no se reconoce cuenta como Pro", () => {
    expect(limitesDeMensajes("pro")).toEqual({ porDia: 30, porSemana: 150 });
    expect(limitesDeMensajes("business")).toEqual({ porDia: 60, porSemana: 400 });
    expect(limitesDeMensajes("elite")).toEqual({ porDia: 150, porSemana: 1000 });
    for (const raro of [null, undefined, "", "raro"]) expect(limitesDeMensajes(raro)).toEqual({ porDia: 30, porSemana: 150 });
  });
});

describe("comprobarCupoDePreguntas", () => {
  it("sin tope para las cuentas beta y mientras dure la fase de pruebas", async () => {
    for (const status of ["beta", "testing"]) {
      acceso.mockResolvedValue({ allowed: true, status });
      await aReuniones(500);
      expect(await comprobarCupoDePreguntas("u1", AHORA), status).toMatchObject({ permitido: true, ilimitado: true, mensaje: null });
    }
  });

  it("sin suscripción vigente no se pregunta, con el motivo que da el acceso", async () => {
    acceso.mockResolvedValue({ allowed: false, status: "expired", reason: "Tu prueba gratis terminó." });
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: false, mensaje: "Tu prueba gratis terminó." });
    acceso.mockResolvedValue({ allowed: false, status: "expired" });
    expect((await comprobarCupoDePreguntas("u1", AHORA)).mensaje).toBe("Necesitas una suscripción activa para preguntarle a una reunión.");
  });

  it("con cupo: deja preguntar y dice cuánto lleva", async () => {
    await plan("pro");
    await alAgente(5);
    await aReuniones(3);
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toEqual({
      permitido: true, ilimitado: false, usadoHoy: 8, limiteHoy: 30, usadoEstaSemana: 8, limiteSemana: 150, mensaje: null,
    });
  });

  it("es UNA bolsa: lo que se le escribió a los agentes y lo que se le preguntó a las reuniones se suman", async () => {
    await plan("pro");
    await alAgente(20);
    await aReuniones(9);
    expect((await comprobarCupoDePreguntas("u1", AHORA)).permitido).toBe(true); // 29 de 30
    await aReuniones(1);
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: false, usadoHoy: 30, limiteHoy: 30, mensaje: "Has alcanzado el límite diario de 30 mensajes. Intenta mañana." });
  });

  it("solo cuentan los mensajes de la persona (no las respuestas del agente), los suyos, y de los tipos que son preguntas", async () => {
    await plan("pro");
    await alAgente(40, { role: "assistant" });
    await aReuniones(40, { userId: "otra" });
    await aReuniones(40, { tipo: "agente_chat" });
    await aReuniones(40, { tipo: "reunion_ia" });
    await db.agentChat.create({ data: { id: "ajeno", userId: "otra", agentId: "themis" } });
    for (let i = 0; i < 40; i++) await db.agentMessage.create({ data: { chatId: "ajeno", role: "user", createdAt: new Date(AHORA.getTime() - HORA) } });
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, usadoHoy: 0 });
  });

  it("lo de ayer no cuenta para hoy (pero sí para la semana)", async () => {
    await plan("pro");
    // Ayer (domingo 4) a las 10 a. m. de Bogotá = 15:00 UTC: la semana anterior; no cuenta ni hoy ni esta semana.
    await aReuniones(100, { creadoHace: AHORA.getTime() - new Date("2026-10-04T15:00:00Z").getTime() });
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, usadoHoy: 0, usadoEstaSemana: 0 });
  });

  it("el tope semanal se cuenta desde el lunes", async () => {
    await plan("pro");
    const ahora = new Date("2026-10-09T20:00:00Z"); // viernes 9
    // 150 mensajes entre el lunes y el jueves: hoy no ha gastado nada, pero la semana está llena.
    for (let i = 0; i < 150; i++) await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, tokens: 1, costUsd: 0, date: new Date(new Date("2026-10-07T15:00:00Z").getTime() - i) } });
    expect(await comprobarCupoDePreguntas("u1", ahora)).toMatchObject({ permitido: false, usadoHoy: 0, usadoEstaSemana: 150, limiteSemana: 150, mensaje: "Has alcanzado el límite semanal de 150 mensajes." });
    // Al llegar el lunes siguiente se libera.
    expect(await comprobarCupoDePreguntas("u1", new Date("2026-10-12T15:00:00Z"))).toMatchObject({ permitido: true, usadoEstaSemana: 0 });
  });

  it("cada plan con su tope", async () => {
    await plan("business");
    await aReuniones(59);
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, limiteHoy: 60 });
    await aReuniones(1);
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: false, mensaje: "Has alcanzado el límite diario de 60 mensajes. Intenta mañana." });
  });

  it("en la prueba gratis, 15 al día y sin tope semanal", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "trialing" });
    await aReuniones(14);
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, limiteHoy: 15, limiteSemana: null });
    await aReuniones(1);
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: false, mensaje: "Has alcanzado el límite diario de 15 mensajes. Intenta mañana." });
  });

  it("los mensajes justo desde la medianoche de Bogotá cuentan; uno un segundo antes, no", async () => {
    await plan("pro");
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, tokens: 1, costUsd: 0, date: new Date("2026-10-05T05:00:00Z") } });
    await db.usageRecord.create({ data: { userId: "u1", type: TIPO_DE_USO_PREGUNTA, tokens: 1, costUsd: 0, date: new Date("2026-10-05T04:59:59Z") } });
    expect((await comprobarCupoDePreguntas("u1", AHORA)).usadoHoy).toBe(1);
  });

  it("si no se puede consultar, se deja pasar (como el resto de los topes) y se registra", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.subscription.findUnique = async () => {
      throw new Error("connection refused");
    };
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: true, ilimitado: true });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("si las tablas del chat no existen todavía, cuentan solo las preguntas a reuniones", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await plan("pro");
    db.agentChat.findMany = async () => {
      throw new Error('relation "AgentChat" does not exist');
    };
    await aReuniones(30);
    expect(await comprobarCupoDePreguntas("u1", AHORA)).toMatchObject({ permitido: false, usadoHoy: 30 });
    log.mockRestore();
  });
});
