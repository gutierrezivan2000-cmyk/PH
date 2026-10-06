import { describe, expect, it } from "vitest";
import { grabacionAAvisar, rutaDeLaGrabadora } from "./aviso-grabacion";

const g = (meetingId: string, transcurridoMs: number) => ({ meetingId, transcurridoMs });

describe("grabacionAAvisar", () => {
  it("sin grabaciones en marcha no hay nada que avisar", () => {
    expect(grabacionAAvisar([], "/dashboard")).toBeNull();
  });
  it("en otra pantalla avisa de la grabación en marcha", () => {
    for (const ruta of ["/dashboard", "/dashboard/generar", "/dashboard/reuniones", "/dashboard/reuniones/nueva", "/dashboard/reuniones/otra/grabar", null]) {
      expect(grabacionAAvisar([g("m1", 5000)], ruta), String(ruta)).toEqual(g("m1", 5000));
    }
  });
  it("en las pantallas de esa misma reunión no (ahí ya ve la grabadora)", () => {
    expect(grabacionAAvisar([g("m1", 5000)], "/dashboard/reuniones/m1")).toBeNull();
    expect(grabacionAAvisar([g("m1", 5000)], "/dashboard/reuniones/m1/grabar")).toBeNull();
  });
  it("una reunión cuyo id empieza igual no cuenta como la misma", () => {
    expect(grabacionAAvisar([g("m1", 5000)], "/dashboard/reuniones/m10")).toEqual(g("m1", 5000));
    expect(grabacionAAvisar([g("m1", 5000)], "/dashboard/reuniones/m10/grabar")).toEqual(g("m1", 5000));
  });
  it("con varias, avisa de la que lleva más tiempo y que no sea la que tiene delante", () => {
    const todas = [g("a", 1000), g("b", 9000), g("c", 4000)];
    expect(grabacionAAvisar(todas, "/dashboard")?.meetingId).toBe("b");
    expect(grabacionAAvisar(todas, "/dashboard/reuniones/b")?.meetingId).toBe("c");
  });
});

describe("rutaDeLaGrabadora", () => {
  it("lleva a la grabadora de esa reunión", () => {
    expect(rutaDeLaGrabadora("abc123")).toBe("/dashboard/reuniones/abc123/grabar");
    expect(rutaDeLaGrabadora("a/b")).toBe("/dashboard/reuniones/a%2Fb/grabar");
  });
});
