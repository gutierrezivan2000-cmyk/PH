import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, verificar, registrar } = vi.hoisted(() => ({
  db: {
    unitPaymentOrder: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    unit: { findUnique: vi.fn() },
    unitPayment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  verificar: vi.fn(),
  registrar: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: registrar }));
// La firma es lo que se prueba de verdad: solo se reemplaza la llamada de red a ePayco.
vi.mock("@/lib/epayco", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/epayco")>()),
  verifyTransaction: verificar,
}));
// El reparto FIFO tiene sus propias pruebas.
vi.mock("@/lib/cartera", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cartera")>()),
  applyPaymentFifoTx: async () => ({ allocations: [], leftover: 0 }),
}));

import { POST } from "./route";
import { encryptSecret } from "@/lib/secret-box";

const CUST_ID = "98765";
const P_KEY = "pk_secreta_de_prueba_ZZ9q_7731";
const REF = "uadm-12345678-abcdef01";

/** Firma como la calcula ePayco: SHA-256 de p_cust_id^p_key^ref^transacción^monto^moneda. */
const firmar = (llave: string, p = { ref: "R-1", tx: "T-1", monto: "100000", moneda: "COP" }) =>
  createHash("sha256").update(`${CUST_ID}^${llave}^${p.ref}^${p.tx}^${p.monto}^${p.moneda}`).digest("hex");

function confirmar(firma: string, extra: Record<string, string> = {}) {
  const f = new FormData();
  const campos: Record<string, string> = {
    x_ref_payco: "R-1",
    x_transaction_id: "T-1",
    x_amount: "100000",
    x_currency_code: "COP",
    x_signature: firma,
    x_cod_response: "1",
    x_id_invoice: REF,
    ...extra,
  };
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return POST(new Request("http://x/api/epayco/unit-confirmation", { method: "POST", body: f }) as never);
}

const orden = (extra: Record<string, unknown> = {}) => ({
  id: "o1",
  ref: REF,
  userId: "u1",
  propertyId: "p1",
  unitId: "un1",
  amount: 100000,
  status: "pending",
  test: false,
  ...extra,
});

let errores: ReturnType<typeof vi.spyOn>;
const log = () => JSON.stringify(errores.mock.calls, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v));

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-de-auth-para-derivar-la-clave");
  vi.stubEnv("ENCRYPTION_KEY", undefined as unknown as string);
  for (const m of [db.unitPaymentOrder, db.user, db.unit, db.unitPayment]) for (const f of Object.values(m)) f.mockReset();
  db.$transaction.mockReset();
  verificar.mockReset();
  registrar.mockReset();
  db.unitPaymentOrder.findUnique.mockResolvedValue(orden());
  db.unitPaymentOrder.update.mockResolvedValue({});
  db.unitPaymentOrder.updateMany.mockResolvedValue({ count: 1 });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.unit.findUnique.mockResolvedValue({ label: "Apto 502" });
  // Transacción: ejecuta el callback con un cliente mínimo donde el reclamo de la orden sí aplica.
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ unitPaymentOrder: { updateMany: async () => ({ count: 1 }) }, unitPayment: { create: db.unitPayment.create } })
  );
  // Por defecto ePayco confirma una transacción real aprobada de esa misma factura.
  verificar.mockResolvedValue({
    success: true,
    status: "approved",
    data: { x_cod_response: "1", x_id_invoice: REF, x_test_request: "FALSE" },
  });
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errores.mockRestore();
});

