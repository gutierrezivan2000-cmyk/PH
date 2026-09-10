import { describe, it, expect } from "vitest";
import { tinte } from "./tinte";

describe("tinte", () => {
  // La razón de existir de este helper: el patrón anterior `${color}20`
  // producía `var(--info)20`, CSS inválido que el navegador descarta en
  // silencio. Lo que se comprueba aquí es que la salida sigue siendo CSS
  // válido cuando el color es una variable, no solo cuando es hexadecimal.
  it("acepta variables CSS, que es lo que la concatenación hexadecimal rompía", () => {
    expect(tinte("var(--info)", 0.14)).toBe("color-mix(in srgb, var(--info) 14%, transparent)");
  });

  it("acepta también hexadecimales (el brandColor del portal)", () => {
    expect(tinte("#7856f5", 0.25)).toBe("color-mix(in srgb, #7856f5 25%, transparent)");
  });

  it("conserva un decimal cuando el porcentaje no es entero", () => {
    expect(tinte("var(--ok)", 0.125)).toBe("color-mix(in srgb, var(--ok) 12.5%, transparent)");
  });

  it("recorta fuera del rango 0..1 en vez de emitir porcentajes imposibles", () => {
    expect(tinte("red", 2)).toBe("color-mix(in srgb, red 100%, transparent)");
    expect(tinte("red", -1)).toBe("color-mix(in srgb, red 0%, transparent)");
  });

  it("0 y 1 son los extremos exactos", () => {
    expect(tinte("red", 0)).toContain(" 0%,");
    expect(tinte("red", 1)).toContain(" 100%,");
  });
});
