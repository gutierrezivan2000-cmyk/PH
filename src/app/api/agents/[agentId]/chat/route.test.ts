import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, get, sesion } = vi.hoisted(() => ({
  db: { subscription: { findUnique: vi.fn(), findFirst: vi.fn() } },
  get: vi.fn(),
  sesion: { actual: null as { user?: { id?: string; email?: string } } | null },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => get(...a), put: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: async () => ({ allowed: true, status: "active" }) }));
vi.mock("@/lib/modulos-acceso", () => ({ modulosDeLaCuenta: async () => [] }));

import { POST } from "./route";
import { MENSAJE_BLOB_AJENO } from "@/lib/blob-owner";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const adjunto = (url: string, name = "foto.png", type = "image/png") => ({ name, url, type, size: 1000 });
const propio = adjunto(`${HOST}/subidas/${U1}/agent-files/foto-AbC123.png`);
const ajeno = adjunto(`${HOST}/subidas/${U2}/agent-files/foto-AbC123.png`);

const enviar = (attachments: unknown) =>
  POST(
    new Request("http://localhost:3000/api/agents/themis/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Resume este archivo", attachments }),
    }) as never,
    { params: Promise.resolve({ agentId: "themis" }) }
  );

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  // Sin clave de IA el flujo se corta justo DESPUÉS de la comprobación de los adjuntos: sirve de testigo de que se pasó.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.actual = { user: { id: U1, email: "admin@ph.co" } };
  get.mockReset();
  db.subscription.findUnique.mockReset().mockResolvedValue({ addonAgents: [] });
  db.subscription.findFirst.mockReset().mockResolvedValue(null);
});

describe("POST /api/agents/[agentId]/chat: dueño de los adjuntos", () => {
  it("RECHAZA (403) un adjunto de otro usuario sin descargarlo ni pasarlo a la IA", async () => {
    const r = await enviar([ajeno]);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe(MENSAJE_BLOB_AJENO);
    expect(get).not.toHaveBeenCalled();
  });

  it("basta UN adjunto ajeno entre los propios: se rechaza la petición entera", async () => {
    const r = await enviar([propio, ajeno]);
    expect(r.status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it("rechaza las rutas de antes, los trucos de ruta, los hosts ajenos y las URLs relativas", async () => {
    for (const url of [
      `${HOST}/agent-files/1700000-foto.png`,
      `${HOST}/agent-files/${U1}/informe.xlsx`,
      `${HOST}/subidas/${U1}/../${U2}/agent-files/foto.png`,
      `${HOST}/subidas/${U1}%2F..%2F${U2}/foto.png`,
      `${HOST}/subidas/${U2}/foto.png?x=/subidas/${U1}/a.png`,
      `https://servidor-del-atacante.example/subidas/${U1}/foto.png`,
      "http://169.254.169.254/latest/meta-data/",
      `/api/agents/files?t=abc`,
    ]) {
      expect((await enviar([adjunto(url)])).status, url).toBe(403);
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("con adjuntos propios pasa la comprobación (aquí se corta después, por no haber clave de IA)", async () => {
    const r = await enviar([propio]);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/servicio de IA no esta configurado/);
  });

  it("sin adjuntos sigue el flujo normal", async () => {
    expect((await enviar([])).status).toBe(500);
    expect((await enviar(undefined)).status).toBe(500);
  });

  it("sin sesión responde 401", async () => {
    sesion.actual = null;
    expect((await enviar([propio])).status).toBe(401);
  });
});
