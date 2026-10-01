"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Boton } from "./Boton";
import { Sigilo, AGENTES, type AgenteId } from "./Sigilo";
import { unir } from "./util";

/**
 * Mensaje del usuario: burbuja violeta a la derecha (máx. 66 %), meta de 13 px
 * (nombre en negrita + hora) y texto de 16,5 px en blanco.
 */
export function MensajeUsuario({ autor, hora, children }: { autor: string; hora?: string; children: ReactNode }) {
  return (
    <div className="k-msg-u">
      <div className="k-msg-meta"><b>{autor}</b>{hora && <span>{hora}</span>}</div>
      {typeof children === "string" ? <p>{children}</p> : children}
    </div>
  );
}

/**
 * Respuesta del agente = SECCIÓN DE DOCUMENTO, no burbuja: avatar de color de 48 px
 * con el icono del agente, meta con su nombre («Themis 10:42 · 2 fuentes»), cuerpo
 * de lectura (envuelve el markdown en <div className="k-md">) y acciones
 * («Redactar convocatoria» + secundarias). Solo datos reales en `hora` y `meta`.
 */
export function RespuestaAgente({ agente, hora, meta, children, acciones, className }: {
  agente: AgenteId; hora?: string; meta?: ReactNode; children: ReactNode; acciones?: ReactNode; className?: string;
}) {
  return (
    <article className={unir("k-msg-a", className)} aria-label={`Respuesta de ${AGENTES[agente].nombre}`}>
      <Sigilo agente={agente} className="av" />
      <div className="cuerpo">
        <div className="k-msg-meta"><b className="firma" data-h={AGENTES[agente].tono}>{AGENTES[agente].nombre}</b>{hora && <span>{hora}</span>}{meta && <span>{meta}</span>}</div>
        {children}
        {acciones && <div className="acc">{acciones}</div>}
      </div>
    </article>
  );
}

/**
 * Redactor del chat: recuadro redondeado, textarea de 16,5 px sin borde propio,
 * herramientas («Adjuntar», «Grabar», contexto) y «Enviar» abajo a la derecha. El
 * foco pinta el contorno del recuadro. Enter envía y Mayús+Enter salta de
 * línea si `enviarConEnter`.
 *
 *   <Redactor etiqueta="Mensaje para Themis" placeholder="Escribe tu pregunta a Themis…"
 *     valor={texto} alCambiar={setTexto} alEnviar={enviar} enviando={cargando}
 *     herramientas={<><button type="button" onClick={adjuntar}><Paperclip />Adjuntar</button><span>Reglamento en contexto</span></>} />
 */
export function Redactor({
  etiqueta, placeholder, valor, alCambiar, alEnviar, enviando, deshabilitado, herramientas, enviarConEnter = true, filas = 2,
  etiquetaEnviar = "Enviar", textoEnviando = "Enviando…",
}: {
  etiqueta: string; placeholder?: string; valor: string; alCambiar: (v: string) => void; alEnviar: () => void;
  enviando?: boolean; deshabilitado?: boolean; herramientas?: ReactNode; enviarConEnter?: boolean; filas?: number;
  /** Verbo del botón: «Enviar» (por defecto), «Responder», «Publicar»… El icono se deduce de él. */
  etiquetaEnviar?: string; textoEnviando?: string;
}) {
  const vacio = !valor.trim();
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (enviarConEnter && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!vacio && !enviando && !deshabilitado) alEnviar();
    }
  };
  return (
    <div className="k-redactor">
      <textarea rows={filas} aria-label={etiqueta} placeholder={placeholder} value={valor} disabled={deshabilitado}
        onChange={(e) => alCambiar(e.target.value)} onKeyDown={tecla} />
      <div className="herr">{herramientas}</div>
      <Boton onClick={alEnviar} disabled={deshabilitado || vacio} cargando={enviando} textoCargando={textoEnviando} tono="violet">
        {etiquetaEnviar}
      </Boton>
    </div>
  );
}
