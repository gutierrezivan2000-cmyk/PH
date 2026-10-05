"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { urlDeAudio } from "@/lib/meetings/cliente";
import { crearMotor, type EstadoMotor, type Motor } from "@/lib/meetings/motor-audio";

/**
 * El motor del audio de una reunión: uno por página, compartido por el reproductor de la transcripción, el «Escuchar» de
 * cada voz y los saltos desde el resumen. Se suelta (red y `<audio>`) al salir de la página.
 */
export function useMotorDeAudio(meetingId: string, duracionMs: number): Motor {
  const motor = useMemo(() => crearMotor({ url: urlDeAudio(meetingId), duracionMs }), [meetingId, duracionMs]);
  useEffect(() => () => motor.destruir(), [motor]);
  return motor;
}

/**
 * Lee del motor lo que esta parte de la pantalla necesita. `seleccionar` tiene que devolver un VALOR (número, texto,
 * booleano…): la pantalla solo se vuelve a pintar cuando ese valor cambia, así quien solo mira «qué intervención suena»
 * no se pinta cuatro veces por segundo con el minuto.
 */
export function useEstadoDeAudio<T extends string | number | boolean | null>(motor: Motor, seleccionar: (e: EstadoMotor) => T): T {
  return useSyncExternalStore(
    motor.suscribir,
    () => seleccionar(motor.estado()),
    () => seleccionar(motor.estado()),
  );
}
