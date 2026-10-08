/**
 * Los precios de los proveedores de IA, en un solo lugar: todo lo que se registra como consumo se calcula con esta tabla.
 * Es puro (se prueba sin red) y se puede usar en el navegador.
 *
 * Anthropic (US$ por millón de tokens): verificado con la tabla oficial de modelos el 8 de octubre de 2026. La escritura en
 * caché cuesta 1,25× la entrada (5 min) o 2× (1 h); la lectura, lo que dice la tabla de cada modelo.
 * OpenAI: gpt-4.1-nano $0,10 / $0,40 por millón (lectura de caché $0,025); la transcripción se estima por minuto de audio.
 * Si un precio cambia, se cambia aquí: el costo de cada registro queda guardado con el precio del día en que se hizo.
 */

export const PRECIOS_VERIFICADOS_EL = "2026-10-08";

/** US$ por millón de tokens. `escritura` es la escritura en caché de 5 min; `escritura1h`, la de 1 h. */
export type PrecioPorToken = { entrada: number; salida: number; lectura: number; escritura: number; escritura1h: number };

export const PRECIOS_ANTHROPIC: Readonly<Record<string, PrecioPorToken>> = {
  "claude-opus-5-5": { entrada: 4, salida: 20, lectura: 0.2, escritura: 5, escritura1h: 8 },
  "claude-opus-5": { entrada: 5, salida: 25, lectura: 0.5, escritura: 6.25, escritura1h: 10 },
  "claude-opus-4-8": { entrada: 5, salida: 25, lectura: 0.5, escritura: 6.25, escritura1h: 10 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, lectura: 0.2, escritura: 2.5, escritura1h: 4 },
  "claude-sonnet-5": { entrada: 2, salida: 10, lectura: 0.2, escritura: 2.5, escritura1h: 4 },
  "claude-fable-5-1": { entrada: 10, salida: 50, lectura: 0.25, escritura: 12.5, escritura1h: 20 },
  "claude-haiku-4-5": { entrada: 1, salida: 5, lectura: 0.1, escritura: 1.25, escritura1h: 2 },
};

/** De un modelo de Anthropic que no está en la tabla se supone el precio de Opus 5: mejor pasarse que quedarse corto. */
export const PRECIO_ANTHROPIC_DESCONOCIDO = PRECIOS_ANTHROPIC["claude-opus-5"];

/** OpenAI, chat: US$ por millón de tokens (la escritura en caché no se cobra aparte). */
export const PRECIOS_OPENAI: Readonly<Record<string, PrecioPorToken>> = {
  "gpt-4.1-nano": { entrada: 0.1, salida: 0.4, lectura: 0.025, escritura: 0.1, escritura1h: 0.1 },
};
const PRECIO_OPENAI_DESCONOCIDO: PrecioPorToken = { entrada: 2.5, salida: 10, lectura: 1.25, escritura: 2.5, escritura1h: 2.5 };

/** Transcripción: US$ por minuto de audio (estimado; OpenAI lo factura por tokens de audio). */
export const AUDIO_USD_POR_MINUTO: Readonly<Record<string, number>> = {
  "whisper-1": 0.006,
  "gpt-4o-transcribe": 0.006,
  "gpt-4o-transcribe-diarize": 0.006,
  "gpt-4o-mini-transcribe": 0.003,
};
const AUDIO_DESCONOCIDO_USD_POR_MINUTO = 0.006;

/** El id de un modelo sin la fecha de la versión: `claude-haiku-4-5-20251001` → `claude-haiku-4-5`. */
export const modeloBase = (modelo: string): string => modelo.trim().toLowerCase().replace(/-\d{8}$/, "");

export function precioAnthropic(modelo: string): PrecioPorToken {
  return PRECIOS_ANTHROPIC[modeloBase(modelo)] ?? PRECIO_ANTHROPIC_DESCONOCIDO;
}

export function precioOpenAI(modelo: string): PrecioPorToken {
  const base = modeloBase(modelo).replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return PRECIOS_OPENAI[base] ?? PRECIO_OPENAI_DESCONOCIDO;
}

export const usdPorMinutoDeAudio = (modelo: string): number => AUDIO_USD_POR_MINUTO[modeloBase(modelo)] ?? AUDIO_DESCONOCIDO_USD_POR_MINUTO;

/** Tokens de una llamada, separados como los cobra el proveedor. `cacheEscritura1h` es la parte de la escritura que fue de 1 h. */
export type Tokens = { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number; cacheEscritura1h?: number };

/** Lo que cuestan unos tokens con un precio. */
export function costoDeTokens(t: Tokens, p: PrecioPorToken): number {
  const de1h = Math.min(Math.max(0, t.cacheEscritura1h ?? 0), t.cacheEscritura);
  return (t.entrada * p.entrada + t.salida * p.salida + t.cacheLectura * p.lectura + (t.cacheEscritura - de1h) * p.escritura + de1h * p.escritura1h) / 1_000_000;
}
