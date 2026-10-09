import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { datosDeAceptacion, debeAceptar } from "./aceptacion";
import { DOCUMENTOS_LEGALES, EMPRESA, LEGAL_FECHA_TEXTO, LEGAL_VERSION } from "./empresa";

describe("aceptación de los documentos legales", () => {
  it("guarda la fecha y la versión vigente", () => {
    const ahora = new Date("2026-10-09T12:00:00Z");
    expect(datosDeAceptacion(ahora)).toEqual({ termsAcceptedAt: ahora, termsVersion: LEGAL_VERSION });
  });
  it("pide aceptar a quien nunca aceptó o aceptó una versión anterior, y no a quien tiene la vigente", () => {
    expect(debeAceptar({ termsVersion: null })).toBe(true);
    expect(debeAceptar({})).toBe(true);
    expect(debeAceptar({ termsVersion: "2026-01-01" })).toBe(true);
    expect(debeAceptar({ termsVersion: LEGAL_VERSION })).toBe(false);
    expect(debeAceptar(null)).toBe(false);
  });
});

describe("documentos legales", () => {
  it("cada documento del índice tiene su página", () => {
    for (const d of DOCUMENTOS_LEGALES) {
      expect(existsSync(join(process.cwd(), "src/app", d.ruta, "page.tsx")), d.ruta).toBe(true);
    }
  });
  it("la versión es una fecha ISO y coincide con la fecha escrita", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [a, m, d] = LEGAL_VERSION.split("-").map(Number);
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    expect(LEGAL_FECHA_TEXTO).toBe(`${d} de ${meses[m - 1]} de ${a}`);
  });
  it("el canal de atención es un correo", () => {
    expect(EMPRESA.correoLegal).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
