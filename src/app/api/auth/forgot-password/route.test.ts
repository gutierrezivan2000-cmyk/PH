import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  verificationToken: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
}));
const limite = vi.hoisted(() => ({ rateLimit: vi.fn(), clientIp: vi.fn() }));
const correo = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => limite);
vi.mock("@/lib/email", () => correo);

import { POST } from "./route";

const NEUTRO = "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.";
const MENSAJE_CAPTCHA = "No pudimos verificar que eres una persona. Intenta de nuevo.";
const SECRETO = "1x0000000000000000000000000000000AA";

const peticion = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const respuestaCloudflare = (cuerpo: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;

let fetchFalso: ReturnType<typeof vi.fn>;
let errores: MockInstance<typeof console.error>;

/** El enlace que se le mandó al correo en la última llamada. */
const enlaceEnviado = (): string => String(correo.sendPasswordResetEmail.mock.calls.at(-1)?.[1]);

beforeEach(() => {
  vi.clearAllMocks();
  fetchFalso = vi.fn();
  vi.stubGlobal("fetch", fetchFalso);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.ejemplo.co");
  errores = vi.spyOn(console, "error").mockImplementation(() => {});

  limite.clientIp.mockReturnValue("203.0.113.9");
  limite.rateLimit.mockResolvedValue({ allowed: true });
  db.user.findUnique.mockResolvedValue({ email: "ana@x.co", passwordHash: "$2a$12$hash" });
  db.verificationToken.findFirst.mockResolvedValue(null);
  db.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  db.verificationToken.create.mockResolvedValue({});
  correo.sendPasswordResetEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/auth/forgot-password — captcha apagado (sin TURNSTILE_SECRET_KEY)", () => {
  it("manda el enlace como siempre y no llama a Cloudflare", async () => {
    const r = await POST(peticion({ email: " Ana@X.co " }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, message: NEUTRO });
    expect(correo.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(correo.sendPasswordResetEmail.mock.calls[0][0]).toBe("ana@x.co");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("sin correo responde 400", async () => {
    const r = await POST(peticion({}));
    expect(r.status).toBe(400);
    expect(correo.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/forgot-password — captcha encendido", () => {
  beforeEach(() => vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETO));

  it("sin captchaToken responde 400 explícito y no toca límites, base de datos ni correo", async () => {
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: MENSAJE_CAPTCHA });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.verificationToken.create).not.toHaveBeenCalled();
    expect(correo.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("con token válido verifica con Cloudflare (llave, token e IP) y manda el enlace", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({ success: true }));
    const r = await POST(peticion({ email: "ana@x.co", captchaToken: "token-bueno" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, message: NEUTRO });

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const datos = new URLSearchParams(String(init.body));
    expect(datos.get("secret")).toBe(SECRETO);
    expect(datos.get("response")).toBe("token-bueno");
    expect(datos.get("remoteip")).toBe("203.0.113.9");
    expect(correo.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("si Cloudflare rechaza el token responde 400 y no se crea token ni se manda correo", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    const r = await POST(peticion({ email: "ana@x.co", captchaToken: "token-usado" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: MENSAJE_CAPTCHA });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.verificationToken.create).not.toHaveBeenCalled();
    expect(correo.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("el rechazo del captcha es idéntico exista o no la cuenta: no permite averiguar qué correos hay", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({ success: false, "error-codes": ["invalid-input-response"] }));
    db.user.findUnique.mockResolvedValue(null);
    const rInexistente = await POST(peticion({ email: "nadie@x.co", captchaToken: "malo" }));
    db.user.findUnique.mockResolvedValue({ email: "ana@x.co", passwordHash: "$2a$12$hash" });
    const rExistente = await POST(peticion({ email: "ana@x.co", captchaToken: "malo" }));
    expect(rInexistente.status).toBe(rExistente.status);
    expect(await rInexistente.json()).toEqual(await rExistente.json());
  });

  it("con captcha válido y un correo que no existe sigue respondiendo la frase neutral", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({ success: true }));
    db.user.findUnique.mockResolvedValue(null);
    const r = await POST(peticion({ email: "nadie@x.co", captchaToken: "token-bueno" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, message: NEUTRO });
    expect(correo.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("si Cloudflare está caído falla ABIERTO: manda el enlace y el límite por IP sigue aplicando", async () => {
    fetchFalso.mockRejectedValue(new TypeError("fetch failed"));
    const r = await POST(peticion({ email: "ana@x.co", captchaToken: "token-cualquiera" }));
    expect(r.status).toBe(200);
    expect(limite.rateLimit).toHaveBeenCalledWith("forgot:ip:203.0.113.9", { max: 6, windowMs: 60 * 60 * 1000 });
    expect(correo.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("aun con Cloudflare caído, pasado el límite por IP no se manda nada y la respuesta sigue neutral", async () => {
    fetchFalso.mockResolvedValue(respuestaCloudflare({}, 503));
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 60 });
    const r = await POST(peticion({ email: "ana@x.co", captchaToken: "token-cualquiera" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, message: NEUTRO });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(correo.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/forgot-password — dirección pública del enlace (urlBase)", () => {
  it("arma el enlace con NEXT_PUBLIC_APP_URL, sin barra final ni ruta", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.ejemplo.co/dashboard/");
    await POST(peticion({ email: "ana@x.co" }));
    expect(enlaceEnviado()).toMatch(/^https:\/\/app\.ejemplo\.co\/reset-password\?token=[0-9a-f]{64}&email=ana%40x\.co$/);
  });

  it("sin NEXT_PUBLIC_APP_URL usa el dominio de Vercel", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ph.vercel.app");
    await POST(peticion({ email: "ana@x.co" }));
    expect(enlaceEnviado().startsWith("https://ph.vercel.app/reset-password?")).toBe(true);
  });

  it("en producción sin ninguna dirección NO manda un enlace a localhost: responde lo neutral, no crea token y lo deja en el log", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, message: NEUTRO });
    expect(db.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(db.verificationToken.create).not.toHaveBeenCalled();
    expect(correo.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(errores.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n")).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("en desarrollo sin dirección sí cae en localhost", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    await POST(peticion({ email: "ana@x.co" }));
    expect(enlaceEnviado().startsWith("http://localhost:3000/reset-password?")).toBe(true);
  });

  it("con un enlace reciente vigente no crea otro ni consulta la dirección", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    db.verificationToken.findFirst.mockResolvedValue({ identifier: "pwreset:ana@x.co" });
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(200);
    expect(db.verificationToken.create).not.toHaveBeenCalled();
    expect(errores).not.toHaveBeenCalled();
  });

  it("una cuenta de Google (sin contraseña) no recibe correo", async () => {
    db.user.findUnique.mockResolvedValue({ email: "ana@x.co", passwordHash: null });
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(await r.json()).toEqual({ success: true, message: NEUTRO });
    expect(correo.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("si falla el envío del correo igual responde lo neutral", async () => {
    correo.sendPasswordResetEmail.mockRejectedValue(new Error("SMTP caído"));
    const r = await POST(peticion({ email: "ana@x.co" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, message: NEUTRO });
  });
});
