import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, registrar } = vi.hoisted(() => ({
  db: {
    property: { findFirst: vi.fn(), update: vi.fn() },
    unit: { findMany: vi.fn() },
    charge: { findMany: vi.fn(), createMany: vi.fn() },
    unitPayment: { groupBy: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  registrar: vi.fn(),
}));
vi.mock("@/lib/cartera-server", () => ({ requireCartera: async () => ({ userId: "u1", accessStatus: "testing" }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: registrar }));

import { POST } from "./route";

const liquidar = (b: Record<string, unknown>) =>
  POST(new Request("http://x/api/cartera/intereses", { method: "POST", body: JSON.stringify(b) }) as never);
const base = { propertyId: "p1", month: 1, year: 2025, rate: 2 };

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  db.property.findFirst.mockReset().mockResolvedValue({ id: "p1", features: {} });
  db.property.update.mockReset().mockResolvedValue({});
  db.unit.findMany.mockReset().mockResolvedValue([{ id: "a" }]);
  db.unitPayment.groupBy.mockReset().mockResolvedValue([]);
  db.charge.createMany.mockReset().mockResolvedValue({ count: 1 });
  db.$executeRaw.mockReset().mockResolvedValue(1);
  registrar.mockReset();
  // 1ª lectura: cargos de la propiedad; 2ª: intereses ya liquidados del mes.
  db.charge.findMany.mockReset().mockImplementation(async (args: { where: { type?: string } }) =>
    args.where.type === "interes"
      ? []
      : [{ unitId: "a", type: "admin", amount: 1_000_000, paidAmount: 0, dueDate: new Date(2024, 11, 5) }],
  );
  db.$transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
});

describe("POST /api/cartera/intereses", () => {
  it("toma el candado de asesoría antes de leer lo existente y de insertar, todo en una transacción", async () => {
    const r = await liquidar(base);
    expect(await r.json()).toMatchObject({ ok: true, created: 1 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const lock = db.$executeRaw.mock.invocationCallOrder[0];
    expect(lock).toBeLessThan(db.charge.findMany.mock.invocationCallOrder[0]);
    expect(lock).toBeLessThan(db.charge.createMany.mock.invocationCallOrder[0]);
    expect(db.charge.createMany.mock.calls[0][0].data[0]).toMatchObject({ unitId: "a", type: "interes", month: 1, year: 2025 });
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it("una segunda petición que ya ve el interés confirmado no crea nada", async () => {
    db.charge.findMany.mockImplementation(async (args: { where: { type?: string } }) =>
      args.where.type === "interes" ? [{ unitId: "a" }] : [],
    );
    const r = await liquidar(base);
    expect(await r.json()).toMatchObject({ created: 0, skippedExisting: 1 });
    expect(db.charge.createMany).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });

  it("rechaza datos inválidos y propiedad ajena sin abrir transacción", async () => {
    expect((await liquidar({ ...base, month: 13 })).status).toBe(400);
    db.property.findFirst.mockResolvedValue(null);
    expect((await liquidar(base)).status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
