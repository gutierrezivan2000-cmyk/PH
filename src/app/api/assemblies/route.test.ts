import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, suscripcion } = vi.hoisted(() => ({
  db: { assembly: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() } },
  suscripcion: { allowed: true as boolean, reason: undefined as string | undefined },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1", email: "jefe@x.com", role: "admin" } }) }));
vi.mock("@/lib/modulos-acceso", () => ({ exigirModulo: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: async () => ({ allowed: suscripcion.allowed, reason: suscripcion.reason }) }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: async () => {} }));

import { PATCH } from "./route";

const patch = (b: unknown) => PATCH(new Request("http://x/api/assemblies", { method: "PATCH", body: JSON.stringify(b) }) as never);

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  db.assembly.findFirst.mockReset();
  db.assembly.updateMany.mockReset();
  db.assembly.update.mockReset();
  suscripcion.allowed = true;
  suscripcion.reason = undefined;
});

describe("PATCH asambleas: suscripción", () => {
  it("sin suscripción activa no cambia el estado de la asamblea", async () => {
    suscripcion.allowed = false;
    suscripcion.reason = "Tu prueba terminó. Activa tu suscripción para seguir.";
    const r = await patch({ id: "a1", action: "cancel" });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "Tu prueba terminó. Activa tu suscripción para seguir." });
    expect(db.assembly.findFirst).not.toHaveBeenCalled();
    expect(db.assembly.updateMany).not.toHaveBeenCalled();
    expect(db.assembly.update).not.toHaveBeenCalled();
  });

  it("con suscripción activa sigue el flujo normal (una asamblea que no es del usuario responde 404)", async () => {
    db.assembly.findFirst.mockResolvedValue(null);
    const r = await patch({ id: "a1", action: "cancel" });
    expect(r.status).toBe(404);
    expect(db.assembly.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", userId: "u1" } }));
  });
});
