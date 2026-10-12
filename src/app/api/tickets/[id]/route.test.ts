/**
 * Detalle de un ticket del usuario: solo el dueño, sin notas internas y sin datos del equipo.
 * El ticket de otra persona y uno que no existe responden IGUAL (404): un 403 confirmaba que el id existe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { sesion, db } = vi.hoisted(() => {
  delete process.env.DEMO_MODE;
  return {
    sesion: { current: { user: { id: "u1", email: "ana@x.co" } } as null | { user: { id: string; email: string } } },
    db: { ticket: { findFirst: vi.fn() } },
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

/** Una «base» con un solo ticket que filtra por el `where` como la real: si el dueño no coincide, no lo encuentra. */
function conTicketDe(dueno: string) {
  const { userId, ...f } = fila(dueno);
  // Como la real con `select`: el dueño sirve para filtrar pero no vuelve en la fila.
  db.ticket.findFirst.mockImplementation(async ({ where }: { where: { id: string; userId: string } }) =>
    where.id === f.id && where.userId === userId ? f : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sesion.current = { user: { id: "u1", email: "ana@x.co" } };
  conTicketDe("u1");
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
    const args = db.ticket.findFirst.mock.calls[0][0];
    expect(args).not.toHaveProperty("include");
    expect(args.select).not.toHaveProperty("userId");
    expect(args.select).not.toHaveProperty("assignedTo");
    expect(args.select).not.toHaveProperty("user");
    expect(args.select.messages.where).toEqual({ internal: false });
    expect(Object.keys(args.select.messages.select).sort()).toEqual(["attachments", "content", "createdAt", "fromAdmin", "id"]);
    expect(args.select.messages.select).not.toHaveProperty("authorId");
    expect(args.select.messages.select).not.toHaveProperty("internal");
  });

  it("la búsqueda lleva al dueño en el where (id + userId de la sesión)", async () => {
    await GET({} as NextRequest, ctx());
    expect(db.ticket.findFirst.mock.calls[0][0].where).toEqual({ id: "t1", userId: "u1" });
  });

  it("el ticket de otra persona responde 404, idéntico a uno que no existe, y sin sus datos", async () => {
    conTicketDe("otro");
    const ajeno = await GET({} as NextRequest, ctx());
    expect(ajeno.status).toBe(404);
    const cuerpoAjeno = await ajeno.json();
    expect(JSON.stringify(cuerpoAjeno)).not.toContain("No carga");

    db.ticket.findFirst.mockResolvedValue(null);
    const inexistente = await GET({} as NextRequest, ctx("nada"));
    expect(inexistente.status).toBe(404);
    // Mismo código y mismo cuerpo: no hay forma de distinguir «existe pero no es tuyo» de «no existe».
    expect(await inexistente.json()).toEqual(cuerpoAjeno);
    expect(cuerpoAjeno).toEqual({ error: "Ticket no encontrado" });
  });

  it("sin sesión responde 401", async () => {
    sesion.current = null;
    expect((await GET({} as NextRequest, ctx())).status).toBe(401);
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
  });
});
