import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, usuarios } = vi.hoisted(() => ({ auth: vi.fn(), usuarios: { findUnique: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ db: { user: usuarios } }));

import { MODO_DE_MODULO, MODULOS_PAUSADOS, esDePiloto, moduloVisible, type ModoModulo } from "./feature-flags";
import { exigirModulo, moduloAbiertoParaPropietario, modulosVisiblesDe } from "./modulos-acceso";

const todos = (m: ModoModulo) => Object.fromEntries(MODULOS_PAUSADOS.map((k) => [k, m])) as Record<(typeof MODULOS_PAUSADOS)[number], ModoModulo>;

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.stubEnv("PILOTO_EMAILS", "tester@x.com, Otra@X.com");
  auth.mockReset();
  usuarios.findUnique.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("moduloVisible", () => {
  it("en piloto lo usan los admins, los propietarios y los testers; los demás no", () => {
    const m = todos("piloto");
    expect(moduloVisible("cartera", { role: "admin" }, m)).toBe(true);
    expect(moduloVisible("cartera", { role: "user", adminDeEntorno: true }, m)).toBe(true);
    expect(moduloVisible("cartera", { role: "user", enPiloto: true }, m)).toBe(true);
    expect(moduloVisible("cartera", { role: "user" }, m)).toBe(false);
    expect(moduloVisible("cartera", null, m)).toBe(false);
  });
  it("«oculto» no lo usa nadie y «todos» lo usa cualquiera", () => {
    expect(moduloVisible("pqrs", { role: "admin" }, todos("oculto"))).toBe(false);
    expect(moduloVisible("pqrs", { role: "user" }, todos("todos"))).toBe(true);
    expect(moduloVisible("pqrs", null, todos("todos"))).toBe(true);
  });
  it("hoy los seis módulos están en piloto (solo admins)", () => {
    for (const k of MODULOS_PAUSADOS) expect(MODO_DE_MODULO[k], k).toBe("piloto");
  });
});

describe("esDePiloto", () => {
  it("compara sin importar mayúsculas ni espacios", () => {
    expect(esDePiloto("TESTER@x.com")).toBe(true);
    expect(esDePiloto("otra@x.com")).toBe(true);
    expect(esDePiloto("nadie@x.com")).toBe(false);
    expect(esDePiloto(null)).toBe(false);
    expect(esDePiloto("x@x.com", "")).toBe(false);
  });
});

describe("exigirModulo (rutas de la API)", () => {
  it("sin sesión: 401", async () => {
    auth.mockResolvedValue(null);
    const r = await exigirModulo("comunicados");
    expect("error" in r && r.error.status).toBe(401);
  });
  it("una cuenta común recibe 404 (no se revela que existe)", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "cliente@x.com", role: "user" } });
    const r = await exigirModulo("comunicados");
    expect("error" in r && r.error.status).toBe(404);
  });
  it("un admin pasa, un tester de PILOTO_EMAILS pasa y el demo no", async () => {
    auth.mockResolvedValue({ user: { id: "a1", email: "jefe@x.com", role: "admin" } });
    expect(await exigirModulo("asambleas")).toEqual({ userId: "a1" });
    auth.mockResolvedValue({ user: { id: "t1", email: "tester@x.com", role: "user" } });
    expect(await exigirModulo("asambleas")).toEqual({ userId: "t1" });
    vi.stubEnv("DEMO_MODE", "true");
    auth.mockResolvedValue({ user: { id: "a1", email: "jefe@x.com", role: "admin" } });
    expect("error" in (await exigirModulo("asambleas"))).toBe(true);
  });
  it("la cuenta del propietario fijo pasa aunque su rol aún no diga admin", async () => {
    auth.mockResolvedValue({ user: { id: "o1", email: "gutierrezivan2000@gmail.com", role: "user" } });
    expect(await exigirModulo("cartera")).toEqual({ userId: "o1" });
  });
});

describe("modulosVisiblesDe y portal de residentes", () => {
  it("devuelve un mapa por módulo", async () => {
    expect(Object.values(await modulosVisiblesDe({ email: "a@x.com", role: "admin" })).every(Boolean)).toBe(true);
    expect(Object.values(await modulosVisiblesDe({ email: "a@x.com", role: "user" })).some(Boolean)).toBe(false);
  });
  it("el portal está abierto si el módulo está abierto para el administrador dueño de la copropiedad", async () => {
    usuarios.findUnique.mockResolvedValue({ email: "jefe@x.com", role: "admin" });
    expect(await moduloAbiertoParaPropietario("cartera", "dueno")).toBe(true);
    usuarios.findUnique.mockResolvedValue({ email: "cliente@x.com", role: "user" });
    expect(await moduloAbiertoParaPropietario("cartera", "dueno")).toBe(false);
    usuarios.findUnique.mockResolvedValue(null);
    expect(await moduloAbiertoParaPropietario("pqrs", "nadie")).toBe(false);
  });
  it("si la base de datos falla, el portal queda cerrado (no se mueve dinero sin control)", async () => {
    usuarios.findUnique.mockRejectedValue(new Error("caída"));
    expect(await moduloAbiertoParaPropietario("cartera", "dueno")).toBe(false);
  });
});
