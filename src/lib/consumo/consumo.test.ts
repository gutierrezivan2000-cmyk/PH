import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { crearDbFalsa, type DbFalsa } from "@/lib/meetings/db-falsa";
import { costoDeUso } from "./calculo";
import { FUNCIONES, TIPOS, funcionDe } from "./funciones";
import { AUDIO_USD_POR_MINUTO, PRECIOS_ANTHROPIC, costoDeTokens, modeloBase, precioAnthropic, precioOpenAI } from "./precios";
import { conConsumo, contextoDeConsumo, filaDeConsumo, registrarConsumo } from "./registrar";
import { sumarTokens, tokensDeAnthropic, tokensDeOpenAI, totalDeTokens } from "./uso";

const M = 1_000_000;

describe("precios", () => {
  it("los de Anthropic son los oficiales (US$ por millón)", () => {
    expect(PRECIOS_ANTHROPIC["claude-opus-5-5"]).toMatchObject({ entrada: 4, salida: 20, lectura: 0.2 });
    expect(PRECIOS_ANTHROPIC["claude-sonnet-5"]).toMatchObject({ entrada: 2, salida: 10, lectura: 0.2 });
    expect(PRECIOS_ANTHROPIC["claude-haiku-4-5"]).toMatchObject({ entrada: 1, salida: 5, lectura: 0.1 });
    // La escritura en caché: 1,25× (5 min) y 2× (1 h) la entrada.
    for (const p of Object.values(PRECIOS_ANTHROPIC)) {
      expect(p.escritura).toBeCloseTo(p.entrada * 1.25, 9);
      expect(p.escritura1h).toBeCloseTo(p.entrada * 2, 9);
    }
  });
  it("un id con fecha usa el precio de su modelo; uno desconocido, el de Opus 5 (mejor pasarse)", () => {
    expect(modeloBase("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
    expect(precioAnthropic("claude-haiku-4-5-20251001")).toBe(PRECIOS_ANTHROPIC["claude-haiku-4-5"]);
    expect(precioAnthropic("claude-nuevo-9")).toBe(PRECIOS_ANTHROPIC["claude-opus-5"]);
    expect(precioOpenAI("gpt-4.1-nano-2025-04-14")).toMatchObject({ entrada: 0.1, salida: 0.4 });
    expect(precioOpenAI("modelo-raro").entrada).toBeGreaterThan(0.1);
  });
  it("el costo de tokens separa entrada, salida, lectura y escritura (5 min y 1 h)", () => {
    const p = PRECIOS_ANTHROPIC["claude-sonnet-5"];
    expect(costoDeTokens({ entrada: M, salida: 0, cacheLectura: 0, cacheEscritura: 0 }, p)).toBeCloseTo(2, 9);
    expect(costoDeTokens({ entrada: 0, salida: M, cacheLectura: 0, cacheEscritura: 0 }, p)).toBeCloseTo(10, 9);
    expect(costoDeTokens({ entrada: 0, salida: 0, cacheLectura: M, cacheEscritura: 0 }, p)).toBeCloseTo(0.2, 9);
    expect(costoDeTokens({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: M }, p)).toBeCloseTo(2.5, 9);
    expect(costoDeTokens({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: M, cacheEscritura1h: M }, p)).toBeCloseTo(4, 9);
    // La parte de 1 h nunca pasa del total escrito.
    expect(costoDeTokens({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: M, cacheEscritura1h: 5 * M }, p)).toBeCloseTo(4, 9);
  });
  it("el audio se cobra por minuto", () => {
    expect(AUDIO_USD_POR_MINUTO["whisper-1"]).toBe(0.006);
    expect(costoDeUso({ proveedor: "openai", modelo: "whisper-1", audioSegundos: 600 })).toBeCloseTo(0.06, 9);
    expect(costoDeUso({ proveedor: "openai", modelo: "gpt-4o-transcribe-diarize", audioSegundos: 3600 })).toBeCloseTo(0.36, 9);
  });
});

describe("uso de cada proveedor", () => {
  it("Anthropic: entrada, salida, caché (y la parte de 1 h) y el modelo que respondió", () => {
    const r = tokensDeAnthropic(
      { model: "claude-sonnet-5", usage: { input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 3000, cache_creation_input_tokens: 500, cache_creation: { ephemeral_1h_input_tokens: 200 } } },
      "claude-sonnet-5-pedido",
    );
    expect(r).toEqual({ modelo: "claude-sonnet-5", tokens: { entrada: 1200, salida: 800, cacheLectura: 3000, cacheEscritura: 500, cacheEscritura1h: 200 } });
    expect(tokensDeAnthropic({}, "claude-haiku-4-5").modelo).toBe("claude-haiku-4-5");
    expect(totalDeTokens(tokensDeAnthropic({ usage: { input_tokens: -3, output_tokens: "x" } }, "m").tokens)).toBe(0);
  });
  it("OpenAI: los tokens en caché vienen dentro de la entrada y se separan", () => {
    expect(tokensDeOpenAI({ model: "gpt-4.1-nano-2025-04-14", usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 400 } } }, "gpt-4.1-nano")).toEqual({
      modelo: "gpt-4.1-nano-2025-04-14", tokens: { entrada: 600, salida: 50, cacheLectura: 400, cacheEscritura: 0 },
    });
  });
  it("las vueltas de un mismo mensaje se suman", () => {
    const a = { entrada: 1, salida: 2, cacheLectura: 3, cacheEscritura: 4, cacheEscritura1h: 1 };
    expect(sumarTokens(a, a)).toEqual({ entrada: 2, salida: 4, cacheLectura: 6, cacheEscritura: 8, cacheEscritura1h: 2 });
  });
});

