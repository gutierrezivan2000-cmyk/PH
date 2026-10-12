import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { NextRequest } from "next/server";

const sesion = vi.hoisted(() => ({ auth: vi.fn() }));
const db = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn() },
  pendingOrder: { create: vi.fn() },
}));
const esquema = vi.hoisted(() => ({ ensureAdminSchema: vi.fn() }));
vi.mock("@/lib/auth", () => sesion);
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => esquema);
// Solo se necesita la forma del plan: así la prueba no depende de los precios reales.
vi.mock("@/lib/epayco", () => ({
  PLANS: {
    pro: { name: "Plan Pro", idPlan: "plan-pro-ph", description: "Plan de prueba", amount: 99900, currency: "cop" },
    business: { name: "Plan Business", idPlan: "plan-business-ph", description: "Plan de prueba", amount: 199900, currency: "cop" },
    elite: { name: "Plan Élite", idPlan: "plan-elite-ph", description: "Plan de prueba", amount: 399900, currency: "cop" },
  },
}));

const MENSAJE_SIN_DIRECCION = "El pago en línea no está disponible en este momento. Intenta de nuevo más tarde.";
const peticion = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

/** IS_DEMO se lee al cargar el módulo: para cambiar DEMO_MODE hay que importar la ruta de nuevo. */
async function cargarRuta() {
  vi.resetModules();
  return (await import("./route")).POST;
}

/** Quita toda dirección pública del entorno (también las de Vercel), como en un despliegue mal configurado. */
function sinDireccion() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("VERCEL_URL", "");
}

let errores: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.ejemplo.co");
  vi.stubEnv("EPAYCO_PUBLIC_KEY", "llave-publica-de-prueba");
  errores = vi.spyOn(console, "error").mockImplementation(() => {});

  sesion.auth.mockResolvedValue({ user: { id: "u1", email: "ana@x.co", name: "Ana" } });
  db.subscription.findUnique.mockResolvedValue(null);
  db.pendingOrder.create.mockResolvedValue({});
  esquema.ensureAdminSchema.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/epayco/checkout — direcciones de retorno y confirmación (urlBase)", () => {
  it("sin sesión responde 401", async () => {
    sesion.auth.mockResolvedValue(null);
    const POST = await cargarRuta();
    expect((await POST(peticion({ plan: "pro" }))).status).toBe(401);
  });

  it("arma confirmación y retorno con NEXT_PUBLIC_APP_URL (sin barra final ni ruta)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.ejemplo.co/dashboard/");
    const POST = await cargarRuta();
    const r = await POST(peticion({ plan: "pro" }));
    expect(r.status).toBe(200);
    const { checkoutConfig, publicKey } = await r.json();
    expect(checkoutConfig.confirmation).toBe("https://app.ejemplo.co/api/epayco/confirmation");
    expect(checkoutConfig.response).toBe("https://app.ejemplo.co/dashboard/epayco/response");
    expect(checkoutConfig.amount).toBe("99900");
    expect(publicKey).toBe("llave-publica-de-prueba");
    expect(db.pendingOrder.create).toHaveBeenCalledTimes(1);
  });

  it("sin NEXT_PUBLIC_APP_URL usa el dominio de producción de Vercel", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ph.vercel.app");
    const POST = await cargarRuta();
    const { checkoutConfig } = await (await POST(peticion({ plan: "elite" }))).json();
    expect(checkoutConfig.confirmation).toBe("https://ph.vercel.app/api/epayco/confirmation");
    expect(checkoutConfig.amount).toBe("399900");
  });

  it("en producción sin ninguna dirección NO abre el cobro: 500 en español, sin pedido pendiente ni localhost", async () => {
    sinDireccion();
    vi.stubEnv("NODE_ENV", "production");
    const POST = await cargarRuta();
    const r = await POST(peticion({ plan: "pro" }));
    expect(r.status).toBe(500);
    const cuerpo = await r.json();
    expect(cuerpo).toEqual({ error: MENSAJE_SIN_DIRECCION });
    expect(JSON.stringify(cuerpo)).not.toContain("localhost");
    expect(db.pendingOrder.create).not.toHaveBeenCalled();
    expect(errores.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n")).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("en desarrollo sin dirección sí cae en localhost", async () => {
    sinDireccion();
    const POST = await cargarRuta();
    const { checkoutConfig } = await (await POST(peticion({ plan: "pro" }))).json();
    expect(checkoutConfig.confirmation).toBe("http://localhost:3000/api/epayco/confirmation");
  });

  it("un NEXT_PUBLIC_APP_URL inválido tampoco abre el cobro", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "javascript:alert(1)");
    const POST = await cargarRuta();
    const r = await POST(peticion({ plan: "pro" }));
    expect(r.status).toBe(500);
    expect(db.pendingOrder.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/epayco/checkout — lo demás sigue igual", () => {
  it("un plan activo igual al pedido se rechaza con 400", async () => {
    db.subscription.findUnique.mockResolvedValue({
      status: "active",
      planId: "pro",
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });
    const POST = await cargarRuta();
    const r = await POST(peticion({ plan: "pro" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Ya tienes este plan activo." });
    expect(db.pendingOrder.create).not.toHaveBeenCalled();
  });

  it("sin cuerpo válido cobra el plan Pro por omisión y guarda el pedido pendiente", async () => {
    const POST = await cargarRuta();
    const r = await POST({ json: async () => { throw new SyntaxError("sin cuerpo"); } } as unknown as NextRequest);
    expect(r.status).toBe(200);
    const { checkoutConfig } = await r.json();
    expect(checkoutConfig.name).toBe("Plan Pro");
    expect(db.pendingOrder.create.mock.calls[0][0].data).toMatchObject({ userId: "u1", planType: "pro", amount: 99900, status: "pending" });
  });
});

describe("POST /api/epayco/checkout — modo demo", () => {
  beforeEach(() => vi.stubEnv("DEMO_MODE", "true"));

  it("devuelve la dirección de retorno con NEXT_PUBLIC_APP_URL", async () => {
    const POST = await cargarRuta();
    const r = await POST(peticion({ plan: "pro" }));
    expect(await r.json()).toEqual({ url: "https://app.ejemplo.co/dashboard?success=true&demo=1" });
    expect(db.pendingOrder.create).not.toHaveBeenCalled();
  });

  it("en producción sin dirección responde 500 en español en vez de mandar a localhost", async () => {
    sinDireccion();
    vi.stubEnv("NODE_ENV", "production");
    const POST = await cargarRuta();
    const r = await POST(peticion({ plan: "pro" }));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: MENSAJE_SIN_DIRECCION });
  });
});
