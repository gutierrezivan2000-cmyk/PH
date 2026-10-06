/**
 * Con el valor publicado de `REUNIONES_PARA` ("todos"), cualquier cuenta con sesión entra a Reuniones; sin sesión, 401.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("db tocada antes de la puerta de acceso"); } }) }));

import { exigirVisible, sesionVeReuniones } from "./acceso";

beforeEach(() => {
  auth.mockReset();
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("ADMIN_EMAILS", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("el valor publicado de REUNIONES_PARA", () => {
  it("una cuenta normal entra, con su propio id", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "ana@x.com", role: "user" } });
    expect(await exigirVisible()).toEqual({ ctx: { userId: "u1", demo: false } });
    expect(await sesionVeReuniones()).toBe(true);
  });
  it("una cuenta sin rol también", async () => {
    auth.mockResolvedValue({ user: { id: "u2", email: "sin-rol@x.com" } });
    expect(await exigirVisible()).toEqual({ ctx: { userId: "u2", demo: false } });
  });
  it("sin sesión sigue siendo 401 y las páginas no la ven", async () => {
    auth.mockResolvedValue(null);
    const r = await exigirVisible();
    expect("error" in r && r.error.status).toBe(401);
    expect(await sesionVeReuniones()).toBe(false);
  });
});
