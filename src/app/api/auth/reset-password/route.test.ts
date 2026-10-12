import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const db = vi.hoisted(() => ({
  verificationToken: { findFirst: vi.fn(), deleteMany: vi.fn() },
  user: { updateMany: vi.fn() },
}));
const limite = vi.hoisted(() => ({ rateLimit: vi.fn(), clientIp: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => limite);
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: vi.fn(async () => {}) }));

import { POST } from "./route";

const TOKEN = "a".repeat(64);
const hashDe = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const peticion = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const valida = { email: "ana@x.co", token: TOKEN, password: "mi-clave-nueva" };

beforeEach(() => {
  vi.clearAllMocks();
  limite.clientIp.mockReturnValue("1.2.3.4");
  limite.rateLimit.mockResolvedValue({ allowed: true });
  db.verificationToken.findFirst.mockResolvedValue({ identifier: "pwreset:ana@x.co", token: hashDe(TOKEN) });
  db.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
  db.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/auth/reset-password — freno por IP", () => {
  it("limita por IP y falla CERRADO si la base de contadores cae", async () => {
    const r = await POST(peticion({ ...valida, email: " Ana@X.co " }));
    expect(r.status).toBe(200);
    expect(limite.rateLimit).toHaveBeenCalledTimes(1);
    expect(limite.rateLimit).toHaveBeenCalledWith("reset:ip:1.2.3.4", {
      max: 20,
      windowMs: 15 * 60 * 1000,
      failClosed: true,
    });
  });

  it("no limita por correo: nadie puede bloquear el restablecimiento de otra persona", async () => {
    await POST(peticion(valida));
    const claves = limite.rateLimit.mock.calls.map((c) => String(c[0]));
    expect(claves.some((k) => k.includes("ana@x.co"))).toBe(false);
  });

  it("pasado el límite responde 429 sin consultar el token ni tocar la cuenta", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 300 });
    const r = await POST(peticion(valida));
    expect(r.status).toBe(429);
    expect(db.verificationToken.findFirst).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("con el contador caído (failClosed) responde 429 y no toca la cuenta", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30, unavailable: true });
    const r = await POST(peticion(valida));
    expect(r.status).toBe(429);
    expect(db.verificationToken.findFirst).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("datos incompletos o contraseña corta se rechazan antes y no gastan intentos", async () => {
    expect((await POST(peticion({ email: "ana@x.co", token: TOKEN }))).status).toBe(400);
    expect((await POST(peticion({ ...valida, password: "corta7c" }))).status).toBe(400);
    expect(limite.rateLimit).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password — comportamiento que no cambió", () => {
  it("token inválido o vencido: 400 y no cambia nada", async () => {
    db.verificationToken.findFirst.mockResolvedValue(null);
    const r = await POST(peticion(valida));
    expect(r.status).toBe(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("busca el token por su hash con el prefijo pwreset: y vigente", async () => {
    await POST(peticion(valida));
    const { where } = db.verificationToken.findFirst.mock.calls[0][0];
    expect(where.identifier).toBe("pwreset:ana@x.co");
    expect(where.token).toBe(hashDe(TOKEN));
    expect(where.expires.gt).toBeInstanceOf(Date);
  });

  it("con el token bueno cambia la contraseña, verifica la cuenta y desconecta sesiones previas", async () => {
    const r = await POST(peticion(valida));
    expect(r.status).toBe(200);
    const { where, data } = db.user.updateMany.mock.calls[0][0];
    expect(where).toEqual({ email: "ana@x.co" });
    expect(data.emailVerified).toBeInstanceOf(Date);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(await bcrypt.compare("mi-clave-nueva", data.passwordHash)).toBe(true);
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: "pwreset:ana@x.co" } });
  });

  it("cuenta inexistente: 400 y no gasta el token", async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const r = await POST(peticion(valida));
    expect(r.status).toBe(400);
    expect(db.verificationToken.deleteMany).not.toHaveBeenCalled();
  });
});
