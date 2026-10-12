import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  property: { findFirst: vi.fn() },
  unit: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  announcement: { create: vi.fn() },
}));
const sesion = vi.hoisted(() => ({ auth: vi.fn() }));
const modulos = vi.hoisted(() => ({ exigirModulo: vi.fn() }));
const uso = vi.hoisted(() => ({ checkSubscriptionAccess: vi.fn() }));
const cuota = vi.hoisted(() => ({ getEmailQuota: vi.fn(), getEmailsSentThisMonth: vi.fn(), reservarEmails: vi.fn(), liberarEmails: vi.fn() }));
const correo = vi.hoisted(() => ({ sendAnnouncementEmails: vi.fn(), textToEmailHtml: vi.fn() }));
const limite = vi.hoisted(() => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => sesion);
vi.mock("@/lib/modulos-acceso", () => modulos);
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: vi.fn() }));
vi.mock("@/lib/usage", () => uso);
vi.mock("@/lib/email-quota", () => cuota);
vi.mock("@/lib/email", () => correo);
vi.mock("@/lib/rate-limit", () => limite);
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: vi.fn() }));

const peticion = (body: unknown) =>
  ({ json: async () => body, headers: new Headers() }) as unknown as NextRequest;
const cuerpo = { propertyId: "p1", subject: "Aviso", content: "Hola vecinos" };

async function cargarRuta() {
  vi.resetModules();
  return (await import("./route")).POST;
}

let errores: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEMO_MODE", "false");
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.auth.mockResolvedValue({ user: { id: "adm1" } });
  modulos.exigirModulo.mockResolvedValue({});
  uso.checkSubscriptionAccess.mockResolvedValue({ allowed: true, status: "active" });
  db.property.findFirst.mockResolvedValue({ id: "p1", name: "Los Pinos" });
  db.unit.findMany.mockResolvedValue([{ email: "a@x.co" }, { email: "b@x.co" }]);
  db.user.findUnique.mockResolvedValue({ name: "Ana", email: "ana@admin.co", company: null, logoUrl: null, brandColor: null });
  db.announcement.create.mockResolvedValue({ id: "an1", subject: "Aviso" });
  cuota.getEmailQuota.mockResolvedValue(500);
  cuota.reservarEmails.mockResolvedValue({ allowed: true, used: 2, quota: 500 });
  cuota.liberarEmails.mockResolvedValue(undefined);
  correo.textToEmailHtml.mockReturnValue("<p>Hola</p>");
  correo.sendAnnouncementEmails.mockResolvedValue({ sent: 2, failed: 0 });
  limite.rateLimit.mockResolvedValue({ allowed: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  void errores;
});

describe("POST /api/announcements — freno de ráfagas", () => {
  it("usa un límite por usuario que deniega si la base falla", async () => {
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(201);
    expect(limite.rateLimit).toHaveBeenCalledWith("announce:adm1", { max: 3, windowMs: 60_000, failClosed: true });
  });

  it("al superar el límite responde 429 y no revisa cuota ni envía", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 42 });
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("42");
    expect(cuota.reservarEmails).not.toHaveBeenCalled();
    expect(correo.sendAnnouncementEmails).not.toHaveBeenCalled();
  });

  it("si la base falla (failClosed) responde 503 y no envía", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30, unavailable: true });
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(503);
    expect(correo.sendAnnouncementEmails).not.toHaveBeenCalled();
  });

  it("una cuota mensual agotada sigue respondiendo 403", async () => {
    cuota.reservarEmails.mockResolvedValue({ allowed: false, reason: "Supera la cuota" });
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(403);
    expect(correo.sendAnnouncementEmails).not.toHaveBeenCalled();
  });
});

describe("POST /api/announcements — reserva atómica de cuota", () => {
  it("reserva ANTES de enviar, con la cuota del plan", async () => {
    const orden: string[] = [];
    cuota.reservarEmails.mockImplementation(async () => (orden.push("reservar"), { allowed: true, used: 2, quota: 500 }));
    correo.sendAnnouncementEmails.mockImplementation(async () => (orden.push("enviar"), { sent: 2, failed: 0 }));
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(201);
    expect(orden).toEqual(["reservar", "enviar"]);
    expect(cuota.reservarEmails).toHaveBeenCalledWith("adm1", 2, 500);
    expect(cuota.liberarEmails).toHaveBeenCalledWith("adm1", 0);
  });

  it("devuelve a la cuota lo que no se pudo enviar", async () => {
    correo.sendAnnouncementEmails.mockResolvedValue({ sent: 1, failed: 1 });
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(201);
    expect(cuota.liberarEmails).toHaveBeenCalledWith("adm1", 1);
  });

  it("si no se envió ninguno (502) libera toda la reserva", async () => {
    correo.sendAnnouncementEmails.mockResolvedValue({ sent: 0, failed: 2 });
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(502);
    expect(cuota.liberarEmails).toHaveBeenCalledWith("adm1", 2);
  });

  it("si el envío lanza, libera toda la reserva y responde 500", async () => {
    correo.sendAnnouncementEmails.mockRejectedValue(new Error("smtp"));
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(500);
    expect(cuota.liberarEmails).toHaveBeenCalledWith("adm1", 2);
  });

  it("sobre la cuota: 403 con code email_quota y no envía", async () => {
    cuota.reservarEmails.mockResolvedValue({ allowed: false, reason: "Supera la cuota" });
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("email_quota");
    expect(correo.sendAnnouncementEmails).not.toHaveBeenCalled();
  });

  it("si la reserva no está disponible (base caída) responde 503 y no envía", async () => {
    cuota.reservarEmails.mockResolvedValue({ allowed: false, unavailable: true, reason: "No disponible" });
    const POST = await cargarRuta();
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(503);
    expect(correo.sendAnnouncementEmails).not.toHaveBeenCalled();
  });
});
