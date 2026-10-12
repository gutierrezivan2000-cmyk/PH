/** Responder o dejar una nota interna en un ticket desde el panel: texto acotado e `internal` booleano de verdad. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, log, db } = vi.hoisted(() => ({
  // `current: null` simula a alguien que no es administrador (requireAdminOr401 responde 403).
  admin: { current: { userId: "adm", email: "adm@x.com" } as { userId: string; email: string } | null },
  log: vi.fn(),
  db: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    ticketMessage: { create: vi.fn() },
    $transaction: vi.fn(),
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

import { POST } from "./route";

const post = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }) as never;
const postCrudo = (texto: string) => new Request("http://x/api", { method: "POST", body: texto }) as never;
const ctx = (id = "t1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  db.ticket.findUnique.mockReset().mockResolvedValue({ id: "t1", status: "open" });
  db.ticket.update.mockReset().mockImplementation(async (a: unknown) => a);
  db.ticketMessage.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data }));
  db.$transaction.mockReset().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  log.mockReset();
  admin.current = { userId: "adm", email: "adm@x.com" };
});

describe("POST /api/admin/tickets/[id]/messages", () => {
  it("una respuesta se guarda recortada, no es interna y pasa el ticket de abierto a pendiente", async () => {
    const r = await POST(post({ content: "  Ya lo revisamos.  " }), ctx());
    expect(r.status).toBe(201);
    expect(db.ticketMessage.create.mock.calls[0][0].data).toEqual({ ticketId: "t1", fromAdmin: true, authorId: "adm", content: "Ya lo revisamos.", internal: false });
    expect(db.ticket.update.mock.calls[0][0].data).toMatchObject({ status: "pending" });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "ticket.reply", metadata: { internal: false, contentLength: "Ya lo revisamos.".length } }));
  });

  it("una nota interna no cambia el estado del ticket", async () => {
    const r = await POST(post({ content: "Revisar con facturación", internal: true }), ctx());
    expect(r.status).toBe(201);
    expect(db.ticketMessage.create.mock.calls[0][0].data.internal).toBe(true);
    expect(db.ticket.update.mock.calls[0][0].data).not.toHaveProperty("status");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ action: "ticket.internal_note" }));
  });

  it.each([{ a: 1 }, 5, ["hola"], null, true, ""])("un contenido que no es texto útil (%j) responde 400 sin tocar la base (antes daba 500)", async (content) => {
    const r = await POST(post({ content }), ctx());
    expect(r.status).toBe(400);
    expect(db.ticket.findUnique).not.toHaveBeenCalled();
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("el contenido es obligatorio aunque sean solo espacios", async () => {
    for (const cuerpo of [{}, { content: "   \n " }]) {
      const r = await POST(post(cuerpo), ctx());
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/obligatorio/);
    }
  });

  it("admite 5000 caracteres y rechaza uno más", async () => {
    expect((await POST(post({ content: "a".repeat(5000) }), ctx())).status).toBe(201);
    db.ticketMessage.create.mockClear();
    const r = await POST(post({ content: "a".repeat(5001) }), ctx());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("5000");
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("rechaza el NUL pero deja pasar los saltos de línea", async () => {
    expect((await POST(post({ content: "hola\u0000" }), ctx())).status).toBe(400);
    expect((await POST(post({ content: "línea 1\nlínea 2" }), ctx())).status).toBe(201);
  });

  it.each(["no", "false", 0, 1, null, {}, []])("`internal` debe ser un booleano (%j): 400 y nada se guarda", async (internal) => {
    const r = await POST(post({ content: "hola", internal }), ctx());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/internal/);
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("`internal: false` explícito equivale a una respuesta normal", async () => {
    expect((await POST(post({ content: "hola", internal: false }), ctx())).status).toBe(201);
    expect(db.ticketMessage.create.mock.calls[0][0].data.internal).toBe(false);
  });

  it("un cuerpo que no es un objeto o un JSON roto responde 400", async () => {
    for (const cuerpo of [null, [], "hola", 5]) expect((await POST(post(cuerpo), ctx())).status).toBe(400);
    expect((await POST(postCrudo("{roto"), ctx())).status).toBe(400);
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("un ticket que no existe responde 404", async () => {
    db.ticket.findUnique.mockResolvedValue(null);
    expect((await POST(post({ content: "hola" }), ctx("nada"))).status).toBe(404);
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("quien no es administrador: 403 sin consultar la base", async () => {
    admin.current = null;
    expect((await POST(post({ content: "hola" }), ctx())).status).toBe(403);
    expect(db.ticket.findUnique).not.toHaveBeenCalled();
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });
});
