import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ErrorIA, MODELO_POR_DEFECTO, PRECIOS_USD_POR_MTOK, USO_VACIO, aErrorIA, calcularUso, crearClienteIA, esfuerzoDeReuniones, modeloDeReuniones,
  reiniciarRespaldo, sumarUso, type ClienteDeAnthropic, type EntradaIA, type MensajeCrudo,
} from "./ia";

const ESQUEMA = { type: "object", properties: { x: { type: "string" } }, required: ["x"], additionalProperties: false };
const entrada = (extra: Partial<EntradaIA> = {}): EntradaIA => ({
  etiqueta: "el bloque 2", sistema: "Eres un analista.", usuario: "texto de la reunión", esquema: ESQUEMA, timeoutMs: 120_000, ...extra,
});
const mensaje = (extra: Partial<MensajeCrudo> = {}): MensajeCrudo => ({
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: '{"x":"hola"}' }],
  usage: { input_tokens: 1_000, output_tokens: 200 },
  ...extra,
});

/** Un cliente de Anthropic falso que guarda lo que se le pidió. */
function clienteFalso(respuestas: Array<MensajeCrudo | Error>) {
  const llamadas: Array<{ params: Record<string, unknown>; opciones: Record<string, unknown> | undefined }> = [];
  const cliente: ClienteDeAnthropic = {
    beta: {
      messages: {
        stream(params, opciones) {
          llamadas.push({ params, opciones });
          const r = respuestas.shift();
          return { finalMessage: async () => { if (r instanceof Error) throw r; return r as MensajeCrudo; } };
        },
      },
    },
  };
  return { cliente, llamadas };
}
const conStatus = (status: number | undefined, message = "falló") => Object.assign(new Error(message), { status });

beforeEach(() => reiniciarRespaldo());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("configuración", () => {
  it("el modelo es Claude Opus 5.5 salvo que MEETINGS_MODEL diga otro", () => {
    expect(MODELO_POR_DEFECTO).toBe("claude-opus-5-5");
    expect(modeloDeReuniones({})).toBe("claude-opus-5-5");
    expect(modeloDeReuniones({ MEETINGS_MODEL: " claude-sonnet-5-5 " })).toBe("claude-sonnet-5-5");
    expect(modeloDeReuniones({ MEETINGS_MODEL: "  " })).toBe("claude-opus-5-5");
  });

  it("el esfuerzo es «high» salvo que MEETINGS_EFFORT diga otro nivel válido", () => {
    expect(esfuerzoDeReuniones({})).toBe("high");
    expect(esfuerzoDeReuniones({ MEETINGS_EFFORT: "MEDIUM" })).toBe("medium");
    expect(esfuerzoDeReuniones({ MEETINGS_EFFORT: "xhigh" })).toBe("xhigh");
    expect(esfuerzoDeReuniones({ MEETINGS_EFFORT: "altísimo" })).toBe("high");
    expect(esfuerzoDeReuniones({}, "medium")).toBe("medium");
  });
});

describe("la petición", () => {
  it("pide JSON con el esquema, esfuerzo explícito y respaldo, y NO manda thinking ni temperature", async () => {
    const { cliente, llamadas } = clienteFalso([mensaje()]);
    const senal = new AbortController().signal;
    await crearClienteIA({ cliente }).generarJson(entrada({ senal, timeoutMs: 90_000 }));
    expect(llamadas).toHaveLength(1);
    const { params, opciones } = llamadas[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 32_000,
      system: "Eres un analista.",
      messages: [{ role: "user", content: "texto de la reunión" }],
      output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    for (const prohibido of ["thinking", "temperature", "top_p", "top_k", "tool_choice"]) expect(params, prohibido).not.toHaveProperty(prohibido);
    expect(opciones).toEqual({ timeout: 90_000, signal: senal, maxRetries: 0 });
  });

  it("respeta el esfuerzo y el tope de tokens que se pidan, y el modelo de MEETINGS_MODEL", async () => {
    vi.stubEnv("MEETINGS_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("MEETINGS_EFFORT", "low");
    const { cliente, llamadas } = clienteFalso([mensaje({ model: "claude-sonnet-5-5" }), mensaje({ model: "claude-sonnet-5-5" })]);
    const ia = crearClienteIA({ cliente });
    await ia.generarJson(entrada());
    expect(llamadas[0].params).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "low" } });
    await ia.generarJson(entrada({ esfuerzo: "medium", maxTokens: 64_000 }));
    expect(llamadas[1].params).toMatchObject({ max_tokens: 64_000, output_config: { effort: "medium" } });
  });

  it("MEETINGS_FALLBACKS=off no pide el respaldo", async () => {
    vi.stubEnv("MEETINGS_FALLBACKS", "off");
    const { cliente, llamadas } = clienteFalso([mensaje()]);
    await crearClienteIA({ cliente }).generarJson(entrada());
    expect(llamadas[0].params).not.toHaveProperty("fallbacks");
    expect(llamadas[0].params).not.toHaveProperty("betas");
  });

  it("sin clave de API falla sin reintentar y con un mensaje claro", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(crearClienteIA({}).generarJson(entrada())).rejects.toMatchObject({ name: "ErrorIA", reintentable: false, message: expect.stringContaining("no está configurado") });
  });
});

