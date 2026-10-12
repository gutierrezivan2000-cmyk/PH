import { describe, expect, it } from "vitest";
import {
  SESION_MAX_AGE_SEG,
  SESION_UPDATE_AGE_SEG,
  avisoCookieDomain,
  cookiesDeSesion,
  nombreCookieSesion,
  vencidoPorInactividad,
} from "./session-config";

const DIA = 24 * 60 * 60;
const T = 1_700_000_000; // segundos (iat de Auth.js)

describe("plazos de la sesión", () => {
  it("la sesión vive 7 días y se renueva a las 24 h", () => {
    expect(SESION_MAX_AGE_SEG).toBe(7 * DIA);
    expect(SESION_UPDATE_AGE_SEG).toBe(DIA);
  });
});

describe("vencidoPorInactividad", () => {
  it("un token firmado hace menos de 7 días sigue vivo", () => {
    expect(vencidoPorInactividad(T, (T + 6 * DIA) * 1000)).toBe(false);
    expect(vencidoPorInactividad(T, (T + 7 * DIA) * 1000)).toBe(false); // justo en el límite todavía vale
  });

  it("un token sin uso durante más de 7 días caduca", () => {
    expect(vencidoPorInactividad(T, (T + 7 * DIA + 1) * 1000)).toBe(true);
    expect(vencidoPorInactividad(T, (T + 29 * DIA) * 1000)).toBe(true);
  });

  it("si iat no es un número no decide nada (queda el exp de Auth.js)", () => {
    expect(vencidoPorInactividad(undefined, T * 1000)).toBe(false);
    expect(vencidoPorInactividad("1700000000", (T + 30 * DIA) * 1000)).toBe(false);
    expect(vencidoPorInactividad(NaN, T * 1000)).toBe(false);
    expect(vencidoPorInactividad(null, T * 1000)).toBe(false);
  });

  it("respeta un plazo distinto cuando se le pasa", () => {
    expect(vencidoPorInactividad(T, (T + 2 * DIA) * 1000, DIA)).toBe(true);
    expect(vencidoPorInactividad(T, (T + 2 * DIA) * 1000, 3 * DIA)).toBe(false);
  });
});

describe("cookiesDeSesion", () => {
  it("sin COOKIE_DOMAIN no redefine nada: valen los valores por omisión de Auth.js (cookie solo del host)", () => {
    expect(cookiesDeSesion({ cookieDomain: undefined, seguras: true })).toBeUndefined();
    expect(cookiesDeSesion({ cookieDomain: "", seguras: true })).toBeUndefined();
  });

  it("con COOKIE_DOMAIN en producción: httpOnly, lax, secure y prefijo __Secure-", () => {
    const c = cookiesDeSesion({ cookieDomain: ".sophia.app", seguras: true });
    expect(c?.sessionToken).toEqual({
      name: "__Secure-authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: ".sophia.app" },
    });
    // Solo se redefine la de sesión; CSRF y callback siguen ligadas al host (con su prefijo __Host-).
    expect(Object.keys(c ?? {})).toEqual(["sessionToken"]);
  });

  it("con COOKIE_DOMAIN en desarrollo (HTTP): sin prefijo y sin secure, para que el navegador la acepte", () => {
    const c = cookiesDeSesion({ cookieDomain: ".sophia.app", seguras: false });
    expect(c?.sessionToken?.name).toBe("authjs.session-token");
    expect(c?.sessionToken?.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false });
  });

  it("el nombre coincide con el que lee proxy.ts", () => {
    expect(nombreCookieSesion(true)).toBe("__Secure-authjs.session-token");
    expect(nombreCookieSesion(false)).toBe("authjs.session-token");
  });
});

describe("avisoCookieDomain", () => {
  it("avisa solo en producción y solo si la variable está definida", () => {
    const aviso = avisoCookieDomain(".sophia.app", "production");
    expect(aviso).toContain("COOKIE_DOMAIN");
    expect(aviso).toContain(".sophia.app");
    expect(aviso).toContain("TODOS los subdominios");
    expect(avisoCookieDomain(".sophia.app", "development")).toBeNull();
    expect(avisoCookieDomain(".sophia.app", "test")).toBeNull();
    expect(avisoCookieDomain(undefined, "production")).toBeNull();
    expect(avisoCookieDomain("", "production")).toBeNull();
  });
});
