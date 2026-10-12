import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { NextRequest } from "next/server";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  property: { count: vi.fn(), create: vi.fn() },
}));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
const sesion = vi.hoisted(() => ({ auth: vi.fn() }));
const uso = vi.hoisted(() => ({ checkPropertyLimit: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => sesion);
vi.mock("@/lib/usage", () => uso);

const peticion = (body: unknown) =>
  ({ json: async () => body, headers: new Headers() }) as unknown as NextRequest;

async function cargarRuta() {
  vi.resetModules();
  return (await import("./route")).POST;
}

let errores: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEMO_MODE", "false");
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.auth.mockResolvedValue({ user: { id: "u1", email: "a@x.co", name: "Ana" } });
  db.user.findUnique.mockResolvedValue({ id: "u1" });
  uso.checkPropertyLimit.mockResolvedValue({ allowed: true, limit: 3, current: 0 });
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.$queryRaw.mockResolvedValue([{ id: "u1" }]);
  tx.property.count.mockResolvedValue(0);
  tx.property.create.mockResolvedValue({ id: "p1", name: "Los Pinos" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  void errores;
});

describe("POST /api/properties", () => {
  it("crea la propiedad dentro de una transacción con la fila del usuario bloqueada", async () => {
    const POST = await cargarRuta();
    const res = await POST(peticion({ name: "Los Pinos" }));
    expect(res.status).toBe(201);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.property.count).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(tx.property.create).toHaveBeenCalledTimes(1);
  });

  it("rechaza con 403 si al recontar bajo el bloqueo ya se alcanzó el tope (peticiones en paralelo)", async () => {
    tx.property.count.mockResolvedValue(3);
    const POST = await cargarRuta();
    const res = await POST(peticion({ name: "Otra" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("property_limit");
    expect(tx.property.create).not.toHaveBeenCalled();
  });

  it("no cuenta ni bloquea cuando el plan es ilimitado", async () => {
    uso.checkPropertyLimit.mockResolvedValue({ allowed: true, limit: 999, current: 0 });
    const POST = await cargarRuta();
    const res = await POST(peticion({ name: "Los Pinos" }));
    expect(res.status).toBe(201);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.property.count).not.toHaveBeenCalled();
  });

  it("responde 403 sin abrir transacción si el chequeo previo ya niega", async () => {
    uso.checkPropertyLimit.mockResolvedValue({ allowed: false, reason: "Tope", limit: 3, current: 3 });
    const POST = await cargarRuta();
    const res = await POST(peticion({ name: "Otra" }));
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
