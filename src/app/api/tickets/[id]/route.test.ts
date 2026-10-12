/** Detalle de un ticket del usuario: solo el dueño, sin notas internas y sin datos del equipo. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { sesion, db } = vi.hoisted(() => {
  delete process.env.DEMO_MODE;
  return {
    sesion: { current: { user: { id: "u1", email: "ana@x.co" } } as null | { user: { id: string; email: string } } },
    db: { ticket: { findUnique: vi.fn() } },
  };
});
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.current }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));

import { GET } from "./route";

const ctx = (id = "t1") => ({ params: Promise.resolve({ id }) });
const FECHA = new Date("2026-10-12T10:00:00Z");
const fila = (userId: string) => ({
  id: "t1",
  userId,
  subject: "No carga",
  status: "pending",
  category: "bug",
  priority: "normal",
  createdAt: FECHA,
  updatedAt: FECHA,
  messages: [{ id: "m1", fromAdmin: true, content: "Hola", attachments: null, createdAt: FECHA }],
  _count: { messages: 1 },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sesion.current = { user: { id: "u1", email: "ana@x.co" } };
  db.ticket.findUnique.mockResolvedValue(fila("u1"));
});

describe("GET /api/tickets/[id]", () => {
  it("devuelve el ticket del dueño sin userId", async () => {
    const r = await GET({} as NextRequest, ctx());
    expect(r.status).toBe(200);
    const { ticket } = await r.json();
    expect(ticket).not.toHaveProperty("userId");
    expect(ticket).toMatchObject({ id: "t1", subject: "No carga", status: "pending", category: "bug", priority: "normal" });
    expect(ticket.messages).toEqual([{ id: "m1", fromAdmin: true, content: "Hola", attachments: null, createdAt: FECHA.toISOString() }]);
  });

  it("pide solo las columnas de la pantalla y deja fuera las notas internas, el administrador asignado y los autores", async () => {
    await GET({} as NextRequest, ctx());
    const args = db.ticket.findUnique.mock.calls[0][0];
    expect(args).not.toHaveProperty("include");
    expect(args.select).not.toHaveProperty("assignedTo");
    expect(args.select).not.toHaveProperty("user");
    expect(args.select.messages.where).toEqual({ internal: false });
    expect(Object.keys(args.select.messages.select).sort()).toEqual(["attachments", "content", "createdAt", "fromAdmin", "id"]);
    expect(args.select.messages.select).not.toHaveProperty("authorId");
    expect(args.select.messages.select).not.toHaveProperty("internal");
  });

  it("el ticket de otra persona responde 403 sin sus datos", async () => {
    db.ticket.findUnique.mockResolvedValue(fila("otro"));
    const r = await GET({} as NextRequest, ctx());
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toContain("No carga");
  });

  it("un ticket que no existe responde 404 y sin sesión 401", async () => {
    db.ticket.findUnique.mockResolvedValue(null);
    expect((await GET({} as NextRequest, ctx("nada"))).status).toBe(404);
    sesion.current = null;
    expect((await GET({} as NextRequest, ctx())).status).toBe(401);
  });
});
