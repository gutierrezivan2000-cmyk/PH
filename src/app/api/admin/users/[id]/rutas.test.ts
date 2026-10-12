/** Reglas de las rutas de control de usuarios: roles solo para propietarios y acceso con auditoría. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { admin, log, db } = vi.hoisted(() => ({
  // `current: null` simula a alguien que no es administrador (requireAdminOr401 responde 403).
  admin: { current: { userId: "adm", email: "otro-admin@x.com" } as { userId: string; email: string } | null },
  log: vi.fn(),
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn() },
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
import { POST as darAcceso } from "./acceso/route";

const req = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }) as never;
const ctx = (id = "u1xyz123") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "");
  Object.values(db.user).forEach((f) => f.mockReset());
  Object.values(db.subscription).forEach((f) => f.mockReset());
  log.mockReset();
  admin.current = { userId: "adm", email: "otro-admin@x.com" };
  db.user.findUnique.mockResolvedValue({ id: "u1xyz123", role: "user", email: "cliente@x.com", banned: false });
  db.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "u1xyz123", ...data }));
});
afterEach(() => vi.unstubAllEnvs());

describe("cambiar rol", () => {
  it("un admin que no es propietario NO puede volver admin a nadie", async () => {
    const r = await PATCH(req({ role: "admin" }), ctx());
    expect(r.status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("el propietario sí y queda auditado", async () => {
    admin.current = { userId: "adm", email: "gutierrezivan2000@gmail.com" };
    const r = await PATCH(req({ role: "admin" }), ctx());
    expect(r.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "user.role_change", targetId: "u1xyz123", metadata: { from: "user", to: "admin" } }));
  });
  it("un admin común tampoco puede bloquear a otro admin, pero sí a un cliente", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "admin", email: "a@x.com", banned: false });
    expect((await PATCH(req({ banned: true }), ctx("u2"))).status).toBe(403);
    db.user.findUnique.mockResolvedValue({ id: "u1xyz123", role: "user", email: "cliente@x.com", banned: false });
    expect((await PATCH(req({ banned: true, reason: "abuso" }), ctx())).status).toBe(200);
  });
  it("a un propietario no se le puede bloquear ni degradar", async () => {
    admin.current = { userId: "adm", email: "gutierrezivan2000@gmail.com" };
    db.user.findUnique.mockResolvedValue({ id: "own", role: "admin", email: "gutierrezivan2000@gmail.com", banned: false });
    expect((await PATCH(req({ banned: true }), ctx("own"))).status).toBe(400);
    expect((await PATCH(req({ role: "user" }), ctx("own"))).status).toBe(400);
  });
});

describe("dar acceso", () => {
  it("crea o renueva la suscripción activa con el plan y los días pedidos, y lo audita", async () => {
    db.subscription.findUnique.mockResolvedValue(null);
    db.subscription.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "s1", ...create }));
    const r = await darAcceso(req({ planId: "pro", dias: 30 }), ctx());
    expect(r.status).toBe(200);
    const args = db.subscription.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1xyz123" });
    expect(args.create).toMatchObject({ userId: "u1xyz123", planId: "pro", status: "active" });
    const dias = (args.create.currentPeriodEnd.getTime() - args.create.currentPeriodStart.getTime()) / 86_400_000;
    expect(dias).toBe(30);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "user.grant_access", metadata: { planId: "pro", dias: 30, from: null } }));
  });
  it("rechaza planes o días inválidos y usuarios que no existen", async () => {
    expect((await darAcceso(req({ planId: "gratis", dias: 30 }), ctx())).status).toBe(400);
    expect((await darAcceso(req({ planId: "pro", dias: 9999 }), ctx())).status).toBe(400);
    db.user.findUnique.mockResolvedValue(null);
    expect((await darAcceso(req({ planId: "pro", dias: 30 }), ctx("nadie"))).status).toBe(404);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("dar acceso: nadie se da planes a sí mismo, salvo los propietarios", () => {
  const OWNER = "gutierrezivan2000@gmail.com";
  beforeEach(() => {
    db.subscription.findUnique.mockResolvedValue(null);
    db.subscription.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "s1", ...create }));
    db.user.findUnique.mockResolvedValue({ id: "adm" });
  });

  it("un admin común sobre su propia cuenta: 403 y no toca nada", async () => {
    const r = await darAcceso(req({ planId: "elite", dias: 30 }), ctx("adm"));
    expect(r.status).toBe(403);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it("un admin común sobre la cuenta de otra persona: funciona y queda auditado sin marca de cambio propio", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1xyz123" });
    const r = await darAcceso(req({ planId: "pro", dias: 7 }), ctx("u1xyz123"));
    expect(r.status).toBe(200);
    expect(db.subscription.upsert).toHaveBeenCalledTimes(1);
    const meta = log.mock.calls[0][0].metadata;
    expect(meta).not.toHaveProperty("propio");
  });
  it("un propietario sobre su propia cuenta: funciona y la auditoría lo marca como cambio propio", async () => {
    admin.current = { userId: "adm", email: OWNER };
    const r = await darAcceso(req({ planId: "elite", dias: 30 }), ctx("adm"));
    expect(r.status).toBe(200);
    expect(db.subscription.upsert.mock.calls[0][0].where).toEqual({ userId: "adm" });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "user.grant_access", targetId: "adm", metadata: expect.objectContaining({ planId: "elite", propio: true }) }));
  });
  it("un propietario por ADMIN_EMAILS también cuenta como propietario", async () => {
    vi.stubEnv("ADMIN_EMAILS", "socia@x.com");
    admin.current = { userId: "adm", email: "Socia@X.com" };
    expect((await darAcceso(req({ planId: "pro", dias: 30 }), ctx("adm"))).status).toBe(200);
  });
  it("quien no es administrador: 403 sin consultar la base", async () => {
    admin.current = null;
    const r = await darAcceso(req({ planId: "pro", dias: 30 }), ctx("u1xyz123"));
    expect(r.status).toBe(403);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
});
