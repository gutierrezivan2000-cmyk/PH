import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, verify, applyFifo } = vi.hoisted(() => ({
  db: {
    unitPaymentOrder: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    unitPayment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  verify: vi.fn(),
  applyFifo: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/epayco", () => ({ verifyTransaction: verify }));
vi.mock("@/lib/cartera", () => ({ applyPaymentFifoTx: applyFifo }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));

import { GET } from "./route";

const req = () =>
  new Request("http://x/api/cron/reconcile-payments", { headers: { authorization: "Bearer sec" } }) as never;
const orden = (id: string) => ({ id, ref: `ref-${id}`, userId: "u1", propertyId: "p1", unitId: "un1", amount: 100_000, test: false });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "sec");
  Object.values(db.unitPaymentOrder).forEach((f) => f.mockReset());
  db.unitPayment.create.mockReset();
  db.$transaction.mockReset();
  verify.mockReset();
  applyFifo.mockReset();
  db.unitPaymentOrder.updateMany.mockResolvedValue({ count: 0 });
  db.unitPaymentOrder.update.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) =>
    fn({ unitPaymentOrder: { updateMany: async () => ({ count: 1 }) }, unitPayment: db.unitPayment })
  );
  applyFifo.mockResolvedValue({ allocations: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET reconcile-payments", () => {
  it("sin secreto: 401", async () => {
    const r = await GET(new Request("http://x") as never);
    expect(r.status).toBe(401);
  });

  it("recorre toda la cola con cursor: una orden pagada tras 25 abandonadas SÍ se concilia", async () => {
    const abandonadas = Array.from({ length: 25 }, (_, i) => orden(`a${i}`));
    const pagada = orden("pagada");
    db.unitPaymentOrder.findMany.mockResolvedValueOnce(abandonadas).mockResolvedValueOnce([pagada]);
    verify.mockImplementation(async (ref: string) =>
      ref === "ref-pagada"
        ? { success: true, status: "ok", data: { x_cod_response: "1", x_amount: "100000", x_ref_payco: "EP1", x_id_invoice: ref } }
        : { success: false, status: "error", data: null }
    );
    const r = await GET(req());
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, checked: 26, reconciled: 1 });
    expect(db.unitPaymentOrder.findMany).toHaveBeenCalledTimes(2);
    expect(db.unitPaymentOrder.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "a24" }, skip: 1 });
    expect(db.unitPayment.create).toHaveBeenCalledTimes(1);
  });

  it("una consulta lenta a ePayco vence por tope y no bloquea al resto", async () => {
    vi.useFakeTimers();
    db.unitPaymentOrder.findMany.mockResolvedValueOnce([orden("lenta"), orden("ok")]);
    verify.mockImplementation((ref: string) =>
      ref === "ref-lenta"
        ? new Promise(() => {})
        : Promise.resolve({ success: true, status: "ok", data: { x_cod_response: "1", x_amount: "100000", x_ref_payco: "EP2", x_id_invoice: ref } })
    );
    const p = GET(req());
    await vi.advanceTimersByTimeAsync(9_000);
    const j = await (await p).json();
    expect(j).toMatchObject({ checked: 2, reconciled: 1 });
  });

  it("se detiene al agotar el presupuesto de tiempo", async () => {
    vi.useFakeTimers();
    db.unitPaymentOrder.findMany.mockImplementation(async () => Array.from({ length: 25 }, (_, i) => orden(`x${i}`)));
    verify.mockImplementation(() => new Promise((res) => setTimeout(() => res({ success: false, status: "error", data: null }), 5_000)));
    const p = GET(req());
    await vi.advanceTimersByTimeAsync(120_000);
    const j = await (await p).json();
    expect(j.ok).toBe(true);
    expect(j.checked).toBeLessThan(200);
    expect(j.checked).toBeGreaterThan(0);
  });
});
