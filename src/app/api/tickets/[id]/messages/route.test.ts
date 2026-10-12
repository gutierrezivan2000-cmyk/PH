/** Responder un ticket: solo el dueño, solo el texto, con largo acotado y con límite por hora. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { sesion, db, ritmo } = vi.hoisted(() => {
  delete process.env.DEMO_MODE;
  return {
    sesion: { current: { user: { id: "u1", email: "ana@x.co" } } as null | { user: { id: string; email: string } } },
    db: {
      ticket: { findUnique: vi.fn(), update: vi.fn() },
      ticketMessage: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    ritmo: vi.fn(),
  };
});
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.current }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => ritmo(...a) }));

import { POST } from "./route";

const post = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const postRoto = () => ({ json: async () => { throw new SyntaxError("Unexpected token"); } }) as unknown as NextRequest;
const ctx = (id = "t1") => ({ params: Promise.resolve({ id }) });
const FECHA = new Date("2026-10-12T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sesion.current = { user: { id: "u1", email: "ana@x.co" } };
  ritmo.mockResolvedValue({ allowed: true });
  db.ticket.findUnique.mockResolvedValue({ id: "t1", userId: "u1", status: "pending" });
  db.ticketMessage.create.mockImplementation(async () => ({ id: "m1", fromAdmin: false, content: "x", createdAt: FECHA }));
  db.ticket.update.mockImplementation(async () => ({}));
  db.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

describe("POST /api/tickets/[id]/messages", () => {
  it("guarda la respuesta del usuario, reabre el ticket y devuelve solo lo que la pantalla necesita", async () => {
    const r = await POST(post({ content: "  Ya lo probé de nuevo.  " }), ctx());
    expect(r.status).toBe(201);
    expect(db.ticketMessage.create).toHaveBeenCalledWith({
      data: { ticketId: "t1", fromAdmin: false, authorId: "u1", content: "Ya lo probé de nuevo.", internal: false },
      select: { id: true, fromAdmin: true, content: true, createdAt: true },
    });
    expect(db.ticket.update.mock.calls[0][0]).toMatchObject({ where: { id: "t1" }, data: { status: "open" } });
    expect(Object.keys((await r.json()).message).sort()).toEqual(["content", "createdAt", "fromAdmin", "id"]);
  });

  it("asignación masiva: fromAdmin, internal, authorId, ticketId, attachments y status del cuerpo se ignoran", async () => {
    await POST(post({ content: "hola", fromAdmin: true, internal: true, authorId: "admin-1", ticketId: "t-ajeno", attachments: [{ url: "https://evil.example" }], status: "closed" }), ctx());
    expect(db.ticketMessage.create.mock.calls[0][0].data).toEqual({ ticketId: "t1", fromAdmin: false, authorId: "u1", content: "hola", internal: false });
    expect(db.ticket.update.mock.calls[0][0].data).toMatchObject({ status: "open" });
  });

  it.each([{ a: 1 }, 5, ["hola"], null, true])("rechaza un mensaje que no es texto: %j", async (valor) => {
    const r = await POST(post({ content: valor }), ctx());
    expect(r.status).toBe(400);
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("el mensaje es obligatorio, admite 5000 caracteres y rechaza uno más", async () => {
    for (const cuerpo of [{}, { content: "" }, { content: "   \n " }]) {
      const r = await POST(post(cuerpo), ctx());
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/obligatorio/);
    }
    expect((await POST(post({ content: "a".repeat(5000) }), ctx())).status).toBe(201);
    const r = await POST(post({ content: "a".repeat(5001) }), ctx());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("5000");
  });

  it("rechaza el NUL pero deja pasar los saltos de línea", async () => {
    expect((await POST(post({ content: "hola\u0000" }), ctx())).status).toBe(400);
    expect((await POST(post({ content: "línea 1\nlínea 2" }), ctx())).status).toBe(201);
  });

  it("un cuerpo que no es un objeto o un JSON roto responde 400", async () => {
    for (const cuerpo of [null, [], "hola", 5]) expect((await POST(post(cuerpo), ctx())).status).toBe(400);
    expect((await POST(postRoto(), ctx())).status).toBe(400);
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("limita las respuestas por persona (30 por hora) y responde 429 al pasarse", async () => {
    await POST(post({ content: "hola" }), ctx());
    expect(ritmo).toHaveBeenCalledWith("ticket-msg:u1", { max: 30, windowMs: 3_600_000 });
    ritmo.mockResolvedValue({ allowed: false, retryAfterSec: 60 });
    db.ticketMessage.create.mockClear();
    const r = await POST(post({ content: "hola" }), ctx());
    expect(r.status).toBe(429);
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("una petición inválida no gasta el cupo", async () => {
    await POST(post({ content: "" }), ctx());
    expect(ritmo).not.toHaveBeenCalled();
  });

  it("el ticket de otra persona responde 403, uno inexistente 404 y uno cerrado 400; sin escribir nada", async () => {
    db.ticket.findUnique.mockResolvedValue({ id: "t1", userId: "otro", status: "open" });
    expect((await POST(post({ content: "hola" }), ctx())).status).toBe(403);
    db.ticket.findUnique.mockResolvedValue(null);
    expect((await POST(post({ content: "hola" }), ctx("nada"))).status).toBe(404);
    for (const status of ["resolved", "closed"]) {
      db.ticket.findUnique.mockResolvedValue({ id: "t1", userId: "u1", status });
      expect((await POST(post({ content: "hola" }), ctx())).status).toBe(400);
    }
    expect(db.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("sin sesión responde 401 y en el demo 403", async () => {
    sesion.current = null;
    expect((await POST(post({ content: "hola" }), ctx())).status).toBe(401);
    sesion.current = { user: { id: "u1", email: "ana@x.co" } };
    vi.stubEnv("DEMO_MODE", "true");
    expect((await POST(post({ content: "hola" }), ctx())).status).toBe(403);
  });
});
