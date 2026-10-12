import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Se captura la configuración que auth.ts le pasa a NextAuth para comprobar plazos, cookies y el callback `jwt` sin levantar Auth.js.
type ConfigCapturada = {
  providers: Array<{ id?: string; authorize?: (credentials: Record<string, unknown>) => Promise<Record<string, unknown> | null> }>;
  session: Record<string, unknown>;
  jwt: { maxAge: number; decode: (p: { token: string; secret: string; salt: string }) => Promise<unknown> };
  cookies?: { sessionToken: Record<string, unknown> };
  callbacks: { jwt: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null> };
};
const capturada = vi.hoisted(() => ({ config: null as null | Record<string, unknown> }));
vi.mock("next-auth", () => ({
  default: (config: Record<string, unknown>) => {
    capturada.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: (o: object) => ({ id: "google", ...o }) }));
vi.mock("next-auth/providers/credentials", () => ({ default: (o: object) => o }));

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  // Para el limitador real (rate-limit.ts): el conteo usa $queryRaw y el borrado de contadores viejos, deleteMany.
  $queryRaw: vi.fn(),
  rateLimit: { delete: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: vi.fn().mockResolvedValue(undefined) }));
// El limitador se reemplaza por un espía que, según la prueba, delega o no en el real (ver «límite de intentos del login»).
const limite = vi.hoisted(() => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...args: unknown[]) => limite.rateLimit(...args) }));

const DIA = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-03-01T12:00:00Z").getTime();

