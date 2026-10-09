import { describe, expect, it } from "vitest";
import { costoDeTokens, precioAnthropic } from "@/lib/consumo/precios";
import { TIPOS } from "@/lib/consumo/funciones";
import {
  aceptaEsfuerzo,
  aceptaRespaldoDelServidor,
  configDeFuncion,
  esErrorDeEsfuerzo,
  esfuerzoDeFuncion,
  esfuerzoDelTurno,
  modeloDeFuncion,
  parametroDeEsfuerzo,
} from "./modelos";

describe("qué modelo usa cada función", () => {
  it("el chat de los agentes usa Sonnet 5.5 y todo lo demás Haiku 5.5; ninguna usa Opus", () => {
    expect(modeloDeFuncion(TIPOS.agenteChat, {})).toBe("claude-haiku-5-5");
    for (const t of Object.values(TIPOS)) {
      if (t === TIPOS.agenteChat) continue;
      expect(modeloDeFuncion(t, {}), t).toBe("claude-haiku-5-5");
    }
  });
  it("se puede cambiar por variable de entorno: todo el chat, todo lo general o una sola función", () => {
    expect(modeloDeFuncion(TIPOS.agenteChat, { IA_MODELO_CHAT: " claude-opus-5-5 " })).toBe("claude-opus-5-5");
    expect(modeloDeFuncion(TIPOS.informe, { IA_MODELO_GENERAL: "claude-sonnet-5-5" })).toBe("claude-sonnet-5-5");
    expect(modeloDeFuncion(TIPOS.reunionActa, { IA_MODELO_REUNION_ACTA: "claude-sonnet-5-5", IA_MODELO_GENERAL: "claude-haiku-5-5" })).toBe("claude-sonnet-5-5");
    expect(modeloDeFuncion(TIPOS.reunionIa, { IA_MODELO_REUNION_ACTA: "claude-sonnet-5-5" })).toBe("claude-haiku-5-5");
  });
  it("la variable antigua ANTHROPIC_MODEL ya no manda (podía seguir puesta en Vercel con otro modelo)", () => {
    expect(modeloDeFuncion(TIPOS.informe, { ANTHROPIC_MODEL: "claude-opus-5-5" })).toBe("claude-haiku-5-5");
  });
});

describe("esfuerzo por función", () => {
  it("los documentos con consecuencias piensan más; lo mecánico, casi nada", () => {
    expect(esfuerzoDeFuncion(TIPOS.acta, {})).toBe("high");
    expect(esfuerzoDeFuncion(TIPOS.reunionActa, {})).toBe("high");
    expect(esfuerzoDeFuncion(TIPOS.agenteChat, {})).toBe("medium");
    expect(esfuerzoDeFuncion(TIPOS.agenteTitulo, {})).toBe("low");
    expect(esfuerzoDeFuncion(TIPOS.lecturaDeImagenes, {})).toBe("low");
  });
  it("una función desconocida usa «medium» y un valor inválido de entorno se ignora", () => {
    expect(esfuerzoDeFuncion("algo_nuevo", {})).toBe("medium");
    expect(esfuerzoDeFuncion(TIPOS.acta, { IA_ESFUERZO_ACTA: "enorme" })).toBe("high");
    expect(esfuerzoDeFuncion(TIPOS.acta, { IA_ESFUERZO_ACTA: " LOW " })).toBe("low");
  });
  it("configDeFuncion junta ambos", () => {
    expect(configDeFuncion(TIPOS.agenteChat, {})).toEqual({ modelo: "claude-haiku-5-5", esfuerzo: "medium" });
  });
});

