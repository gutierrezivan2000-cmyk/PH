import { describe, expect, it } from "vitest";
import { LIMITES, colorHex, cuerpoComoObjeto, esCorreoValido, identificadorReset, normalizarCorreo, textoAcotado, urlHttps } from "./validar-entrada";

describe("textoAcotado", () => {
  it("recorta y devuelve el texto", () => {
    expect(textoAcotado("  Ana  ", "El nombre", 10)).toEqual({ ok: true, valor: "Ana" });
  });
  it("rechaza lo que no es texto en vez de convertirlo", () => {
    for (const v of [5, true, null, {}, [], ["a"], () => "a"]) expect(textoAcotado(v, "El nombre", 10)).toEqual({ ok: false, error: "El nombre debe ser texto." });
  });
  it("opcional por omisión: ausente es «no es texto», vacío es válido y sirve para borrar", () => {
    expect(textoAcotado("   ", "La ciudad", 10)).toEqual({ ok: true, valor: "" });
  });
  it("obligatorio: ausente o vacío dicen «es obligatorio», no «debe ser texto»", () => {
    expect(textoAcotado(undefined, "El asunto", 10, { obligatorio: true })).toEqual({ ok: false, error: "El asunto es obligatorio." });
    expect(textoAcotado("  ", "El asunto", 10, { obligatorio: true })).toEqual({ ok: false, error: "El asunto es obligatorio." });
    expect(textoAcotado(null, "El asunto", 10, { obligatorio: true })).toEqual({ ok: false, error: "El asunto debe ser texto." });
  });
  it("el largo se mide recortado: el máximo pasa y uno más no", () => {
    expect(textoAcotado(` ${"a".repeat(10)} `, "X", 10).ok).toBe(true);
    expect(textoAcotado("a".repeat(11), "El nombre", 10)).toEqual({ ok: false, error: "El nombre no puede pasar de 10 caracteres." });
  });
  it("una sola línea rechaza saltos y tabulaciones; varias líneas los admite pero no el NUL", () => {
    expect(textoAcotado("a\nb", "X", 10).ok).toBe(false);
    expect(textoAcotado("a\tb", "X", 10).ok).toBe(false);
    expect(textoAcotado("a\nb\tc\r\nd", "X", 20, { variasLineas: true }).ok).toBe(true);
    expect(textoAcotado("a\u0000b", "X", 10, { variasLineas: true })).toEqual({ ok: false, error: "X tiene caracteres no permitidos." });
    expect(textoAcotado("a\u001bb", "X", 10, { variasLineas: true }).ok).toBe(false);
  });
  it("deja pasar tildes, ñ y emojis", () => {
    expect(textoAcotado("Ñandú 🏢 Bogotá", "X", 30)).toMatchObject({ ok: true });
  });
});

describe("urlHttps", () => {
  const BLOB = "https://abc123.public.blob.vercel-storage.com/subidas/u1/branding/logo-x1y2z3.png";
  it("acepta una URL https (como las del almacenamiento) y vacío", () => {
    expect(urlHttps(BLOB, "El logo")).toEqual({ ok: true, valor: BLOB });
    expect(urlHttps(`  ${BLOB}  `, "El logo")).toEqual({ ok: true, valor: BLOB });
    expect(urlHttps("", "El logo")).toEqual({ ok: true, valor: "" });
    expect(urlHttps("https://a.example/ruta%20con%20espacio.png?v=1#x", "El logo").ok).toBe(true);
  });
  it.each([
    "http://a.example/x.png",
    "ftp://a.example/x.png",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "//a.example/x.png",
    "a.example/x.png",
    "https://",
    "https:///x.png",
    "https://user@a.example/x.png",
    "https://user:clave@a.example/x.png",
    "https://a.example/x y.png",
    'https://a.example/x"onerror="y',
    "https://a.example/x'y",
    "https://a.example/<x>",
    "https://a.example/`x`",
    "https://a.example\\.evil.example/x",
    "https://a.example/ñ.png",
    "https://a.example/x\u0000.png",
    "https://a.example/x\n.png",
  ])("rechaza %j", (u) => {
    expect(urlHttps(u, "El logo")).toEqual({ ok: false, error: "El logo debe ser una dirección https válida." });
  });
  it("rechaza lo que no es texto y lo que pasa del máximo", () => {
    expect(urlHttps(5, "El logo")).toEqual({ ok: false, error: "El logo debe ser texto." });
    expect(urlHttps({ href: BLOB }, "El logo").ok).toBe(false);
    const largo = `https://a.example/${"a".repeat(LIMITES.url)}`;
    expect(urlHttps(largo, "El logo")).toEqual({ ok: false, error: `El logo no puede pasar de ${LIMITES.url} caracteres.` });
    expect(urlHttps(largo.slice(0, LIMITES.url), "El logo").ok).toBe(true);
  });
});

describe("colorHex", () => {
  it("acepta #rrggbb en cualquier caja, recortado, y vacío", () => {
    expect(colorHex(" #1A2b3C ", "El color")).toEqual({ ok: true, valor: "#1A2b3C" });
    expect(colorHex("", "El color")).toEqual({ ok: true, valor: "" });
  });
  it("rechaza lo demás", () => {
    for (const v of ["rojo", "#abc", "#12345g", "1a2b3c", "#1a2b3c4d", 5, null, {}]) expect(colorHex(v, "El color").ok).toBe(false);
  });
});

describe("cuerpoComoObjeto", () => {
  it("solo un objeto simple pasa", () => {
    expect(cuerpoComoObjeto({ a: 1 })).toEqual({ a: 1 });
    for (const v of [null, undefined, [], [1], "x", 5, true]) expect(cuerpoComoObjeto(v)).toBeNull();
  });
});

describe("normalizarCorreo / esCorreoValido", () => {
  it("recorta y pasa a minúsculas", () => {
    expect(normalizarCorreo("  Ana@X.CO ")).toBe("ana@x.co");
    expect(esCorreoValido("ana@x.co")).toBe(true);
  });
  it("rechaza lo que no es texto", () => {
    for (const v of [undefined, null, 5, {}, [], ["a@b.co"]]) expect(normalizarCorreo(v)).toBeNull();
  });
  it("rechaza ':' (no puede imitar el prefijo pwreset:) y cualquier espacio, también unicode", () => {
    for (const v of ["pwreset:ana@x.co", "ana@x.co:1", "a na@x.co", "ana@x.co\u00a0z", "ana\u2003@x.co", "an\na@x.co", "a\u0000@x.co"]) {
      expect(normalizarCorreo(v)).toBeNull();
    }
  });
  it("rechaza formatos sin arroba, sin dominio o con arrobas de más", () => {
    for (const v of ["", "   ", "ana", "ana@x", "@x.co", "a@@x.co", "a@b@x.co"]) expect(normalizarCorreo(v)).toBeNull();
  });
  it("tope de 254 caracteres", () => {
    const largo = (n: number) => "a".repeat(n - "@x.co".length) + "@x.co";
    expect(normalizarCorreo(largo(254))).toBe(largo(254));
    expect(normalizarCorreo(largo(255))).toBeNull();
  });
  it("acepta unicode sin espacios (correos internacionales)", () => {
    expect(normalizarCorreo("Ñandú@Ejemplo.CO")).toBe("ñandú@ejemplo.co");
  });
  it("el identifier de un correo válido nunca empieza por el prefijo de recuperación", () => {
    expect(normalizarCorreo("ana@x.co")!.startsWith("pwreset:")).toBe(false);
    expect(identificadorReset("ana@x.co")).toBe("pwreset:ana@x.co");
  });
});
