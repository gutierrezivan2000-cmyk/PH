import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, acceso, parseFile, generateWithClaude } = vi.hoisted(() => ({
  db: { property: { findFirst: vi.fn() } },
  acceso: { allowed: true },
  parseFile: vi.fn(),
  generateWithClaude: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: async () => ({ allowed: acceso.allowed, status: "x" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/consumo/registrar", () => ({ conConsumo: async (_o: unknown, fn: () => unknown) => fn() }));
vi.mock("@/lib/parsers", () => ({ detectFileType: () => "text", parseFile }));
vi.mock("@/lib/ai-client", () => ({ generateWithClaude }));

import { POST } from "./route";

const llamar = () => {
  const form = new FormData();
  form.set("file", new File(["Ascensor A, 2026-12-01"], "bitacora.csv", { type: "text/csv" }));
  return POST({ formData: async () => form } as never, { params: Promise.resolve({ propertyId: "p1" }) });
};

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  acceso.allowed = true;
  db.property.findFirst.mockReset().mockResolvedValue({ id: "p1" });
  parseFile.mockReset().mockResolvedValue({ text: "Ascensor A, 2026-12-01" });
  generateWithClaude.mockReset().mockResolvedValue({
    text: '[{"kind":"zona_comun","name":"Ascensor A","dueDate":"2026-12-01"}]',
  });
});

describe("POST common-assets/import", () => {
  it("sin prueba ni plan activo: 403 y no se consume IA", async () => {
    acceso.allowed = false;
    const r = await llamar();
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/suscripción/);
    expect(parseFile).not.toHaveBeenCalled();
    expect(generateWithClaude).not.toHaveBeenCalled();
  });

  it("con acceso activo: importa normalmente", async () => {
    const r = await llamar();
    expect(r.status).toBe(200);
    expect((await r.json()).assets).toHaveLength(1);
    expect(generateWithClaude).toHaveBeenCalledTimes(1);
  });
});
