import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => {
  // La ruta lee DEMO_MODE al cargarse: se fija antes de importarla.
  process.env.DEMO_MODE = "false";
  return {
    db: {
      unit: { findUnique: vi.fn() },
      charge: { findMany: vi.fn() },
      unitPayment: { aggregate: vi.fn() },
      unitPaymentOrder: { create: vi.fn() },
      user: { updateMany: vi.fn() },
    },
  };
});
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/modulos-acceso", () => ({ moduloAbiertoParaPropietario: async () => true }));
vi.mock("@/lib/cartera-server", () => ({ ownerHasCarteraPlan: async () => true }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));

import { POST } from "./route";
import { encryptSecret } from "@/lib/secret-box";

const TOKEN = "tok_abcdefghijklmnop1234";
const P_KEY = "pk_secreta_de_prueba_ZZ9q_7731";

const pagar = () =>
  POST(
    new Request("http://x/api/portal/pay", {
      method: "POST",
      headers: { "content-type": "application/json", host: "ph.test" },
      body: JSON.stringify({ token: TOKEN }),
    }) as never
  );

const unidad = (epaycoPKey: string | null) => ({
  id: "unit-12345678",
  label: "Apto 502",
  propertyId: "p1",
  property: {
    name: "Los Pinos",
    userId: "u1",
    user: { epaycoPublicKey: "pub_test_123", epaycoPCustId: "98765", epaycoPKey, epaycoTest: true },
  },
});

let errores: ReturnType<typeof vi.spyOn>;
const log = () => JSON.stringify(errores.mock.calls, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v));

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-de-auth-para-derivar-la-clave");
  vi.stubEnv("ENCRYPTION_KEY", undefined as unknown as string);
  db.unit.findUnique.mockReset();
  db.charge.findMany.mockReset();
  db.unitPayment.aggregate.mockReset();
  db.unitPaymentOrder.create.mockReset();
  db.charge.findMany.mockResolvedValue([{ amount: 250000, paidAmount: 0, dueDate: new Date(2020, 0, 5) }]);
  db.unitPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  db.unitPaymentOrder.create.mockResolvedValue({});
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errores.mockRestore();
});

describe("POST /api/portal/pay con la P_KEY cifrada en la base de datos", () => {
  it("con la llave cifrada y legible abre el cobro, y la respuesta no lleva ninguna parte de la llave", async () => {
    const guardada = encryptSecret(P_KEY);
    db.unit.findUnique.mockResolvedValue(unidad(guardada));

    const r = await pagar();
    const texto = await r.text();
    const body = JSON.parse(texto);

    expect(r.status).toBe(200);
    expect(body).toMatchObject({ publicKey: "pub_test_123", amount: 250000, currency: "cop", test: true });
    expect(db.unitPaymentOrder.create).toHaveBeenCalledTimes(1);
    for (const prohibido of [P_KEY, "7731", guardada, "enc:v1"]) expect(texto).not.toContain(prohibido);
  });

  it("una llave antigua en claro sigue permitiendo el cobro (no se rompe lo guardado antes del cifrado)", async () => {
    db.unit.findUnique.mockResolvedValue(unidad(P_KEY));
    const r = await pagar();
    expect(r.status).toBe(200);
    expect(await r.text()).not.toContain(P_KEY);
    expect(db.unitPaymentOrder.create).toHaveBeenCalledTimes(1);
  });

  it("si la llave guardada ya no se puede leer NO abre el cobro (la confirmación no se podría validar)", async () => {
    const guardada = encryptSecret(P_KEY);
    vi.stubEnv("AUTH_SECRET", "otro-secreto-de-auth-completamente-distinto");
    db.unit.findUnique.mockResolvedValue(unidad(guardada));

    const r = await pagar();
    const texto = await r.text();

    expect(r.status).toBe(503);
    expect(JSON.parse(texto)).toMatchObject({ code: "not_available" });
    expect(JSON.parse(texto).error).toContain("Comunícate con la administración");
    expect(db.unitPaymentOrder.create).not.toHaveBeenCalled();
    for (const prohibido of [P_KEY, "7731", guardada]) {
      expect(texto).not.toContain(prohibido);
      expect(log()).not.toContain(prohibido);
    }
  });

  it("sin llave guardada sigue respondiendo not_configured (400)", async () => {
    db.unit.findUnique.mockResolvedValue(unidad(null));
    const r = await pagar();
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "not_configured" });
    expect(db.unitPaymentOrder.create).not.toHaveBeenCalled();
  });
});
