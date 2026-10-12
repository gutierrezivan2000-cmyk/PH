import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, limite } = vi.hoisted(() => {
  // La ruta lee DEMO_MODE al cargarse: se fija antes de importarla.
  process.env.DEMO_MODE = "false";
  return {
    db: {
      unit: { findUnique: vi.fn() },
      charge: { findMany: vi.fn() },
      unitPayment: { aggregate: vi.fn() },
      unitPaymentOrder: { create: vi.fn() },
      user: { updateMany: vi.fn() },
      // Para el limitador real (rate-limit.ts), que cuenta con $queryRaw y limpia contadores viejos con deleteMany.
      $queryRaw: vi.fn(),
      rateLimit: { deleteMany: vi.fn() },
    },
    limite: { rateLimit: vi.fn() },
  };
});
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/modulos-acceso", () => ({ moduloAbiertoParaPropietario: async () => true }));
vi.mock("@/lib/cartera-server", () => ({ ownerHasCarteraPlan: async () => true }));
vi.mock("@/lib/rate-limit", () => limite);

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
  // La dirección de retorno sale de la configuración (urlBase), nunca de la cabecera Host de la petición.
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.ejemplo.co");
  limite.rateLimit.mockReset();
  limite.rateLimit.mockResolvedValue({ allowed: true });
  db.$queryRaw.mockReset();
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

describe("POST /api/portal/pay — límite por unidad con failClosed", () => {
  const HORA = 60 * 60 * 1000;
  const MENSAJE_LIMITE = "Demasiados intentos de pago seguidos. Espera unos minutos e intenta de nuevo.";

  beforeEach(() => db.unit.findUnique.mockResolvedValue(unidad(encryptSecret(P_KEY))));

  it("pide el contador de la unidad con failClosed:true (10 por hora)", async () => {
    const r = await pagar();
    expect(r.status).toBe(200);
    expect(limite.rateLimit).toHaveBeenCalledTimes(1);
    expect(limite.rateLimit).toHaveBeenCalledWith("portal-pay:unit-12345678", { max: 10, windowMs: HORA, failClosed: true });
  });

  it("con el límite alcanzado responde 429 y no crea la orden", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 600 });
    const r = await pagar();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: MENSAJE_LIMITE });
    expect(db.unitPaymentOrder.create).not.toHaveBeenCalled();
  });

  it("si el límite no se pudo contar (unavailable) responde la misma 429 y no abre el cobro", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30, unavailable: true });
    const r = await pagar();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: MENSAJE_LIMITE });
    expect(db.unitPaymentOrder.create).not.toHaveBeenCalled();
  });

  it("si la base falla al contar, el limitador REAL deniega: 429 y ninguna orden pendiente", async () => {
    const real = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
    limite.rateLimit.mockImplementation(real.rateLimit);
    db.$queryRaw.mockRejectedValue(new Error("la base no responde"));

    const r = await pagar();

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(429);
    expect(db.unitPaymentOrder.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/portal/pay — dirección de retorno y confirmación (urlBase)", () => {
  beforeEach(() => db.unit.findUnique.mockResolvedValue(unidad(encryptSecret(P_KEY))));

  const sinDireccion = () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
  };

  it("las URLs salen de NEXT_PUBLIC_APP_URL y NO de la cabecera Host de quien llama", async () => {
    const r = await pagar(); // la petición trae host: ph.test
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.confirmationUrl).toBe("https://app.ejemplo.co/api/epayco/unit-confirmation");
    expect(body.responseUrl).toBe("https://app.ejemplo.co/pago/respuesta");
    expect(JSON.stringify(body)).not.toContain("ph.test");
  });

  it("quita la barra final y cualquier ruta de NEXT_PUBLIC_APP_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.ejemplo.co/dashboard/");
    const body = await (await pagar()).json();
    expect(body.confirmationUrl).toBe("https://app.ejemplo.co/api/epayco/unit-confirmation");
    expect(body.responseUrl).toBe("https://app.ejemplo.co/pago/respuesta");
  });

  it("sin NEXT_PUBLIC_APP_URL usa el dominio de producción de Vercel", async () => {
    sinDireccion();
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ph.vercel.app");
    const body = await (await pagar()).json();
    expect(body.confirmationUrl).toBe("https://ph.vercel.app/api/epayco/unit-confirmation");
    expect(body.responseUrl).toBe("https://ph.vercel.app/pago/respuesta");
  });

  it("en desarrollo sin dirección cae en localhost (nunca en la cabecera Host)", async () => {
    sinDireccion();
    const body = await (await pagar()).json();
    expect(body.confirmationUrl).toBe("http://localhost:3000/api/epayco/unit-confirmation");
  });

  it("en producción sin ninguna dirección responde 503 not_available, no gasta cupo, no crea la orden y deja el motivo en el log", async () => {
    sinDireccion();
    vi.stubEnv("NODE_ENV", "production");

    const r = await pagar();
    const texto = await r.text();

    expect(r.status).toBe(503);
    expect(JSON.parse(texto)).toEqual({ error: "El pago en línea no está disponible en este momento.", code: "not_available" });
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(db.unitPaymentOrder.create).not.toHaveBeenCalled();
    expect(log()).toContain("NEXT_PUBLIC_APP_URL");
    for (const prohibido of [P_KEY, "7731", "ph.test"]) {
      expect(texto).not.toContain(prohibido);
      expect(log()).not.toContain(prohibido);
    }
  });

  it("una NEXT_PUBLIC_APP_URL inválida (esquema raro) tampoco abre el cobro", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "ftp://app.ejemplo.co");
    const r = await pagar();
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ code: "not_available" });
    expect(db.unitPaymentOrder.create).not.toHaveBeenCalled();
  });
});
