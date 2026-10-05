"use client";

import { MessageSquareText, RotateCcw, Sparkles, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Aviso, Boton, Etiqueta, MensajeUsuario, Redactor, Vacio } from "@/components/kit";
import type { ConversacionEnPantalla } from "@/components/reuniones/usePreguntar";
import { TextoConMarcadores } from "@/components/reuniones/VistaDeTexto";
import { leerActa } from "@/lib/meetings/acta-vista";
import type { Ficha } from "@/lib/meetings/dto";
import { MAX_PREGUNTA } from "@/lib/meetings/preguntar-pedido";
import { subioAReleer, sugerenciasDePregunta, textoEnCurso, type TurnoDeConversacion } from "@/lib/meetings/preguntar-pantalla";

const CSS = `
.re-pre { display: grid; gap: 14px; }
.re-pre-barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.re-pre-barra p { margin: 0; font-size: 14px; color: var(--ink-3); }
.re-pre-hilo { display: grid; }
.re-pre-hilo > .k-msg-u { margin: 18px 0 14px auto; }
.re-pre-hilo > .k-msg-u:first-child { margin-top: 4px; }
.re-pre-sug { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 720px; }
.re-pre-sug button { display: inline-flex; align-items: center; min-height: 42px; padding: 8px 16px; border: 1.5px solid var(--line-strong); border-radius: 999px; background: var(--surface-1); font: inherit; font-size: 14.5px; font-weight: 600; line-height: 1.25; text-align: left; color: var(--ink); cursor: pointer; }
.re-pre-sug button:hover { border-color: var(--accent); background: rgb(var(--accent-rgb) / .08); }
.re-pre-sug button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.re-pre-sug button:disabled { opacity: .55; cursor: not-allowed; }
.re-resp { display: grid; gap: 10px; max-width: 78ch; margin: 0 0 20px; scroll-margin-bottom: 200px; }
.re-resp-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 13.5px; color: var(--ink-3); }
.re-resp .k-md { font-size: 16px; }
.re-resp .k-md > :last-child { margin-bottom: 0; }
.re-resp-nota { margin: 0; font-size: 14px; color: var(--ink-3); }
.re-pre-redactor { position: sticky; bottom: 12px; z-index: 5; }
.re-pre-redactor .k-redactor { box-shadow: 0 10px 30px -14px rgb(0 0 0 / .45); }
.re-pre-redactor .herr button { color: var(--ink); }
@media (max-width: 860px) {
  .re-pre-redactor { bottom: calc(var(--dock-h, 0px) + env(safe-area-inset-bottom, 0px) + 12px); }
  .re-resp { scroll-margin-bottom: calc(var(--dock-h, 0px) + 200px); }
}
`;

/** Una respuesta: lo que ya llegó (con sus minutos enlazados), cómo va y, si falló o se detuvo, qué se puede hacer. */
function Respuesta({
  turno, duracionS, alIrAlMinuto, alReintentar, puedeReintentar, refArticulo,
}: {
  turno: Extract<TurnoDeConversacion, { rol: "assistant" }>;
  duracionS: number;
  alIrAlMinuto: (ms: number) => void;
  alReintentar: () => void;
  puedeReintentar: boolean;
  refArticulo?: Ref<HTMLElement>;
}) {
  const escribiendo = turno.estado === "escribiendo";
  const visible = escribiendo ? textoEnCurso(turno.texto) : turno.texto;
  // Un minuto que pasa de la duración no existe (la IA se equivocó): se descarta en vez de enlazar a ninguna parte.
  const bloques = useMemo(() => leerActa(visible, { maxSegundos: duracionS + 60 }), [visible, duracionS]);

  return (
    <article ref={refArticulo} className="re-resp" aria-label="Respuesta" aria-busy={escribiendo}>
      <div className="re-resp-meta">
        <Etiqueta icono={Sparkles} tono="ai">
          Generada con IA
        </Etiqueta>
        {turno.estado === "lista" && <span>Revísala contra la transcripción antes de usarla.</span>}
      </div>

      {escribiendo && !visible && (
        <span className="k-escribe" role="status">
          <span aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Buscando en la reunión…
        </span>
      )}
      {bloques.length > 0 && (
        <div className="k-md">
          <TextoConMarcadores bloques={bloques} alIrAlMinuto={alIrAlMinuto} />
        </div>
      )}
      {escribiendo && visible && (
        <span className="k-escribe" role="status">
          <span aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Escribiendo…
        </span>
      )}

      {turno.estado === "cortada" && <p className="re-resp-nota">La respuesta se cortó por su largo. Pídele que continúe.</p>}
      {turno.estado === "detenida" && (
        <Aviso
          enLinea
          rol={null}
          tipo="info"
          titulo="Detuviste la respuesta."
          accion={puedeReintentar ? { etiqueta: "Volver a preguntar", alElegir: alReintentar } : undefined}
        />
      )}
      {turno.estado === "error" && (
        <Aviso
          enLinea
          rol={null}
          tipo="error"
          titulo={visible ? "La respuesta se interrumpió." : "No pudimos responder tu pregunta."}
          texto={turno.error}
          accion={puedeReintentar ? { etiqueta: "Intentar de nuevo", alElegir: alReintentar } : undefined}
        />
      )}
    </article>
  );
}

