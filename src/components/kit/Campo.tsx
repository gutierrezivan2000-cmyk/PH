import type { ComponentProps, ReactNode } from "react";
import { Chevron, Lupa } from "./Iconos";
import { unir } from "./util";

/**
 * Campo con etiqueta SIEMPRE visible encima (SPEC §f.3). Envuelve un control
 * del kit (<Entrada>, <AreaTexto>, <Selector>) y le da ayuda y error.
 *
 *   <Campo id="nit" etiqueta="NIT" ayuda="Con dígito de verificación.">
 *     <Entrada id="nit" value={nit} onChange={…} />
 *   </Campo>
 *   <Campo id="correo" etiqueta="Correo del consejo" error="Falta el dominio: por ejemplo, consejo@lospinos.com">
 *     <Entrada id="correo" invalido aria-describedby="correo-err" … />
 *   </Campo>
 *
 * Para enlazar ayuda/error al control usa los ids `${id}-ayuda` y `${id}-err`
 * en su aria-describedby (el componente los genera con esos ids).
 */
export function Campo({
  id, etiqueta, opcional, ayuda, error, children, className, sinEtiqueta,
}: {
  id: string;
  etiqueta: ReactNode;
  /** Añade «(opcional)» en --ink-3. */
  opcional?: boolean;
  ayuda?: ReactNode;
  /** Mensaje concreto y accionable. Muestra ■ naranja + texto. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Para controles sin <label for> (grupo de radios, interruptor): la etiqueta es un <span>. */
  sinEtiqueta?: boolean;
}) {
  const et = (
    <>
      {etiqueta}
      {opcional && <span className="opc"> (opcional)</span>}
    </>
  );
  return (
    <div className={unir("k-fld", className)}>
      {sinEtiqueta ? <span className="lb" id={`${id}-lb`}>{et}</span> : <label htmlFor={id}>{et}</label>}
      {children}
      {ayuda && <span className="k-ayuda" id={`${id}-ayuda`}>{ayuda}</span>}
      {error && <span className="k-err" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

/** Texto de una línea (48 px, 16 px de letra). `invalido` pinta el borde de error de 2 px. */
export function Entrada({ invalido, className, ...rest }: { invalido?: boolean } & ComponentProps<"input">) {
  return <input className={unir("k-in", className)} aria-invalid={invalido || undefined} {...rest} />;
}

/** Área de texto (mín. 96 px, redimensionable en vertical). */
export function AreaTexto({ invalido, className, ...rest }: { invalido?: boolean } & ComponentProps<"textarea">) {
  return <textarea className={unir("k-in", className)} aria-invalid={invalido || undefined} {...rest} />;
}

/**
 * Select nativo con chevrón propio (el chevrón global del repo queda anulado).
 *   <Selector id="ciudad" value={c} onChange={…}><option>Bogotá D. C.</option></Selector>
 */
export function Selector({ invalido, className, children, ...rest }: { invalido?: boolean } & ComponentProps<"select">) {
  return (
    <span className="k-select">
      <select className={unir("k-in", className)} aria-invalid={invalido || undefined} {...rest}>{children}</select>
      <Chevron />
    </span>
  );
}

/**
 * Buscador de tabla o de cabecera (44 px, lupa). Sin etiqueta visible: `etiqueta`
 * es su aria-label y, por defecto, su placeholder. `atajo="/"` muestra la tecla.
 */
export function Buscador({
  etiqueta, placeholder, atajo, className, ...rest
}: { etiqueta: string; atajo?: string } & Omit<ComponentProps<"input">, "aria-label" | "type">) {
  return (
    <label className={unir("k-campo", className)}>
      <Lupa />
      <input type="search" aria-label={etiqueta} placeholder={placeholder ?? etiqueta} {...rest} />
      {atajo && <kbd aria-hidden="true">{atajo}</kbd>}
    </label>
  );
}

/**
 * Bloque de un formulario largo: filete de 2 px + título de 22 px
 * («Datos de la copropiedad», «Documentos»). Es un <fieldset> con <legend>.
 */
export function GrupoCampos({ titulo, nota, children, className }:
  { titulo: ReactNode; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={unir("k-grupo-campos", className)}>
      <legend>{titulo}{nota && <small>{nota}</small>}</legend>
      <div>{children}</div>
    </fieldset>
  );
}
