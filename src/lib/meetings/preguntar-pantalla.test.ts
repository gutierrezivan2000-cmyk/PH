import { describe, expect, it } from "vitest";
import { FICHA_SEPTIEMBRE } from "./demo-datos";
import { MAX_TURNOS_DE_HISTORIAL } from "./preguntar-pedido";
import { historialParaEnviar, MARGEN_DEL_FINAL_PX, subioAReleer, sugerenciasDePregunta, textoEnCurso, type TurnoDeConversacion } from "./preguntar-pantalla";

describe("sugerenciasDePregunta", () => {
  it("con la ficha: las que sirven para cualquier reunión, una sobre un tema de esta y las votaciones", () => {
    expect(sugerenciasDePregunta(FICHA_SEPTIEMBRE)).toEqual([
      "¿Qué se decidió en la reunión?",
      "¿Qué se dijo sobre «Informe de cartera y recaudo»?",
      "¿Qué compromisos quedaron y quién los asumió?",
      "¿Cómo salieron las votaciones?",
    ]);
  });

  it("sin votaciones pregunta por lo pendiente; sin ficha, solo lo general", () => {
    expect(sugerenciasDePregunta({ ...FICHA_SEPTIEMBRE, votaciones: [] })[3]).toBe("¿Qué quedó pendiente?");
    expect(sugerenciasDePregunta(null)).toEqual(["¿Qué se decidió en la reunión?", "¿Qué compromisos quedaron y quién los asumió?", "¿Qué quedó pendiente?"]);
    expect(sugerenciasDePregunta({ ordenDelDia: [], votaciones: [] })).toHaveLength(3);
  });

  it("el tema que sugiere no es el de apertura ni el de cierre; con pocos temas usa el que haya", () => {
    const f = { votaciones: [], ordenDelDia: [{ titulo: "Verificación del quórum", inicioS: 0 }, { titulo: "Proposiciones y varios", inicioS: 9000 }, { titulo: "Mantenimiento de ascensores", inicioS: 3000 }, { titulo: "Seguridad", inicioS: 5000 }] };
    expect(sugerenciasDePregunta(f)[1]).toBe("¿Qué se dijo sobre «Mantenimiento de ascensores»?");
    expect(sugerenciasDePregunta({ votaciones: [], ordenDelDia: [{ titulo: "Único tema", inicioS: 0 }] })[1]).toBe("¿Qué se dijo sobre «Único tema»?");
    expect(sugerenciasDePregunta({ votaciones: [], ordenDelDia: [{ titulo: "  ", inicioS: 0 }] })).toHaveLength(3);
  });

  it("un título muy largo se recorta para que la pregunta quepa", () => {
    const largo = "Presentación y discusión del informe detallado de la revisoría fiscal sobre los estados financieros del año anterior";
    const s = sugerenciasDePregunta({ votaciones: [], ordenDelDia: [{ titulo: "Apertura", inicioS: 0 }, { titulo: largo, inicioS: 100 }, { titulo: "Cierre", inicioS: 900 }] });
    expect(s[1].length).toBeLessThan(90);
    expect(s[1]).toMatch(/…»\?$/);
  });

  it("nunca más de cuatro, sin repetir", () => {
    const s = sugerenciasDePregunta(FICHA_SEPTIEMBRE);
    expect(s.length).toBeLessThanOrEqual(4);
    expect(new Set(s).size).toBe(s.length);
  });
});

describe("textoEnCurso", () => {
  it("quita un marcador que todavía no terminó de llegar", () => {
    expect(textoEnCurso("Se aprobó la prórroga. [[t=00:4")).toBe("Se aprobó la prórroga. ");
    expect(textoEnCurso("Se aprobó. [[")).toBe("Se aprobó. ");
    expect(textoEnCurso("Se aprobó. [")).toBe("Se aprobó. ");
    expect(textoEnCurso("Se aprobó. [[t=00:41:05]")).toBe("Se aprobó. ");
  });
  it("deja intacto lo que está completo", () => {
    expect(textoEnCurso("Se aprobó. [[t=00:41:05]]")).toBe("Se aprobó. [[t=00:41:05]]");
    expect(textoEnCurso("Se aprobó. [[t=00:41:05]] Luego")).toBe("Se aprobó. [[t=00:41:05]] Luego");
    expect(textoEnCurso("Texto sin marcadores")).toBe("Texto sin marcadores");
    expect(textoEnCurso("")).toBe("");
  });
  it("un corchete de otra línea no se confunde: solo cuenta el que está al final de la última línea", () => {
    expect(textoEnCurso("[[t=00:10:00]] uno\nsegunda línea [[t=")).toBe("[[t=00:10:00]] uno\nsegunda línea ");
    expect(textoEnCurso("línea [a]\nfin")).toBe("línea [a]\nfin");
  });
});