/**
 * La pestaña «Preguntar»: una conversación con la reunión. Cada respuesta llega escribiéndose, con la transcripción completa
 * como base, y cita el minuto donde se habló: tocarlo lleva a ese momento de la transcripción. La conversación no se guarda.
 */
export function TabPreguntar({
  conversacion, ficha, duracionMs, puedePreguntar, alIrAlMinuto,
}: {
  conversacion: ConversacionEnPantalla;
  ficha: Ficha | null;
  duracionMs: number;
  /** La reunión está lista: con la reunión procesándose no hay transcripción completa a la que preguntarle. */
  puedePreguntar: boolean;
  alIrAlMinuto: (ms: number) => void;
}) {
  const { turnos, enviando } = conversacion;
  const [texto, setTexto] = useState("");
  const sugerencias = useMemo(() => sugerenciasDePregunta(ficha), [ficha]);
  const duracionS = Math.ceil(duracionMs / 1000);

  // Mientras la respuesta se escribe, la pantalla la sigue (su final queda sobre el cuadro de la pregunta). Si la persona sube a
  // releer, deja de seguirla hasta la próxima pregunta. La rueda, el dedo y el teclado avisan antes de que la pantalla se mueva
  // (así un trozo que llega justo después no la devuelve); lo demás —la barra de desplazamiento, por ejemplo— se nota por la
  // posición.
  const siguiendo = useRef(false);
  const ultimaRespuesta = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const parar = () => {
      siguiendo.current = false;
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(e.key) || (e.key === " " && e.shiftKey)) parar();
    };
    let antes = window.scrollY;
    const alDesplazar = () => {
      const ahora = window.scrollY;
      if (subioAReleer({ antes, ahora, maximo: document.documentElement.scrollHeight - window.innerHeight })) parar();
      antes = ahora;
    };
    window.addEventListener("wheel", parar, { passive: true });
    window.addEventListener("touchmove", parar, { passive: true });
    window.addEventListener("keydown", alTeclear);
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      window.removeEventListener("wheel", parar);
      window.removeEventListener("touchmove", parar);
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener("scroll", alDesplazar);
    };
  }, []);
  useEffect(() => {
    // `instant`: la página tiene `scroll-behavior: smooth` y a cada trozo llegaría tarde, peleándose con el siguiente.
    if (siguiendo.current && enviando) ultimaRespuesta.current?.scrollIntoView({ block: "end", behavior: "instant" });
  }, [turnos, enviando]);

  const enviar = (pregunta: string) => {
    if (!pregunta.trim() || enviando || !puedePreguntar) return;
    setTexto("");
    siguiendo.current = true;
    void conversacion.preguntar(pregunta);
  };

  const ultimoTurno = turnos[turnos.length - 1];

  return (
    <div className="re-pre">
      <style href="k-reuniones-preguntar-local" precedence="default">
        {CSS}
      </style>

      {turnos.length === 0 ? (
        <Vacio
          icono={MessageSquareText}
          tono="violet"
          titulo="Pregúntale a la reunión."
          texto="Responde con la transcripción completa y te dice en qué minuto se habló: toca el minuto para ir a ese momento. Cada pregunta cuenta como un mensaje de tu plan, y la conversación no se guarda: al salir de la página se borra."
          acciones={
            <>
              <div className="re-pre-sug">
                {sugerencias.map((s) => (
                  <button key={s} type="button" disabled={!puedePreguntar} onClick={() => enviar(s)}>
                    {s}
                  </button>
                ))}
              </div>
              {!puedePreguntar && <p className="re-resp-nota">Disponible cuando la reunión termine de procesarse.</p>}
            </>
          }
        />
      ) : (
        <>
          <div className="re-pre-barra">
            <p>Esta conversación no se guarda.</p>
            <Boton variante="fantasma" icono={RotateCcw} onClick={conversacion.limpiar} disabled={enviando}>
              Nueva conversación
            </Boton>
          </div>
          <div className="re-pre-hilo" role="log" aria-label="Conversación con la reunión">
            {turnos.map((t) =>
              t.rol === "user" ? (
                <MensajeUsuario key={t.id} autor="Tú">
                  {t.texto}
                </MensajeUsuario>
              ) : (
                <Respuesta
                  key={t.id}
                  turno={t}
                  duracionS={duracionS}
                  alIrAlMinuto={alIrAlMinuto}
                  alReintentar={() => {
                    siguiendo.current = true;
                    void conversacion.reintentar();
                  }}
                  puedeReintentar={t === ultimoTurno && !enviando && puedePreguntar}
                  refArticulo={t === ultimoTurno ? ultimaRespuesta : undefined}
                />
              ),
            )}
          </div>
        </>
      )}

      <div className="re-pre-redactor">
        <Redactor
          etiqueta="Tu pregunta sobre la reunión"
          placeholder="Escribe tu pregunta…"
          valor={texto}
          alCambiar={(v) => setTexto(v.slice(0, MAX_PREGUNTA))}
          alEnviar={() => enviar(texto)}
          enviando={enviando}
          deshabilitado={!puedePreguntar}
          etiquetaEnviar="Preguntar"
          textoEnviando="Respondiendo…"
          herramientas={
            enviando ? (
              <button type="button" onClick={conversacion.detener}>
                <Square aria-hidden="true" focusable="false" />
                Detener
              </button>
            ) : (
              <span>Enter envía · Mayús + Enter salta de línea</span>
            )
          }
        />
      </div>
    </div>
  );
}
