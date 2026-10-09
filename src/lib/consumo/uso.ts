/**
 * Lo que dice cada proveedor que se usó en una llamada, en la forma común (`Tokens`). Es puro.
 */
import type { Tokens } from "./precios";

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Una respuesta de la API de mensajes de Anthropic (`message.usage`, `message.model`). */
export function tokensDeAnthropic(mensaje: unknown, modeloSolicitado: string): { modelo: string; tokens: Tokens } {
  const m = obj(mensaje);
  const u = obj(m.usage);
  const modelo = typeof m.model === "string" && m.model ? m.model : modeloSolicitado;
  return {
    modelo,
    tokens: {
      entrada: n(u.input_tokens),
      salida: n(u.output_tokens),
      cacheLectura: n(u.cache_read_input_tokens),
      cacheEscritura: n(u.cache_creation_input_tokens),
      cacheEscritura1h: n(obj(u.cache_creation).ephemeral_1h_input_tokens),
    },
  };
}

/** Una respuesta de chat de OpenAI: los tokens en caché vienen DENTRO de `prompt_tokens`; aquí se separan. */
export function tokensDeOpenAI(respuesta: unknown, modeloSolicitado: string): { modelo: string; tokens: Tokens } {
  const r = obj(respuesta);
  const u = obj(r.usage);
  const enCache = n(obj(u.prompt_tokens_details).cached_tokens);
  const modelo = typeof r.model === "string" && r.model ? r.model : modeloSolicitado;
  return {
    modelo,
    tokens: { entrada: Math.max(0, n(u.prompt_tokens) - enCache), salida: n(u.completion_tokens), cacheLectura: enCache, cacheEscritura: 0 },
  };
}

/** Suma tokens de varias llamadas (p. ej., las vueltas de herramientas de un mismo mensaje). */
export const sumarTokens = (a: Tokens, b: Tokens): Tokens => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  cacheLectura: a.cacheLectura + b.cacheLectura,
  cacheEscritura: a.cacheEscritura + b.cacheEscritura,
  cacheEscritura1h: (a.cacheEscritura1h ?? 0) + (b.cacheEscritura1h ?? 0),
});

export const TOKENS_VACIOS: Tokens = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0, cacheEscritura1h: 0 };

export const totalDeTokens = (t: Tokens): number => t.entrada + t.salida + t.cacheLectura + t.cacheEscritura;
