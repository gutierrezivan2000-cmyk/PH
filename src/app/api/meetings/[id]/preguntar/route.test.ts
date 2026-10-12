import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  cupo: vi.fn(),
  responder: vi.fn(),
  registrar: vi.fn(),
  liberar: null as null | (() => void),
}));
vi.mock("@/lib/db", () => ({ db: { meetingUtterance: { findFirst: async () => ({ idx: 0 }) } } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/meetings/acceso", () => ({
  exigirVisible: async () => ({ ctx: { userId: "u1", demo: false } }),
  reunionDelUsuario: async () => ({ status: "lista" }),
}));
vi.mock("@/lib/meetings/cupo-preguntas", () => ({ TIPO_DE_USO_PREGUNTA: "preguntar", comprobarCupoDePreguntas: (...a: unknown[]) => m.cupo(...a) }));
vi.mock("@/lib/meetings/demo-preguntar", () => ({ demoPuedePreguntar: vi.fn(), demoResponderPregunta: vi.fn() }));
vi.mock("@/lib/meetings/ia", () => ({
  ErrorIA: class extends Error {},
  crearClienteIA: () => ({}),
  modeloDeReuniones: () => "modelo",
  tokensDeUso: () => 1,
}));
vi.mock("@/lib/meetings/preguntar-servidor", () => ({ responderPregunta: (...a: unknown[]) => m.responder(...a) }));
vi.mock("@/lib/consumo/registrar", () => ({ registrarConsumo: (...a: unknown[]) => m.registrar(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => m.rateLimit(...a) }));

import { POST } from "./route";

const pedir = () =>
  POST(
    new Request("http://localhost/api/meetings/r1/preguntar", { method: "POST", body: JSON.stringify({ pregunta: "resume" }) }) as never,
    { params: Promise.resolve({ id: "r1" }) },
  );
const consumir = async (r: Response) => { await r.text(); };

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "x");
  m.rateLimit.mockReset().mockResolvedValue({ allowed: true });
  m.cupo.mockReset().mockResolvedValue({ permitido: true });
  m.registrar.mockReset().mockResolvedValue(undefined);
  m.responder.mockReset().mockResolvedValue({
    ok: true,
    respuesta: { uso: { costoUsd: 0 }, modelo: "modelo", cortada: false },
  });
});

describe("POST /api/meetings/[id]/preguntar: freno a las ráfagas", () => {
  it("responde 429 con Retry-After, sin tocar el cupo ni la IA, si se pasa del ritmo por minuto", async () => {
    m.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 17 });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("17");
    expect(m.rateLimit).toHaveBeenCalledWith("preguntar:u1", expect.objectContaining({ max: 6, windowMs: 60_000, failClosed: true }));
    expect(m.cupo).not.toHaveBeenCalled();
    expect(m.responder).not.toHaveBeenCalled();
  });

  it("una pregunta normal sale bien y registra el consumo", async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    await consumir(r);
    expect(m.responder).toHaveBeenCalledTimes(1);
    expect(m.registrar).toHaveBeenCalledTimes(1);
  });

  it("limita a 2 respuestas simultáneas por persona y libera el puesto al terminar", async () => {
    const pendientes: Array<() => void> = [];
    m.responder.mockImplementation(
      () => new Promise((res) => pendientes.push(() => res({ ok: true, respuesta: { uso: { costoUsd: 0 }, modelo: "modelo", cortada: false } }))),
    );
    const r1 = await pedir();
    const r2 = await pedir();
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const r3 = await pedir();
    expect(r3.status).toBe(429);
    expect(m.responder).toHaveBeenCalledTimes(2);

    pendientes.forEach((f) => f());
    await consumir(r1);
    await consumir(r2);
    m.responder.mockResolvedValue({ ok: true, respuesta: { uso: { costoUsd: 0 }, modelo: "modelo", cortada: false } });
    const r4 = await pedir();
    expect(r4.status).toBe(200);
    await consumir(r4);
  });

  it("libera el puesto aunque la IA falle", async () => {
    m.responder.mockRejectedValue(new Error("boom"));
    for (let i = 0; i < 4; i++) {
      const r = await pedir();
      expect(r.status).toBe(200);
      await consumir(r);
    }
  });
});
