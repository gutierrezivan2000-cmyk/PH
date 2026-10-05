"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { clienteDeActa } from "@/lib/meetings/cliente";
import { crearControladorDeActa, type ControladorDeActa, type EstadoDelControlador } from "@/lib/meetings/controlador-acta";

export type ActaEnPantalla = EstadoDelControlador & Pick<ControladorDeActa, "pedir" | "reanudar" | "recargar">;

/**
 * El acta de una reunión: uno por página (así el avance sigue aunque se cambie de pestaña). `activo` es cuando la reunión ya
 * se puede leer; antes no se consulta nada. Se suelta (red y reloj) al salir de la página.
 */
export function useActa(meetingId: string, activo: boolean): ActaEnPantalla {
  const controlador = useMemo(() => crearControladorDeActa({ cliente: clienteDeActa(meetingId) }), [meetingId]);
  useEffect(() => {
    if (!activo) return;
    controlador.iniciar();
    return () => controlador.detener();
  }, [controlador, activo]);
  const estado = useSyncExternalStore(controlador.suscribir, controlador.leer, controlador.leer);
  return useMemo(() => ({ ...estado, pedir: controlador.pedir, reanudar: controlador.reanudar, recargar: controlador.recargar }), [estado, controlador]);
}
