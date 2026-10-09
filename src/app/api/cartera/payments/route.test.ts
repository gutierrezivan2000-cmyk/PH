import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, registrar } = vi.hoisted(() => ({
  db: {
    unitPayment: { findFirst: vi.fn(), create: vi.fn() },
    unit: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  registrar: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1", email: "jefe@x.com", role: "admin" } }) }));
vi.mock("@/lib/cartera-server", () => ({ requireCartera: async () => ({ userId: "u1", accessStatus: "testing" }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: registrar }));
// El reparto FIFO tiene sus propias pruebas; aquí solo importa cómo responde la ruta ante la clave.
vi.mock("@/lib/cartera", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cartera")>()),
  applyPaymentFifoTx: async () => ({ allocations: [], leftover: 0 }),
}));

import { POST } from "./route";

const CLAVE = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const pagar = (b: Record<string, unknown>) =>
  POST(new Request("http://x/api/cartera/payments", { method: "POST", body: JSON.stringify(b) }) as never);
const base = { propertyId: "p1", unitId: "un1", amount: 100_000, method: "transferencia" };

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  db.unitPayment.findFirst.mockReset();
  db.unitPayment.create.mockReset();
  db.unit.findFirst.mockReset();
  db.$transaction.mockReset();
  registrar.mockReset();
  db.unit.findFirst.mockResolvedValue({ id: "un1", label: "Apto 502" });
  db.unitPayment.findFirst.mockResolvedValue(null);
  db.unitPayment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "pay1", ...data }));
  // La transacción ejecuta el callback con el mismo cliente: basta para ver qué se escribe.
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({ ...db, $queryRaw: async () => [], charge: { findMany: async () => [], update: async () => ({}) } }));
});

describe("POST /api/cartera/payments con clave de idempotencia", () => {
  it("un pago nuevo con clave queda guardado con esa clave, acotada a la cuenta del administrador", async () => {
    const r = await pagar({ ...base, idempotencyKey: CLAVE });
    expect(r.status).toBe(201);
    expect(db.unitPayment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", idempotencyKey: CLAVE } }));
    expect(db.unitPayment.create.mock.calls[0][0].data.idempotencyKey).toBe(CLAVE);
  });

  it("un reintento con la misma clave, monto y unidad devuelve el pago ya registrado y no crea otro", async () => {
    db.unitPayment.findFirst.mockResolvedValue({ id: "pay1", amount: 100_000, unitId: "un1" });
    const r = await pagar({ ...base, idempotencyKey: CLAVE });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, id: "pay1", repetido: true });
    expect(db.unitPayment.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });

  it("una clave ya usada para otro monto responde 409 y no toca la cartera", async () => {
    db.unitPayment.findFirst.mockResolvedValue({ id: "pay1", amount: 50_000, unitId: "un1" });
    const r = await pagar({ ...base, idempotencyKey: CLAVE });
    expect(r.status).toBe(409);
    expect(db.unitPayment.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("una clave ya usada para otra unidad responde 409", async () => {
    db.unitPayment.findFirst.mockResolvedValue({ id: "pay1", amount: 100_000, unitId: "otra" });
    const r = await pagar({ ...base, idempotencyKey: CLAVE });
    expect(r.status).toBe(409);
    expect(db.unitPayment.create).not.toHaveBeenCalled();
  });

  it("una clave con formato inválido se ignora: el pago se registra sin clave (no se confía en texto arbitrario)", async () => {
    const r = await pagar({ ...base, idempotencyKey: "corta" });
    expect(r.status).toBe(201);
    expect(db.unitPayment.findFirst).not.toHaveBeenCalled();
    expect(db.unitPayment.create.mock.calls[0][0].data.idempotencyKey).toBeNull();
  });

  it("sin clave, el pago se registra como antes", async () => {
    const r = await pagar(base);
    expect(r.status).toBe(201);
    expect(db.unitPayment.findFirst).not.toHaveBeenCalled();
    expect(db.unitPayment.create.mock.calls[0][0].data.idempotencyKey).toBeNull();
  });

  it("dos envíos simultáneos: si el segundo choca con el índice único (P2002), responde con el pago que sí quedó", async () => {
    db.unitPayment.findFirst
      .mockResolvedValueOnce(null) // la comprobación previa no vio nada
      .mockResolvedValueOnce({ id: "pay1" }); // tras el choque, el pago del otro envío ya existe
    db.$transaction.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    const r = await pagar({ ...base, idempotencyKey: CLAVE });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: "pay1", repetido: true });
    expect(registrar).not.toHaveBeenCalled();
  });

  it("un P2002 sin pago que lo explique no se esconde: responde 500", async () => {
    db.unitPayment.findFirst.mockResolvedValue(null);
    db.$transaction.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    const r = await pagar({ ...base, idempotencyKey: CLAVE });
    expect(r.status).toBe(500);
  });
});
