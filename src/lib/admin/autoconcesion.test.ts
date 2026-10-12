import { describe, expect, it } from "vitest";
import { MENSAJE_AUTOCONCESION, autoconcesionBloqueada, marcaDeCambioPropio } from "./autoconcesion";

describe("autoconcesión de planes", () => {
  it("un admin común no puede cambiar su propia cuenta", () => {
    expect(autoconcesionBloqueada("a1", "a1", false)).toBe(true);
  });
  it("un propietario sí puede cambiar la suya", () => {
    expect(autoconcesionBloqueada("a1", "a1", true)).toBe(false);
  });
  it("sobre la cuenta de otra persona nunca se bloquea, sea propietario o no", () => {
    expect(autoconcesionBloqueada("a1", "u2", false)).toBe(false);
    expect(autoconcesionBloqueada("a1", "u2", true)).toBe(false);
  });
  it("el mensaje está en español y dice a quién acudir", () => {
    expect(MENSAJE_AUTOCONCESION).toMatch(/propietario/);
  });
  it("la marca de auditoría solo aparece en el cambio propio", () => {
    expect(marcaDeCambioPropio("a1", "a1")).toEqual({ propio: true });
    expect(marcaDeCambioPropio("a1", "u2")).toEqual({});
  });
});
