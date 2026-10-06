/**
 * «Preguntar» en el modo demo (DEMO_MODE=true): sin base de datos ni claves. La pregunta se contesta con el MISMO sistema y el
 * mismo bloque compartido que la de verdad (`preguntar.ts`) y el modelo simulado, que busca en la transcripción las
 * intervenciones que más se parecen a la pregunta y las cita con su minuto. Escribe por trozos, con una pausa antes de empezar,
 * para que se vea cómo llega la respuesta.
 */
import { transcripcionParaIA, vocesDeReunion } from "./contexto-reunion";
import { demoContextoDeActa } from "./demo";
import type { RespuestaTexto } from "./ia";
import { crearIASimulada } from "./ia-simulada";
import { MAX_TOKENS_DE_RESPUESTA, SISTEMA_DE_PREGUNTAR, construirContextoDePreguntar } from "./preguntar";
import type { PedidoDePreguntar } from "./preguntar-pedido";

export type PuedePreguntarDemo = { ok: true } | { ok: false; codigo: "no_existe" | "no_lista" | "sin_transcripcion"; error: string };

/** ¿Se le puede preguntar a esta reunión de ejemplo? (la misma regla que la de verdad) */
export function demoPuedePreguntar(userId: string, id: string): PuedePreguntarDemo {
  const c = demoContextoDeActa(userId, id);
  if (!c) return { ok: false, codigo: "no_existe", error: "Reunión no encontrada" };
  if (!c.lista) return { ok: false, codigo: "no_lista", error: "Esta reunión todavía se está procesando." };
  if (!c.tieneTranscripcion) return { ok: false, codigo: "sin_transcripcion", error: "Esta reunión no tiene transcripción: no hay a qué preguntarle." };
  return { ok: true };
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** La respuesta a una pregunta sobre una reunión de ejemplo, por trozos. Debe llamarse después de `demoPuedePreguntar`. */
export async function demoResponderPregunta(
  userId: string,
  id: string,
  pedido: PedidoDePreguntar,
  { alTexto, esperaInicialMs = 700, pausaEntreTrozosMs = 30 }: { alTexto?: (trozo: string) => void; esperaInicialMs?: number; pausaEntreTrozosMs?: number } = {},
): Promise<RespuestaTexto> {
  const c = demoContextoDeActa(userId, id);
  if (!c) throw new Error("Reunión no encontrada");
  const voces = vocesDeReunion(c.hablantes);
  const compartido = construirContextoDePreguntar({
    datos: { propiedad: c.propiedad, tipo: c.tipo, fecha: c.fecha, duracionMs: c.duracionMs },
    voces,
    ficha: c.ficha,
    transcripcion: transcripcionParaIA(c.intervenciones.map((u) => ({ startMs: u.startMs, speaker: u.speaker, text: u.text }))),
  });
  const ia = crearIASimulada({ pausaEntreTrozosMs, alLlamarTexto: () => esperar(esperaInicialMs) });
  return ia.generarTexto({
    etiqueta: "la pregunta",
    sistema: SISTEMA_DE_PREGUNTAR,
    compartido,
    turnos: [...pedido.historial, { rol: "user", texto: pedido.pregunta }],
    maxTokens: MAX_TOKENS_DE_RESPUESTA,
    permitirCorte: true,
    timeoutMs: 110_000,
    alTexto,
  });
}