describe("catálogo de funciones", () => {
  it("cada tipo del catálogo tiene nombre, grupo y unidad; los de audio cuentan segundos", () => {
    for (const tipo of Object.values(TIPOS)) {
      const f = FUNCIONES[tipo];
      expect(f, tipo).toBeDefined();
      expect(f.nombre && f.grupo && f.unidad, tipo).toBeTruthy();
    }
    expect(funcionDe(TIPOS.reunionAudio).tokensSonSegundos).toBe(true);
    expect(funcionDe(TIPOS.audioEnAgente).tokensSonSegundos).toBe(true);
    expect(funcionDe(TIPOS.agenteChat).tokensSonSegundos).toBeUndefined();
  });
  it("un tipo desconocido se muestra con su clave, en «Otros»", () => {
    expect(funcionDe("algo_nuevo")).toEqual({ tipo: "algo_nuevo", nombre: "algo_nuevo", grupo: "Otros", unidad: "operación" });
  });
});

describe("la fila que se registra", () => {
  const tokens = { entrada: 1000, salida: 500, cacheLectura: 2000, cacheEscritura: 0 };

  it("calcula el costo con la tabla y separa los tokens", () => {
    const f = filaDeConsumo({ tipo: TIPOS.agenteChat, proveedor: "anthropic", modelo: "claude-haiku-4-5-20251001", tokens, userId: "u1", ref: { tipo: "chat", id: "c1" } }, null);
    expect(f).toEqual({
      userId: "u1", type: "agente_chat", tokens: 3500, costUsd: (1000 * 1 + 500 * 5 + 2000 * 0.1) / M, provider: "anthropic", model: "claude-haiku-4-5-20251001",
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0, audioSeconds: 0, refType: "chat", refId: "c1",
    });
  });
  it("toma el usuario y la operación del contexto si no se dan; `ref: null` no asocia ninguna", () => {
    const ctx = { userId: "u9", ref: { tipo: "generacion" as const, id: "g1" } };
    expect(filaDeConsumo({ tipo: "x", proveedor: "anthropic", modelo: "claude-sonnet-5", tokens }, ctx)).toMatchObject({ userId: "u9", refType: "generacion", refId: "g1" });
    expect(filaDeConsumo({ tipo: "x", proveedor: "anthropic", modelo: "claude-sonnet-5", tokens, ref: null }, ctx)).toMatchObject({ refType: null, refId: null });
    expect(filaDeConsumo({ tipo: "x", proveedor: "anthropic", modelo: "m", tokens }, null)).toBeNull();
  });
  it("un costo ya calculado manda; los segundos de audio van aparte y la columna `tokens` puede guardar otra cosa", () => {
    expect(filaDeConsumo({ tipo: "reunion_ia", proveedor: "anthropic", modelo: "claude-opus-5-5", tokens, costoUsd: 1.23, userId: "u" }, null)?.costUsd).toBe(1.23);
    const audio = filaDeConsumo({ tipo: "reunion_audio", proveedor: "openai", modelo: "gpt-4o-transcribe-diarize", audioSegundos: 7200.4, tokensDelRegistro: 7200, userId: "u" }, null);
    expect(audio).toMatchObject({ tokens: 7200, audioSeconds: 7200, costUsd: 0.72 });
  });
  it("un costo raro (negativo, NaN) se guarda como 0", () => {
    expect(filaDeConsumo({ tipo: "x", proveedor: "anthropic", modelo: "m", costoUsd: -1, userId: "u" }, null)?.costUsd).toBe(0);
    expect(filaDeConsumo({ tipo: "x", proveedor: "anthropic", modelo: "m", costoUsd: Number.NaN, userId: "u" }, null)?.costUsd).toBe(0);
  });
});