describe("subioAReleer", () => {
  const maximo = 2000;
  it("la pantalla se movió hacia arriba y quedó lejos del final: subió a releer", () => {
    expect(subioAReleer({ antes: 1984, ahora: 1484, maximo })).toBe(true);
    expect(subioAReleer({ antes: 900, ahora: 100, maximo })).toBe(true);
  });
  it("bajar, o quedarse quieta, no es subir", () => {
    expect(subioAReleer({ antes: 1000, ahora: 1400, maximo })).toBe(false);
    expect(subioAReleer({ antes: 1000, ahora: 1000, maximo })).toBe(false);
    expect(subioAReleer({ antes: 1000, ahora: 999.5, maximo })).toBe(false); // medio píxel de redondeo no cuenta
  });
  it("si sigue al final es que la página se acortó y el navegador la ajustó: no es releer", () => {
    expect(subioAReleer({ antes: 1984, ahora: 1900, maximo: 1920 })).toBe(false);
    expect(subioAReleer({ antes: 1984, ahora: 1960, maximo })).toBe(false);
  });
  it("el margen del final es el que se declara: justo en el borde sigue contando como al final", () => {
    expect(subioAReleer({ antes: 1990, ahora: maximo - MARGEN_DEL_FINAL_PX, maximo })).toBe(false);
    expect(subioAReleer({ antes: 1990, ahora: maximo - MARGEN_DEL_FINAL_PX - 1, maximo })).toBe(true);
  });
  it("subir un solo píxel ya cuenta (hay una zona muerta de 1 px por redondeo)", () => {
    expect(subioAReleer({ antes: 500, ahora: 498, maximo })).toBe(true);
    expect(subioAReleer({ antes: 500, ahora: 499, maximo })).toBe(false);
  });
});

describe("historialParaEnviar", () => {
  const u = (id: string, texto: string): TurnoDeConversacion => ({ id, rol: "user", texto });
  const a = (id: string, texto: string, estado: "escribiendo" | "lista" | "cortada" | "detenida" | "error" = "lista"): TurnoDeConversacion => ({ id, rol: "assistant", texto, estado });

  it("las preguntas con su respuesta completa, en orden", () => {
    expect(historialParaEnviar([u("1", "p1"), a("2", "r1"), u("3", "p2"), a("4", "r2")])).toEqual([
      { rol: "user", texto: "p1" }, { rol: "assistant", texto: "r1" }, { rol: "user", texto: "p2" }, { rol: "assistant", texto: "r2" },
    ]);
  });

  it("una respuesta que falló, se detuvo, sigue escribiéndose o salió vacía no cuenta (ni su pregunta); una cortada sí", () => {
    const h = historialParaEnviar([
      u("1", "p1"), a("2", "r1", "error"), u("3", "p2"), a("4", "parcial", "detenida"), u("5", "p3"), a("6", "", "lista"),
      u("7", "p4"), a("8", "larga…", "cortada"), u("9", "p5"), a("10", "escribiendo…", "escribiendo"),
    ]);
    expect(h).toEqual([{ rol: "user", texto: "p4" }, { rol: "assistant", texto: "larga…" }]);
  });

  it("solo los últimos turnos, y sin dejar una respuesta suelta al empezar", () => {
    const turnos: TurnoDeConversacion[] = [];
    for (let i = 0; i < 8; i++) turnos.push(u(`u${i}`, `p${i}`), a(`a${i}`, `r${i}`));
    const h = historialParaEnviar(turnos);
    expect(h).toHaveLength(MAX_TURNOS_DE_HISTORIAL);
    expect(h[0]).toEqual({ rol: "user", texto: "p3" });
    expect(h[h.length - 1]).toEqual({ rol: "assistant", texto: "r7" });
  });

  it("sin conversación, no hay historial", () => {
    expect(historialParaEnviar([])).toEqual([]);
    expect(historialParaEnviar([u("1", "sola")])).toEqual([]);
  });
});
