import { describe, expect, it } from "vitest";
import type { HablanteDTO, PersonaDTO } from "./dto";
import {
  OTRA, alElegirPersona, aPedidos, aplicarSugerencia, eleccionInicial, hayCambios, nombreElegido, personasPorCrear, rolDeTexto, vocesQueSeUniran,
  type EleccionDeVoz,
} from "./nombres-pantalla";

const personas: PersonaDTO[] = [
  { id: "p1", propertyId: "c1", name: "Martha López", role: "presidente", active: true },
  { id: "p2", propertyId: "c1", name: "Jorge Pardo", role: "administrador", active: true },
  { id: "p3", propertyId: "c1", name: "Luz Marina Ortiz", role: null, active: true },
];
const voz = (label: string, extra: Partial<HablanteDTO> = {}): HablanteDTO => ({ label, name: null, role: null, personId: null, confirmed: false, suggestion: null, talkMs: 1, sampleStartMs: null, sampleEndMs: null, ...extra });
const e = (persona: string, rol: EleccionDeVoz["rol"] = "", libre = ""): EleccionDeVoz => ({ persona, libre, rol });

describe("rolDeTexto", () => {
  it("reconoce la clave y el nombre largo del rol, sin importar tildes ni mayúsculas", () => {
    expect(rolDeTexto("presidente")).toBe("presidente");
    expect(rolDeTexto("Presidente del consejo")).toBe("presidente");
    expect(rolDeTexto("REVISOR FISCAL")).toBe("revisor_fiscal");
    expect(rolDeTexto("Consejera")).toBe(""); // no es una de las claves (un texto libre de la IA)
    expect(rolDeTexto(null)).toBe("");
    expect(rolDeTexto("")).toBe("");
  });
});

describe("eleccionInicial", () => {
  it("una voz con su persona la muestra elegida, con el rol guardado o el de la persona", () => {
    expect(eleccionInicial(voz("V1", { personId: "p1", name: "Martha López", role: "presidente" }), personas)).toEqual(e("p1", "presidente"));
    expect(eleccionInicial(voz("V1", { personId: "p2", name: "Jorge Pardo" }), personas)).toEqual(e("p2", "administrador"));
  });
  it("una voz con nombre pero sin persona se empareja con la persona del mismo nombre; si no hay, es «Otra persona»", () => {
    expect(eleccionInicial(voz("V1", { name: "martha lopez" }), personas)).toEqual(e("p1", "presidente"));
    expect(eleccionInicial(voz("V2", { name: "Andrés Gómez", role: "consejero" }), personas)).toEqual(e(OTRA, "consejero", "Andrés Gómez"));
  });
  it("una persona que ya no está en la lista (se desactivó) no rompe: queda como nombre escrito", () => {
    expect(eleccionInicial(voz("V1", { personId: "borrada", name: "Alguien" }), personas)).toEqual(e(OTRA, "", "Alguien"));
  });
  it("sin nombre, sin nada elegido", () => {
    expect(eleccionInicial(voz("V3"), personas)).toEqual(e(""));
  });
});

describe("aplicarSugerencia", () => {
  it("si la sugerencia es una persona de la copropiedad, la elige (con su rol)", () => {
    const h = voz("V1", { suggestion: { nombre: "Martha López", rol: "Presidente del consejo", evidencia: "e" } });
    expect(aplicarSugerencia(h, personas)).toEqual(e("p1", "presidente"));
  });
  it("si es alguien nuevo, lo deja como «Otra persona» con ese nombre, y el rol solo si lo reconoce", () => {
    expect(aplicarSugerencia(voz("H5", { suggestion: { nombre: "Andrés Gómez", rol: "Vigilante nocturno", evidencia: "e" } }), personas)).toEqual(e(OTRA, "", "Andrés Gómez"));
    expect(aplicarSugerencia(voz("H5", { suggestion: { nombre: "Andrés Gómez", rol: "Consejero", evidencia: "e" } }), personas)).toEqual(e(OTRA, "consejero", "Andrés Gómez"));
  });
  it("sin sugerencia con nombre, deja lo que había", () => {
    expect(aplicarSugerencia(voz("V1", { suggestion: { evidencia: "e" } }), personas)).toEqual(e(""));
  });
});