describe("registrarConsumo", () => {
  let db: DbFalsa;
  beforeEach(() => {
    db = crearDbFalsa();
    fake.db = db;
    vi.stubEnv("DEMO_MODE", "false");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("guarda la fila y devuelve el costo", async () => {
    const costo = await registrarConsumo({ tipo: "correccion", proveedor: "anthropic", modelo: "claude-sonnet-5", tokens: { entrada: M, salida: 0, cacheLectura: 0, cacheEscritura: 0 }, userId: "u1" });
    expect(costo).toBeCloseTo(2, 9);
    expect(db.usageRecord.filas).toHaveLength(1);
    expect(db.usageRecord.filas[0]).toMatchObject({ userId: "u1", type: "correccion", inputTokens: M, model: "claude-sonnet-5" });
  });

  it("dentro de una operación, las llamadas profundas se cargan a su usuario y su operación (también tras esperas)", async () => {
    await conConsumo({ userId: "u2", ref: { tipo: "generacion", id: "g7" } }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(contextoDeConsumo()).toEqual({ userId: "u2", ref: { tipo: "generacion", id: "g7" } });
      await Promise.all([
        registrarConsumo({ tipo: "generacion_lectura", proveedor: "anthropic", modelo: "claude-sonnet-5" }),
        registrarConsumo({ tipo: "generacion_audio", proveedor: "openai", modelo: "whisper-1", audioSegundos: 60, tokensDelRegistro: 60 }),
      ]);
    });
    expect(contextoDeConsumo()).toBeNull();
    expect(db.usageRecord.filas.map((f) => [f.userId, f.type, f.refId])).toEqual([["u2", "generacion_lectura", "g7"], ["u2", "generacion_audio", "g7"]]);
  });

  it("nunca rompe lo que se está haciendo: sin usuario no guarda; si la base falla, lo anota y sigue", async () => {
    expect(await registrarConsumo({ tipo: "x", proveedor: "anthropic", modelo: "m" })).toBe(0);
    vi.spyOn(db.usageRecord, "create").mockRejectedValueOnce(new Error("conexión perdida"));
    expect(await registrarConsumo({ tipo: "x", proveedor: "anthropic", modelo: "m", userId: "u" })).toBe(0);
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(db.usageRecord.filas).toHaveLength(0);
  });

  it("en el demo no se registra nada (no hay base de datos)", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect(await registrarConsumo({ tipo: "x", proveedor: "anthropic", modelo: "m", userId: "u" })).toBe(0);
    expect(db.usageRecord.filas).toHaveLength(0);
  });
});
