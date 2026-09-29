import type { LucideIcon } from "lucide-react";
import type { Tono } from "./modulos";
import { unir } from "./util";

export type TamLoseta = 28 | 32 | 36 | 40 | 52 | 60 | 72;

/**
 * Loseta = la ficha de color con el icono de una función, un estado o un tipo de
 * contenido. Es la unidad de significado de «Guía»: el mismo icono y el mismo color
 * significan siempre lo mismo. Decorativa (aria-hidden): el texto de al lado dice qué es.
 * 44 px por defecto; `tam` elige otro; `suave` = fondo tintado en vez de degradado.
 *
 *   <Loseta icono={Building2} tono="blue" />
 *   <Loseta icono={Users} tono="sky" tam={60} suave />
 */
export function Loseta({ icono: Icono, tono, tam, suave, className }: {
  icono: LucideIcon; tono?: Tono; tam?: TamLoseta; suave?: boolean; className?: string;
}) {
  return (
    <span className={unir("k-tile ico", tam && `k-t${tam}x`, suave && "suave", className)} data-h={tono} aria-hidden="true">
      <Icono strokeWidth={2.1} aria-hidden="true" focusable="false" />
    </span>
  );
}