describe("alElegirPersona", () => {
  it("elegir una persona pone su rol; «Sin nombre» limpia todo; «Otra persona» conserva lo escrito", () => {
    expect(alElegirPersona("p2", e("", "contador"), personas)).toEqual(e("p2", "administrador"));
    expect(alElegirPersona("p3", e("", "contador"), personas)).toEqual(e("p3", "contador")); // la persona no tiene rol: se conserva el que había
    expect(alElegirPersona("", e("p1", "presidente"), personas)).toEqual(e(""));
    expect(alElegirPersona(OTRA, e(OTRA, "otro", "Ana"), personas)).toEqual(e(OTRA, "otro", "Ana"));
  });
});

describe("nombreElegido y vocesQueSeUniran", () => {
  it("el nombre sale de la persona o de lo escrito, sin espacios de más", () => {
    expect(nombreElegido(e("p1"), personas)).toBe("Martha López");
    expect(nombreElegido(e(OTRA, "", "  Andrés   Gómez "), personas)).toBe("Andrés Gómez");
    expect(nombreElegido(e(""), personas)).toBe("");
    expect(nombreElegido(e("borrada"), personas)).toBe("");
  });
  it("agrupa las voces que quedarían con el mismo nombre, venga de la lista o escrito a mano", () => {
    const g = vocesQueSeUniran({ V1: e("p1"), V2: e("p2"), V3: e(OTRA, "", "martha lópez"), V4: e(""), H5: e(OTRA, "", "Nueva") }, personas);
    expect(g).toEqual([["V1", "V3"]]);
    expect(vocesQueSeUniran({ V1: e("p1"), V2: e("p2") }, personas)).toEqual([]);
  });
});

describe("hayCambios", () => {
  const base = { V1: e("p1", "presidente"), V2: e("") };
  it("detecta un cambio de persona, de rol o de nombre escrito, y nada más", () => {
    expect(hayCambios(base, { ...base })).toBe(false);
    expect(hayCambios(base, { ...base, V2: e("p2") })).toBe(true);
    expect(hayCambios(base, { ...base, V1: e("p1", "") })).toBe(true);
    expect(hayCambios({ V1: e(OTRA, "", "Ana") }, { V1: e(OTRA, "", " Ana ") })).toBe(false);
    expect(hayCambios({ V1: e(OTRA, "", "Ana") }, { V1: e(OTRA, "", "Ani") })).toBe(true);
    expect(hayCambios(base, { V1: base.V1 })).toBe(true);
  });
});

describe("aPedidos y personasPorCrear", () => {
  it("cada voz pide su nombre, rol y persona; «Otra persona» usa el identificador de la que se acaba de crear", () => {
    const elecciones = { V1: e("p1", "presidente"), V2: e(""), H5: e(OTRA, "consejero", "Andrés Gómez") };
    expect(personasPorCrear(elecciones, personas)).toEqual([{ name: "Andrés Gómez", role: "consejero" }]);
    expect(aPedidos(elecciones, personas, new Map([["andres gomez", "nuevo1"]]))).toEqual([
      { label: "V1", name: "Martha López", role: "presidente", personId: "p1" },
      { label: "V2", name: null, role: null, personId: null },
      { label: "H5", name: "Andrés Gómez", role: "consejero", personId: "nuevo1" },
    ]);
  });
  it("no crea a quien ya existe ni dos veces al mismo nombre, y una voz escrita en blanco no pide nada", () => {
    const elecciones = { V1: e(OTRA, "", "martha lópez"), V2: e(OTRA, "", "Nueva"), V3: e(OTRA, "", " nueva "), V4: e(OTRA, "", "   ") };
    expect(personasPorCrear(elecciones, personas)).toEqual([{ name: "Nueva", role: null }]);
    expect(aPedidos({ V4: e(OTRA, "", "   ") }, personas)).toEqual([{ label: "V4", name: null, role: null, personId: null }]);
  });
});
