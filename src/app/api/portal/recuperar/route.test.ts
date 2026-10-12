import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  unit: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  // Para el limitador real (rate-limit.ts), que cuenta con $queryRaw y limpia contadores viejos con deleteMany.
  $queryRaw: vi.fn(),
  rateLimit: { deleteMany: vi.fn() },
}));
const limite = vi.hoisted(() => ({ rateLimit: vi.fn(), clientIp: vi.fn() }));
const correo = vi.hoisted(() => ({ sendPortalLinkEmails: vi.fn() }));
const cuota = vi.hoisted(() => ({ checkEmailQuota: vi.fn(), recordEmailsSent: vi.fn() }));
const uso = vi.hoisted(() => ({ checkSubscriptionAccess: vi.fn() }));
const esquema = vi.hoisted(() => ({ ensureAdminSchema: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => limite);
vi.mock("@/lib/email", () => correo);
vi.mock("@/lib/email-quota", () => cuota);
vi.mock("@/lib/usage", () => uso);
vi.mock("@/lib/ensure-admin-schema", () => esquema);

const GENERICO = {
  ok: true,
  message:
    "Si el correo está registrado en una copropiedad, te enviamos el enlace de tu portal. Revisa tu bandeja de entrada y la carpeta de spam.",
};

/** La cabecera Host viene de quien llama: aquí es la de un atacante. */
const peticion = (body: unknown) =>
  ({ json: async () => body, headers: new Headers({ host: "atacante.example", "x-forwarded-proto": "http" }) }) as unknown as NextRequest;

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

  limite.clientIp.mockReturnValue("203.0.113.9");
  limite.rateLimit.mockResolvedValue({ allowed: true });
  esquema.ensureAdminSchema.mockResolvedValue(undefined);
  db.unit.findMany.mockResolvedValue([
    { id: "un1", label: "Apto 101", portalToken: "tok-101", propertyId: "p1", property: { name: "Los Pinos", userId: "adm1" } },
  ]);
  db.user.findUnique.mockResolvedValue({ name: "Ana", email: "ana@admin.co", company: "Administraciones Ana", logoUrl: null, brandColor: null });
  uso.checkSubscriptionAccess.mockResolvedValue({ status: "active" });
  cuota.checkEmailQuota.mockResolvedValue({ allowed: true });
  cuota.recordEmailsSent.mockResolvedValue(undefined);
  correo.sendPortalLinkEmails.mockResolvedValue({ sent: 1, failed: 0, failedUnits: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/portal/recuperar — dirección del enlace (urlBase)", () => {
  it("el enlace sale con NEXT_PUBLIC_APP_URL y NO con la cabecera Host de quien llama", async () => {
    const POST = await cargarRuta();
    const r = await POST(peticion({ email: "res@x.co" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(GENERICO);
    expect(correo.sendPortalLinkEmails).toHaveBeenCalledTimes(1);
    const { recipients } = correo.sendPortalLinkEmails.mock.calls[0][0];
    expect(recipients).toEqual([{ email: "res@x.co", url: "https://app.ejemplo.co/u/tok-101", unitLabel: "Apto 101" }]);
  });

  it("sin NEXT_PUBLIC_APP_URL usa el dominio de producción de Vercel", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ph.vercel.app");
    const POST = await cargarRuta();
    await POST(peticion({ email: "res@x.co" }));
    expect(correo.sendPortalLinkEmails.mock.calls[0][0].recipients[0].url).toBe("https://ph.vercel.app/u/tok-101");
  });

  it("en producción sin ninguna dirección no sale ningún correo y la respuesta sigue siendo la genérica", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    const POST = await cargarRuta();
    const r = await POST(peticion({ email: "res@x.co" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(GENERICO);
    expect(correo.sendPortalLinkEmails).not.toHaveBeenCalled();
    expect(cuota.recordEmailsSent).not.toHaveBeenCalled();
    expect(errores.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n")).toContain("NEXT_PUBLIC_APP_URL");
  });
});

describe("POST /api/portal/recuperar — lo demás sigue igual", () => {
  it("un correo que no es de ninguna unidad responde lo genérico sin enviar", async () => {
    db.unit.findMany.mockResolvedValue([]);
    const POST = await cargarRuta();
    const r = await POST(peticion({ email: "nadie@x.co" }));
    expect(await r.json()).toEqual(GENERICO);
    expect(correo.sendPortalLinkEmails).not.toHaveBeenCalled();
  });

  it("un correo mal escrito responde 400", async () => {
    const POST = await cargarRuta();
    expect((await POST(peticion({ email: "no-es-correo" }))).status).toBe(400);
  });

  it("con la cuota del administrador agotada no se envía y la respuesta sigue siendo la genérica", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cuota.checkEmailQuota.mockResolvedValue({ allowed: false, reason: "sin cupo" });
    const POST = await cargarRuta();
    const r = await POST(peticion({ email: "res@x.co" }));
    expect(await r.json()).toEqual(GENERICO);
    expect(correo.sendPortalLinkEmails).not.toHaveBeenCalled();
  });
});

describe("POST /api/portal/recuperar — límites con failClosed", () => {
  const HORA = 60 * 60 * 1000;

  it("pide los dos contadores (correo e IP) con failClosed:true", async () => {
    const POST = await cargarRuta();
    const r = await POST(peticion({ email: "Res@X.co" }));
    expect(await r.json()).toEqual(GENERICO);
    expect(limite.rateLimit).toHaveBeenCalledTimes(2);
    expect(limite.rateLimit).toHaveBeenCalledWith("recover:email:res@x.co", { max: 3, windowMs: HORA, failClosed: true });
    expect(limite.rateLimit).toHaveBeenCalledWith("recover:ip:203.0.113.9", { max: 10, windowMs: HORA, failClosed: true });
  });

  it("si cualquiera de los dos no se pudo contar (unavailable) responde lo genérico y no consulta ni envía nada", async () => {
    for (const clave of ["recover:email:", "recover:ip:"]) {
      vi.clearAllMocks();
      limite.clientIp.mockReturnValue("203.0.113.9");
      limite.rateLimit.mockImplementation(async (k: string) =>
        k.startsWith(clave) ? { allowed: false, retryAfterSec: 30, unavailable: true } : { allowed: true }
      );
      const POST = await cargarRuta();
      const r = await POST(peticion({ email: "res@x.co" }));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual(GENERICO);
      expect(esquema.ensureAdminSchema).not.toHaveBeenCalled();
      expect(db.unit.findMany).not.toHaveBeenCalled();
      expect(correo.sendPortalLinkEmails).not.toHaveBeenCalled();
    }
  });

  it("si la base falla al contar, el limitador REAL deniega: respuesta genérica y ningún correo", async () => {
    const real = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
    limite.rateLimit.mockImplementation(real.rateLimit);
    db.$queryRaw.mockRejectedValue(new Error("la base no responde"));

    const POST = await cargarRuta();
    const r = await POST(peticion({ email: "res@x.co" }));

    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(GENERICO);
    expect(db.unit.findMany).not.toHaveBeenCalled();
    expect(correo.sendPortalLinkEmails).not.toHaveBeenCalled();
    expect(cuota.recordEmailsSent).not.toHaveBeenCalled();
  });
});
