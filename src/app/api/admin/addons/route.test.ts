/** PATCH de add-ons desde el panel: nadie se activa add-ons a sí mismo salvo los propietarios. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { admin, log, db } = vi.hoisted(() => ({
  // `current: null` simula a alguien que no es administrador (requireAdminOr401 responde 403).
  admin: { current: { userId: "adm", email: "otro-admin@x.com" } as { userId: string; email: string } | null },
  log: vi.fn(),
  db: {
    user: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/admin-auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/admin-emails")>("@/lib/admin-emails");
  return {
    requireAdminOr401: async () =>
      admin.current
        ? { admin: { ...admin.current, name: null, role: "admin" } }
        : { error: Response.json({ error: "Acceso denegado. Solo administradores." }, { status: 403 }) },
    logAdminAction: (...a: unknown[]) => log(...a),
    isEnvAdmin: real.esAdminDeEntorno,
  };
});
vi.mock("@/lib/db", () => ({ db }));

import { PATCH } from "./route";

const OWNER = "gutierrezivan2000@gmail.com";
const patch = (body: unknown) => new Request("http://x/api/admin/addons", { method: "PATCH", body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "");
  Object.values(db.user).forEach((f) => f.mockReset());
  Object.values(db.subscription).forEach((f) => f.mockReset());
  log.mockReset();
  admin.current = { userId: "adm", email: "otro-admin@x.com" };
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }));
  db.subscription.findUnique.mockResolvedValue({ id: "sub1", userId: "x", addonAgents: [] });
  db.subscription.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub-nueva", ...data }));
  db.subscription.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub1", ...data }));
});
afterEach(() => vi.unstubAllEnvs());

describe("PATCH /api/admin/addons — add-ons de la propia cuenta", () => {
  it("un admin común sobre su PROPIA cuenta: 403, no se guarda nada y no se audita", async () => {
    const r = await PATCH(patch({ userId: "adm", agent: "metra", enabled: true }));
    expect(r.status).toBe(403);
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(db.subscription.create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("un admin común sobre la cuenta de otra persona: funciona y se audita sin marca de cambio propio", async () => {
    const r = await PATCH(patch({ userId: "cliente1", agent: "hermes", enabled: true }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, addonAgents: ["hermes"] });
    expect(db.subscription.update).toHaveBeenCalledWith({ where: { userId: "cliente1" }, data: { addonAgents: ["hermes"] } });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "addon.toggle", adminId: "adm", metadata: { userId: "cliente1", agent: "hermes", enabled: true } }));
  });

  it("un propietario sobre su propia cuenta: funciona y la auditoría lo marca como cambio propio", async () => {
    admin.current = { userId: "adm", email: OWNER };
    const r = await PATCH(patch({ userId: "adm", agent: "logistes", enabled: true }));
    expect(r.status).toBe(200);
    expect(db.subscription.update).toHaveBeenCalledWith({ where: { userId: "adm" }, data: { addonAgents: ["logistes"] } });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "addon.toggle", metadata: { userId: "adm", agent: "logistes", enabled: true, propio: true } }));
  });

  it("quien no es administrador: 403 sin consultar la base", async () => {
    admin.current = null;
    const r = await PATCH(patch({ userId: "cliente1", agent: "metra", enabled: true }));
    expect(r.status).toBe(403);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/addons — validación del cuerpo", () => {
  it("rechaza tipos que no son texto/booleano y agentes desconocidos sin tocar la base", async () => {
    for (const cuerpo of [
      { userId: { id: "x" }, agent: "metra", enabled: true },
      { userId: ["cliente1"], agent: "metra", enabled: true },
      { userId: "cliente1", agent: { a: 1 }, enabled: true },
      { userId: "cliente1", agent: "metra", enabled: "true" },
      { userId: "cliente1", agent: "inventado", enabled: true },
      { userId: "", agent: "metra", enabled: true },
      null,
    ]) {
      expect((await PATCH(patch(cuerpo))).status).toBe(400);
    }
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(db.subscription.create).not.toHaveBeenCalled();
  });

  it("un usuario que no existe responde 404", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await PATCH(patch({ userId: "nadie", agent: "metra", enabled: true }))).status).toBe(404);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("sin suscripción crea una inactiva con el add-on (comportamiento de siempre)", async () => {
    db.subscription.findUnique.mockResolvedValue(null);
    const r = await PATCH(patch({ userId: "cliente1", agent: "metra", enabled: true }));
    expect(r.status).toBe(200);
    expect(db.subscription.create).toHaveBeenCalledWith({ data: { userId: "cliente1", status: "inactive", addonAgents: ["metra"] } });
  });
});
