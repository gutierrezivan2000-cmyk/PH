/**
 * Chat: la lectura de los adjuntos recibe quién los envía. La validación de la lista (route.test.ts) ya rechaza los ajenos; esto
 * prueba que además parseAttachments los vuelve a comprobar, para que la lectura no dependa de esa validación.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, parseAttachments, sesion } = vi.hoisted(() => ({
  db: {
    subscription: { findUnique: vi.fn(), findFirst: vi.fn() },
    agentChat: { create: vi.fn(), findFirst: vi.fn() },
    agentMessage: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    agentMemory: { findFirst: vi.fn() },
    agentChatFocus: { findFirst: vi.fn(), upsert: vi.fn() },
  },
  parseAttachments: vi.fn(),
  sesion: { actual: null as { user?: { id?: string; email?: string } } | null },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: async () => ({ allowed: true, status: "active" }) }));
vi.mock("@/lib/modulos-acceso", () => ({ modulosDeLaCuenta: async () => [] }));
vi.mock("@/lib/uso-chat-servidor", () => ({
  usoDelChat: async () => null,
  cupoDeAudioMensual: async () => ({ bloqueado: false }),
  limitesDelPlan: () => ({ transcriptionMinutesPerDay: 100 }),
}));
vi.mock("@/lib/ensure-operacion-schema", () => ({ ensureOperacionSchema: async () => {} }));
vi.mock("@/lib/agentes/briefing-datos", () => ({ contextoOperativo: async () => ({ texto: "", propertyId: null }) }));
vi.mock("@/lib/consumo/registrar", () => ({
  // Sin contexto de medición: se ejecuta tal cual lo que se le pasa.
  conConsumo: async (_contexto: unknown, fn: () => unknown) => fn(),
  registrarConsumo: vi.fn(),
}));
vi.mock("@/lib/parse-attachment", () => ({
  parseAttachments: (...a: unknown[]) => parseAttachments(...a),
  seTranscribe: () => false,
}));
// La llamada a la IA es lo último que hace la ruta: si el cliente no se puede crear, responde con error y la prueba ya tiene lo que necesita.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      throw new Error("sin IA en las pruebas");
    }
  },
}));

import { POST } from "./route";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const adjunto = (name: string) => ({ name, url: `${HOST}/subidas/${U1}/agent-files/${name}-AbC123`, type: "application/pdf", size: 1000 });

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
  vi.stubEnv("ANTHROPIC_API_KEY", "clave-de-prueba");
  vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.actual = { user: { id: U1, email: "admin@ph.co" } };
  db.subscription.findUnique.mockReset().mockResolvedValue({ addonAgents: [] });
  db.subscription.findFirst.mockReset().mockResolvedValue(null);
  db.agentChat.create.mockReset().mockResolvedValue({ id: "chat1" });
  db.agentMessage.create.mockReset().mockResolvedValue({});
  db.agentMessage.count.mockReset().mockResolvedValue(1);
  db.agentMessage.findMany.mockReset().mockResolvedValue([]);
  db.agentMemory.findFirst.mockReset().mockResolvedValue(null);
  db.agentChatFocus.findFirst.mockReset().mockResolvedValue(null);
  db.agentChatFocus.upsert.mockReset().mockResolvedValue({});
  parseAttachments.mockReset().mockResolvedValue([]);
});

describe("POST /api/agents/[agentId]/chat: la lectura de adjuntos recibe al dueño", () => {
  it("llama a parseAttachments con los adjuntos y el id de la sesión como dueño", async () => {
    const adj = [adjunto("acta.pdf"), adjunto("informe.pdf")];
    await enviar(adj);
    expect(parseAttachments).toHaveBeenCalledTimes(1);
    const [lista, dueno] = parseAttachments.mock.calls[0];
    expect(lista).toEqual(adj);
    expect(dueno).toEqual({ userId: U1 });
  });

  it("con un adjunto ajeno la petición se rechaza (403) antes de leer nada", async () => {
    const r = await enviar([adjunto("acta.pdf"), { ...adjunto("secreto.pdf"), url: `${HOST}/subidas/otro-usuario/agent-files/secreto-AbC123` }]);
    expect(r.status).toBe(403);
    expect(parseAttachments).not.toHaveBeenCalled();
  });

  it("sin adjuntos no se llama a parseAttachments", async () => {
    await enviar([]);
    await enviar(undefined);
    expect(parseAttachments).not.toHaveBeenCalled();
  });
});
