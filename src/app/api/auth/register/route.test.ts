import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  subscription: { create: vi.fn() },
  verificationToken: { deleteMany: vi.fn(), create: vi.fn() },
}));
const limite = vi.hoisted(() => ({ rateLimit: vi.fn(), clientIp: vi.fn() }));
const correo = vi.hoisted(() => ({ sendVerificationEmail: vi.fn() }));
const esquema = vi.hoisted(() => ({ ensureAdminSchema: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => limite);
vi.mock("@/lib/email", () => correo);
vi.mock("@/lib/ensure-admin-schema", () => esquema);
// bcrypt con costo 12 tarda cientos de ms por llamada: aquí solo importa que se pida el hash.
vi.mock("bcryptjs", () => {
  const hash = vi.fn(async () => "$hash-de-prueba");
  return { default: { hash }, hash };
});

import { POST } from "./route";

const MENSAJE_CAPTCHA = "No pudimos verificar que eres una persona. Intenta de nuevo.";
const SECRETO = "1x0000000000000000000000000000000AA";
const cuerpoValido = { email: "Ana@X.co", password: "una-clave-larga", name: "Ana", acepta: true };

const peticion = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const respuestaCloudflare = (cuerpo: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;

let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchFalso = vi.fn();
  vi.stubGlobal("fetch", fetchFalso);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});

  limite.clientIp.mockReturnValue("203.0.113.9");
  limite.rateLimit.mockResolvedValue({ allowed: true });
  esquema.ensureAdminSchema.mockResolvedValue(undefined);
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockResolvedValue({ id: "u1" });
  db.subscription.create.mockResolvedValue({});
  db.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  db.verificationToken.create.mockResolvedValue({});
  correo.sendVerificationEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/auth/register — captcha apagado (sin TURNSTILE_SECRET_KEY)", () => {
  it("crea la cuenta y manda el código como siempre, sin llamar a Cloudflare", async () => {
    const r = await POST(peticion(cuerpoValido));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ success: true, needsVerification: true, emailSent: true });
    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(correo.sendVerificationEmail).toHaveBeenCalledWith("ana@x.co", expect.stringMatching(/^\d{6}$/));
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("ignora un captchaToken que llegue de más", async () => {
    const r = await POST(peticion({ ...cuerpoValido, captchaToken: "lo-que-sea" }));
    expect(r.status).toBe(200);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/register — captcha encendido", () => {
  beforeEach(() => vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETO));

  it("sin captchaToken responde 400 con el mensaje y no toca la base de datos ni manda correo", async () => {
    const r = await POST(peticion(cuerpoValido));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: MENSAJE_CAPTCHA });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(esquema.ensureAdminSchema).not.toHaveBeenCalled();
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("con un token vacío o que no es texto tampoco pasa", async () => {
    for (const captchaToken of ["", "   ", 42, null]) {
      const r = await POST(peticion({ ...cuerpoValido, captchaToken }));
      expect(r.status).toBe(400);
    }
    expect(db.user.create).not.toHaveBeenCalled();
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("con token válido verifica con Cloudflare (llave, token e IP) y sigue el registro", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({ success: true }));
    const r = await POST(peticion({ ...cuerpoValido, captchaToken: "token-bueno" }));
    expect(r.status).toBe(200);

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const datos = new URLSearchParams(String(init.body));
    expect(datos.get("secret")).toBe(SECRETO);
    expect(datos.get("response")).toBe("token-bueno");
    expect(datos.get("remoteip")).toBe("203.0.113.9");

    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(correo.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("si Cloudflare rechaza el token responde 400 y no crea la cuenta ni manda el código", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({ success: false, "error-codes": ["invalid-input-response"] }));
    const r = await POST(peticion({ ...cuerpoValido, captchaToken: "token-malo" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: MENSAJE_CAPTCHA });
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.verificationToken.create).not.toHaveBeenCalled();
    expect(correo.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("si Cloudflare está caído falla ABIERTO: el registro sigue y los límites siguen aplicando", async () => {
    fetchFalso.mockRejectedValue(new TypeError("fetch failed"));
    const r = await POST(peticion({ ...cuerpoValido, captchaToken: "token-cualquiera" }));
    expect(r.status).toBe(200);
    expect(limite.rateLimit).toHaveBeenCalledWith("register:ip:203.0.113.9", expect.any(Object));
    expect(limite.rateLimit).toHaveBeenCalledWith("register:email:ana@x.co", expect.any(Object));
    expect(db.user.create).toHaveBeenCalledTimes(1);
  });

  it("aun con Cloudflare caído, pasado el límite por IP responde 429", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({}, 503));
    limite.rateLimit.mockImplementation(async (clave: string) => ({ allowed: !clave.startsWith("register:ip:") }));
    const r = await POST(peticion({ ...cuerpoValido, captchaToken: "token-cualquiera" }));
    expect(r.status).toBe(429);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("la validación de campos va primero: sin correo ni contraseña no se llama a Cloudflare", async () => {
    const r = await POST(peticion({ captchaToken: "token-bueno" }));
    expect(r.status).toBe(400);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
