import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, acceso, plan } = vi.hoisted(() => ({ auth: vi.fn(), acceso: vi.fn(), plan: { actual: "business" as string | null } }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: (...a: unknown[]) => acceso(...a) }));
vi.mock("@/lib/db", () => ({ db: { subscription: { findUnique: async () => (plan.actual ? { planId: plan.actual } : null) } } }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));

import { requireCartera } from "./cartera-server";

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.stubEnv("PILOTO_EMAILS", "");
  auth.mockReset();
  acceso.mockReset();
  plan.actual = "business";
  acceso.mockResolvedValue({ allowed: true, status: "active" });
});
afterEach(() => vi.unstubAllEnvs());

const estado = (r: Awaited<ReturnType<typeof requireCartera>>) => ("error" in r ? r.error.status : 200);

describe("requireCartera con módulo en lanzamiento gradual", () => {
  it("una cuenta Business común recibe 404 en Cartera, Presupuesto y PQRS mientras estén en piloto", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "cliente@x.com", role: "user" } });
    for (const m of ["cartera", "presupuesto", "pqrs"] as const) expect(estado(await requireCartera(m)), m).toBe(404);
    expect(acceso).not.toHaveBeenCalled();
  });
  it("un admin entra", async () => {
    auth.mockResolvedValue({ user: { id: "a1", email: "jefe@x.com", role: "admin" } });
    expect(estado(await requireCartera("cartera"))).toBe(200);
  });
  it("las rutas que no son un módulo pausado (portal de residentes, pagos) no se cierran para una cuenta Business", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "cliente@x.com", role: "user" } });
    expect(estado(await requireCartera())).toBe(200);
  });
  it("en piloto no se exige plan Business: un admin sin suscripción puede probar el módulo; sin módulo (portal/pagos) el plan sigue mandando", async () => {
    plan.actual = null;
    acceso.mockResolvedValue({ allowed: true, status: "active" });
    auth.mockResolvedValue({ user: { id: "a1", email: "jefe@x.com", role: "admin" } });
    expect(estado(await requireCartera("cartera"))).toBe(200);
    expect(estado(await requireCartera())).toBe(403);
  });
  it("sin sesión: 401", async () => {
    auth.mockResolvedValue(null);
    expect(estado(await requireCartera("cartera"))).toBe(401);
  });
});
