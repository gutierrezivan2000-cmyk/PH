import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  verificationToken: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
}));
const limite = vi.hoisted(() => ({ rateLimit: vi.fn(), clientIp: vi.fn() }));
const correo = vi.hoisted(() => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => limite);
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => correo);

import { POST } from "./route";

const HORA = 60 * 60 * 1000;
const peticion = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  limite.clientIp.mockReturnValue("1.2.3.4");
  limite.rateLimit.mockResolvedValue({ allowed: true });
  db.user.findUnique.mockResolvedValue({ email: "ana@x.co", emailVerified: null });
  db.verificationToken.findFirst.mockResolvedValue(null);
  db.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  db.verificationToken.create.mockResolvedValue({});
  correo.sendVerificationEmail.mockResolvedValue(undefined);
});

describe("POST /api/auth/resend-code — freno por IP y por correo", () => {
  it("ambos límites se piden con failClosed (este endpoint envía correos)", async () => {
    const r = await POST(peticion({ email: " Ana@X.co " }));
    expect(r.status).toBe(200);
    expect(limite.rateLimit).toHaveBeenCalledTimes(2);
    expect(limite.rateLimit).toHaveBeenCalledWith("resend:ip:1.2.3.4", {
      max: 10,
      windowMs: HORA,
      failClosed: true,
    });
    expect(limite.rateLimit).toHaveBeenCalledWith("resend:email:ana@x.co", {
      max: 5,
      windowMs: HORA,
      failClosed: true,
    });
  });

  it("si la IP pasó el límite responde 429 y no toca usuarios ni envía correo", async () => {
    limite.rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("resend:ip:") ? { allowed: false, retryAfterSec: 90 } : { allowed: true }
    );
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(429);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("si el correo pasó el límite responde 429 y no envía nada", async () => {
    limite.rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("resend:email:") ? { allowed: false, retryAfterSec: 90 } : { allowed: true }
    );
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(429);
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("con el contador caído (failClosed) no se envían correos sin freno", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30, unavailable: true });
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(429);
    expect(db.verificationToken.create).not.toHaveBeenCalled();
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("sin correo responde 400 y no gasta intentos", async () => {
    const r = await POST(peticion({}));
    expect(r.status).toBe(400);
    expect(limite.rateLimit).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/resend-code — comportamiento que no cambió", () => {
  it("cuenta sin verificar: guarda el código nuevo (solo su hash) y envía el correo", async () => {
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(200);
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: "ana@x.co" } });
    const guardado = db.verificationToken.create.mock.calls[0][0].data;
    expect(guardado.identifier).toBe("ana@x.co");
    expect(guardado.token).toMatch(/^[0-9a-f]{64}$/);
    expect(correo.sendVerificationEmail).toHaveBeenCalledWith("ana@x.co", expect.stringMatching(/^\d{6}$/));
  });

  it("correo desconocido: responde igual y no envía nada (no revela si existe)", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const r = await POST(peticion({ email: "nadie@x.co" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true });
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("cuenta ya verificada: responde igual y no envía nada", async () => {
    db.user.findUnique.mockResolvedValue({ email: "ana@x.co", emailVerified: new Date() });
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(200);
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("con un código reciente pide esperar un minuto", async () => {
    db.verificationToken.findFirst.mockResolvedValue({ identifier: "ana@x.co" });
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(429);
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/resend-code — formato de correo", () => {
  it("un correo con ':' o espacios no crea ningún token (no se puede plantar 'pwreset:')", async () => {
    for (const email of ["pwreset:ana@x.co", "ana@x.co:1", "a na@x.co", 5, { a: 1 }]) {
      const r = await POST(peticion({ email }));
      expect(r.status).toBe(400);
    }
    expect(db.verificationToken.create).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(limite.rateLimit).not.toHaveBeenCalled();
  });
});
