import { describe, expect, it } from "vitest";
import { MAX_FUENTE_BYTES } from "./tipos";
import {
  MAX_NOMBRE_PERSONA, MAX_TITULO, leerFecha, limpiarTexto, validarCambiosPersona, validarCambiosReunion,
  validarNuevaReunion, validarPedidoToken, validarPersona, validarRegistroFuente,
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

describe("validarPedidoToken", () => {
  const ID = "m1abcdefg";
  const ok = { nombre: "consejo.m4a", tamano: 64_000_000, tipo: "audio/mp4" };

  it("acepta una grabación de audio o de video", () => {
    expect(validarPedidoToken(ok, ID)).toEqual({ ok: true, valor: { ...ok, pathname: null } });
    const video = validarPedidoToken({ nombre: "zoom.mp4", tamano: 1_500_000_000, tipo: "video/mp4" }, ID);
    expect(video.ok && video.valor.tipo).toBe("video/mp4");
  });
  it("acepta archivos de varios GB (una reunión de 8 h en WAV pesa ~5,5 GB) y hasta el tope", () => {
    expect(validarPedidoToken({ nombre: "a.wav", tamano: 5_900_000_000, tipo: "audio/wav" }, ID).ok).toBe(true);
    expect(validarPedidoToken({ nombre: "a.wav", tamano: MAX_FUENTE_BYTES, tipo: "audio/wav" }, ID).ok).toBe(true);
  });
  it("sobre el tope explica qué hacer (partir en varios archivos)", () => {
    const r = validarPedidoToken({ nombre: "enorme.wav", tamano: MAX_FUENTE_BYTES + 1, tipo: "audio/wav" }, ID);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/20\.0 GB.*pártela en varios archivos/);
  });
  it("si el navegador no sabe el tipo, lo deduce de la extensión", () => {
    const vacio = validarPedidoToken({ nombre: "nota.m4a", tamano: 10, tipo: "" }, ID);
    expect(vacio.ok && vacio.valor.tipo).toBe("audio/mp4");
    const generico = validarPedidoToken({ nombre: "iphone.MOV", tamano: 10, tipo: "application/octet-stream" }, ID);
    expect(generico.ok && generico.valor.tipo).toBe("video/quicktime");
    const sin = validarPedidoToken({ nombre: "x.mp3", tamano: 10 }, ID);
    expect(sin.ok && sin.valor.tipo).toBe("audio/mpeg");
  });
  it("un tipo declarado que no es de audio ni video se ignora, pero la extensión manda", () => {
    const r = validarPedidoToken({ nombre: "x.mp3", tamano: 10, tipo: "application/pdf" }, ID);
    expect(r.ok && r.valor.tipo).toBe("audio/mpeg");
  });
  it("rechaza lo que no es una grabación", () => {
    for (const nombre of ["acta.pdf", "presupuesto.xlsx", "foto.jpg", "sin-extension", "script.exe"]) {
      const r = validarPedidoToken({ nombre, tamano: 10, tipo: "audio/mpeg" }, ID);
      expect(r.ok, nombre).toBe(false);
      expect(!r.ok && r.error).toMatch(/no parece una grabación/);
    }
  });
  it("rechaza tamaños inválidos y nombres vacíos o larguísimos", () => {
    for (const tamano of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "10", null, undefined]) {
      expect(validarPedidoToken({ nombre: "a.mp3", tamano }, ID).ok, String(tamano)).toBe(false);
    }
    expect(validarPedidoToken({ tamano: 10 }, ID)).toEqual({ ok: false, error: "Falta el nombre del archivo." });
    expect(validarPedidoToken({ nombre: `${"a".repeat(300)}.mp3`, tamano: 10 }, ID).ok).toBe(false);
  });
  it("al reanudar acepta SOLO la ruta de esta reunión con la forma exacta", () => {
    const propia = `meetings/${ID}/fuentes/ab12cd34-consejo.m4a`;
    const r = validarPedidoToken({ ...ok, pathname: propia }, ID);
    expect(r.ok && r.valor.pathname).toBe(propia);
    for (const mala of ["meetings/otra12345/fuentes/ab12cd34-x.mp3", `meetings/${ID}/norm/ab12cd34-x.mp3`, `meetings/${ID}/fuentes/../../otra/x.mp3`, "../x", 5, {}]) {
      expect(validarPedidoToken({ ...ok, pathname: mala }, ID), String(mala)).toEqual({ ok: false, error: "La ruta de la subida no es válida." });
    }
    // Vacío o null equivale a una subida nueva.
    expect(validarPedidoToken({ ...ok, pathname: null }, ID).ok).toBe(true);
    expect(validarPedidoToken({ ...ok, pathname: "" }, ID).ok).toBe(true);
  });
  it("no acepta cuerpos que no son objetos", () => {
    for (const b of [null, undefined, "x", 3, []]) expect(validarPedidoToken(b, ID)).toEqual({ ok: false, error: "Solicitud no válida." });
  });
});

describe("validarRegistroFuente", () => {
  const ID = "m1abcdefg";
  const pathname = `meetings/${ID}/fuentes/ab12cd34-consejo.m4a`;
  const url = `https://abc123.private.blob.vercel-storage.com/${pathname}`;
  const ok = { url, pathname, nombre: "consejo.m4a", tamano: 64_000_000, tipo: "audio/mp4" };

  it("acepta un archivo ya subido a ESTA reunión", () => {
    expect(validarRegistroFuente(ok, ID)).toEqual({ ok: true, valor: ok });
  });
  it("exige una URL de Blob (https y dominio de Vercel) que corresponda a la ruta", () => {
    for (const u of [
      `http://abc123.private.blob.vercel-storage.com/${pathname}`,
      `https://servidor-del-atacante.com/${pathname}`,
      `https://abc123.private.blob.vercel-storage.com/meetings/${ID}/fuentes/zz99zz99-otro.m4a`,
      "no es una url", "", null, 5,
    ]) {
      expect(validarRegistroFuente({ ...ok, url: u }, ID), String(u)).toEqual({ ok: false, error: "La dirección del archivo no es válida." });
    }
  });
  it("exige una ruta de esta reunión", () => {
    for (const p of [`meetings/otra12345/fuentes/ab12cd34-x.m4a`, "", null, undefined, `meetings/${ID}/audio.mp3`]) {
      expect(validarRegistroFuente({ ...ok, pathname: p }, ID), String(p)).toEqual({ ok: false, error: "La ruta del archivo no es válida." });
    }
  });
  it("valida también nombre, tamaño y tipo", () => {
    expect(validarRegistroFuente({ ...ok, nombre: "acta.pdf" }, ID).ok).toBe(false);
    expect(validarRegistroFuente({ ...ok, tamano: 0 }, ID).ok).toBe(false);
    expect(validarRegistroFuente(null, ID)).toEqual({ ok: false, error: "Solicitud no válida." });
  });
});
