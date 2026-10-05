/**
 * La conversación con una reunión en la pantalla, sin React (así se prueba con un «respondedor» falso): las preguntas y las
 * respuestas que van llegando por trozos, detener una respuesta, intentarla de nuevo y empezar otra conversación.
 *
 * Una respuesta que falló, que se detuvo o que sigue escribiéndose no entra al historial que se manda con la pregunta siguiente
 * (solo lo que se contestó completo): así una pregunta sin respuesta no se mezcla con la próxima. La conversación vive solo aquí;
 * no se guarda en ningún lado.
 */
import { MAX_PREGUNTA, type TurnoDePreguntar } from "./preguntar-pedido";
import { historialParaEnviar, type TurnoDeConversacion } from "./preguntar-pantalla";

/** Lo que hace la pregunta de verdad (la ruta `preguntar`): manda los trozos a `alTexto` y devuelve si la respuesta se cortó. Si falla, lanza con el mensaje listo para mostrar. */
export type Respondedor = (
  pedido: { pregunta: string; historial: TurnoDePreguntar[] },
  ayudas: { alTexto: (trozo: string) => void; senal: AbortSignal },
) => Promise<{ cortada: boolean }>;

export type EstadoDeConversacion = { turnos: TurnoDeConversacion[]; enviando: boolean };

const mensajeDe = (e: unknown): string => (e instanceof Error && e.message ? e.message : "No pudimos responder tu pregunta. Inténtalo de nuevo.");

export function crearControladorDePreguntar({ responder }: { responder: Respondedor }) {
  let estado: EstadoDeConversacion = { turnos: [], enviando: false };
  const oyentes = new Set<() => void>();
  let actual: AbortController | null = null;
  let desactivado = false;
  let secuencia = 0;

  const cambiar = (parcial: Partial<EstadoDeConversacion>) => {
    if (desactivado) return;
    estado = { ...estado, ...parcial };
    for (const o of [...oyentes]) o();
  };
  const ponerEnTurno = (id: string, cambios: Partial<Extract<TurnoDeConversacion, { rol: "assistant" }>>) =>
    cambiar({ turnos: estado.turnos.map((t) => (t.id === id && t.rol === "assistant" ? { ...t, ...cambios } : t)) });

  /** Pide la respuesta de un turno del asistente que ya está en la lista (en «escribiendo») y la va llenando. */
  async function ejecutar(idRespuesta: string, pregunta: string, historial: TurnoDePreguntar[]): Promise<void> {
    const control = new AbortController();
    actual = control;
    cambiar({ enviando: true });
    try {
      const { cortada } = await responder(
        { pregunta, historial },
        {
          senal: control.signal,
          alTexto: (trozo) => {
            if (control.signal.aborted) return;
            const turno = estado.turnos.find((t) => t.id === idRespuesta);
            if (turno && turno.rol === "assistant") ponerEnTurno(idRespuesta, { texto: turno.texto + trozo });
          },
        },
      );
      ponerEnTurno(idRespuesta, { estado: control.signal.aborted ? "detenida" : cortada ? "cortada" : "lista" });
    } catch (e) {
      if (control.signal.aborted) ponerEnTurno(idRespuesta, { estado: "detenida" });
      else ponerEnTurno(idRespuesta, { estado: "error", error: mensajeDe(e) });
    } finally {
      if (actual === control) actual = null;
      cambiar({ enviando: false });
    }
  }

  return {
    /** Para `useSyncExternalStore`. */
    suscribir(oyente: () => void): () => void {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    leer: (): EstadoDeConversacion => estado,

    /** Hace una pregunta. false si no se hizo (vacía, o todavía se está respondiendo otra). */
    async preguntar(texto: string): Promise<boolean> {
      const pregunta = texto.trim().slice(0, MAX_PREGUNTA);
      if (!pregunta || estado.enviando || desactivado) return false;
      const historial = historialParaEnviar(estado.turnos);
      const idPregunta = `t${++secuencia}`;
      const idRespuesta = `t${++secuencia}`;
      cambiar({
        turnos: [...estado.turnos, { id: idPregunta, rol: "user", texto: pregunta }, { id: idRespuesta, rol: "assistant", texto: "", estado: "escribiendo" }],
      });
      await ejecutar(idRespuesta, pregunta, historial);
      return true;
    },

    /** Para la respuesta que se está escribiendo (queda lo que ya llegó). */
    detener(): void {
      actual?.abort();
    },

    /** Vuelve a hacer la última pregunta cuando su respuesta falló o se detuvo. false si no hay nada que repetir. */
    async reintentar(): Promise<boolean> {
      if (estado.enviando || desactivado) return false;
      const i = estado.turnos.length - 1;
      const respuesta = estado.turnos[i];
      const pregunta = estado.turnos[i - 1];
      if (!respuesta || respuesta.rol !== "assistant" || (respuesta.estado !== "error" && respuesta.estado !== "detenida") || !pregunta || pregunta.rol !== "user") return false;
      const historial = historialParaEnviar(estado.turnos.slice(0, i - 1));
      ponerEnTurno(respuesta.id, { texto: "", estado: "escribiendo", error: undefined });
      await ejecutar(respuesta.id, pregunta.texto, historial);
      return true;
    },

    /** Empieza otra conversación. No hace nada mientras se responde. */
    limpiar(): void {
      if (!estado.enviando) cambiar({ turnos: [] });
    },

    /** La pantalla se montó (o volvió a montarse: React lo hace dos veces en desarrollo): vuelve a atender. */
    activar(): void {
      desactivado = false;
    },

    /** La pantalla se cerró: se corta lo que esté en vuelo y se deja de avisar. */
    desactivar(): void {
      actual?.abort();
      desactivado = true;
    },
  };
}

export type ControladorDePreguntar = ReturnType<typeof crearControladorDePreguntar>;
