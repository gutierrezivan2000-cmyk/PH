"use client";

import { SelectorTema } from "@/components/kit";

/**
 * Selector de tema de tres estados (Auto / Claro / Oscuro) del pie del índice.
 * Se muestran los tres a la vez —en vez de un interruptor que alterna— para que
 * «automático» sea visible: con un interruptor de dos posiciones no hay forma de
 * volver a seguir al dispositivo.
 *
 * Es el `SelectorTema` del kit (un solo patrón en todo el armazón): radiogroup
 * con flechas y tabulador itinerante, el elegido en negativo (--accent).
 * `ciclo`: en el índice plegado, un solo botón de 40 px que rota los tres.
 */
export function ThemeToggle({ ciclo }: { ciclo?: boolean }) {
  return <SelectorTema ciclo={ciclo} />;
}
