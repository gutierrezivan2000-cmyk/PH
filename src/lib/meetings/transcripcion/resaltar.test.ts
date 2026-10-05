/** Marcar lo buscado en un texto: sin tildes ni mayúsculas, y la marca cae sobre lo que se lee. */
import { describe, expect, it } from "vitest";
import { terminosDeBusqueda } from "./paginas";
import { resaltarCoincidencias, textoDeCoincidencias } from "./resaltar";

const marcas = (texto: string, q: string) => resaltarCoincidencias(texto, terminosDeBusqueda(q)).filter((t) => t.marca).map((t) => t.texto);
const unido = (texto: string, q: string) => resaltarCoincidencias(texto, terminosDeBusqueda(q)).map((t) => t.texto).join("");

describe("resaltarCoincidencias", () => {
  it("sin palabras o sin texto no hay nada que marcar", () => {
    expect(resaltarCoincidencias("Hola", [])).toEqual([{ texto: "Hola", marca: false }]);
    expect(resaltarCoincidencias("", ["a"])).toEqual([{ texto: "", marca: false }]);
    expect(resaltarCoincidencias("Hola", [""])).toEqual([{ texto: "Hola", marca: false }]);
  });

  it("marca la palabra donde está y deja el resto tal cual", () => {
    expect(resaltarCoincidencias("Hablemos del ascensor ahora", terminosDeBusqueda("ascensor"))).toEqual([
      { texto: "Hablemos del ", marca: false },
      { texto: "ascensor", marca: true },
      { texto: " ahora", marca: false },
    ]);
  });

  it("no distingue mayúsculas ni tildes, pero conserva lo que está escrito en el texto", () => {
    expect(marcas("La REUNIÓN de hoy y la reunion de ayer", "reunion")).toEqual(["REUNIÓN", "reunion"]);
    expect(marcas("Sesión extraordinaria", "SESION")).toEqual(["Sesión"]);
    expect(marcas("el administrador", "administrádor")).toEqual(["administrador"]);
    expect(marcas("el año pasado", "ano")).toEqual(["año"]); // la «ñ» se busca como «n» (igual que en el servidor)
  });

  it("marca todas las apariciones y de todas las palabras buscadas", () => {
    expect(marcas("el contrato del ascensor y otro contrato", "contrato ascensor")).toEqual(["contrato", "ascensor", "contrato"]);
  });

  it("dos palabras buscadas pegadas quedan en una sola marca; las que se pisan, también", () => {
    expect(resaltarCoincidencias("cuota extraordinaria", terminosDeBusqueda("cuota extraordinaria"))).toEqual([
      { texto: "cuota", marca: true },
      { texto: " ", marca: false },
      { texto: "extraordinaria", marca: true },
    ]);
    // «extra» está dentro de «extraordinaria»: una sola marca sobre toda la palabra
    expect(marcas("cuota extraordinaria", "extra extraordinaria")).toEqual(["extraordinaria"]);
    // «ordina» (0–6) y «dinar» (2–7) se pisan en «ordinario»: una sola marca sobre «ordinar»
    expect(marcas("ordinario", "ordina dinar")).toEqual(["ordinar"]);
    // en «fecundinar», «cundi» y «dinar» se pisan; en «ordinar», «dinar» está solo
    expect(marcas("fecundinar ordinar", "cundi dinar")).toEqual(["cundinar", "dinar"]);
  });

  it("también marca dentro de una palabra (buscar «cuota» encuentra «cuotas»)", () => {
    expect(marcas("las cuotas atrasadas", "cuota")).toEqual(["cuota"]);
    expect(unido("las cuotas atrasadas", "cuota")).toBe("las cuotas atrasadas");
  });

  it("sirve con letras acentuadas, «ñ», emojis y tildes sueltas sin correr la marca", () => {
    expect(marcas("¡Ñandú 🎉 con ñoñería!", "noneria")).toEqual(["ñoñería"]);
    expect(marcas("🎉🎉 fiesta 🎉", "fiesta")).toEqual(["fiesta"]);
    // «é» escrita como «e» + tilde suelta (NFD): la marca cubre las dos piezas
    const suelta = "café caliente";
    expect(marcas(suelta, "cafe")).toEqual(["café"]);
    expect(unido(suelta, "cafe")).toBe(suelta);
  });

  it("los trozos siempre juntan el texto original, sin perder ni repetir nada", () => {
    for (const [texto, q] of [
      ["Buenas noches, vamos a verificar el quórum.", "quorum noches"],
      ["a a a a", "a"],
      ["sin coincidencias aquí", "zzz"],
      ["Reunión REUNIÓN reunión", "reunion"],
    ] as const) {
      expect(unido(texto, q)).toBe(texto);
    }
  });

  it("lo que no se encuentra devuelve el texto entero sin marcar", () => {
    expect(resaltarCoincidencias("nada de esto", terminosDeBusqueda("presupuesto"))).toEqual([{ texto: "nada de esto", marca: false }]);
  });

  it("no tarda con un texto largo", () => {
    const largo = "la asamblea aprobó el presupuesto ".repeat(2_000);
    const t0 = Date.now();
    const trozos = resaltarCoincidencias(largo, terminosDeBusqueda("presupuesto asamblea"));
    expect(Date.now() - t0).toBeLessThan(500);
    expect(trozos.filter((t) => t.marca)).toHaveLength(4_000);
  });
});

describe("textoDeCoincidencias", () => {
  it("dice cuántas, y con «hay más» avisa que son más de las que se muestran", () => {
    expect(textoDeCoincidencias(0, false)).toBe("Sin coincidencias");
    expect(textoDeCoincidencias(1, false)).toBe("1 coincidencia");
    expect(textoDeCoincidencias(12, false)).toBe("12 coincidencias");
    expect(textoDeCoincidencias(200, true)).toBe("Más de 200 coincidencias");
  });
});
