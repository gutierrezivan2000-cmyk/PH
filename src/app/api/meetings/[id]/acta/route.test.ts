import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  usage: vi.fn(),
  iniciar: vi.fn(),
  reanudar: vi.fn(),
  leer: vi.fn(),
  count: vi.fn(),
  tx: vi.fn(),
  lock: vi.fn(),
  orden: [] as string[],
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      m.orden.push("tx-abre");
      const r = await fn({ $executeRaw: async (...a: unknown[]) => { m.orden.push("candado"); m.lock(...a); }, generation: { count: (...a: unknown[]) => m.count(...a) } });
      m.orden.push("tx-cierra");
      return r;
    },
  },
}));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/usage", () => ({ checkUsageLimits: (...a: unknown[]) => m.usage(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => m.rateLimit(...a) }));
vi.mock("@/lib/meetings/acta-orquestador", () => ({
  iniciarActa: (...a: unknown[]) => { m.orden.push("iniciar"); return m.iniciar(...a); },
  reanudarActa: (...a: unknown[]) => m.reanudar(...a),
}));
vi.mock("@/lib/meetings/acta-estado", () => ({ leerActa: (...a: unknown[]) => m.leer(...a) }));
vi.mock("@/lib/meetings/acceso", () => ({
  exigirVisible: async () => ({ ctx: { userId: "u1", demo: false } }),
  reunionDelUsuario: async () => ({ status: "lista" }),
}));
vi.mock("@/lib/meetings/almacen-blob", () => ({ almacenBlob: () => ({}) }));
vi.mock("@/lib/meetings/cola", () => ({ hayTrabajoSinAtender: async () => false }));
vi.mock("@/lib/meetings/demo-acta", () => ({ demoActa: vi.fn(), demoIniciarActa: vi.fn() }));
vi.mock("@/lib/meetings/empujon", () => ({ empujar: vi.fn() }));

import { POST } from "./route";

const pedir = (cuerpo: unknown = {}) =>
  POST(new Request("http://localhost/api/meetings/r1/acta", { method: "POST", body: JSON.stringify(cuerpo) }) as never, { params: Promise.resolve({ id: "r1" }) });

beforeEach(() => {
  m.orden.length = 0;
  m.rateLimit.mockReset().mockResolvedValue({ allowed: true });
  m.usage.mockReset().mockResolvedValue({ allowed: true });
  m.iniciar.mockReset().mockImplementation(async (a: { comprobarCupo: () => Promise<unknown> }) => {
    await a.comprobarCupo();
    return { ok: true, generationId: "g1", yaEnCurso: false };
  });
  m.reanudar.mockReset().mockResolvedValue({ ok: true });
  m.leer.mockReset().mockResolvedValue({ acta: { id: "g1" } });
  m.lock.mockReset();
  m.count.mockReset().mockResolvedValue(0);
});

describe("POST /api/meetings/[id]/acta: cupo sin carreras", () => {
  it("toma el candado de generación del usuario ANTES de comprobar el cupo y crear el acta, y lo suelta después", async () => {
    const r = await pedir();
    expect(r.status).toBe(201);
    expect(m.orden).toEqual(["tx-abre", "candado", "iniciar", "tx-cierra"]);
    const plantilla = m.lock.mock.calls[0][0] as string[];
    expect(plantilla.join("?")).toContain("pg_advisory_xact_lock(hashtext(");
    expect(m.lock.mock.calls[0][1]).toBe("generate:u1"); // misma clave que generate/full
    expect(m.usage).toHaveBeenCalledWith("u1");
  });

  it("frena la ráfaga con 429 y Retry-After, sin abrir transacción ni crear nada", async () => {
    m.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 17 });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("17");
    expect(m.rateLimit).toHaveBeenCalledWith("acta:u1", { max: 3, windowMs: 60_000 });
    expect(m.orden).toEqual([]);
    expect(m.iniciar).not.toHaveBeenCalled();
  });

  it("con el tope de actas en curso (de otras reuniones) responde 429 sin crear otra", async () => {
    m.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const r = await pedir();
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/redactándose/);
    expect(m.iniciar).not.toHaveBeenCalled();
  });

  it("un doble clic sobre la reunión que ya tiene un acta en curso no choca con el tope: devuelve la existente (200)", async () => {
    m.count.mockResolvedValueOnce(1);
    m.iniciar.mockResolvedValue({ ok: true, generationId: "g1", yaEnCurso: true });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).yaEnCurso).toBe(true);
  });

  it("si el plan no tiene más generaciones, el límite del uso se traduce a 429 con su mensaje", async () => {
    m.iniciar.mockResolvedValue({ ok: false, codigo: "sin_cupo", error: "Llegaste al límite." });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe("Llegaste al límite.");
  });

  it("reanudar también corre bajo el candado y con el tope", async () => {
    const r = await pedir({ reanudar: "g0" });
    expect(r.status).toBe(200);
    expect(m.orden.slice(0, 2)).toEqual(["tx-abre", "candado"]);
    expect(m.reanudar).toHaveBeenCalledWith("r1", "g0", expect.any(Date), expect.any(Function));
    expect(m.iniciar).not.toHaveBeenCalled();
  });
});
