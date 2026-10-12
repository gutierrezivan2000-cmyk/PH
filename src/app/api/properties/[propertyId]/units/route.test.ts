import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, sesion } = vi.hoisted(() => ({
  db: {
    property: { findFirst: vi.fn() },
    unit: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), update: vi.fn() },
  },
  sesion: { actual: null as { user?: { id?: string } } | null },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: async () => {} }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));

import { POST, PATCH } from "./route";

const ctx = { params: Promise.resolve({ propertyId: "prop1" }) };
const post = (body: unknown) =>
  POST(new Request("http://localhost:3000/api/properties/prop1/units", { method: "POST", body: JSON.stringify(body) }) as never, ctx);
const patch = (body: unknown) =>
  PATCH(new Request("http://localhost:3000/api/properties/prop1/units", { method: "PATCH", body: JSON.stringify(body) }) as never, ctx);

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.actual = { user: { id: "u1" } };
  db.property.findFirst.mockReset().mockResolvedValue({ id: "prop1" });
  db.unit.count.mockReset().mockResolvedValue(0);
  db.unit.findMany.mockReset().mockResolvedValue([]);
  db.unit.findFirst.mockReset().mockResolvedValue({ id: "x" });
  db.unit.createMany.mockReset().mockResolvedValue({ count: 1 });
  db.unit.update.mockReset().mockResolvedValue({});
});

describe("POST units: correos", () => {
  it("sigue extrayendo el correo de una línea normal", async () => {
    const r = await post({ lines: "Apto 101, María, Maria@X.com, 350.000" });
    expect(r.status).toBe(201);
    expect(db.unit.createMany.mock.calls[0][0].data[0]).toMatchObject({ label: "Apto 101", email: "maria@x.com" });
  });

  it("una línea enorme sin '@' se procesa rápido (sin ReDoS)", async () => {
    const t0 = Date.now();
    const r = await post({ lines: "a".repeat(1_000_000) });
    expect(r.status).toBe(201);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("un correo enorme en units[] se descarta rápido", async () => {
    const t0 = Date.now();
    const r = await post({ units: [{ label: "x", email: "a".repeat(1_000_000) }] });
    expect(r.status).toBe(201);
    expect(db.unit.createMany.mock.calls[0][0].data[0].email).toBeNull();
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("PATCH units: correo", () => {
  it("rechaza (400) un correo de más de 254 caracteres", async () => {
    const r = await patch({ id: "x", email: `${"a".repeat(60)}@${"b".repeat(250)}.com` });
    expect(r.status).toBe(400);
    expect(db.unit.update).not.toHaveBeenCalled();
  });

  it("acepta un correo válido", async () => {
    const r = await patch({ id: "x", email: "Ana@Casa.co" });
    expect(r.status).toBe(200);
    expect(db.unit.update).toHaveBeenCalledWith({ where: { id: "x" }, data: { email: "ana@casa.co" } });
  });
});
