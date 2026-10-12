import { describe, expect, it } from "vitest";
import { avisoDeReintento } from "./reintento-lote";

describe("aviso del reintento de un lote", () => {
  it("un reintento completo no necesita aviso (el avance del lote ya lo muestra)", () => {
    expect(avisoDeReintento(true, 200, { requeued: 3, skippedCap: 0, skippedAntiguas: 0 })).toBeNull();
  });

  it("429: muestra el mensaje del servidor tal cual", () => {
    const error = "Llegaste al tope de 100 generaciones de este mes. Las fallidas se podrán reintentar cuando se renueve el cupo.";
    expect(avisoDeReintento(false, 429, { error, requeued: 0, skippedCap: 4, skippedAntiguas: 0 })).toEqual({ tipo: "error", titulo: error });
  });

  it("400 por fallidas de un mes anterior: muestra el mensaje del servidor", () => {
    const error = "Estas fallidas son de un mes anterior y no se reintentan. Crea un lote nuevo con las mismas propiedades.";
    expect(avisoDeReintento(false, 400, { error })).toEqual({ tipo: "error", titulo: error });
  });

  it("sin un `error` legible usa un texto en español según el código, y uno genérico para los demás", () => {
    expect(avisoDeReintento(false, 429, null)?.titulo).toMatch(/tope/);
    expect(avisoDeReintento(false, 400, "<html>")?.titulo).toMatch(/mes anterior/);
    expect(avisoDeReintento(false, 403, {})?.titulo).toMatch(/permiso/);
    expect(avisoDeReintento(false, 404, { error: "  " })?.titulo).toMatch(/lote/);
    expect(avisoDeReintento(false, 502, undefined)).toEqual({ tipo: "error", titulo: "No se pudieron reintentar las fallidas. Inténtalo de nuevo en un momento." });
  });

  it("un `error` que no es texto no se muestra", () => {
    expect(avisoDeReintento(false, 500, { error: { a: 1 } })?.titulo).toMatch(/No se pudieron reintentar/);
  });

  it("reencoló parte y el tope dejó el resto: lo dice, con singular y plural", () => {
    const varias = avisoDeReintento(true, 200, { requeued: 2, skippedCap: 3, skippedAntiguas: 0 });
    expect(varias).toEqual({
      tipo: "aviso",
      titulo: "Reencolamos 2 fallidas.",
      texto: "3 siguen fallidas porque llegaste al tope mensual: podrás reintentarlas cuando se renueve el cupo.",
    });
    const una = avisoDeReintento(true, 200, { requeued: 1, skippedCap: 1, skippedAntiguas: 0 });
    expect(una?.titulo).toBe("Reencolamos 1 fallida.");
    expect(una?.texto).toBe("1 sigue fallida porque llegaste al tope mensual: podrás reintentarla cuando se renueve el cupo.");
  });

  it("reencoló parte y otras eran de un mes anterior: lo dice y manda a crear un lote nuevo", () => {
    const a = avisoDeReintento(true, 200, { requeued: 4, skippedCap: 0, skippedAntiguas: 2 });
    expect(a?.tipo).toBe("aviso");
    expect(a?.titulo).toBe("Reencolamos 4 fallidas.");
    expect(a?.texto).toBe("2 son de un mes anterior y no se reintentan: crea un lote nuevo con esas propiedades.");
    expect(avisoDeReintento(true, 200, { requeued: 1, skippedAntiguas: 1 })?.texto).toBe(
      "1 es de un mes anterior y no se reintenta: crea un lote nuevo con esa propiedad.",
    );
  });

  it("junta las dos razones en un solo aviso", () => {
    const a = avisoDeReintento(true, 200, { requeued: 1, skippedCap: 2, skippedAntiguas: 1 });
    expect(a?.texto).toContain("tope mensual");
    expect(a?.texto).toContain("mes anterior");
  });

  it("si no se reencoló ninguna pero se saltó alguna, no dice 'Reencolamos 0'", () => {
    expect(avisoDeReintento(true, 200, { requeued: 0, skippedCap: 2 })?.titulo).toBe("No se reencoló ninguna fallida.");
  });

  it("si no había nada que reintentar, avisa en vez de quedarse callado", () => {
    expect(avisoDeReintento(true, 200, { requeued: 0, skippedCap: 0, skippedAntiguas: 0 })).toEqual({ tipo: "aviso", titulo: "No había fallidas para reintentar." });
    expect(avisoDeReintento(true, 200, null)?.titulo).toBe("No había fallidas para reintentar.");
  });

  it("los contadores raros (texto, negativos, NaN, decimales) no rompen el aviso", () => {
    expect(avisoDeReintento(true, 200, { requeued: "3", skippedCap: -2, skippedAntiguas: Number.NaN })?.titulo).toBe("No había fallidas para reintentar.");
    expect(avisoDeReintento(true, 200, { requeued: 2.9, skippedCap: 1.2 })?.titulo).toBe("Reencolamos 2 fallidas.");
  });
});
