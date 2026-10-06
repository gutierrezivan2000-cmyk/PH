import { describe, expect, it } from "vitest";
import type { HorasDeReunionesDTO } from "./dto";
import { horasEnPantalla } from "./horas-pantalla";

const H = 3_600_000;
const horas = (extra: Partial<HorasDeReunionesDTO>): HorasDeReunionesDTO => ({ ilimitado: false, periodo: "mes", usadoMs: 3.5 * H, limiteMs: 10 * H, restanMs: 6.5 * H, ...extra });

describe("horasEnPantalla", () => {
  it("con tope: la fila del medidor dice lo usado y el tope, y el resumen lo que queda", () => {
    expect(horasEnPantalla(horas({}))).toEqual({
      ilimitado: false, etiqueta: "Horas este mes", cifra: "3 h 30 min de 10 h", resumen: "Horas: quedan 6 h 30 min este mes.", agotado: false, usadoHoras: 3.5, totalHoras: 10,
    });
  });

  it("sin nada usado dice «0 h», no el guion que usa la duración de una reunión", () => {
    expect(horasEnPantalla(horas({ usadoMs: 0, restanMs: 10 * H }))).toMatchObject({ cifra: "0 h de 10 h", resumen: "Horas: quedan 10 h este mes.", usadoHoras: 0 });
  });

  it("la prueba gratis habla de la prueba, no del mes", () => {
    expect(horasEnPantalla(horas({ periodo: "prueba", usadoMs: H, limiteMs: 2 * H, restanMs: H }))).toMatchObject({
      etiqueta: "Horas de la prueba", cifra: "1 h de 2 h", resumen: "Horas: quedan 1 h en la prueba.",
    });
  });

  it("sin horas que queden lo dice, y si se pasó del tope la cifra es la real", () => {
    expect(horasEnPantalla(horas({ usadoMs: 10 * H, restanMs: 0 }))).toMatchObject({ agotado: true, resumen: "Ya usaste las 10 h de reuniones de este mes.", cifra: "10 h de 10 h" });
    expect(horasEnPantalla(horas({ usadoMs: 10.25 * H, restanMs: 0 }))).toMatchObject({ agotado: true, cifra: "10 h 15 min de 10 h", usadoHoras: 10.25 });
    expect(horasEnPantalla(horas({ periodo: "prueba", usadoMs: 2 * H, limiteMs: 2 * H, restanMs: 0 }))).toMatchObject({ agotado: true, resumen: "Ya usaste las 2 h de reuniones de la prueba." });
  });

  it("si el servidor no trae lo que queda, se calcula", () => {
    expect(horasEnPantalla(horas({ restanMs: null }))).toMatchObject({ resumen: "Horas: quedan 6 h 30 min este mes.", agotado: false });
  });

  it("sin tope: solo cuántas horas lleva, con la nota de la fase de prueba", () => {
    expect(horasEnPantalla({ ilimitado: true, periodo: "mes", usadoMs: 4 * H, limiteMs: null, restanMs: null })).toEqual({
      ilimitado: true, etiqueta: "Horas de reuniones este mes", cifra: "4 h", nota: "Sin tope de horas durante la fase de prueba.",
    });
    expect(horasEnPantalla({ ilimitado: true, periodo: "mes", usadoMs: 0, limiteMs: null, restanMs: null })).toMatchObject({ cifra: "0 h" });
  });

  it("un tope que falta se trata como sin tope en vez de romper la pantalla", () => {
    expect(horasEnPantalla(horas({ ilimitado: false, limiteMs: null, restanMs: null }))).toMatchObject({ ilimitado: true });
  });
});