describe("la respuesta", () => {
  it("lee el JSON de los bloques de texto e ignora el pensamiento y los avisos de respaldo", async () => {
    const { cliente } = clienteFalso([
      mensaje({
        content: [
          { type: "thinking", text: "no se lee" },
          { type: "fallback" },
          { type: "text", text: '{"x":' },
          { type: "text", text: '"completo"}' },
        ],
      }),
    ]);
    const r = await crearClienteIA({ cliente }).generarJson(entrada());
    expect(r.json).toEqual({ x: "completo" });
    expect(r.modelo).toBe("claude-opus-5-5");
    expect(r.conRespaldo).toBe(false);
  });

  it("si respondió otro modelo (el respaldo), lo dice", async () => {
    const { cliente } = clienteFalso([mensaje({ model: "claude-opus-4-8" })]);
    const r = await crearClienteIA({ cliente }).generarJson(entrada());
    expect(r).toMatchObject({ modelo: "claude-opus-4-8", conRespaldo: true });
  });

  it("revisa cómo terminó ANTES de leer el contenido: un rechazo no se reintenta; un corte, sí", async () => {
    const rechazo = clienteFalso([mensaje({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [{ type: "text", text: '{"x":"no confiar"}' }] })]);
    await expect(crearClienteIA({ cliente: rechazo.cliente }).generarJson(entrada())).rejects.toMatchObject({
      reintentable: false, message: "La IA no pudo analizar el bloque 2 (cyber).",
    });
    const corte = clienteFalso([mensaje({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"x":"a medi' }] })]);
    await expect(crearClienteIA({ cliente: corte.cliente }).generarJson(entrada())).rejects.toMatchObject({ reintentable: true, message: expect.stringContaining("se cortó") });
  });

  it("una respuesta vacía o que no es JSON se reintenta", async () => {
    for (const content of [[], [{ type: "thinking", text: "solo pensó" }], [{ type: "text", text: "Claro, aquí está: {x}" }]]) {
      const { cliente } = clienteFalso([mensaje({ content })]);
      await expect(crearClienteIA({ cliente }).generarJson(entrada())).rejects.toMatchObject({ name: "ErrorIA", reintentable: true });
    }
  });

  it("clasifica los fallos de la llamada", async () => {
    const { cliente } = clienteFalso([conStatus(503), conStatus(401)]);
    const ia = crearClienteIA({ cliente });
    await expect(ia.generarJson(entrada())).rejects.toMatchObject({ reintentable: true });
    await expect(ia.generarJson(entrada())).rejects.toMatchObject({ reintentable: false });
  });
});

describe("el respaldo de modelos", () => {
  const BETA_NO = conStatus(400, "Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header.");

  it("si la organización no tiene la beta, repite sin ella y deja de pedirla en las siguientes", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cliente, llamadas } = clienteFalso([BETA_NO, mensaje(), mensaje()]);
    const ia = crearClienteIA({ cliente });
    expect((await ia.generarJson(entrada())).json).toEqual({ x: "hola" });
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].params).toHaveProperty("fallbacks");
    expect(llamadas[1].params).not.toHaveProperty("fallbacks");
    expect(llamadas[1].params).not.toHaveProperty("betas");
    await ia.generarJson(entrada());
    expect(llamadas[2].params).not.toHaveProperty("fallbacks"); // ya no insiste
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("un 400 que no es de la beta no se confunde con eso", async () => {
    const { cliente, llamadas } = clienteFalso([conStatus(400, "messages: roles must alternate")]);
    await expect(crearClienteIA({ cliente }).generarJson(entrada())).rejects.toMatchObject({ reintentable: false });
    expect(llamadas).toHaveLength(1);
  });

  it("sin pedir el respaldo, un 400 de beta tampoco se repite", async () => {
    const { cliente, llamadas } = clienteFalso([BETA_NO]);
    await expect(crearClienteIA({ cliente, respaldo: false }).generarJson(entrada())).rejects.toBeInstanceOf(ErrorIA);
    expect(llamadas).toHaveLength(1);
  });
});

describe("uso y costo", () => {
  it("cuesta lo que dicen los precios de Opus 5.5: entrada, salida y caché", () => {
    const u = calcularUso({ model: "claude-opus-5-5", usage: { input_tokens: 100_000, output_tokens: 5_000, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 10_000 } }, "claude-opus-5-5");
    expect(u).toMatchObject({ entrada: 100_000, salida: 5_000, cacheLectura: 20_000, cacheEscritura: 10_000 });
    // (100 000 × 4 + 5 000 × 20 + 20 000 × 0,2 + 10 000 × 5) / 1 000 000
    expect(u.costoUsd).toBeCloseTo(0.554, 6);
    expect(PRECIOS_USD_POR_MTOK["claude-opus-5-5"]).toEqual({ entrada: 4, salida: 20, lectura: 0.2, escritura: 5 });
  });

  it("con respaldo suma cada intento, cada uno a su precio (los rechazados también se pagan)", () => {
    const u = calcularUso(
      {
        model: "claude-opus-4-8",
        usage: {
          input_tokens: 1_000, output_tokens: 500,
          iterations: [
            { type: "message", input_tokens: 1_000, output_tokens: 10 },
            { type: "fallback_message", input_tokens: 1_000, output_tokens: 500 },
          ],
        },
      },
      "claude-opus-5-5",
    );
    // El intento rechazado, a Opus 5.5 (4 / 20); el que respondió, a Opus 4.8 (5 / 25).
    expect(u.entrada).toBe(2_000);
    expect(u.salida).toBe(510);
    expect(u.costoUsd).toBeCloseTo((1_000 * 4 + 10 * 20 + 1_000 * 5 + 500 * 25) / 1_000_000, 9);
  });

  it("si una iteración dice su modelo, manda ese", () => {
    const u = calcularUso({ model: "claude-opus-5-5", usage: { iterations: [{ type: "message", model: "claude-haiku-4-5", input_tokens: 1_000_000, output_tokens: 0 }] } }, "claude-opus-5-5");
    expect(u.costoUsd).toBeCloseTo(1, 9);
  });

  it("un modelo que no está en la tabla se cobra como Opus 5 (mejor pasarse que quedarse corto)", () => {
    expect(calcularUso({ model: "claude-nuevo-9", usage: { input_tokens: 1_000_000 } }, "claude-opus-5-5").costoUsd).toBeCloseTo(5, 9);
  });

  it("sin uso es cero, y los valores raros no rompen la cuenta", () => {
    expect(calcularUso({}, "claude-opus-5-5")).toEqual(USO_VACIO);
    expect(calcularUso({ usage: { input_tokens: -5, output_tokens: Number.NaN, cache_read_input_tokens: "x" } }, "claude-opus-5-5").costoUsd).toBe(0);
  });

  it("la llamada devuelve su uso y se pueden sumar varias", async () => {
    const { cliente } = clienteFalso([mensaje({ usage: { input_tokens: 50_000, output_tokens: 2_000 } })]);
    const r = await crearClienteIA({ cliente }).generarJson(entrada());
    expect(r.uso.costoUsd).toBeCloseTo((50_000 * 4 + 2_000 * 20) / 1_000_000, 9);
    const dos = sumarUso(r.uso, r.uso);
    expect(dos.entrada).toBe(100_000);
    expect(dos.costoUsd).toBeCloseTo(r.uso.costoUsd * 2, 9);
  });
});

describe("aErrorIA", () => {
  const caso = (e: unknown) => {
    const r = aErrorIA(e);
    return [r.reintentable, r.message] as const;
  };

  it("los fallos del momento se reintentan: sin respuesta, 408, 409, 429, 500, 503, 529", () => {
    for (const status of [undefined, 408, 409, 429, 500, 502, 503, 529]) expect(caso(conStatus(status))[0], String(status)).toBe(true);
    expect(caso(new Error("raro"))[0]).toBe(true);
    expect(caso("texto")[0]).toBe(true);
    expect(caso(conStatus(529))[1]).toMatch(/saturado/);
  });

  it("lo que reintentar no arregla no se reintenta: credenciales, saldo, modelo, petición rechazada", () => {
    for (const status of [400, 401, 402, 403, 404, 413, 422]) expect(caso(conStatus(status))[0], String(status)).toBe(false);
    expect(caso(conStatus(400, "Your credit balance is too low to access the Anthropic API"))[1]).toMatch(/saldo/);
    expect(caso(conStatus(402))[1]).toMatch(/saldo/);
    expect(caso(conStatus(401))[1]).toMatch(/credenciales/);
    expect(caso(conStatus(404))[1]).toMatch(/modelo configurado/);
  });

  it("los mensajes empiezan por «No pudimos» cuando no hay nada que hacer, y no pasan de un tamaño razonable", () => {
    expect(caso(conStatus(401))[1]).toMatch(/^No pudimos analizar la reunión con IA/);
    expect(caso(conStatus(400, "x".repeat(500)))[1].length).toBeLessThan(300);
  });

  it("un ErrorIA ya clasificado pasa tal cual", () => {
    const propio = new ErrorIA("listo", { reintentable: false });
    expect(aErrorIA(propio)).toBe(propio);
  });
});
