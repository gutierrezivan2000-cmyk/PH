/**
 * Perfil del usuario: lista blanca de campos (nada de asignación masiva), tipos, largos, URL https y qué se devuelve.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { sesion, db } = vi.hoisted(() => {
  delete process.env.DEMO_MODE;
  return {
    sesion: { current: { user: { id: "u1", email: "ana@x.co", name: "Ana", image: null } } as null | { user: { id: string; email: string; name: string | null; image: string | null } } },
    db: { user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
  };
});
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.current }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));

import { GET, PUT } from "./route";

const put = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const putRoto = () => ({ json: async () => { throw new SyntaxError("Unexpected token"); } }) as unknown as NextRequest;
const guardado = () => db.user.update.mock.calls[0][0].data as Record<string, unknown>;
const BLOB = "https://abc123.public.blob.vercel-storage.com/subidas/u1/branding/logo-x1y2z3.png";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.current = { user: { id: "u1", email: "ana@x.co", name: "Ana", image: null } };
  db.user.findUnique.mockResolvedValue({ id: "u1", logoUrl: null });
  db.user.create.mockResolvedValue({ id: "u1", logoUrl: null });
  db.user.update.mockResolvedValue({ id: "u1" });
});

describe("PUT /api/profile — lista blanca", () => {
  it("sin sesión responde 401 y no toca la base", async () => {
    sesion.current = null;
    expect((await PUT(put({ name: "x" }))).status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("guarda los campos del perfil, recortados", async () => {
    const r = await PUT(put({ name: "  Ana Gómez ", cargo: "Contador(a)", phone: " 300 123 4567", company: "Admin SAS", city: "Bogotá", onboarded: true }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "Ana Gómez", cargo: "Contador(a)", phone: "300 123 4567", company: "Admin SAS", city: "Bogotá", onboarded: true },
      select: { id: true },
    });
  });

  it("asignación masiva: role, banned, emailVerified, plan, id, correo, hash y llaves del cuerpo NO llegan a la base", async () => {
    const r = await PUT(
      put({
        name: "Ana",
        role: "admin",
        banned: false,
        bannedAt: null,
        banReason: "x",
        emailVerified: "2020-01-01T00:00:00Z",
        email: "otra@x.co",
        id: "u2",
        passwordHash: "$2a$12$robado",
        passwordChangedAt: "2020-01-01",
        plan: "elite",
        planId: "elite",
        subscription: { update: { planId: "elite" } },
        epaycoPKey: "k",
        epaycoPublicKey: "k",
        epaycoPCustId: "k",
        termsAcceptedAt: "2020-01-01",
        lastLoginAt: "2020-01-01",
        createdAt: "2000-01-01",
        image: "https://evil.example/x.png",
        $set: { role: "admin" },
        __proto__: { role: "admin" },
      }),
    );
    expect(r.status).toBe(200);
    expect(guardado()).toEqual({ name: "Ana" });
    expect(db.user.update.mock.calls[0][0].where).toEqual({ id: "u1" }); // siempre la cuenta de la sesión
  });

  it("un campo ausente no se toca (no se pisa con vacío)", async () => {
    await PUT(put({ city: "Cali" }));
    expect(guardado()).toEqual({ city: "Cali" });
  });

  it("un texto vacío sí se guarda vacío (así se borra un campo)", async () => {
    await PUT(put({ company: "   " }));
    expect(guardado()).toEqual({ company: "" });
  });

  it("si la cuenta aún no existe la crea con los datos de la sesión, nunca con los del cuerpo", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "nuevo", logoUrl: null });
    await PUT(put({ name: "Ana", email: "otra@x.co", role: "admin" }));
    expect(db.user.create).toHaveBeenCalledWith({ data: { email: "ana@x.co", name: "Ana", image: null }, select: { id: true, logoUrl: true } });
    expect(db.user.update.mock.calls[0][0].where).toEqual({ id: "nuevo" });
    expect(guardado()).toEqual({ name: "Ana" });
  });
});

describe("PUT /api/profile — tipos y largos", () => {
  it.each([
    ["name", { a: 1 }],
    ["name", 42],
    ["name", ["Ana"]],
    ["name", null],
    ["name", true],
    ["cargo", { $ne: "" }],
    ["phone", 3001234567],
    ["company", ["x"]],
    ["city", false],
  ])("rechaza %s con valor que no es texto: %j", async (campo, valor) => {
    const r = await PUT(put({ [campo]: valor }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/texto/);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["name", 120],
    ["cargo", 100],
    ["phone", 30],
    ["company", 160],
    ["city", 120],
  ])("%s admite hasta %i caracteres y rechaza uno más", async (campo, max) => {
    expect((await PUT(put({ [campo]: "a".repeat(max) }))).status).toBe(200);
    db.user.update.mockClear();
    const r = await PUT(put({ [campo]: "a".repeat(max + 1) }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain(String(max));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("el largo se mide después de recortar", async () => {
    expect((await PUT(put({ name: `  ${"a".repeat(120)}  ` }))).status).toBe(200);
  });

  it("rechaza caracteres de control (el NUL rompe el guardado en Postgres)", async () => {
    expect((await PUT(put({ name: "Ana\u0000" }))).status).toBe(400);
    expect((await PUT(put({ city: "Cali\nBogotá" }))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("onboarded solo acepta verdadero o falso", async () => {
    expect((await PUT(put({ onboarded: "true" }))).status).toBe(400);
    expect((await PUT(put({ onboarded: 1 }))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
    expect((await PUT(put({ onboarded: false }))).status).toBe(200);
  });

  it("un cuerpo que no es un objeto o un JSON roto responde 400", async () => {
    for (const cuerpo of [null, [], "texto", 5]) expect((await PUT(put(cuerpo))).status).toBe(400);
    expect((await PUT(putRoto())).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/profile — logo y color de marca", () => {
  it("acepta un logo https y un color hexadecimal", async () => {
    const r = await PUT(put({ logoUrl: BLOB, brandColor: " #1A2b3C " }));
    expect(r.status).toBe(200);
    expect(guardado()).toEqual({ logoUrl: BLOB, brandColor: "#1A2b3C" });
  });

  it("vacío los quita (null en la base)", async () => {
    await PUT(put({ logoUrl: "", brandColor: "" }));
    expect(guardado()).toEqual({ logoUrl: null, brandColor: null });
  });

  it.each([
    ["http", "http://abc.public.blob.vercel-storage.com/logo.png"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:image/svg+xml;base64,PHN2Zz4="],
    ["sin protocolo", "abc.public.blob.vercel-storage.com/logo.png"],
    ["protocolo relativo", "//evil.example/logo.png"],
    ["con usuario y contraseña", "https://user:clave@evil.example/logo.png"],
    ["con espacios", "https://evil.example/mi logo.png"],
    ["con comillas (salirse del atributo)", 'https://evil.example/x.png"onerror="alert(1)'],
    ["con ángulos", "https://evil.example/<script>.png"],
    ["con barra invertida", "https://evil.example\\@otro.example/x.png"],
    ["sin dominio", "https://"],
  ])("rechaza un logo %s", async (_nombre, url) => {
    const r = await PUT(put({ logoUrl: url }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/https/);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rechaza un logo que no es texto o que pasa de 2048 caracteres", async () => {
    expect((await PUT(put({ logoUrl: { href: BLOB } }))).status).toBe(400);
    expect((await PUT(put({ logoUrl: 5 }))).status).toBe(400);
    expect((await PUT(put({ logoUrl: `https://a.example/${"a".repeat(2048)}` }))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
    expect((await PUT(put({ logoUrl: `https://a.example/${"a".repeat(2048 - 18)}` }))).status).toBe(200);
  });

  it("reenviar el mismo logo que ya estaba guardado no se vuelve a exigir (guardar el resto del perfil no falla)", async () => {
    const antiguo = "https://cdn.example/Logo Viejo.png"; // anterior a estas reglas
    db.user.findUnique.mockResolvedValue({ id: "u1", logoUrl: antiguo });
    const r = await PUT(put({ name: "Ana", logoUrl: antiguo }));
    expect(r.status).toBe(200);
    expect(guardado()).toEqual({ name: "Ana" }); // el logo no cambia, no se reescribe
  });

  it("cambiar el logo guardado por otro inválido sí se rechaza", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", logoUrl: BLOB });
    expect((await PUT(put({ logoUrl: "http://evil.example/x.png" }))).status).toBe(400);
  });

  it.each(["rojo", "#12345", "#1234567", "#gggggg", "1a2b3c", { a: 1 }, 5])("rechaza el color %j", async (color) => {
    const r = await PUT(put({ brandColor: color }));
    expect(r.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/profile — fallos de la base", () => {
  it("responde 500 sin devolver el texto del error de la base", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.user.update.mockRejectedValue(new Error('Invalid `prisma.user.update()` invocation: column "passwordHash" ...'));
    const r = await PUT(put({ name: "Ana" }));
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(JSON.stringify(j)).not.toMatch(/prisma|passwordHash|column/i);
    expect(j.error).toMatch(/guardar/);
  });
});

describe("GET /api/profile — solo lo que la pantalla necesita", () => {
  it("consulta solo esas columnas (no trae el hash ni las llaves de pago) y devuelve la misma forma de siempre", async () => {
    db.user.findUnique.mockResolvedValue({
      name: "Ana", email: "ana@x.co", image: null, cargo: null, phone: "300", company: "Admin SAS", city: null, onboarded: true, logoUrl: BLOB, brandColor: null,
    });
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      name: "Ana", email: "ana@x.co", image: null, cargo: "", phone: "300", company: "Admin SAS", city: "", onboarded: true, logoUrl: BLOB, brandColor: "",
    });
    const select = db.user.findUnique.mock.calls[0][0].select as Record<string, boolean>;
    expect(Object.keys(select).sort()).toEqual(["brandColor", "cargo", "city", "company", "email", "image", "logoUrl", "name", "onboarded", "phone"]);
    for (const secreto of ["passwordHash", "role", "banned", "epaycoPKey", "epaycoPublicKey", "epaycoPCustId", "id"]) expect(select).not.toHaveProperty(secreto);
  });

  it("sin sesión responde 401", async () => {
    sesion.current = null;
    expect((await GET()).status).toBe(401);
  });

  it("una cuenta sin fila devuelve el perfil vacío sin completar (onboarded false)", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const j = await (await GET()).json();
    expect(j).toMatchObject({ email: "ana@x.co", onboarded: false, cargo: "" });
  });

  it("un fallo de la base responde 500 con error:true (no se confunde con un usuario nuevo)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.user.findUnique.mockRejectedValue(new Error("boom"));
    const r = await GET();
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ error: true, onboarded: true });
  });
});
