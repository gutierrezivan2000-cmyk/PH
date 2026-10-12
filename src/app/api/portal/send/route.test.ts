import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  property: { findFirst: vi.fn() },
  unit: { findMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const cartera = vi.hoisted(() => ({ requireCartera: vi.fn() }));
const correo = vi.hoisted(() => ({ sendPortalLinkEmails: vi.fn() }));
const cuota = vi.hoisted(() => ({ checkEmailQuota: vi.fn(), recordEmailsSent: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/cartera-server", () => cartera);
vi.mock("@/lib/email", () => correo);
vi.mock("@/lib/email-quota", () => cuota);

/** La cabecera Host puede ser la del panel de administración (otro subdominio): el enlace no debe salir de ahí. */
const peticion = (body: unknown) =>
  ({ json: async () => body, headers: new Headers({ host: "admin.ejemplo.co" }) }) as unknown as NextRequest;

async function cargarRuta() {
  vi.resetModules();
  return (await import("./route")).POST;
}

let errores: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.ejemplo.co");
  errores = vi.spyOn(console, "error").mockImplementation(() => {});

  cartera.requireCartera.mockResolvedValue({ userId: "adm1", accessStatus: "active" });
  db.property.findFirst.mockResolvedValue({ id: "p1", name: "Los Pinos" });
  db.unit.findMany.mockResolvedValue([{ id: "un1", label: "Apto 101", email: "res@x.co", portalToken: null }]);
  db.unit.update.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ name: "Ana", email: "ana@admin.co", company: null, logoUrl: null, brandColor: null });
  cuota.checkEmailQuota.mockResolvedValue({ allowed: true });
  cuota.recordEmailsSent.mockResolvedValue(undefined);
  correo.sendPortalLinkEmails.mockResolvedValue({ sent: 1, failed: 0, failedUnits: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/portal/send — dirección del enlace (urlBase)", () => {
  it("el enlace sale con NEXT_PUBLIC_APP_URL y no con la cabecera Host", async () => {
    const POST = await cargarRuta();
    const r = await POST(peticion({ propertyId: "p1" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, sent: 1 });
    const { recipients } = correo.sendPortalLinkEmails.mock.calls[0][0];
    expect(recipients).toHaveLength(1);
    expect(recipients[0].url).toMatch(/^https:\/\/app\.ejemplo\.co\/u\/[A-Za-z0-9_-]{20}$/);
  });

  it("en producción sin ninguna dirección responde 500 en español y no genera tokens, ni gasta cupo, ni envía", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    const POST = await cargarRuta();
    const r = await POST(peticion({ propertyId: "p1" }));
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).toMatch(/dirección pública/);
    expect(error).not.toContain("localhost");
    expect(db.unit.update).not.toHaveBeenCalled();
    expect(cuota.checkEmailQuota).not.toHaveBeenCalled();
    expect(correo.sendPortalLinkEmails).not.toHaveBeenCalled();
    expect(cuota.recordEmailsSent).not.toHaveBeenCalled();
    expect(errores.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n")).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("sin propertyId sigue respondiendo 400", async () => {
    const POST = await cargarRuta();
    expect((await POST(peticion({}))).status).toBe(400);
  });
});
