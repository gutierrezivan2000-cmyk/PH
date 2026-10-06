import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
// Estas pruebas cubren la compuerta de acceso: se hacen con el piloto «solo admins» para que la puerta se pruebe de verdad
// (el valor publicado se prueba aparte, en `feature-flags.test.ts` y `acceso-publicado.test.ts`).
vi.mock("@/lib/feature-flags", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/feature-flags")>();
  return { ...real, puedeVerReuniones: (u: Parameters<typeof real.puedeVerReuniones>[0]) => real.reunionesVisibles("admins", u) };
});
// Si la puerta falla y alguien toca la base de datos, la prueba lo grita.
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("db tocada antes de la puerta de acceso"); } }),
}));

import { DEMO_USER } from "@/lib/demo-store";
import { exigirVisible, sesionVeReuniones } from "./acceso";

const sesion = (user: Record<string, unknown> | null) => auth.mockResolvedValue(user ? { user } : null);

beforeEach(() => {
  auth.mockReset();
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("ADMIN_EMAILS", "dueno@soph.ia, otro@soph.ia");
});
afterEach(() => vi.unstubAllEnvs());

describe("exigirVisible (el piloto solo para admins)", () => {
  it("sin sesión: 401", async () => {
    sesion(null);
    const r = await exigirVisible();
    expect("error" in r && r.error.status).toBe(401);
  });

  it("sesión sin id: 401", async () => {
    sesion({ email: "x@y.com", role: "admin" });
    const r = await exigirVisible();
    expect("error" in r && r.error.status).toBe(401);
  });

  it("cuenta normal: 404, no 403 (no revela que la función existe)", async () => {
    sesion({ id: "u1", email: "ana@x.com", role: "user" });
    const r = await exigirVisible();
    expect("error" in r && r.error.status).toBe(404);
    expect("error" in r && (await r.error.json())).toEqual({ error: "No encontrado" });
  });

  it("cuenta sin rol: 404", async () => {
    sesion({ id: "u1", email: "ana@x.com" });
    const r = await exigirVisible();
    expect("error" in r && r.error.status).toBe(404);
  });

  it("admin por rol: pasa, con su propio id", async () => {
    sesion({ id: "admin-1", email: "jefe@x.com", role: "admin" });
    const r = await exigirVisible();
    expect(r).toEqual({ ctx: { userId: "admin-1", demo: false } });
  });

  it("admin de ADMIN_EMAILS aunque el rol de la sesión aún no se haya actualizado (sin distinguir mayúsculas)", async () => {
    sesion({ id: "u9", email: "Dueno@Soph.IA", role: "user" });
    const r = await exigirVisible();
    expect(r).toEqual({ ctx: { userId: "u9", demo: false } });
  });

  it("un correo parecido pero que no está en la lista no pasa", async () => {
    sesion({ id: "u9", email: "dueno@soph.ia.falso.com", role: "user" });
    const r = await exigirVisible();
    expect("error" in r && r.error.status).toBe(404);
  });

  it("demo: la ve cualquiera, y trabaja con el usuario del demo (no con el id de la sesión)", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    sesion({ id: "lo-que-sea", email: "demo@phgestion.app", role: "user" });
    const r = await exigirVisible();
    expect(r).toEqual({ ctx: { userId: DEMO_USER.id, demo: true } });
  });
});

describe("sesionVeReuniones (las páginas)", () => {
  it("coincide con la puerta de la API", async () => {
    sesion(null);
    expect(await sesionVeReuniones()).toBe(false);
    sesion({ id: "u1", email: "ana@x.com", role: "user" });
    expect(await sesionVeReuniones()).toBe(false);
    sesion({ id: "a1", email: "jefe@x.com", role: "admin" });
    expect(await sesionVeReuniones()).toBe(true);
    sesion({ id: "u9", email: "otro@soph.ia", role: "user" });
    expect(await sesionVeReuniones()).toBe(true);
    vi.stubEnv("DEMO_MODE", "true");
    sesion({ id: "d", email: "demo@phgestion.app" });
    expect(await sesionVeReuniones()).toBe(true);
  });
});
