import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { fake, acceso } = vi.hoisted(() => ({ fake: { db: null as unknown }, acceso: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: (...a: unknown[]) => acceso(...a) }));

import { comprobarCupoDeReuniones, horasPorMes, inicioDeMes, mensajeDeCupo } from "./cupos";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

const H = 3_600_000;
const AHORA = new Date("2026-10-15T15:00:00Z");

describe("inicioDeMes", () => {
  it("el mes empieza a medianoche de Bogotá, no a la de Greenwich", () => {
    expect(inicioDeMes(new Date("2026-10-15T15:00:00Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z");
    // 23:59:59 del 30 de septiembre en Bogotá todavía es septiembre…
    expect(inicioDeMes(new Date("2026-10-01T04:59:59Z")).toISOString()).toBe("2026-09-01T05:00:00.000Z");
    // …y a las 5:00 UTC ya es octubre.
    expect(inicioDeMes(new Date("2026-10-01T05:00:00Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(inicioDeMes(new Date("2027-01-01T03:00:00Z")).toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("horasPorMes", () => {
  it("Pro 10, Business 40, Élite 120; un plan que no se reconoce cuenta como Pro", () => {
    expect([horasPorMes("pro"), horasPorMes("plan-business-ph"), horasPorMes("elite"), horasPorMes("plan-elite-ph")]).toEqual([10, 40, 120, 120]);
    expect([horasPorMes(null), horasPorMes(undefined), horasPorMes("raro")]).toEqual([10, 10, 10]);
  });
});

describe("mensajeDeCupo", () => {
  it("dice cuánto dura la reunión y cuánto queda", () => {
    expect(mensajeDeCupo({ duracionMs: 8 * H, restanMs: 2 * H, limiteMs: 10 * H, periodo: "mes" })).toBe("Esta reunión dura 8 h y te quedan 2 h este mes.");
    expect(mensajeDeCupo({ duracionMs: 3 * H + 30 * 60_000, restanMs: 90 * 60_000, limiteMs: 10 * H, periodo: "mes" })).toBe("Esta reunión dura 3 h 30 min y te quedan 1 h 30 min este mes.");
    expect(mensajeDeCupo({ duracionMs: 3 * H, restanMs: H, limiteMs: 2 * H, periodo: "prueba" })).toBe("Esta reunión dura 3 h y te quedan 1 h en la prueba.");
  });
  it("sin nada que quede, dice que ya se usó todo", () => {
    expect(mensajeDeCupo({ duracionMs: H, restanMs: 0, limiteMs: 10 * H, periodo: "mes" })).toBe("Ya usaste las 10 h de reuniones de este mes.");
    expect(mensajeDeCupo({ duracionMs: H, restanMs: 0, limiteMs: 2 * H, periodo: "prueba" })).toBe("Ya usaste las 2 h de reuniones de la prueba gratis.");
  });
});

describe("comprobarCupoDeReuniones", () => {
  let db: DbFalsa;
  beforeEach(() => {
    db = crearDbFalsa();
    fake.db = db;
    acceso.mockReset();
    acceso.mockResolvedValue({ allowed: true, status: "active" });
  });
  afterEach(() => vi.restoreAllMocks());

  const plan = (planId: string) => db.subscription.create({ data: { userId: "u1", planId, status: "active" } });
  const reunion = (id: string, horas: number, extra: Record<string, unknown> = {}) =>
    db.meeting.create({ data: { id, userId: "u1", durationMs: horas * H, audioUrl: "local://a", status: "lista", createdAt: new Date("2026-10-05T12:00:00Z"), ...extra } });
  const comprobar = (horas: number, excluir?: string) => comprobarCupoDeReuniones("u1", horas * H, excluir, AHORA);

  it("las cuentas beta y la fase de pruebas abierta no tienen tope: ni siquiera consulta la base", async () => {
    const consulta = vi.spyOn(db.meeting, "aggregate");
    for (const status of ["beta", "testing"]) {
      acceso.mockResolvedValue({ allowed: true, status });
      expect(await comprobar(500)).toMatchObject({ permitido: true, ilimitado: true, mensaje: null });
    }
    expect(consulta).not.toHaveBeenCalled();
  });

  it("sin una suscripción activa no se procesa, con el motivo que da la plataforma", async () => {
    acceso.mockResolvedValue({ allowed: false, status: "expired", reason: "Tu suscripción terminó." });
    expect(await comprobar(1)).toMatchObject({ permitido: false, ilimitado: false, mensaje: "Tu suscripción terminó." });
  });

  it("Pro: 10 h al mes; cabe lo que queda y no cabe lo que se pasa (con el mensaje de cuánto dura y cuánto queda)", async () => {
    await plan("pro");
    await reunion("a", 5);
    await reunion("b", 3);
    expect(await comprobar(2)).toMatchObject({ permitido: true, usadoMs: 8 * H, limiteMs: 10 * H, restanMs: 2 * H, periodo: "mes", mensaje: null }); // justo cabe
    expect(await comprobar(3)).toMatchObject({ permitido: false, mensaje: "Esta reunión dura 3 h y te quedan 2 h este mes." });
  });

  it("con todo el cupo usado lo dice así", async () => {
    await plan("pro");
    await reunion("a", 10);
    expect(await comprobar(0.5)).toMatchObject({ permitido: false, restanMs: 0, mensaje: "Ya usaste las 10 h de reuniones de este mes." });
  });

  it("Business y Élite tienen más horas", async () => {
    await plan("business");
    await reunion("a", 30);
    expect(await comprobar(10)).toMatchObject({ permitido: true, limiteMs: 40 * H });
    expect(await comprobar(11)).toMatchObject({ permitido: false });
    db.subscription.filas.length = 0;
    await plan("plan-elite-ph");
    expect(await comprobar(90)).toMatchObject({ permitido: true, limiteMs: 120 * H });
  });

  it("solo cuenta lo que consume cupo: las reuniones de este usuario, de este mes, con audio y sin las que esperan cupo", async () => {
    await plan("pro");
    await reunion("de-este-mes", 2);
    await reunion("de-otro-mes", 5, { createdAt: new Date("2026-09-30T23:00:00Z") }); // 18:00 del 30 de sept. en Bogotá
    await reunion("de-otro-usuario", 5, { userId: "otro" });
    await reunion("sin-audio", 5, { audioUrl: null });
    await reunion("sin-duracion", 5, { durationMs: null });
    await reunion("sin-cupo", 5, { status: "sin_cupo" });
    expect((await comprobar(1)).usadoMs).toBe(2 * H);
  });

  it("la reunión que se evalúa no cuenta contra sí misma (reprocesar no cobra dos veces)", async () => {
    await plan("pro");
    await reunion("esta", 8);
    await reunion("otra", 1);
    expect((await comprobar(8, "esta")).usadoMs).toBe(H);
    expect((await comprobar(8, "esta")).permitido).toBe(true);
    expect((await comprobar(8)).permitido).toBe(false);
  });

  it("la prueba gratis son 2 horas EN TOTAL, sin importar el mes", async () => {
    acceso.mockResolvedValue({ allowed: true, status: "trialing" });
    await reunion("vieja", 1, { createdAt: new Date("2026-08-01T00:00:00Z") });
    const c = await comprobar(2);
    expect(c).toMatchObject({ permitido: false, periodo: "prueba", usadoMs: H, limiteMs: 2 * H, restanMs: H, mensaje: "Esta reunión dura 2 h y te quedan 1 h en la prueba." });
    expect((await comprobar(1)).permitido).toBe(true);
  });

  it("si no se puede consultar, no se bloquea a nadie por una falla nuestra", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    await plan("pro");
    vi.spyOn(db.meeting, "aggregate").mockRejectedValue(new Error("conexión perdida"));
    expect(await comprobar(100)).toMatchObject({ permitido: true, ilimitado: true });
    expect(consola).toHaveBeenCalledTimes(1);
  });
});
