/**
 * Tickets del usuario: lista blanca (nada de asignación masiva), tipos, largos, límite de creación y qué se devuelve.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { sesion, db, ritmo } = vi.hoisted(() => {
  delete process.env.DEMO_MODE;
  return {
    sesion: { current: { user: { id: "u1", email: "ana@x.co" } } as null | { user: { id: string; email: string } } },
    db: { ticket: { findMany: vi.fn(), create: vi.fn() } },
    ritmo: vi.fn(),
  };
});
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.current }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => ritmo(...a) }));

import { GET, POST } from "./route";

const post = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const postRoto = () => ({ json: async () => { throw new SyntaxError("Unexpected token"); } }) as unknown as NextRequest;
const creado = () => db.ticket.create.mock.calls[0][0] as { data: Record<string, unknown>; select: Record<string, boolean> };
const valido = { subject: "No carga el informe", content: "Al subir los archivos se queda en blanco." };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sesion.current = { user: { id: "u1", email: "ana@x.co" } };
  ritmo.mockResolvedValue({ allowed: true });
  db.ticket.create.mockImplementation(async () => ({ id: "t1", subject: "x", status: "open", createdAt: new Date("2026-10-12T10:00:00Z") }));
  db.ticket.findMany.mockResolvedValue([]);
});

describe("POST /api/tickets — lista blanca", () => {
  it("sin sesión responde 401 y en el demo 403", async () => {
    sesion.current = null;
    expect((await POST(post(valido))).status).toBe(401);
    sesion.current = { user: { id: "u1", email: "ana@x.co" } };
    vi.stubEnv("DEMO_MODE", "true");
    expect((await POST(post(valido))).status).toBe(403);
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("crea el ticket abierto, del usuario de la sesión, con el mensaje recortado", async () => {
    const r = await POST(post({ subject: "  No carga el informe ", content: "  Hola\n\nGracias  ", category: "bug", priority: "high" }));
    expect(r.status).toBe(201);
    expect(creado().data).toEqual({
      userId: "u1",
      subject: "No carga el informe",
      category: "bug",
      priority: "high",
      status: "open",
      messages: { create: { fromAdmin: false, authorId: "u1", content: "Hola\n\nGracias", internal: false } },
    });
  });

  it("categoría y prioridad tienen valor por omisión", async () => {
    await POST(post(valido));
    expect(creado().data).toMatchObject({ category: "general", priority: "normal" });
  });

  it("asignación masiva: userId, status, assignedTo, id, authorId, fromAdmin, internal y mensajes del cuerpo NO llegan a la base", async () => {
    const r = await POST(
      post({
        ...valido,
        userId: "otro",
        status: "closed",
        assignedTo: "admin-1",
        id: "t-ajeno",
        createdAt: "2000-01-01",
        authorId: "admin-1",
        fromAdmin: true,
        internal: true,
        messages: { create: { fromAdmin: true, internal: true, content: "colado" } },
      })
    );
    expect(r.status).toBe(201);
    const { data } = creado();
    expect(data).toMatchObject({ userId: "u1", status: "open" });
    expect(Object.keys(data).sort()).toEqual(["category", "messages", "priority", "status", "subject", "userId"]);
    expect(data.messages).toEqual({ create: { fromAdmin: false, authorId: "u1", content: valido.content, internal: false } });
  });

  it("devuelve solo id, asunto, estado y fecha", async () => {
    const r = await POST(post(valido));
    expect(Object.keys(creado().select).sort()).toEqual(["createdAt", "id", "status", "subject"]);
    expect(Object.keys((await r.json()).ticket).sort()).toEqual(["createdAt", "id", "status", "subject"]);
  });
});

describe("POST /api/tickets — tipos y largos", () => {
  it.each([
    ["subject", { a: 1 }],
    ["subject", 5],
    ["subject", ["x"]],
    ["subject", null],
    ["content", { $ne: "" }],
    ["content", 5],
    ["content", ["hola"]],
    ["content", null],
  ])("rechaza %s que no es texto: %j", async (campo, valor) => {
    const r = await POST(post({ ...valido, [campo]: valor }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/texto/);
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("asunto y mensaje son obligatorios (también si solo traen espacios)", async () => {
    for (const cuerpo of [{}, { subject: valido.subject }, { content: valido.content }, { subject: "   ", content: "x" }, { subject: "x", content: "  \n " }]) {
      const r = await POST(post(cuerpo));
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/obligatorio/);
    }
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("categoría y prioridad deben ser texto de la lista (la prioridad «urgent» es solo del equipo)", async () => {
    for (const extra of [{ category: { a: 1 } }, { category: "otra" }, { category: 5 }, { priority: "urgent" }, { priority: ["low"] }, { priority: 1 }, { priority: null }]) {
      expect((await POST(post({ ...valido, ...extra }))).status).toBe(400);
    }
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("el asunto admite 150 caracteres y rechaza uno más", async () => {
    expect((await POST(post({ ...valido, subject: "a".repeat(150) }))).status).toBe(201);
    const r = await POST(post({ ...valido, subject: "a".repeat(151) }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("150");
  });

  it("el mensaje admite 5000 caracteres y rechaza uno más", async () => {
    expect((await POST(post({ ...valido, content: "a".repeat(5000) }))).status).toBe(201);
    const r = await POST(post({ ...valido, content: "a".repeat(5001) }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("5000");
  });

  it("rechaza caracteres de control: el NUL en cualquier campo y el salto de línea en el asunto", async () => {
    expect((await POST(post({ ...valido, content: "hola\u0000" }))).status).toBe(400);
    expect((await POST(post({ ...valido, subject: "asunto\u0000" }))).status).toBe(400);
    expect((await POST(post({ ...valido, subject: "dos\nlíneas" }))).status).toBe(400);
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es un objeto o un JSON roto responde 400", async () => {
    for (const cuerpo of [null, [], "texto", 5]) expect((await POST(post(cuerpo))).status).toBe(400);
    expect((await POST(postRoto())).status).toBe(400);
    expect(db.ticket.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/tickets — límite de creación", () => {
  it("cuenta por persona: 5 por hora y 20 por día", async () => {
    await POST(post(valido));
    expect(ritmo).toHaveBeenCalledWith("ticket:h:u1", { max: 5, windowMs: 3_600_000 });
    expect(ritmo).toHaveBeenCalledWith("ticket:d:u1", { max: 20, windowMs: 24 * 3_600_000 });
  });

  it("si se pasó del límite por hora o por día responde 429 y no crea nada", async () => {
    ritmo.mockImplementation(async (clave: string) => ({ allowed: !clave.startsWith("ticket:h:") }));
    const r = await POST(post(valido));
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/tickets/);
    ritmo.mockImplementation(async (clave: string) => ({ allowed: !clave.startsWith("ticket:d:") }));
    expect((await POST(post(valido))).status).toBe(429);
    expect(db.ticket.create).not.toHaveBeenCalled();
  });

  it("una petición inválida no gasta el cupo", async () => {
    await POST(post({ subject: "", content: "" }));
    await POST(post({ ...valido, category: "otra" }));
    expect(ritmo).not.toHaveBeenCalled();
  });
});

describe("GET /api/tickets — qué se devuelve", () => {
  it("pide solo las columnas de la pantalla (sin assignedTo ni userId) y sigue ocultando las notas internas", async () => {
    await GET({} as NextRequest);
    const args = db.ticket.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1" });
    expect(args).not.toHaveProperty("include");
    expect(Object.keys(args.select).sort()).toEqual(["_count", "category", "createdAt", "id", "messages", "priority", "status", "subject", "updatedAt"]);
    expect(args.select).not.toHaveProperty("assignedTo");
    expect(args.select).not.toHaveProperty("userId");
    expect(args.select._count).toEqual({ select: { messages: { where: { internal: false } } } });
    expect(args.select.messages.where).toEqual({ internal: false });
    expect(Object.keys(args.select.messages.select).sort()).toEqual(["content", "createdAt", "fromAdmin", "id"]);
    expect(args.select.messages.select).not.toHaveProperty("authorId");
    expect(args.select.messages.select).not.toHaveProperty("internal");
  });

  it("sin sesión responde 401 y un fallo de la base responde 500 con mensaje genérico", async () => {
    sesion.current = null;
    expect((await GET({} as NextRequest)).status).toBe(401);
    sesion.current = { user: { id: "u1", email: "ana@x.co" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.ticket.findMany.mockRejectedValue(new Error("secreto interno"));
    const r = await GET({} as NextRequest);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secreto");
  });
});
