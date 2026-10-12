import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, sesion } = vi.hoisted(() => ({
  db: { property: { findFirst: vi.fn() }, propertyDocument: { create: vi.fn() } },
  sesion: { actual: null as { user?: { id?: string } } | null },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: async () => {} }));

import { POST } from "./route";
import { MENSAJE_BLOB_AJENO } from "@/lib/blob-owner";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";

const registrar = (url: unknown) =>
  POST(
    new Request("http://localhost:3000/api/properties/prop1/documents", {
      method: "POST",
      body: JSON.stringify({ type: "reglamento_interno", name: "Reglamento.pdf", url, size: 1000, mimeType: "application/pdf" }),
    }) as never,
    { params: Promise.resolve({ propertyId: "prop1" }) }
  );

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.actual = { user: { id: U1 } };
  db.property.findFirst.mockReset().mockResolvedValue({ id: "prop1" });
  db.propertyDocument.create.mockReset().mockImplementation(async ({ data }: { data: object }) => ({ id: "doc1", ...data }));
});

describe("POST /api/properties/[propertyId]/documents: dueño del archivo", () => {
  it("registra un documento cuyo archivo subió el propio usuario", async () => {
    const url = `${HOST}/subidas/${U1}/property-docs/prop1/reglamento-AbC123.pdf`;
    const r = await registrar(url);
    expect(r.status).toBe(200);
    expect(db.propertyDocument.create).toHaveBeenCalledWith({ data: expect.objectContaining({ propertyId: "prop1", url }) });
  });

  it("RECHAZA (403) el archivo de otro usuario: no se puede colgar de la propia copropiedad", async () => {
    const r = await registrar(`${HOST}/subidas/${U2}/property-docs/prop1/reglamento-AbC123.pdf`);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe(MENSAJE_BLOB_AJENO);
    expect(db.propertyDocument.create).not.toHaveBeenCalled();
  });

  it("rechaza las rutas de antes, los trucos de ruta y las consultas", async () => {
    for (const url of [
      `${HOST}/property-docs/prop1/1700000-reglamento.pdf`,
      `${HOST}/subidas/${U1}/../${U2}/reglamento.pdf`,
      `${HOST}/subidas/${U1}%2F..%2F${U2}/reglamento.pdf`,
      `${HOST}/subidas/${U2}/reglamento.pdf?x=/subidas/${U1}/a.pdf`,
      `${HOST}/generations/gen1/informe.html`,
    ]) {
      expect((await registrar(url)).status, url).toBe(403);
    }
    expect(db.propertyDocument.create).not.toHaveBeenCalled();
  });

  it("un host que no es del almacenamiento sigue respondiendo 400", async () => {
    const r = await registrar(`https://servidor-del-atacante.example/subidas/${U1}/a.pdf`);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("El archivo debe subirse desde esta aplicación.");
  });

  it("sin url sigue respondiendo 400 (datos incompletos)", async () => {
    expect((await registrar(undefined)).status).toBe(400);
  });

  it("una copropiedad ajena sigue respondiendo 404", async () => {
    db.property.findFirst.mockResolvedValue(null);
    expect((await registrar(`${HOST}/subidas/${U1}/a.pdf`)).status).toBe(404);
  });

  it("sin sesión responde 401", async () => {
    sesion.actual = null;
    expect((await registrar(`${HOST}/subidas/${U1}/a.pdf`)).status).toBe(401);
  });
});
