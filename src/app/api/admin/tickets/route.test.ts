/** Crear un ticket desde el panel: tipos y largos validados, mensaje recortado y auditoría sin el asunto completo. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, log, db } = vi.hoisted(() => ({
  // `current: null` simula a alguien que no es administrador (requireAdminOr401 responde 403).
  admin: { current: { userId: "adm", email: "adm@x.com" } as { userId: string; email: string } | null },
  log: vi.fn(),
  db: {
    user: { findUnique: vi.fn() },
    ticket: { create: vi.fn(), findMany: vi.fn() },
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

const post = (body: unknown) => new Request("http://x/api/admin/tickets", { method: "POST", body: JSON.stringify(body) }) as never;
const postCrudo = (texto: string) => new Request("http://x/api/admin/tickets", { method: "POST", body: texto }) as never;
const valido = { userId: "u1", subject: "No puedo entrar", content: "Hola, te escribimos por tu caso." };

beforeEach(() => {
  db.user.findUnique.mockReset().mockResolvedValue({ id: "u1" });
  db.ticket.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", ...data }));
  log.mockReset();
  admin.current = { userId: "adm", email: "adm@x.com" };
});

describe("POST /api/admin/tickets", () => {
  it("crea el ticket con los valores por omisión, recorta el mensaje y lo asigna a quien lo crea", async () => {
    const r = await POST(post({ ...valido, content: "  Hola  \n" }));
    expect(r.status).toBe(201);
    const data = db.ticket.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: "u1", subject: "No puedo entrar", category: "general", priority: "normal", status: "open", assignedTo: "adm" });
    expect(data.messages.create).toEqual({ fromAdmin: true, authorId: "adm", content: "Hola", internal: false });
  });

  it("la auditoría guarda el largo del asunto y no el asunto", async () => {
    await POST(post({ ...valido, subject: "Datos de Juan Pérez, cédula 123", category: "billing", priority: "high" }));
    const { metadata } = log.mock.calls[0][0];
    expect(metadata).toEqual({ userId: "u1", category: "billing", priority: "high", subjectLength: "Datos de Juan Pérez, cédula 123".length });
    expect(JSON.stringify(log.mock.calls[0][0])).not.toContain("Juan");
  });

  it.each([
    ["userId", { a: 1 }], ["userId", 5], ["userId", ["u1"]], ["userId", ""],
    ["subject", { a: 1 }], ["subject", 5], ["subject", null], ["subject", "   "],
    ["content", { a: 1 }], ["content", 5], ["content", ["x"]], ["content", "  \n "],
  ])("%s inválido (%j): 400 sin tocar la base", async (campo, valor) => {
    const r = await POST(post({ ...valido, [campo]: valor }));
    expect(r.status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("los campos que faltan dicen cuál falta", async () => {
    for (const [campo, texto] of [["userId", /usuario/i], ["subject", /asunto/i], ["content", /mensaje/i]] as const) {
      const sin = { ...valido } as Record<string, unknown>;
      delete sin[campo];
      const r = await POST(post(sin));
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(texto);
    }
  });

  it("topes de largo: asunto 150, mensaje 5000 e id 64; justo en el tope pasa", async () => {
    expect((await POST(post({ ...valido, subject: "a".repeat(150) }))).status).toBe(201);
    expect((await POST(post({ ...valido, content: "a".repeat(5000) }))).status).toBe(201);
    for (const exceso of [{ subject: "a".repeat(151) }, { content: "a".repeat(5001) }, { userId: "a".repeat(65) }]) {
      db.ticket.create.mockClear();
      const r = await POST(post({ ...valido, ...exceso }));
      expect(r.status).toBe(400);
      expect(db.ticket.create).not.toHaveBeenCalled();
    }
  });

  it("rechaza el NUL en el asunto y en el mensaje; el mensaje admite saltos de línea y el asunto no", async () => {
    expect((await POST(post({ ...valido, subject: "hola\u0000" }))).status).toBe(400);
    expect((await POST(post({ ...valido, content: "hola\u0000" }))).status).toBe(400);
    expect((await POST(post({ ...valido, content: "línea 1\nlínea 2" }))).status).toBe(201);
    expect((await POST(post({ ...valido, subject: "línea 1\nlínea 2" }))).status).toBe(400);
  });

  it.each([["category", "otra"], ["category", ""], ["category", null], ["category", 0], ["priority", "máxima"], ["priority", ""], ["priority", null], ["priority", { a: 1 }]])(
    "%s inválida (%j): 400",
    async (campo, valor) => {
      const r = await POST(post({ ...valido, [campo]: valor }));
      expect(r.status).toBe(400);
      expect(db.ticket.create).not.toHaveBeenCalled();
    },
  );

  it("un cuerpo que no es un objeto o un JSON roto responde 400", async () => {
    for (const cuerpo of [null, [], "hola", 5]) expect((await POST(post(cuerpo))).status).toBe(400);
    expect((await POST(postCrudo("{roto"))).status).toBe(400);
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("un usuario que no existe responde 404", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await POST(post(valido))).status).toBe(404);
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("quien no es administrador: 403 sin consultar la base", async () => {
    admin.current = null;
    expect((await POST(post(valido))).status).toBe(403);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.ticket.create).not.toHaveBeenCalled();
  });
});
