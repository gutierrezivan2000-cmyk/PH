"use client";

import { useSyncExternalStore } from "react";

/* ════════════════════════════════════════════════════════════════════
   Chat de soporte (ChatBot): quién lo abre y si está disponible.
   El rediseño «Índice» no tiene botones flotantes (SPEC §f): el panel se
   abre desde la entrada «Soporte» del índice (y del colofón de Inicio).
   El panel lo monta el layout del dashboard; si no está montado (chat de un
   agente, sin sesión), la entrada no se muestra.
   ════════════════════════════════════════════════════════════════════ */

let abierto = false;
let montados = 0;
let origen: HTMLElement | null = null;
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};

/** Abre el panel. Recuerda el control que lo abrió para devolverle el foco al cerrar. */
export function abrirSoporte() {
  origen = (document.activeElement as HTMLElement | null) ?? null;
  abierto = true;
  emitir();
}

/** Cierra el panel y devuelve el foco a quien lo abrió (o, si ya no se ve, al botón «Índice» del dock). */
export function cerrarSoporte() {
  if (!abierto) return;
  abierto = false;
  emitir();
  const destino = origen;
  origen = null;
  requestAnimationFrame(() => {
    // En móvil el origen suele quedar dentro del índice ya cerrado (oculto): ahí no
    // se puede enfocar y el foco va al botón «Índice» del dock, que lo abre.
    if (destino?.isConnected) destino.focus();
    if (document.activeElement !== destino) document.querySelector<HTMLElement>(".k-dock button[aria-haspopup]")?.focus();
  });
}

export function alternarSoporte() {
  if (abierto) cerrarSoporte();
  else abrirSoporte();
}

/** El panel se registra al montarse con sesión; devuelve la función para darse de baja. */
export function registrarSoporte() {
  montados++;
  emitir();
  return () => {
    montados = Math.max(0, montados - 1);
    if (montados === 0) abierto = false;
    emitir();
  };
}

export function useSoporteAbierto(): boolean {
  return useSyncExternalStore(suscribir, () => abierto, () => false);
}

export function useSoporteDisponible(): boolean {
  return useSyncExternalStore(suscribir, () => montados > 0, () => false);
}
