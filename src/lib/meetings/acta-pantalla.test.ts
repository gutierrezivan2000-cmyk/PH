import { describe, expect, it } from "vitest";
import { marcaDePestanaDeActa, requisitosEnOrden, resumenDeRequisitos, sePuedePedirActa, textoDeEtapaDeActa } from "./acta-pantalla";
import type { RequisitoActaDTO } from "./dto";

const r = (item: string, status: "completo" | "pendiente"): RequisitoActaDTO => ({ item, status, detail: "" });

describe("textoDeEtapaDeActa", () => {
  it("dice qué se está haciendo en cada etapa", () => {
    expect(textoDeEtapaDeActa({ etapa: "preparando", secciones: null })).toBe("Preparando la transcripción para la IA…");
    expect(textoDeEtapaDeActa({ etapa: "redactando", secciones: { hechas: 2, total: 5 } })).toBe("Redactando el acta · 2 de 5 secciones");
    expect(textoDeEtapaDeActa({ etapa: "redactando", secciones: { hechas: 0, total: 1 } })).toBe("Redactando el acta · 0 de 1 sección");
    expect(textoDeEtapaDeActa({ etapa: "armando", secciones: { hechas: 5, total: 5 } })).toBe("Armando el acta y revisando que no falte nada…");
  });
  it("sin saber las secciones, lo dice en general", () => {
    expect(textoDeEtapaDeActa({ etapa: "redactando", secciones: null })).toBe("Redactando el acta…");
    expect(textoDeEtapaDeActa({ etapa: null, secciones: null })).toBe("Redactando el acta…");
    expect(textoDeEtapaDeActa({ etapa: "redactando", secciones: { hechas: 0, total: 0 } })).toBe("Redactando el acta…");
  });
});

describe("requisitos", () => {
  it("los pendientes van primero y el resto conserva su orden", () => {
    const orden = requisitosEnOrden([r("A", "completo"), r("B", "pendiente"), r("C", "completo"), r("D", "pendiente")]);
    expect(orden.map((x) => x.item)).toEqual(["B", "D", "A", "C"]);
  });
  it("no cambia lo que recibe", () => {
    const entrada = [r("A", "completo"), r("B", "pendiente")];
    requisitosEnOrden(entrada);
    expect(entrada.map((x) => x.item)).toEqual(["A", "B"]);
  });
  it("resume cuántos están completos", () => {
    expect(resumenDeRequisitos([r("A", "completo"), r("B", "pendiente"), r("C", "completo")])).toEqual({ completos: 2, total: 3, texto: "2 de 3 requisitos completos" });
    expect(resumenDeRequisitos([r("A", "completo")]).texto).toBe("1 de 1 requisito completo");
    expect(resumenDeRequisitos([]).texto).toBe("0 de 0 requisitos completos");
  });
});

describe("marcaDePestanaDeActa", () => {
  it("muestra el avance mientras se redacta y una marca si falló; nada si no hay acta o ya está lista", () => {
    expect(marcaDePestanaDeActa({ estado: "procesando", progreso: 42 })).toEqual({ conteo: "42 %", titulo: "Redactando el acta: 42 %" });
    expect(marcaDePestanaDeActa({ estado: "error", progreso: 0 })).toEqual({ conteo: "!", titulo: "El acta no se pudo terminar" });
    expect(marcaDePestanaDeActa({ estado: "lista", progreso: 100 })).toBeNull();
    expect(marcaDePestanaDeActa(null)).toBeNull();
  });
});

describe("sePuedePedirActa", () => {
  it("solo con la reunión lista", () => {
    expect(sePuedePedirActa("lista")).toBe(true);
    for (const e of ["borrador", "subiendo", "grabando", "en_cola", "procesando", "error", "sin_cupo"]) expect(sePuedePedirActa(e), e).toBe(false);
    expect(sePuedePedirActa("lista", false)).toBe(false);
  });
});
