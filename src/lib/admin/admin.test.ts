import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codigoDeUsuario, comoCodigo, filtroDeBusqueda } from "./anonimo";
import { finDeAcceso, validarAcceso } from "./acceso";
import { PROPIETARIOS, adminEmails, esAdminDeEntorno } from "../admin-emails";

describe("código anónimo", () => {
  it("son los últimos 6 caracteres del id, en mayúscula", () => {
    expect(codigoDeUsuario("cm9x2k1abcdef")).toBe("U-ABCDEF");
  });
  it("entiende U-ABC123 o solo ABC123 y rechaza lo demás", () => {
    expect(comoCodigo("U-ab12cd")).toBe("ab12cd");
    expect(comoCodigo("  ab12cd ")).toBe("ab12cd");
    expect(comoCodigo("ana perez")).toBeNull();
    expect(comoCodigo("ab")).toBeNull();
  });
});

describe("búsqueda de usuarios", () => {
  it("vacía no filtra", () => expect(filtroDeBusqueda("  ")).toBeNull());
  it("un correo busca solo la coincidencia exacta, no parcial", () => {
    const f = filtroDeBusqueda("Ana@Ejemplo.com") as { OR: Array<Record<string, unknown>> };
    expect(f.OR[0]).toEqual({ email: { equals: "Ana@Ejemplo.com", mode: "insensitive" } });
    expect(JSON.stringify(f)).not.toContain("contains");
  });
  it("un código busca por el final del id", () => {
    const f = filtroDeBusqueda("U-ABC123") as { OR: Array<Record<string, unknown>> };
    expect(f.OR).toEqual([{ id: { endsWith: "abc123", mode: "insensitive" } }]);
  });
  it("un nombre (texto libre con espacios) no encuentra a nadie: no se puede explorar la base por nombre", () => {
    expect(filtroDeBusqueda("ana perez")).toEqual({ OR: [{ id: "__sin_resultados__" }] });
  });
});

describe("propietarios", () => {
  beforeEach(() => vi.stubEnv("ADMIN_EMAILS", ""));
  afterEach(() => vi.unstubAllEnvs());
  it("la cuenta del dueño es admin aunque ADMIN_EMAILS esté vacía, sin importar mayúsculas", () => {
    expect(PROPIETARIOS).toContain("gutierrezivan2000@gmail.com");
    expect(esAdminDeEntorno("GutierrezIvan2000@Gmail.com")).toBe(true);
    expect(esAdminDeEntorno("otra@gmail.com")).toBe(false);
    expect(esAdminDeEntorno(null)).toBe(false);
  });
  it("suma los de ADMIN_EMAILS sin repetir", () => {
    vi.stubEnv("ADMIN_EMAILS", " Socio@x.com , gutierrezivan2000@gmail.com ");
    expect(adminEmails()).toEqual(["gutierrezivan2000@gmail.com", "socio@x.com"]);
    expect(esAdminDeEntorno("socio@x.com")).toBe(true);
  });
});

describe("dar acceso", () => {
  it("acepta plan y días válidos", () => {
    expect(validarAcceso({ planId: "pro", dias: 30 })).toEqual({ ok: true, acceso: { planId: "pro", dias: 30 } });
    expect(validarAcceso({ planId: "elite", dias: "365" })).toMatchObject({ ok: true });
  });
  it.each([[{ planId: "free", dias: 5 }], [{ planId: "pro", dias: 0 }], [{ planId: "pro", dias: 366 }], [{ planId: "pro", dias: 1.5 }], [{ planId: "pro" }], [null]])("rechaza %j", (e) => {
    expect(validarAcceso(e)).toMatchObject({ ok: false });
  });
  it("el fin es desde ahora más los días", () => {
    expect(finDeAcceso(new Date("2026-10-09T00:00:00Z"), 30).toISOString()).toBe("2026-11-08T00:00:00.000Z");
  });
});

import { equipoAdministrador } from "./equipo";
describe("equipo administrador", () => {
  const d = new Date("2026-10-01T00:00:00Z");
  it("marca a los propietarios, incluye a los que aún no ingresan y pone primero a los propietarios", () => {
    const e = equipoAdministrador(
      [{ id: "u1", email: "socia@x.com", createdAt: d }, { id: "u2", email: "GutierrezIvan2000@gmail.com", createdAt: d }],
      ["gutierrezivan2000@gmail.com", "nuevo-dueno@x.com"],
    );
    expect(e.map((m) => [m.email, m.propietario, m.id])).toEqual([
      ["GutierrezIvan2000@gmail.com", true, "u2"],
      ["nuevo-dueno@x.com", true, null],
      ["socia@x.com", false, "u1"],
    ]);
  });
});
