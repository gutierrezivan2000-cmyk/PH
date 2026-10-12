import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ count: vi.fn(), create: vi.fn(), propiedad: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { meeting: { count: (...a: unknown[]) => m.count(...a), create: (...a: unknown[]) => m.create(...a), findMany: vi.fn() } } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/demo-store", () => ({ getPropertyById: vi.fn() }));
vi.mock("@/lib/meetings/acceso", () => ({
  exigirVisible: async () => ({ ctx: { userId: "u1", demo: false } }),
  propiedadDelUsuario: (...a: unknown[]) => m.propiedad(...a),
}));
vi.mock("@/lib/meetings/mapeo", () => ({ aResumen: (f: unknown) => f }));

import { POST } from "./route";

const MAX_BORRADORES = 30;

const pedir = () =>
  POST(new Request("http://localhost/api/meetings", { method: "POST", body: JSON.stringify({ propertyId: "p1" }) }) as never);

beforeEach(() => {
  m.propiedad.mockReset().mockResolvedValue({ id: "p1" });
  m.count.mockReset().mockResolvedValue(0);
  m.create.mockReset().mockResolvedValue({ id: "r1" });
});

describe("POST /api/meetings: tope de borradores", () => {
  it("crea la reunión si hay menos borradores que el tope", async () => {
    m.count.mockResolvedValue(MAX_BORRADORES - 1);
    const r = await pedir();
    expect(r.status).toBe(201);
    expect(m.count).toHaveBeenCalledWith({ where: { userId: "u1", status: "borrador", audioUrl: null } });
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("responde 429 y no crea nada al llegar al tope", async () => {
    m.count.mockResolvedValue(MAX_BORRADORES);
    const r = await pedir();
    expect(r.status).toBe(429);
    expect(m.create).not.toHaveBeenCalled();
  });
});