async function cargarAuth(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  capturada.config = null;
  vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-para-vitest");
  vi.stubEnv("DEMO_MODE", "");
  vi.stubEnv("COOKIE_DOMAIN", "");
  vi.stubEnv("VERCEL_ENV", "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  await import("./auth");
  return capturada.config as unknown as ConfigCapturada;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("auth.ts — plazos y cookies de la sesión", () => {
  it("JWT de 7 días, renovación a las 24 h, y el token y la cookie comparten plazo", async () => {
    const config = await cargarAuth();
    expect(config.session).toEqual({ strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 });
    expect(config.jwt.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it("sin COOKIE_DOMAIN deja las cookies por omisión de Auth.js (httpOnly, lax, secure y prefijos por HTTPS)", async () => {
    const config = await cargarAuth();
    expect(config.cookies).toBeUndefined();
  });

  it("con COOKIE_DOMAIN en producción: sesión httpOnly + lax + secure con prefijo __Secure-, y avisa en el log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete (globalThis as { __cookieDomainAvisado?: boolean }).__cookieDomainAvisado;
    const config = await cargarAuth({ NODE_ENV: "production", COOKIE_DOMAIN: ".sophia.app" });
    expect(config.cookies?.sessionToken).toEqual({
      name: "__Secure-authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: ".sophia.app" },
    });
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("COOKIE_DOMAIN");
    delete (globalThis as { __cookieDomainAvisado?: boolean }).__cookieDomainAvisado;
  });

  it("sin COOKIE_DOMAIN no escribe ningún aviso", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await cargarAuth({ NODE_ENV: "production" });
    expect(aviso).not.toHaveBeenCalled();
  });

  it("sigue negándose a arrancar en demo dentro de producción de Vercel", async () => {
    await expect(cargarAuth({ DEMO_MODE: "true", VERCEL_ENV: "production" })).rejects.toThrow(/DEMO_MODE=true no puede estar activo/);
  });
});

describe("auth.ts — tope de inactividad para las sesiones emitidas con el plazo antiguo", () => {
  const seg = (ms: number) => Math.floor(ms / 1000);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });

  it("un token de 30 días que lleva más de 7 sin usarse se cierra, sin tocar la base", async () => {
    const config = await cargarAuth();
    const token = { id: "u1", email: "ana@x.co", role: "user", iat: seg(T0 - 8 * DIA), exp: seg(T0 + 22 * DIA) };
    await expect(config.callbacks.jwt({ token })).resolves.toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("uno usado hace menos de 7 días sigue vivo", async () => {
    const config = await cargarAuth();
    const token = { id: "u1", email: "ana@x.co", role: "user", iat: seg(T0 - 6 * DIA), dbCheckedAt: T0 };
    await expect(config.callbacks.jwt({ token })).resolves.toMatchObject({ id: "u1" });
  });

  it("un token sin iat conserva el comportamiento de siempre", async () => {
    const config = await cargarAuth();
    const token = { id: "u1", email: "ana@x.co", role: "user", dbCheckedAt: T0 };
    await expect(config.callbacks.jwt({ token })).resolves.toMatchObject({ id: "u1" });
  });

  it("al iniciar sesión no se aplica aunque el token trajera un iat viejo", async () => {
    const config = await cargarAuth({ DEMO_MODE: "true" });
    const token = await config.callbacks.jwt({
      token: { iat: seg(T0 - 30 * DIA) },
      user: { id: "demo-user-001", name: "Carlos", email: "demo@phgestion.app", image: null },
      account: { provider: "demo" },
    });
    expect(token).toMatchObject({ id: "demo-user-001", role: "user" });
  });
});

describe("auth.ts — el callback jwt conserva la revocación (baneo y cambio de contraseña)", () => {
  const ahora = T0;
  // Un token cuya última revisión contra la base es de hace más de 5 minutos, para que el callback vuelva a consultar.
  const tokenViejo = (extra: Record<string, unknown> = {}) => ({
    id: "u1",
    email: "ana@x.co",
    role: "user",
    sessionAt: ahora - 2 * DIA,
    dbCheckedAt: ahora - 10 * 60 * 1000,
    ...extra,
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ahora);
  });

  it("cierra la sesión de una cuenta baneada", async () => {
    const config = await cargarAuth();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "user", banned: true, passwordChangedAt: null });
    await expect(config.callbacks.jwt({ token: tokenViejo() })).resolves.toBeNull();
  });

  it("cierra la sesión nacida antes de un cambio de contraseña", async () => {
    const config = await cargarAuth();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "user", banned: false, passwordChangedAt: new Date(ahora - DIA) });
    await expect(config.callbacks.jwt({ token: tokenViejo() })).resolves.toBeNull();
  });

  it("cierra la sesión si la cuenta ya no existe", async () => {
    const config = await cargarAuth();
    db.user.findUnique.mockResolvedValue(null);
    await expect(config.callbacks.jwt({ token: tokenViejo() })).resolves.toBeNull();
  });

  it("una cuenta sana conserva la sesión y se le refresca el rol", async () => {
    const config = await cargarAuth();
    db.user.findUnique.mockResolvedValue({ id: "u1", role: "admin", banned: false, passwordChangedAt: null });
    const token = await config.callbacks.jwt({ token: tokenViejo() });
    expect(token).toMatchObject({ id: "u1", role: "admin" });
    expect(token?.dbCheckedAt).toBe(ahora);
  });

  it("si la base no responde conserva el token (la caída no deja fuera a nadie)", async () => {
    const config = await cargarAuth();
    db.user.findUnique.mockRejectedValue(new Error("db caída"));
    const token = await config.callbacks.jwt({ token: tokenViejo() });
    expect(token).toMatchObject({ id: "u1", role: "user" });
  });

  it("en modo demo no consulta la base y entra como usuario normal", async () => {
    const config = await cargarAuth({ DEMO_MODE: "true" });
    const token = await config.callbacks.jwt({
      token: {},
      user: { id: "demo-user-001", name: "Carlos", email: "demo@phgestion.app", image: null },
      account: { provider: "demo" },
    });
    expect(token).toMatchObject({ id: "demo-user-001", role: "user" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("auth.ts — límite de intentos del login (failClosed)", () => {
  const credenciales = { email: " Ana@X.co ", password: "una-clave-larga" };
  const ventana = 15 * 60 * 1000;

  async function autorizador() {
    const config = await cargarAuth();
    const proveedor = config.providers.find((p) => p.id === "credentials");
    if (!proveedor?.authorize) throw new Error("no se encontró el proveedor de credenciales");
    return proveedor.authorize;
  }

  /** Usuario sano, con la contraseña de `credenciales` (costo 4: aquí solo importa que la comparación sea real). */
  async function usuarioSano(extra: Record<string, unknown> = {}) {
    const { hashSync } = await import("bcryptjs");
    return {
      id: "u1",
      name: "Ana",
      email: "ana@x.co",
      image: null,
      passwordHash: hashSync(credenciales.password, 4),
      emailVerified: new Date("2026-01-01T00:00:00Z"),
      banned: false,
      ...extra,
    };
  }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    limite.rateLimit.mockReset();
    limite.rateLimit.mockResolvedValue({ allowed: true });
    db.user.findUnique.mockReset();
    db.$queryRaw.mockReset();
    db.rateLimit.delete.mockReset();
    db.rateLimit.delete.mockResolvedValue({});
  });

  it("pide el contador por correo (normalizado) con failClosed:true, 10 intentos cada 15 minutos", async () => {
    const authorize = await autorizador();
    db.user.findUnique.mockResolvedValue(await usuarioSano());
    await authorize(credenciales);
    expect(limite.rateLimit).toHaveBeenCalledTimes(1);
    expect(limite.rateLimit).toHaveBeenCalledWith("login:email:ana@x.co", { max: 10, windowMs: ventana, failClosed: true });
  });

  it("con el límite alcanzado responde null sin consultar al usuario", async () => {
    const authorize = await autorizador();
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 120 });
    await expect(authorize(credenciales)).resolves.toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("si la base falla al contar, el limitador REAL deniega: responde null y no prueba la contraseña", async () => {
    const real = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
    limite.rateLimit.mockImplementation(real.rateLimit);
    db.$queryRaw.mockRejectedValue(new Error("la base no responde"));
    db.user.findUnique.mockResolvedValue(await usuarioSano());

    const authorize = await autorizador();
    await expect(authorize(credenciales)).resolves.toBeNull();

    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.rateLimit.delete).not.toHaveBeenCalled();
  });

  it("con el límite libre, entrar bien devuelve al usuario y borra el contador", async () => {
    const authorize = await autorizador();
    db.user.findUnique.mockResolvedValue(await usuarioSano());
    await expect(authorize(credenciales)).resolves.toEqual({ id: "u1", name: "Ana", email: "ana@x.co", image: null });
    expect(db.rateLimit.delete).toHaveBeenCalledWith({ where: { key: "login:email:ana@x.co" } });
  });

  it("con el límite libre, una contraseña equivocada sigue devolviendo null y no borra el contador", async () => {
    const authorize = await autorizador();
    db.user.findUnique.mockResolvedValue(await usuarioSano());
    await expect(authorize({ ...credenciales, password: "otra-clave-distinta" })).resolves.toBeNull();
    expect(db.rateLimit.delete).not.toHaveBeenCalled();
  });
});
