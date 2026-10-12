import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, get, sesion } = vi.hoisted(() => ({
  db: { usageRecord: { count: vi.fn() }, generation: { findFirst: vi.fn() } },
  get: vi.fn(),
  sesion: { actual: null as { user?: { id?: string } } | null },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => get(...a), put: vi.fn() }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: async () => ({ allowed: true }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));

import { POST } from "./route";
import { MENSAJE_BLOB_AJENO } from "@/lib/blob-owner";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const archivo = (url: string) => ({ url, name: "adicional.txt", type: "text/plain", size: 100 });
const propio = archivo(`${HOST}/subidas/${U1}/corrections/adicional-AbC123.txt`);
const ajeno = archivo(`${HOST}/subidas/${U2}/corrections/adicional-AbC123.txt`);

const corregir = (blobFiles: unknown) =>
  POST(
    new Request("http://localhost:3000/api/generate/refine", {
      method: "POST",
      body: JSON.stringify({ generationId: "gen1", instruction: "Agrega el punto de la piscina.", blobFiles }),
    }) as never
  );

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.actual = { user: { id: U1 } };
  get.mockReset().mockResolvedValue(null);
  db.usageRecord.count.mockReset().mockResolvedValue(0);
  db.generation.findFirst.mockReset().mockResolvedValue(null);
});

describe("POST /api/generate/refine: dueño de los adjuntos", () => {
  it("RECHAZA (403) un adjunto de otro usuario sin leerlo", async () => {
    const r = await corregir([ajeno]);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe(MENSAJE_BLOB_AJENO);
    expect(get).not.toHaveBeenCalled();
    expect(db.generation.findFirst).not.toHaveBeenCalled();
  });

  it("basta UN adjunto ajeno entre los propios", async () => {
    const r = await corregir([propio, ajeno]);
    expect(r.status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it("rechaza las rutas de antes, los trucos de ruta y los hosts ajenos", async () => {
    for (const url of [
      `${HOST}/corrections/1700000-adicional.txt`,
      `${HOST}/subidas/${U1}/../${U2}/corrections/a.txt`,
      `${HOST}/subidas/${U1}%2F..%2F${U2}/a.txt`,
      `https://servidor-del-atacante.example/subidas/${U1}/a.txt`,
      "http://169.254.169.254/latest/meta-data/",
    ]) {
      expect((await corregir([archivo(url)])).status, url).toBe(403);
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("con adjuntos propios pasa la comprobación y sigue el flujo normal (aquí, generación inexistente: 404)", async () => {
    const r = await corregir([propio]);
    expect(r.status).toBe(404);
    expect(db.generation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "gen1", userId: U1 } }));
  });

  it("sin adjuntos sigue igual", async () => {
    expect((await corregir([])).status).toBe(404);
  });

  it("sin sesión responde 401", async () => {
    sesion.actual = null;
    expect((await corregir([propio])).status).toBe(401);
  });
});
