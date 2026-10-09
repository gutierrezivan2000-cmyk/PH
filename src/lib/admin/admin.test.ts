import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPOS_DE_IDENTIDAD, codigoDeUsuario, comoCodigo, filtroDeBusqueda } from "./identidad";
import { finDeAcceso, validarAcceso } from "./acceso";
import { PROPIETARIOS, adminEmails, esAdminDeEntorno } from "../admin-emails";

describe("código de cliente", () => {
  it("son los últimos 6 caracteres del id, en mayúscula", () => {
    expect(codigoDeUsuario("cm9x2k1abcdef")).toBe("U-ABCDEF");
  });
  it("solo se toma como código lo que empieza por U-", () => {
    expect(comoCodigo("U-ab12cd")).toBe("ab12cd");
    expect(comoCodigo("ab12cd")).toBeNull();
    expect(comoCodigo("ana perez")).toBeNull();
  });
});

describe("qué datos del cliente ve el panel", () => {
  it("identidad, contacto y fechas sí; secretos nunca", () => {
    for (const k of ["name", "email", "image", "phone", "cargo", "company", "city", "createdAt", "lastLoginAt", "emailVerified", "termsAcceptedAt"]) {
      expect(CAMPOS_DE_IDENTIDAD, k).toHaveProperty(k, true);
    }
    for (const k of ["passwordHash", "epaycoPKey", "epaycoPublicKey", "epaycoPCustId"]) expect(CAMPOS_DE_IDENTIDAD).not.toHaveProperty(k);
  });
});

describe("búsqueda de clientes", () => {
  it("vacía no filtra", () => expect(filtroDeBusqueda("  ")).toBeNull());
  it("texto libre busca en nombre, correo, empresa, ciudad y teléfono, sin distinguir mayúsculas", () => {
    const c = { contains: "Ana", mode: "insensitive" };
    expect(filtroDeBusqueda(" Ana ")).toEqual({ OR: [{ name: c }, { email: c }, { company: c }, { city: c }, { phone: c }] });
  });
  it("un código busca por el final del id", () => {
    expect(filtroDeBusqueda("U-ABC123")).toEqual({ id: { endsWith: "abc123", mode: "insensitive" } });
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
