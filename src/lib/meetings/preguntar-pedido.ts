/**
 * El pedido de «Preguntar» —la pregunta y el historial de la conversación— y sus límites. Es lo único de «Preguntar» que comparten
 * el servidor y la pantalla: no trae el prompt ni toca la base de datos, así que puede ir al navegador.
 */
import type { TurnoDeIA } from "./ia";

export const MAX_PREGUNTA = 2_000;
/** Cuántos turnos de la conversación se recuerdan (la pregunta y la respuesta son dos turnos). */
export const MAX_TURNOS_DE_HISTORIAL = 10;
/** Lo más largo que puede ser un turno recordado: acota lo que cuesta la conversación. */
export const MAX_TEXTO_DE_TURNO = 6_000;

export type TurnoDePreguntar = TurnoDeIA;
export type PedidoDePreguntar = { pregunta: string; historial: TurnoDePreguntar[] };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * El historial que manda la pantalla, dejado como lo exige la API: alterna usuario y asistente, empieza por el usuario y termina
 * en una respuesta (la pregunta nueva va después). Lo que sobra o no cuadra se descarta; no se rechaza, porque lo manda el
 * navegador y un turno raro no debe impedir preguntar. Se recuerdan los últimos `MAX_TURNOS_DE_HISTORIAL`.
 */
export function normalizarHistorial(historial: unknown): TurnoDePreguntar[] {
  if (!Array.isArray(historial)) return [];
  const limpios: TurnoDePreguntar[] = [];
  for (const t of historial) {
    if (!esObjeto(t) || (t.rol !== "user" && t.rol !== "assistant") || typeof t.texto !== "string") continue;
    const texto = t.texto.trim().slice(0, MAX_TEXTO_DE_TURNO);
    if (!texto) continue;
    // Dos del mismo rol seguidos: se queda el último (el más reciente es el que importa).
    if (limpios.length > 0 && limpios[limpios.length - 1].rol === t.rol) limpios.pop();
    limpios.push({ rol: t.rol, texto });
  }
  // Los últimos N; si el corte deja una respuesta primero, se quita (tiene que empezar el usuario). Y no puede terminar en una
  // pregunta sin respuesta: la nueva pregunta iría pegada a ella.
  let recientes = limpios.slice(-MAX_TURNOS_DE_HISTORIAL);
  while (recientes.length > 0 && recientes[0].rol !== "user") recientes = recientes.slice(1);
  while (recientes.length > 0 && recientes[recientes.length - 1].rol === "user") recientes = recientes.slice(0, -1);
  return recientes;
}

export function leerPedido(json: unknown): { ok: true; valor: PedidoDePreguntar } | { ok: false; error: string } {
  if (!esObjeto(json) || typeof json.pregunta !== "string") return { ok: false, error: "Escribe tu pregunta." };
  const pregunta = json.pregunta.trim();
  if (!pregunta) return { ok: false, error: "Escribe tu pregunta." };
  if (pregunta.length > MAX_PREGUNTA) return { ok: false, error: `La pregunta es demasiado larga (máximo ${MAX_PREGUNTA} caracteres).` };
  return { ok: true, valor: { pregunta, historial: normalizarHistorial(json.historial) } };
}
