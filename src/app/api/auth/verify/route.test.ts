import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const db = vi.hoisted(() => ({
  verificationToken: { findFirst: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));

import { POST } from "./route";

const CODIGO = "123456";
const hashDe = (c: string) => crypto.createHash("sha256").update(c).digest("hex");
const peticion = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  db.verificationToken.findFirst.mockResolvedValue({ identifier: "ana@x.co", token: hashDe(CODIGO) });
  db.user.findUnique.mockResolvedValue({ passwordHash: "$2a$12$previa-de-otro" });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/auth/verify — quien verifica fija la contraseña", () => {
  it("sin contraseña no verifica ni toca la cuenta", async () => {
    const r = await POST(peticion({ email: "ana@x.co", code: CODIGO }));
    expect(r.status).toBe(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("una contraseña de menos de 8 caracteres se rechaza", async () => {
    const r = await POST(peticion({ email: "ana@x.co", code: CODIGO, password: "corta7c" }));
    expect(r.status).toBe(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("con el código bueno, reemplaza la contraseña previa por la de quien verifica", async () => {
    const r = await POST(peticion({ email: "ana@x.co", code: CODIGO, password: "mi-clave-nueva" }));
    expect(r.status).toBe(200);
    const llamada = db.user.updateMany.mock.calls[0][0];
    expect(llamada.where).toEqual({ email: "ana@x.co", emailVerified: null });
    expect(llamada.data.emailVerified).toBeInstanceOf(Date);
    expect(await bcrypt.compare("mi-clave-nueva", llamada.data.passwordHash)).toBe(true);
    expect(await bcrypt.compare("$2a$12$previa-de-otro", llamada.data.passwordHash)).toBe(false);
  });

  it("código inválido: no cambia nada", async () => {
    db.verificationToken.findFirst.mockResolvedValue(null);
    const r = await POST(peticion({ email: "ana@x.co", code: "000000", password: "mi-clave-nueva" }));
    expect(r.status).toBe(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("una cuenta de Google (sin contraseña) no recibe una contraseña desde aquí", async () => {
    db.user.findUnique.mockResolvedValue({ passwordHash: null });
    const r = await POST(peticion({ email: "ana@x.co", code: CODIGO, password: "mi-clave-nueva" }));
    expect(r.status).toBe(409);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("si la cuenta se verificó en el mismo instante, solo una gana", async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const r = await POST(peticion({ email: "ana@x.co", code: CODIGO, password: "mi-clave-nueva" }));
    expect(r.status).toBe(409);
  });
});
