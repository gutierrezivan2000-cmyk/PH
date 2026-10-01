import { describe, expect, it } from "vitest";
import {
  MAX_NOMBRE_PERSONA, MAX_TITULO, leerFecha, limpiarTexto, validarCambiosPersona, validarCambiosReunion,
  validarNuevaReunion, validarPersona,
} from "./validar";

const AHORA = new Date("2026-10-01T15:00:00Z");

describe("limpiarTexto", () => {
  it("junta espacios y saltos, y quita caracteres de control", () => {
    expect(limpiarTexto("  Reunión   de\n consejo\t")).toBe("Reunión de consejo");
    expect(limpiarTexto("a\u0000b\u0007c")).toBe("a b c");
  });
  it("lo que no es texto da vacío", () => {
    for (const v of [null, undefined, 5, {}, [], true]) expect(limpiarTexto(v)).toBe("");
  });
});

describe("leerFecha", () => {
  it("acepta fechas ISO razonables", () => {
    expect(leerFecha("2026-10-12T19:00:00-05:00", AHORA)?.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(leerFecha("2026-09-01", AHORA)).toBeInstanceOf(Date);
  });
  it("rechaza lo absurdo: texto, años viejos, más de 5 años adelante, otros tipos", () => {
    for (const v of ["ayer", "", "1999-12-31T00:00:00Z", "2032-01-01T00:00:00Z", 1_700_000_000_000, null, undefined, "x".repeat(60)]) {
      expect(leerFecha(v, AHORA), String(v)).toBeNull();
    }
  });
  it("una reunión futura cercana (se agenda) es válida", () => {
    expect(leerFecha("2026-10-06T22:00:00Z", AHORA)).toBeInstanceOf(Date);
  });
});

describe("validarNuevaReunion", () => {
  it("con solo la copropiedad usa los valores por defecto", () => {
    const r = validarNuevaReunion({ propertyId: "prop-1" }, AHORA);
    expect(r).toEqual({ ok: true, valor: { propertyId: "prop-1", type: "consejo", title: null, date: AHORA } });
  });
  it("limpia el título y lo conserva si viene", () => {
    const r = validarNuevaReunion({ propertyId: " p ", type: "comite", title: "  Comité   de\nconvivencia ", date: "2026-10-12T19:00:00-05:00" }, AHORA);
    expect(r.ok && r.valor).toMatchObject({ propertyId: "p", type: "comite", title: "Comité de convivencia" });
  });
  it("un título en blanco equivale a no mandarlo (el servidor propone uno)", () => {
    const r = validarNuevaReunion({ propertyId: "p", title: "   " }, AHORA);
    expect(r.ok && r.valor.title).toBeNull();
  });
  it("exige copropiedad", () => {
    for (const body of [{}, { propertyId: "" }, { propertyId: "  " }, { propertyId: 5 }, { propertyId: "x".repeat(101) }]) {
      expect(validarNuevaReunion(body, AHORA), JSON.stringify(body)).toEqual({ ok: false, error: "Elige la copropiedad de la reunión." });
    }
  });
  it("rechaza tipo, título y fecha inválidos con mensajes claros", () => {
    expect(validarNuevaReunion({ propertyId: "p", type: "fiesta" }, AHORA)).toEqual({ ok: false, error: "El tipo de reunión no es válido." });
    expect(validarNuevaReunion({ propertyId: "p", type: "toString" }, AHORA).ok).toBe(false);
    expect(validarNuevaReunion({ propertyId: "p", title: 7 }, AHORA)).toEqual({ ok: false, error: "El título no es válido." });
    const largo = validarNuevaReunion({ propertyId: "p", title: "x".repeat(MAX_TITULO + 1) }, AHORA);
    expect(largo.ok).toBe(false);
    expect(validarNuevaReunion({ propertyId: "p", title: "x".repeat(MAX_TITULO) }, AHORA).ok).toBe(true);
    expect(validarNuevaReunion({ propertyId: "p", date: "mañana" }, AHORA)).toEqual({ ok: false, error: "La fecha de la reunión no es válida." });
  });
  it("no acepta cuerpos que no son objetos", () => {
    for (const body of [null, undefined, "x", 3, [], [{ propertyId: "p" }]]) {
      expect(validarNuevaReunion(body, AHORA)).toEqual({ ok: false, error: "Solicitud no válida." });
    }
  });
});

describe("validarCambiosReunion", () => {
  it("acepta cambios parciales", () => {
    expect(validarCambiosReunion({ title: " Nuevo " }, AHORA)).toEqual({ ok: true, valor: { title: "Nuevo" } });
    expect(validarCambiosReunion({ type: "asamblea_ordinaria" }, AHORA)).toEqual({ ok: true, valor: { type: "asamblea_ordinaria" } });
    const r = validarCambiosReunion({ date: "2026-09-20T19:00:00-05:00" }, AHORA);
    expect(r.ok && r.valor.date?.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
  it("el título no puede quedar vacío", () => {
    expect(validarCambiosReunion({ title: "  " }, AHORA)).toEqual({ ok: false, error: "El título no puede quedar vacío." });
    expect(validarCambiosReunion({ title: null }, AHORA).ok).toBe(false);
  });
  it("la constancia del aviso: «now», una fecha pasada o null para quitarla", () => {
    expect(validarCambiosReunion({ consentAt: "now" }, AHORA)).toEqual({ ok: true, valor: { consentAt: AHORA } });
    expect(validarCambiosReunion({ consentAt: null }, AHORA)).toEqual({ ok: true, valor: { consentAt: null } });
    const pasada = validarCambiosReunion({ consentAt: "2026-10-01T14:58:00Z" }, AHORA);
    expect(pasada.ok && pasada.valor.consentAt?.toISOString()).toBe("2026-10-01T14:58:00.000Z");
  });
  it("la constancia no puede estar en el futuro ni ser basura", () => {
    expect(validarCambiosReunion({ consentAt: "2026-10-02T15:00:00Z" }, AHORA).ok).toBe(false);
    expect(validarCambiosReunion({ consentAt: "hoy" }, AHORA).ok).toBe(false);
    expect(validarCambiosReunion({ consentAt: true }, AHORA).ok).toBe(false);
    // Un reloj adelantado unos minutos se tolera.
    expect(validarCambiosReunion({ consentAt: "2026-10-01T15:03:00Z" }, AHORA).ok).toBe(true);
  });
  it("sin cambios o con campos ajenos no hay nada que hacer (no se cuelan campos como status o userId)", () => {
    expect(validarCambiosReunion({}, AHORA)).toEqual({ ok: false, error: "No hay nada que cambiar." });
    expect(validarCambiosReunion({ status: "lista", userId: "otro", costUsd: 0 }, AHORA)).toEqual({ ok: false, error: "No hay nada que cambiar." });
    const r = validarCambiosReunion({ title: "A", status: "lista" }, AHORA);
    expect(r).toEqual({ ok: true, valor: { title: "A" } });
  });
});

describe("validarPersona", () => {
  it("nombre limpio y rol opcional", () => {
    expect(validarPersona({ name: "  Martha   López " })).toEqual({ ok: true, valor: { name: "Martha López", role: null } });
    expect(validarPersona({ name: "Hernán Sierra", role: "revisor_fiscal" })).toEqual({ ok: true, valor: { name: "Hernán Sierra", role: "revisor_fiscal" } });
    expect(validarPersona({ name: "Ana", role: "" })).toEqual({ ok: true, valor: { name: "Ana", role: null } });
  });
  it("rechaza nombres cortos o largos, y roles desconocidos", () => {
    expect(validarPersona({ name: "A" })).toEqual({ ok: false, error: "Escribe el nombre de la persona." });
    expect(validarPersona({})).toEqual({ ok: false, error: "Escribe el nombre de la persona." });
    expect(validarPersona({ name: "x".repeat(MAX_NOMBRE_PERSONA + 1) }).ok).toBe(false);
    expect(validarPersona({ name: "Ana", role: "rey" })).toEqual({ ok: false, error: "El rol no es válido." });
    expect(validarPersona(null)).toEqual({ ok: false, error: "Solicitud no válida." });
  });
});

describe("validarCambiosPersona", () => {
  it("cambios parciales, incluido quitar el rol y desactivar", () => {
    expect(validarCambiosPersona({ name: "Luz Ortiz" })).toEqual({ ok: true, valor: { name: "Luz Ortiz" } });
    expect(validarCambiosPersona({ role: null })).toEqual({ ok: true, valor: { role: null } });
    expect(validarCambiosPersona({ role: "consejero", active: false })).toEqual({ ok: true, valor: { role: "consejero", active: false } });
  });
  it("valida cada campo y exige al menos uno", () => {
    expect(validarCambiosPersona({})).toEqual({ ok: false, error: "No hay nada que cambiar." });
    expect(validarCambiosPersona({ name: "" }).ok).toBe(false);
    expect(validarCambiosPersona({ role: "rey" }).ok).toBe(false);
    expect(validarCambiosPersona({ active: "no" })).toEqual({ ok: false, error: "El estado no es válido." });
    expect(validarCambiosPersona({ propertyId: "otra" })).toEqual({ ok: false, error: "No hay nada que cambiar." });
  });
});
