import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, registrar } = vi.hoisted(() => ({
  db: {
    property: { findFirst: vi.fn() },
    unit: { findMany: vi.fn() },
    charge: { findMany: vi.fn(), createMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  registrar: vi.fn(),
}));
vi.mock("@/lib/cartera-server", () => ({ requireCartera: async () => ({ userId: "u1", accessStatus: "testing" }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: registrar }));

import { POST } from "./route";

const causar = (b: Record<string, unknown>) =>
  POST(new Request("http://x/api/cartera/causar", { method: "POST", body: JSON.stringify(b) }) as never);
const base = { propertyId: "p1", month: 10, year: 2026 };

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  for (const f of [db.property.findFirst, db.unit.findMany, db.charge.findMany, db.charge.createMany, db.$queryRaw, db.$transaction, registrar]) f.mockReset();
  db.property.findFirst.mockResolvedValue({ id: "p1" });
  db.unit.findMany.mockResolvedValue([
    { id: "a", monthlyFee: 100 },
    { id: "b", monthlyFee: 200 },
    { id: "c", monthlyFee: null },
  ]);
  db.charge.findMany.mockResolvedValue([{ unitId: "b" }]);
  db.charge.createMany.mockResolvedValue({ count: 1 });
  db.$queryRaw.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
});

describe("POST /api/cartera/causar", () => {
  it("crea solo los cargos faltantes dentro de una transacción con la propiedad bloqueada", async () => {
    const r = await causar(base);
    expect(await r.json()).toMatchObject({ ok: true, created: 1, skippedExisting: 1, skippedNoFee: 1 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.charge.findMany.mock.invocationCallOrder[0]);
    expect(db.charge.findMany.mock.invocationCallOrder[0]).toBeLessThan(db.charge.createMany.mock.invocationCallOrder[0]);
    expect(db.charge.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(db.charge.createMany.mock.calls[0][0].data[0]).toMatchObject({ unitId: "a", userId: "u1", type: "admin", month: 10, year: 2026 });
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it("una segunda corrida que ya ve los cargos confirmados no crea nada", async () => {
    db.charge.findMany.mockResolvedValue([{ unitId: "a" }, { unitId: "b" }]);
    const r = await causar(base);
    expect(await r.json()).toMatchObject({ created: 0, skippedExisting: 2 });
    expect(db.charge.createMany).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });

  it("rechaza mes inválido y propiedad ajena", async () => {
    expect((await causar({ ...base, month: 13 })).status).toBe(400);
    db.property.findFirst.mockResolvedValue(null);
    expect((await causar(base)).status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
