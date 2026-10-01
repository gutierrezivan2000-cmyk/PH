import { describe, expect, it } from "vitest";
import { COMING_SOON, REUNIONES_PARA, puedeVerReuniones, reunionesVisibles } from "./feature-flags";

describe("reunionesVisibles", () => {
  it("modo «admins»: solo admin (por rol o por ADMIN_EMAILS)", () => {
    expect(reunionesVisibles("admins", { role: "admin" })).toBe(true);
    expect(reunionesVisibles("admins", { role: "user", adminDeEntorno: true })).toBe(true);
    expect(reunionesVisibles("admins", { role: "user" })).toBe(false);
    expect(reunionesVisibles("admins", { role: undefined })).toBe(false);
    expect(reunionesVisibles("admins", { role: null })).toBe(false);
    expect(reunionesVisibles("admins", {})).toBe(false);
  });
  it("modo «todos»: cualquier cuenta con sesión", () => {
    expect(reunionesVisibles("todos", { role: "user" })).toBe(true);
    expect(reunionesVisibles("todos", {})).toBe(true);
  });
  it("sin usuario nunca se ve, en ningún modo", () => {
    expect(reunionesVisibles("admins", null)).toBe(false);
    expect(reunionesVisibles("admins", undefined)).toBe(false);
    expect(reunionesVisibles("todos", null)).toBe(false);
  });
  it("el demo siempre la ve (no hay datos reales que proteger)", () => {
    expect(reunionesVisibles("admins", { role: "user", demo: true })).toBe(true);
    expect(reunionesVisibles("admins", { demo: true })).toBe(true);
  });
});

describe("puedeVerReuniones (el valor publicado)", () => {
  it("el piloto arranca solo para admins: abrirlo a todos exige aprobación", () => {
    expect(REUNIONES_PARA).toBe("admins");
    expect(puedeVerReuniones({ role: "user" })).toBe(false);
    expect(puedeVerReuniones({ role: "admin" })).toBe(true);
  });
});

describe("COMING_SOON", () => {
  it("las seis funciones pausadas siguen pausadas", () => {
    expect(COMING_SOON).toEqual({
      cartera: true, presupuesto: true, certificados: true, asambleas: true, comunicados: true, pqrs: true,
    });
  });
});
