import { describe, it, expect } from "vitest";
import { revokedByPasswordChange, CLOCK_SKEW_MS } from "./session-revocation";

const T = 1_700_000_000_000;

describe("revokedByPasswordChange", () => {
  it("no revoca a quien nunca ha restablecido la contraseña", () => {
    expect(revokedByPasswordChange(T, null)).toBe(false);
    expect(revokedByPasswordChange(undefined, null)).toBe(false);
    expect(revokedByPasswordChange(undefined, undefined)).toBe(false);
  });

  it("revoca la sesión nacida ANTES del cambio de contraseña", () => {
    expect(revokedByPasswordChange(T, new Date(T + 60_000))).toBe(true);
  });

  it("no toca la sesión creada DESPUÉS del cambio", () => {
    expect(revokedByPasswordChange(T + 60_000, new Date(T))).toBe(false);
  });

  it("revoca los tokens antiguos, que no llevan sello", () => {
    // Es justo la población en riesgo: sesiones emitidas antes de que existiera
    // esta función. Como passwordChangedAt solo puede escribirse después del
    // despliegue, cualquier valor es posterior a esas sesiones.
    expect(revokedByPasswordChange(undefined, new Date(T))).toBe(true);
    expect(revokedByPasswordChange("no es un número", new Date(T))).toBe(true);
    expect(revokedByPasswordChange(NaN, new Date(T))).toBe(true);
  });

  it("tolera el desfase de reloj entre instancias", () => {
    // El usuario restablece y entra un segundo después: su propia sesión nueva
    // no puede cerrarse por unos milisegundos de diferencia entre relojes.
    expect(revokedByPasswordChange(T, new Date(T + CLOCK_SKEW_MS - 1))).toBe(false);
    expect(revokedByPasswordChange(T, new Date(T + CLOCK_SKEW_MS + 1))).toBe(true);
  });

  it("un segundo restablecimiento vuelve a cerrar las sesiones vivas", () => {
    const sesion = T + 120_000; // creada tras el primer restablecimiento
    expect(revokedByPasswordChange(sesion, new Date(T))).toBe(false);
    expect(revokedByPasswordChange(sesion, new Date(sesion + 60_000))).toBe(true);
  });
});
