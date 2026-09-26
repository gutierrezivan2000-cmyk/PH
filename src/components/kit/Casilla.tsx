"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { unir } from "./util";

/**
 * Casilla (SPEC §f.4). Con `etiqueta`, se envuelve en un <label> de 44 px:
 * toda la fila es el área táctil. Sin etiqueta, pasa `aria-label`.
 * `indeterminada` = «seleccionar todas» parcial.
 *
 *   <Casilla etiqueta="Incluir el acta del consejo" checked={acta} onChange={e => setActa(e.target.checked)} />
 *   <Casilla aria-label="Seleccionar 101" checked={sel} onChange={…} />
 */
export function Casilla({
  etiqueta, detalle, indeterminada, className, ...rest
}: { etiqueta?: ReactNode; detalle?: ReactNode; indeterminada?: boolean } & Omit<ComponentProps<"input">, "type">) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminada);
  }, [indeterminada]);
  const input = (
    <input ref={ref} type="checkbox" className="k-chk" {...rest} />
  );
  if (!etiqueta) return input;
  return (
    <label className={unir("k-ctl", className)}>
      {input}
      <span>{etiqueta}{detalle && <small>{detalle}</small>}</span>
    </label>
  );
}

/**
 * Opción (radio). El único elemento redondo del sistema. Agrúpalas en un
 * <fieldset> o en un div con role="radiogroup" y aria-labelledby.
 */
export function Opcion({
  etiqueta, detalle, className, ...rest
}: { etiqueta: ReactNode; detalle?: ReactNode } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={unir("k-ctl", className)}>
      <input type="radio" className="k-rad" {...rest} />
      <span>{etiqueta}{detalle && <small>{detalle}</small>}</span>
    </label>
  );
}

/**
 * Fila seleccionable de 64 px (SPEC §g 02, paso 1 de Generar): radio + nombre
 * 18/700 + apoyo 14 px (unidades) + dato a la derecha 14 px --ink-3 («último
 * informe: agosto»). La elegida en --hl con recuadro de 2 px; toda la fila es
 * el área de clic y lleva el anillo de foco. Agrúpalas en <OpcionesFila>.
 *
 *   <OpcionesFila etiquetaAccesible="Copropiedad">
 *     {props.map(p => <OpcionFila key={p.id} name="prop" etiqueta={p.name} detalle={`${p.units} unidades`}
 *       extra={ultimo ? `último informe: ${ultimo}` : undefined} checked={id === p.id} onChange={() => setId(p.id)} />)}
 *   </OpcionesFila>
 * Solo datos reales en `detalle` y `extra` (si la API no da unidades, no las pongas).
 */
export function OpcionFila({
  etiqueta, detalle, extra, className, ...rest
}: { etiqueta: ReactNode; detalle?: ReactNode; extra?: ReactNode } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={unir("k-opfila", className)}>
      <input type="radio" className="k-rad" {...rest} />
      <span className="t"><b>{etiqueta}</b>{detalle && <small>{detalle}</small>}</span>
      {extra && <span className="x">{extra}</span>}
    </label>
  );
}

/** Contenedor de <OpcionFila>: role="radiogroup" con filete de 2 px arriba. */
export function OpcionesFila({ etiquetaAccesible, children, className }: { etiquetaAccesible: string; children: ReactNode; className?: string }) {
  return <div role="radiogroup" aria-label={etiquetaAccesible} className={unir("k-opfilas", className)}>{children}</div>;
}

/**
 * Interruptor: <button role="switch" aria-checked> dentro de un <label> de 44 px
 * (pulsar el texto también lo cambia). Para ajustes que se aplican al momento.
 *
 *   <Interruptor etiqueta="Avisos de Chronos por correo" activo={on} alCambiar={setOn} />
 */
export function Interruptor({
  etiqueta, detalle, activo, alCambiar, disabled, className, id,
}: {
  etiqueta: ReactNode; detalle?: ReactNode; activo: boolean; alCambiar: (v: boolean) => void;
  disabled?: boolean; className?: string; id?: string;
}) {
  return (
    <label className={unir("k-ctl", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={activo}
        className="k-sw"
        disabled={disabled}
        onClick={() => alCambiar(!activo)}
      />
      <span>{etiqueta}{detalle && <small>{detalle}</small>}</span>
    </label>
  );
}
