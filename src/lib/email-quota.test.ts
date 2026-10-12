import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rateLimit: { findUnique: vi.fn(), upsert: vi.fn() },
  subscription: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

import { checkEmailQuota, getEmailsSentThisMonth, liberarEmails, recordEmailsSent, reservarEmails } from "./email-quota";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("getEmailsSentThisMonth", () => {
  it("devuelve el contador del mes", async () => {
    db.rateLimit.findUnique.mockResolvedValue({ count: 42 });
    expect(await getEmailsSentThisMonth("u1")).toBe(42);
    expect(db.rateLimit.findUnique.mock.calls[0][0].where.key).toMatch(/^emails:u1:\d{4}-\d{2}$/);
  });

  it("sin fila vale 0", async () => {
    db.rateLimit.findUnique.mockResolvedValue(null);
    expect(await getEmailsSentThisMonth("u1")).toBe(0);
  });

  it("si la base falla, falla CERRADO: la cuota queda agotada", async () => {
    db.rateLimit.findUnique.mockRejectedValue(new Error("caída"));
    db.subscription.findUnique.mockResolvedValue({ planId: "pro" });
    const used = await getEmailsSentThisMonth("u1");
    expect(used).toBeGreaterThan(15000);
    const r = await checkEmailQuota("u1", 1, false);
    expect(r.allowed).toBe(false);
  });
});

describe("recordEmailsSent", () => {
  it("refresca windowStart en el update del upsert", async () => {
    await recordEmailsSent("u1", 5);
    const arg = db.rateLimit.upsert.mock.calls[0][0];
    expect(arg.update.count).toEqual({ increment: 5 });
    expect(arg.update.windowStart).toBeInstanceOf(Date);
  });

  it("no hace nada con 0", async () => {
    await recordEmailsSent("u1", 0);
    expect(db.rateLimit.upsert).not.toHaveBeenCalled();
  });
});

describe("reservarEmails (atómico)", () => {
  it("reserva con una sola sentencia parametrizada", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 10 }]);
    const r = await reservarEmails("u1", 10, 500);
    expect(r).toEqual({ allowed: true, used: 10, quota: 500 });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...vals] = db.$queryRaw.mock.calls[0];
    const sql = strings.join("?");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toMatch(/WHERE "RateLimit"."count" \+ \?::int <= \?::int/);
    expect(vals).toContain(10);
    expect(vals).toContain(500);
    expect(vals.some((v: unknown) => typeof v === "string" && v.startsWith("emails:u1:"))).toBe(true);
  });

  it("sin fila devuelta (la cuota no alcanza) deniega con motivo y no lanza", async () => {
    db.$queryRaw.mockResolvedValue([]);
    db.rateLimit.findUnique.mockResolvedValue({ count: 495 });
    const r = await reservarEmails("u1", 10, 500);
    expect(r.allowed).toBe(false);
    expect(r.used).toBe(495);
    expect(r.reason).toContain("495/500");
  });

  it("un envío mayor que la cuota se deniega sin tocar la base", async () => {
    const r = await reservarEmails("u1", 501, 500);
    expect(r.allowed).toBe(false);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("si la base falla, deniega (fail closed) y lo marca como no disponible", async () => {
    db.$queryRaw.mockRejectedValue(new Error("caída"));
    const r = await reservarEmails("u1", 2, 500);
    expect(r.allowed).toBe(false);
    expect(r.unavailable).toBe(true);
  });
});

describe("liberarEmails", () => {
  it("resta lo no enviado sin bajar de 0", async () => {
    await liberarEmails("u1", 3);
    const [strings, ...vals] = db.$executeRaw.mock.calls[0];
    expect(strings.join("?")).toContain("GREATEST");
    expect(vals).toContain(3);
  });

  it("con 0 no toca la base y un error no se propaga", async () => {
    await liberarEmails("u1", 0);
    expect(db.$executeRaw).not.toHaveBeenCalled();
    db.$executeRaw.mockRejectedValue(new Error("x"));
    await expect(liberarEmails("u1", 1)).resolves.toBeUndefined();
  });
});
