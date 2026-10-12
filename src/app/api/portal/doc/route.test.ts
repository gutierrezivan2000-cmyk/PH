/**
 * Documento de la copropiedad para el residente (portal, sin sesión): solo se entrega el archivo si es de la copropiedad
 * (del administrador o de su carpeta de antes); una fila que apunte al blob de otra cuenta es un documento inexistente.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, esquema, blob } = vi.hoisted(() => ({
  db: { unit: { findFirst: vi.fn() }, propertyDocument: { findFirst: vi.fn() } },
  esquema: { ensureAdminSchema: vi.fn() },
  blob: { get: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => esquema);
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => blob.get(...a) }));

import { GET } from "./route";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const TOKEN = "tok_abcdefghijklmnop1234";
const ADMIN = "cmadmin1111111111aa";
const OTRO = "cmotro22222222222bb";
const PROP = "cmprop1111111111aa";
const OTRA_PROP = "cmprop9999999999zz";
const DOC = "cmdoc11111111111aa";

const propio = `${HOST}/subidas/${ADMIN}/property-docs/${PROP}/reglamento-AbC123.pdf`;
const legado = `${HOST}/property-docs/${PROP}/1700000-reglamento-AbC123.pdf`;

const abrir = (query: string = `token=${TOKEN}&id=${DOC}`) => GET(new NextRequest(`http://localhost:3000/api/portal/doc?${query}`));
const flujo = (texto = "%PDF-contenido") =>
  new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(texto));
      c.close();
    },
  });
const documento = (url: string, extra: Record<string, unknown> = {}) => ({ name: "Reglamento interno.pdf", url, mimeType: "application/pdf", ...extra });

let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchSimulado = vi.fn().mockResolvedValue(new Response("desde-fetch"));
  vi.stubGlobal("fetch", fetchSimulado);
  esquema.ensureAdminSchema.mockReset().mockResolvedValue(undefined);
  blob.get.mockReset().mockImplementation(async () => ({ stream: flujo() }));
  db.unit.findFirst.mockReset().mockResolvedValue({ propertyId: PROP, property: { userId: ADMIN } });
  db.propertyDocument.findFirst.mockReset().mockResolvedValue(documento(propio));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/portal/doc: el archivo debe ser de la copropiedad", () => {
  it("entrega el archivo que subió el administrador (subidas/<su id>/…)", async () => {
    const r = await abrir();
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("%PDF-contenido");
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('inline; filename="Reglamento interno.pdf"');
    expect(blob.get).toHaveBeenCalledWith(propio, { access: "private" });
  });

  it("entrega un documento de antes de que el dueño fuera parte de la ruta (property-docs/<esta copropiedad>/…)", async () => {
    db.propertyDocument.findFirst.mockResolvedValue(documento(legado));
    const r = await abrir();
    expect(r.status).toBe(200);
    expect(blob.get).toHaveBeenCalledWith(legado, { access: "private" });
  });

  it("una fila que apunta al blob de OTRA cuenta responde 404 y no lee nada del almacenamiento", async () => {
    db.propertyDocument.findFirst.mockResolvedValue(documento(`${HOST}/subidas/${OTRO}/agent-files/secreto-AbC123.pdf`));
    const r = await abrir();
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Documento no disponible" });
    expect(blob.get).not.toHaveBeenCalled();
    expect(fetchSimulado).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[portal/doc]"));
  });

  it("el 404 del blob ajeno es idéntico al de un host no permitido (no revela cuál fue el motivo)", async () => {
    db.propertyDocument.findFirst.mockResolvedValue(documento(`${HOST}/subidas/${OTRO}/x-AbC123.pdf`));
    const ajeno = await abrir();
    db.propertyDocument.findFirst.mockResolvedValue(documento("https://servidor-del-atacante.example/x.pdf"));
    const host = await abrir();
    expect(ajeno.status).toBe(host.status);
    expect(await ajeno.json()).toEqual(await host.json());
  });

  it.each([
    ["la carpeta de antes de OTRA copropiedad", `${HOST}/property-docs/${OTRA_PROP}/1700000-reglamento.pdf`],
    ["la carpeta de antes sin id de copropiedad", `${HOST}/property-docs/1700000-reglamento.pdf`],
    ["los insumos mensuales de esta copropiedad (no son documentos)", `${HOST}/monthly/${PROP}/2026-5/1700000-acta.pdf`],
    ["una carpeta de uso general sin dueño", `${HOST}/uploads/1700000-reglamento.pdf`],
    ["un recorrido hacia la carpeta de otro", `${HOST}/subidas/${ADMIN}/../${OTRO}/reglamento.pdf`],
    ["un recorrido codificado", `${HOST}/subidas/${ADMIN}/%2e%2e/${OTRO}/reglamento.pdf`],
    ["un recorrido por la carpeta de antes", `${HOST}/property-docs/${PROP}/../${OTRA_PROP}/reglamento.pdf`],
    ["una consulta que imita la ruta del dueño", `${HOST}/subidas/${OTRO}/reglamento.pdf?x=/subidas/${ADMIN}/a.pdf`],
    ["el id del dueño con otras mayúsculas", `${HOST}/subidas/${ADMIN.toUpperCase()}/reglamento.pdf`],
    ["la carpeta del dueño sin archivo", `${HOST}/subidas/${ADMIN}`],
  ])("responde 404 sin leer nada cuando el archivo es %s", async (_caso, url) => {
    db.propertyDocument.findFirst.mockResolvedValue(documento(url));
    const r = await abrir();
    expect(r.status).toBe(404);
    expect(blob.get).not.toHaveBeenCalled();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("un host que no es del almacenamiento sigue respondiendo 404 sin salir del servidor", async () => {
    for (const url of ["http://servidor-del-atacante.example/x.pdf", `https://servidor-del-atacante.example/subidas/${ADMIN}/x.pdf`, "javascript:alert(1)", ""]) {
      db.propertyDocument.findFirst.mockResolvedValue(documento(url));
      expect((await abrir()).status, url).toBe(404);
    }
    expect(blob.get).not.toHaveBeenCalled();
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("si la fila no trae al administrador de la copropiedad solo vale la carpeta de antes de esta copropiedad", async () => {
    db.unit.findFirst.mockResolvedValue({ propertyId: PROP, property: null });
    expect((await abrir()).status).toBe(404); // subidas/<admin>/… ya no se puede comprobar
    db.propertyDocument.findFirst.mockResolvedValue(documento(legado));
    expect((await abrir()).status).toBe(200);
  });

  it("consulta el documento solo dentro de la copropiedad de la unidad del enlace", async () => {
    await abrir();
    expect(db.propertyDocument.findFirst).toHaveBeenCalledWith({
      where: { id: DOC, propertyId: PROP },
      select: { name: true, url: true, mimeType: true },
    });
  });

  it("un archivo que no es de un tipo seguro se fuerza a descarga (sigue igual que antes)", async () => {
    db.propertyDocument.findFirst.mockResolvedValue(documento(propio, { mimeType: "text/html", name: 'a"b<c>.html' }));
    const r = await abrir();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="a_b_c_.html"');
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  });

  it("si el almacenamiento no entrega el archivo, el respaldo usa fetch y, si tampoco, responde 404", async () => {
    blob.get.mockResolvedValue(null);
    const r = await abrir();
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("desde-fetch");
    expect(fetchSimulado).toHaveBeenCalledWith(propio);

    fetchSimulado.mockResolvedValue(new Response("no", { status: 500 }));
    expect((await abrir()).status).toBe(404);
  });
});

describe("GET /api/portal/doc: esquema y validaciones previas", () => {
  it("autorrepara el esquema ANTES de la primera consulta a la base", async () => {
    await abrir();
    expect(esquema.ensureAdminSchema).toHaveBeenCalledTimes(1);
    const antes = esquema.ensureAdminSchema.mock.invocationCallOrder[0];
    expect(antes).toBeLessThan(db.unit.findFirst.mock.invocationCallOrder[0]);
    expect(antes).toBeLessThan(db.propertyDocument.findFirst.mock.invocationCallOrder[0]);
  });

  it("si el autorreparado falla responde 500 genérico y no consulta la base", async () => {
    esquema.ensureAdminSchema.mockRejectedValue(new Error("conexión rechazada"));
    const r = await abrir();
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/conexión/);
    expect(db.unit.findFirst).not.toHaveBeenCalled();
  });

  it("un enlace incompleto responde 400 sin tocar la base ni el esquema", async () => {
    expect((await abrir(`token=${TOKEN}`)).status).toBe(400);
    expect((await abrir(`id=${DOC}`)).status).toBe(400);
    expect((await abrir("")).status).toBe(400);
    expect(esquema.ensureAdminSchema).not.toHaveBeenCalled();
    expect(db.unit.findFirst).not.toHaveBeenCalled();
  });

  it("un token con forma inválida responde 404 sin tocar la base", async () => {
    expect((await abrir(`token=corto&id=${DOC}`)).status).toBe(404);
    expect((await abrir(`token=${encodeURIComponent("a".repeat(16) + "'; DROP TABLE x;--")}&id=${DOC}`)).status).toBe(404);
    expect(db.unit.findFirst).not.toHaveBeenCalled();
  });

  it("en el demo no hay nada que servir (404) y no se toca la base", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect((await abrir()).status).toBe(404);
    expect(esquema.ensureAdminSchema).not.toHaveBeenCalled();
    expect(db.unit.findFirst).not.toHaveBeenCalled();
  });

  it("un enlace que no corresponde a ninguna unidad responde 404", async () => {
    db.unit.findFirst.mockResolvedValue(null);
    expect((await abrir()).status).toBe(404);
    expect(db.propertyDocument.findFirst).not.toHaveBeenCalled();
  });

  it("un documento que no es de esa copropiedad (o no existe) responde 404", async () => {
    db.propertyDocument.findFirst.mockResolvedValue(null);
    const r = await abrir();
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Documento no encontrado" });
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("un fallo de la base responde 500 sin devolver el texto del error", async () => {
    db.propertyDocument.findFirst.mockRejectedValue(new Error('relation "PropertyDocument" does not exist'));
    const r = await abrir();
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/relation|PropertyDocument/);
  });
});
