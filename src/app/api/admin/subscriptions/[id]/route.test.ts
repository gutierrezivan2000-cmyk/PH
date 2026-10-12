/** PATCH de una suscripción desde el panel: nadie se cambia la suya salvo los propietarios, y solo pasan los campos permitidos. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { admin, log, db } = vi.hoisted(() => ({
  // `current: null` simula a alguien que no es administrador (requireAdminOr401 responde 403).
  admin: { current: { userId: "adm", email: "otro-admin@x.com" } as { userId: string; email: string } | null },
  log: vi.fn(),
  db: {
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    adminAuditLog: { findMany: vi.fn() },
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
const patch = (body: unknown) => new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body) }) as never;
const ctx = (id = "sub1") => ({ params: Promise.resolve({ id }) });
const suscripcionDe = (userId: string) => ({ id: "sub1", userId, planId: "pro", status: "active", addonAgents: [] as string[], adminNotes: null, epaycoSubscriptionId: null });

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "");
  db.subscription.findUnique.mockReset();
  db.subscription.update.mockReset();
  log.mockReset();
  admin.current = { userId: "adm", email: "otro-admin@x.com" };
  db.subscription.findUnique.mockResolvedValue(suscripcionDe("cliente1"));
  db.subscription.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sub1", ...data }));
});
afterEach(() => vi.unstubAllEnvs());

describe("PATCH /api/admin/subscriptions/[id] — cambios sobre la propia cuenta", () => {
  it("un admin común sobre su PROPIA suscripción: 403, no se guarda nada y no se audita", async () => {
    db.subscription.findUnique.mockResolvedValue(suscripcionDe("adm"));
    for (const cuerpo of [{ planId: "elite" }, { status: "active" }, { addonAgents: ["metra"] }, { adminNotes: "x" }]) {
      const r = await PATCH(patch(cuerpo), ctx());
      expect(r.status).toBe(403);
    }
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("un admin común sobre la suscripción de otra persona: funciona y se audita sin marca de cambio propio", async () => {
    const r = await PATCH(patch({ planId: "elite", addonAgents: ["metra"] }), ctx());
    expect(r.status).toBe(200);
    expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: "sub1" }, data: { planId: "elite", addonAgents: ["metra"] } });
    const acciones = log.mock.calls.map((c) => c[0].action).sort();
    expect(acciones).toEqual(["subscription.addons_change", "subscription.plan_change"]);
    for (const [llamada] of log.mock.calls) expect(llamada.metadata).not.toHaveProperty("propio");
  });

  it("un propietario sobre su propia suscripción: funciona y cada registro de auditoría queda marcado como cambio propio", async () => {
    admin.current = { userId: "adm", email: OWNER };
    db.subscription.findUnique.mockResolvedValue(suscripcionDe("adm"));
    const r = await PATCH(patch({ planId: "elite", addonAgents: ["hermes"], status: "trialing" }), ctx());
    expect(r.status).toBe(200);
    expect(db.subscription.update).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const [llamada] of log.mock.calls) {
      expect(llamada.adminId).toBe("adm");
      expect(llamada.metadata).toMatchObject({ propio: true });
    }
  });

  it("quien no es administrador: 403 sin consultar la base", async () => {
    admin.current = null;
    const r = await PATCH(patch({ planId: "elite" }), ctx());
    expect(r.status).toBe(403);
    expect(db.subscription.findUnique).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("una suscripción que no existe responde 404", async () => {
    db.subscription.findUnique.mockResolvedValue(null);
    expect((await PATCH(patch({ planId: "elite" }), ctx("nada"))).status).toBe(404);
  });
});

describe("PATCH /api/admin/subscriptions/[id] — solo pasan los campos permitidos", () => {
  it("ignora campos ajenos (userId, id, epaycoSubscriptionId, currentPeriodEnd…): no llegan a la base", async () => {
    const r = await PATCH(
      patch({ adminNotes: "cliente de prueba", userId: "adm", id: "otro", epaycoSubscriptionId: "x", currentPeriodEnd: "2099-01-01", role: "admin" }),
      ctx(),
    );
    expect(r.status).toBe(200);
    expect(db.subscription.update.mock.calls[0][0].data).toEqual({ adminNotes: "cliente de prueba" });
  });

  it("las notas deben ser texto y de largo acotado", async () => {
    expect((await PATCH(patch({ adminNotes: { a: 1 } }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ adminNotes: 5 }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ adminNotes: "x".repeat(2001) }), ctx())).status).toBe(400);
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect((await PATCH(patch({ adminNotes: "x".repeat(2000) }), ctx())).status).toBe(200);
    expect((await PATCH(patch({ adminNotes: null }), ctx())).status).toBe(200);
  });

  it("los add-ons repetidos se guardan una sola vez y los desconocidos se rechazan", async () => {
    expect((await PATCH(patch({ addonAgents: ["metra", "metra", "hermes"] }), ctx())).status).toBe(200);
    expect(db.subscription.update.mock.calls[0][0].data.addonAgents).toEqual(["metra", "hermes"]);
    db.subscription.update.mockClear();
    expect((await PATCH(patch({ addonAgents: ["metra", "gratis"] }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ addonAgents: [{ a: 1 }] }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ addonAgents: "metra" }), ctx())).status).toBe(400);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("estado y plan inválidos se rechazan", async () => {
    expect((await PATCH(patch({ status: "gratis" }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ planId: "platino" }), ctx())).status).toBe(400);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es un objeto no rompe la ruta", async () => {
    expect((await PATCH(patch(null), ctx())).status).toBe(200);
    expect((await PATCH(patch([1, 2]), ctx())).status).toBe(200);
  });
});

describe("PATCH /api/admin/subscriptions/[id] — plan", () => {
  it("acepta cada plan que existe en PLANS, también Business (antes la lista solo traía pro y elite)", async () => {
    for (const planId of ["pro", "business", "elite"]) {
      db.subscription.update.mockClear();
      const r = await PATCH(patch({ planId }), ctx());
      expect(r.status).toBe(200);
      expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: "sub1" }, data: { planId } });
    }
  });

  it("pasar de Pro a Business queda en la auditoría como cambio de plan", async () => {
    await PATCH(patch({ planId: "business" }), ctx());
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "subscription.plan_change", metadata: { from: "pro", to: "business" } }));
  });

  it("`null` quita el plan y queda auditado; el mismo plan de antes no genera auditoría", async () => {
    const r = await PATCH(patch({ planId: null }), ctx());
    expect(r.status).toBe(200);
    expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: "sub1" }, data: { planId: null } });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "subscription.plan_change", metadata: { from: "pro", to: null } }));
    log.mockClear();
    await PATCH(patch({ planId: "pro" }), ctx());
    expect(log).not.toHaveBeenCalled();
  });

  it("el texto vacío NO quita el plan: se rechaza, igual que cualquier valor que no sea un plan", async () => {
    for (const planId of ["", " ", "platino", "Elite", 5, true, {}, ["pro"]]) {
      const r = await PATCH(patch({ planId }), ctx());
      expect(r.status).toBe(400);
    }
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("el mensaje de error dice lo mismo que hace la ruta: lista los planes y 'null', y no habla de 'vacío'", async () => {
    const { error } = await (await PATCH(patch({ planId: "" }), ctx())).json();
    expect(error).toContain("'pro'");
    expect(error).toContain("'business'");
    expect(error).toContain("'elite'");
    expect(error).toContain("null");
    expect(error).not.toMatch(/vac[ií]o/i);
  });
});
