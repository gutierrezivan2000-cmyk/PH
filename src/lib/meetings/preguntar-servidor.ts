/**
 * Contestar una pregunta sobre una reunión: carga la reunión de la base de datos, arma el bloque compartido y se lo manda a la IA.
 * Solo del servidor (toca la base de datos): la pantalla usa `preguntar-pedido.ts` y la ruta `preguntar`.
 */
import { transcripcionParaIA, cargarContextoDeReunion } from "./contexto-reunion";
import { esfuerzoDePreguntar, type ClienteIA, type RespuestaTexto } from "./ia";
import { MAX_TOKENS_DE_RESPUESTA, SISTEMA_DE_PREGUNTAR, construirContextoDePreguntar } from "./preguntar";
import type { PedidoDePreguntar } from "./preguntar-pedido";

/** Caracteres por token del español, redondeado a la baja (3,5) para no quedarse corto al estimar lo que se leyó. */
const CARACTERES_POR_TOKEN = 3.5;

export type ResultadoDePreguntar =
  | { ok: true; respuesta: RespuestaTexto }
  | { ok: false; codigo: "no_existe" | "no_lista" | "sin_transcripcion"; error: string };

/**
 * Contesta una pregunta sobre una reunión. `alTexto` recibe cada trozo apenas llega (la ruta lo manda al navegador). Los fallos de
 * la IA suben como `ErrorIA` (con su mensaje en español y si valía la pena reintentar); lo que no se puede preguntar vuelve como
 * `{ ok: false }`.
 */
export async function responderPregunta({
  meetingId, userId, pedido, ia, alTexto, senal, timeoutMs = 110_000,
}: {
  meetingId: string;
  userId: string;
  pedido: PedidoDePreguntar;
  ia: ClienteIA;
  alTexto?: (trozo: string) => void;
  senal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ResultadoDePreguntar> {
  const c = await cargarContextoDeReunion(meetingId, { userId });
  if (!c) return { ok: false, codigo: "no_existe", error: "Reunión no encontrada" };
  if (c.status !== "lista") return { ok: false, codigo: "no_lista", error: "Esta reunión todavía se está procesando." };
  if (c.lineas.length === 0) return { ok: false, codigo: "sin_transcripcion", error: "Esta reunión no tiene transcripción: no hay a qué preguntarle." };

  const compartido = construirContextoDePreguntar({
    datos: { propiedad: c.propiedad, tipo: c.tipo, fecha: c.fecha, duracionMs: c.duracionMs },
    voces: c.voces,
    ficha: c.ficha,
    transcripcion: transcripcionParaIA(c.lineas),
  });
  const turnos = [...pedido.historial, { rol: "user" as const, texto: pedido.pregunta }];
  try {
    const respuesta = await ia.generarTexto({
      etiqueta: "la pregunta",
      sistema: SISTEMA_DE_PREGUNTAR,
      compartido,
      turnos,
      esfuerzo: esfuerzoDePreguntar(),
      maxTokens: MAX_TOKENS_DE_RESPUESTA,
      // Una respuesta que llega al tope se muestra tal cual (con el aviso de que se cortó): en una charla es mejor eso que nada.
      permitirCorte: true,
      timeoutMs,
      senal,
      alTexto,
    });
    return { ok: true, respuesta };
  } catch (e) {
    // Si la llamada se corta (la persona pulsó «Detener», o falló a mitad), la API igual leyó toda la transcripción: eso se cobra.
    // Se deja anotado en el error cuánta entrada fue (estimada por el texto enviado) para que la ruta lo registre; si no, «Detener»
    // y «Reintentar» saldrían gratis y el porcentaje de uso nunca bajaría.
    if (e instanceof Error) {
      const caracteres = SISTEMA_DE_PREGUNTAR.length + compartido.length + turnos.reduce((s, t) => s + t.texto.length, 0);
      (e as Error & { entradaEstimada?: number }).entradaEstimada = Math.ceil(caracteres / CARACTERES_POR_TOKEN);
    }
    throw e;
  }
}
