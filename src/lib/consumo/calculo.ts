/**
 * Cuánto costó una llamada a la IA, a partir de lo que se usó y la tabla de precios (puro).
 */
import { costoDeTokens, precioAnthropic, precioOpenAI, usdPorMinutoDeAudio, type Tokens } from "./precios";
import { TOKENS_VACIOS } from "./uso";

export type Proveedor = "anthropic" | "openai";

export type UsoDeUnaLlamada = {
  proveedor: Proveedor;
  modelo: string;
  tokens?: Tokens;
  /** Segundos de audio transcritos (se cobra por minuto). */
  audioSegundos?: number;
};

export function costoDeUso(u: UsoDeUnaLlamada): number {
  const t = u.tokens ?? TOKENS_VACIOS;
  const deTokens = costoDeTokens(t, u.proveedor === "anthropic" ? precioAnthropic(u.modelo) : precioOpenAI(u.modelo));
  const deAudio = u.audioSegundos && u.audioSegundos > 0 ? (u.audioSegundos / 60) * usdPorMinutoDeAudio(u.modelo) : 0;
  return deTokens + deAudio;
}
