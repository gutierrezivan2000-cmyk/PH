/** PATCH de un ticket desde el panel: estado, prioridad y categoría de la lista, y responsable = nadie o un administrador. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, log, db } = vi.hoisted(() => ({
  // `current: null` simula a alguien que no es administrador (requireAdminOr401 responde 403).
  admin: { current: { userId: "adm", email: "adm@x.com" } as { userId: string; email: string } | null },
  log: vi.fn(),
  db: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminOr401: async () =>
    admin.current
      ? { admin: { ...admin.current, name: null, role: "admin" } }
      : { error: Response.json({ error: "Acceso denegado. Solo administradores." }, { status: 403 }) },
  logAdminAction: (...a: unknown[]) => log(...a),
}));
vi.mock("@/lib/db", () => ({ db }));

import { PATCH } from "./route";

const patch = (body: unknown) => new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body) }) as never;
const patchCrudo = (texto: string) => new Request("http://x/api", { method: "PATCH", body: texto }) as never;
const ctx = (id = "t1") => ({ params: Promise.resolve({ id }) });
const TICKET = { id: "t1", userId: "cliente", status: "open", priority: "normal", category: "general", assignedTo: null };

beforeEach(() => {
  db.ticket.findUnique.mockReset().mockResolvedValue({ ...TICKET });
  db.ticket.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...TICKET, ...data }));
  db.user.findUnique.mockReset().mockResolvedValue({ id: "adm2", role: "admin" });
  log.mockReset();
  admin.current = { userId: "adm", email: "adm@x.com" };
});

describe("PATCH /api/admin/tickets/[id] — estado, prioridad y categoría", () => {
  it("guarda los valores de la lista y audita solo lo que cambió", async () => {
    const r = await PATCH(patch({ status: "resolved", priority: "urgent", category: "billing" }), ctx());
    expect(r.status).toBe(200);
    expect(db.ticket.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "resolved", priority: "urgent", category: "billing" } });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ticket.update",
        metadata: { changes: { status: { from: "open", to: "resolved" }, priority: { from: "normal", to: "urgent" }, category: { from: "general", to: "billing" } } },
      }),
    );
  });

  it.each([
    ["status", ""], ["status", 0], ["status", false], ["status", null], ["status", "borrado"], ["status", { a: 1 }], ["status", ["open"]],
    ["priority", ""], ["priority", 0], ["priority", null], ["priority", "máxima"],
    ["category", ""], ["category", 0], ["category", null], ["category", "otra"],
  ])("%s = %j se rechaza con 400 y no se guarda (antes los valores falsos pasaban la validación y se guardaban)", async (campo, valor) => {
    const r = await PATCH(patch({ [campo]: valor }), ctx());
    expect(r.status).toBe(400);
    expect(db.ticket.update).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es un objeto o un JSON roto responde 400 (no 500)", async () => {
    for (const cuerpo of [null, [], "hola", 5]) expect((await PATCH(patch(cuerpo), ctx())).status).toBe(400);
    expect((await PATCH(patchCrudo("{roto"), ctx())).status).toBe(400);
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("un ticket que no existe responde 404", async () => {
    db.ticket.findUnique.mockResolvedValue(null);
    expect((await PATCH(patch({ status: "closed" }), ctx("nada"))).status).toBe(404);
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("quien no es administrador: 403 sin consultar la base", async () => {
    admin.current = null;
    expect((await PATCH(patch({ status: "closed" }), ctx())).status).toBe(403);
    expect(db.ticket.findUnique).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/tickets/[id] — responsable", () => {
  it("se puede asignar a un administrador", async () => {
    const r = await PATCH(patch({ assignedTo: "adm2" }), ctx());
    expect(r.status).toBe(200);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "adm2" }, select: { id: true, role: true } });
    expect(db.ticket.update.mock.calls[0][0].data).toEqual({ assignedTo: "adm2" });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { changes: { assignedTo: { from: null, to: "adm2" } } } }));
  });

  it("`null` deja el ticket sin responsable y no consulta usuarios", async () => {
    db.ticket.findUnique.mockResolvedValue({ ...TICKET, assignedTo: "adm2" });
    const r = await PATCH(patch({ assignedTo: null }), ctx());
    expect(r.status).toBe(200);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.ticket.update.mock.calls[0][0].data).toEqual({ assignedTo: null });
  });

  it("asignarlo a un cliente (rol user) se rechaza", async () => {
    db.user.findUnique.mockResolvedValue({ id: "cliente", role: "user" });
    const r = await PATCH(patch({ assignedTo: "cliente" }), ctx());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/administrador/);
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("asignarlo a un id que no existe se rechaza", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await PATCH(patch({ assignedTo: "inventado" }), ctx())).status).toBe(400);
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it.each(["", 5, true, { a: 1 }, ["adm2"], "a".repeat(65)])("un responsable que no es un id razonable (%j) se rechaza sin consultar usuarios", async (valor) => {
    const r = await PATCH(patch({ assignedTo: valor }), ctx());
    expect(r.status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("un valor inválido junto a uno válido no guarda ninguno", async () => {
    db.user.findUnique.mockResolvedValue({ id: "cliente", role: "user" });
    const r = await PATCH(patch({ status: "closed", assignedTo: "cliente" }), ctx());
    expect(r.status).toBe(400);
    expect(db.ticket.update).not.toHaveBeenCalled();
  });
});