describe("confirmación de pago de una unidad con la P_KEY cifrada en la base de datos", () => {
  it("la firma calculada con la P_KEY en claro valida aunque lo guardado sea el valor cifrado, y el pago se acredita", async () => {
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: encryptSecret(P_KEY) });

    const r = await confirmar(firmar(P_KEY));

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true });
    expect(verificar).toHaveBeenCalledWith("R-1"); // pasó la firma y siguió al paso 3
    expect(db.unitPayment.create).toHaveBeenCalledTimes(1);
    expect(db.unitPayment.create.mock.calls[0][0].data).toMatchObject({ unitId: "un1", amount: 100000, method: "online" });
    // Ya estaba cifrada: no hay re-guardado.
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("también valida con una llave antigua en claro; con la migración apagada no la reescribe", async () => {
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: P_KEY });

    const r = await confirmar(firmar(P_KEY));

    expect(r.status).toBe(200);
    expect(db.unitPayment.create).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("con MIGRAR_LLAVES_EPAYCO=true valida con la llave en claro y de paso la deja cifrada", async () => {
    vi.stubEnv("MIGRAR_LLAVES_EPAYCO", "true");
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: P_KEY });

    const r = await confirmar(firmar(P_KEY));

    expect(r.status).toBe(200);
    expect(db.unitPayment.create).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    const arg = db.user.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1", epaycoPKey: P_KEY });
    expect(arg.data.epaycoPKey).toMatch(/^enc:v1:/);
    expect(arg.data.epaycoPKey).not.toContain(P_KEY);
  });

  it("si el re-guardado cifrado falla, el pago se valida igual y el log no lleva la llave", async () => {
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: P_KEY });
    db.user.updateMany.mockRejectedValue(new Error(`Invalid invocation where: { epaycoPKey: "${P_KEY}" }`));

    const r = await confirmar(firmar(P_KEY));

    expect(r.status).toBe(200);
    expect(db.unitPayment.create).toHaveBeenCalledTimes(1);
    expect(log()).not.toContain(P_KEY);
  });

  it("una firma hecha con otra llave se rechaza: 400, la orden pasa a revisión y no se consulta a ePayco", async () => {
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: encryptSecret(P_KEY) });

    const r = await confirmar(firmar("otra_llave_cualquiera"));

    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Invalid signature" });
    expect(verificar).not.toHaveBeenCalled();
    expect(db.unitPayment.create).not.toHaveBeenCalled();
    expect(db.unitPaymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", status: "pending" },
      data: { status: "needs_review", failReason: "invalid_signature" },
    });
  });

  it("firmar con el texto cifrado (en vez de con la P_KEY) no sirve: el servidor nunca usa el cifrado como llave", async () => {
    const guardada = encryptSecret(P_KEY);
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: guardada });

    const r = await confirmar(firmar(guardada));

    expect(r.status).toBe(400);
    expect(verificar).not.toHaveBeenCalled();
  });

  it("si la llave guardada ya no se puede leer: 503 para que ePayco reintente, orden a revisión y el log sin el valor", async () => {
    const guardada = encryptSecret(P_KEY);
    vi.stubEnv("AUTH_SECRET", "otro-secreto-de-auth-completamente-distinto"); // la clave de cifrado cambió
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: guardada });

    const r = await confirmar(firmar(P_KEY));
    const texto = await r.text();

    expect(r.status).toBe(503);
    expect(JSON.parse(texto)).toEqual({ error: "Merchant key unreadable" });
    expect(verificar).not.toHaveBeenCalled();
    expect(db.unitPayment.create).not.toHaveBeenCalled();
    expect(db.unitPaymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", status: "pending" },
      data: { status: "needs_review", failReason: "key_unreadable" },
    });
    for (const prohibido of [P_KEY, "7731", guardada]) {
      expect(texto).not.toContain(prohibido);
      expect(log()).not.toContain(prohibido);
    }
    expect(log()).toContain("decrypt_failed");
  });

  it("un callback con el valor guardado alterado se trata igual que una llave ilegible, nunca como válido", async () => {
    const guardada = encryptSecret(P_KEY);
    const alterada = guardada.slice(0, -6) + (guardada.slice(-6, -5) === "A" ? "B" : "A") + guardada.slice(-5);
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: alterada });

    const r = await confirmar(firmar(P_KEY));

    expect(r.status).toBe(503);
    expect(db.unitPayment.create).not.toHaveBeenCalled();
  });

  it("sin llave guardada sigue respondiendo «Merchant not configured» (400)", async () => {
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: null });
    const r = await confirmar(firmar(P_KEY));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Merchant not configured" });
  });

  it("una transacción de pruebas con firma válida queda como «test» y no se acredita", async () => {
    db.user.findUnique.mockResolvedValue({ epaycoPCustId: CUST_ID, epaycoPKey: encryptSecret(P_KEY) });
    verificar.mockResolvedValue({
      success: true,
      status: "approved",
      data: { x_cod_response: "1", x_id_invoice: REF, x_test_request: "TRUE" },
    });

    const r = await confirmar(firmar(P_KEY));

    expect(await r.json()).toEqual({ received: true, test: true });
    expect(db.unitPaymentOrder.update.mock.calls[0][0].data).toMatchObject({ status: "test", epaycoRef: "R-1" });
    expect(db.unitPayment.create).not.toHaveBeenCalled();
  });
});