describe("compatibilidad con la API", () => {
  it("el esfuerzo solo se manda a los modelos que lo aceptan", () => {
    expect(parametroDeEsfuerzo("claude-haiku-5-5", "high")).toEqual({ output_config: { effort: "high" } });
    expect(parametroDeEsfuerzo("claude-sonnet-5-5", "low")).toEqual({ output_config: { effort: "low" } });
    expect(parametroDeEsfuerzo("claude-haiku-4-5-20251001", "high")).toEqual({});
    expect(aceptaEsfuerzo("claude-opus-5-5")).toBe(true);
    expect(aceptaEsfuerzo("claude-sonnet-4-5")).toBe(false);
  });
  it("el respaldo del servidor no existe para Haiku", () => {
    expect(aceptaRespaldoDelServidor("claude-haiku-5-5")).toBe(false);
    expect(aceptaRespaldoDelServidor("claude-opus-5-5")).toBe(true);
    expect(aceptaRespaldoDelServidor("claude-sonnet-5-5")).toBe(true);
  });
  it("reconoce el error de «esfuerzo no soportado» para reintentar sin él", () => {
    expect(esErrorDeEsfuerzo(new Error("400 invalid_request_error: output_config.effort: Extra inputs are not permitted"))).toBe(true);
    expect(esErrorDeEsfuerzo(new Error("400 effort is not supported for this model"))).toBe(true);
    expect(esErrorDeEsfuerzo(new Error("429 rate_limit"))).toBe(false);
    expect(esErrorDeEsfuerzo(new Error("400 max_tokens too large"))).toBe(false);
  });
});

describe("precio de Haiku 5.5", () => {
  const p = precioAnthropic("claude-haiku-5-5");
  it("US$0,10 de entrada y US$0,50 de salida por millón hasta 100.000 tokens", () => {
        expect(costoDeTokens({ entrada: 50_000, salida: 10_000, cacheLectura: 0, cacheEscritura: 0 }, p)).toBeCloseTo(0.005 + 0.005, 9);
  });
  it("si la entrada pasa de 100.000 tokens (contando la caché), TODA la petición cuesta 5 veces más", () => {
    const corto = costoDeTokens({ entrada: 100_000, salida: 2_000, cacheLectura: 0, cacheEscritura: 0 }, p);
    const largo = costoDeTokens({ entrada: 100_001, salida: 2_000, cacheLectura: 0, cacheEscritura: 0 }, p);
    expect(largo / corto).toBeGreaterThan(4.9);
    const conCache = costoDeTokens({ entrada: 10_000, salida: 0, cacheLectura: 95_000, cacheEscritura: 0 }, p);
    expect(conCache).toBeCloseTo(((10_000 * 0.1 + 95_000 * 0.01) / 1_000_000) * 5, 9);
  });
  it("los demás modelos no tienen ese tramo", () => {
    const s = precioAnthropic("claude-sonnet-5-5");
    expect(costoDeTokens({ entrada: 500_000, salida: 0, cacheLectura: 0, cacheEscritura: 0 }, s)).toBeCloseTo(1, 9);
  });
});

describe("esfuerzo de cada turno del chat", () => {
  it("un saludo o una confirmación casi no piensa", () => {
    expect(esfuerzoDelTurno("hola", {}, {})).toBe("low");
    expect(esfuerzoDelTurno("gracias, listo", {}, {})).toBe("low");
  });

  it("una pregunta corta o una frase normal va a esfuerzo medio", () => {
    expect(esfuerzoDelTurno("¿Cuál es el saldo del apto 502?", {}, {})).toBe("medium");
    expect(esfuerzoDelTurno("Muéstrame la cartera de la torre B de este mes", {}, {})).toBe("medium");
  });

  it("un análisis, un cálculo, un documento o un adjunto piensan más", () => {
    expect(esfuerzoDelTurno("Analiza por qué sube la morosidad", {}, {})).toBe("high");
    expect(esfuerzoDelTurno("redacta un borrador de comunicado", {}, {})).toBe("high");
    expect(esfuerzoDelTurno("mira esto", { adjuntos: 1 }, {})).toBe("high");
    expect(esfuerzoDelTurno("x".repeat(601), {}, {})).toBe("high");
  });

  it("una variable de entorno fija el esfuerzo de todos los turnos", () => {
    expect(esfuerzoDelTurno("hola", {}, { IA_ESFUERZO_AGENTE_CHAT: "max" })).toBe("max");
    expect(esfuerzoDelTurno("hola", {}, { IA_ESFUERZO_AGENTE_CHAT: "enorme" })).toBe("low");
  });
});

