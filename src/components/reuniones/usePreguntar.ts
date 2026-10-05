"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { preguntarALaReunion } from "@/lib/meetings/cliente";
import { crearControladorDePreguntar, type ControladorDePreguntar, type EstadoDeConversacion } from "@/lib/meetings/controlador-preguntar";

export type ConversacionEnPantalla = EstadoDeConversacion & Pick<ControladorDePreguntar, "preguntar" | "detener" | "reintentar" | "limpiar">;

/**
 * La conversación con una reunión: una por página (así sigue aunque se cambie de pestaña mientras se responde). No se guarda en
 * ningún lado: al salir de la página se pierde, y lo que esté en vuelo se corta.
 */
export function usePreguntar(meetingId: string): ConversacionEnPantalla {
  const controlador = useMemo(() => crearControladorDePreguntar({ responder: preguntarALaReunion(meetingId) }), [meetingId]);
  useEffect(() => {
    controlador.activar();
    return () => controlador.desactivar();
  }, [controlador]);
  const estado = useSyncExternalStore(controlador.suscribir, controlador.leer, controlador.leer);
  return useMemo(
    () => ({ ...estado, preguntar: controlador.preguntar, detener: controlador.detener, reintentar: controlador.reintentar, limpiar: controlador.limpiar }),
    [estado, controlador],
  );
}
