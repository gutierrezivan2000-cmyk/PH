import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Chevron, Lupa } from "./Iconos";
import { unir } from "./util";

/**
 * Campo con etiqueta SIEMPRE visible encima. Envuelve un control
 * del kit (<Entrada>, <AreaTexto>, <Selector>) y le da ayuda y error.
 *
 *   <Campo id="nit" etiqueta="NIT" ayuda="Con dígito de verificación.">
 *     <Entrada id="nit" value={nit} onChange={…} />
 *   </Campo>
 *   <Campo id="correo" etiqueta="Correo del consejo" error="Falta el dominio: por ejemplo, consejo@lospinos.com">
 *     <Entrada id="correo" … />
 *   </Campo>
 *
 * Asocia solo la ayuda y el error: si el hijo es el control con el mismo `id`
 * (Entrada, AreaTexto, Selector o un control nativo), le añade
 * aria-describedby (`${id}-ayuda`, `${id}-err`, conservando el que ya traiga)
 * y, con error, aria-invalid (borde rojo de 2 px). No hace falta escribirlos.
 */
export function Campo({
  id, etiqueta, opcional, ayuda, error, children, className, sinEtiqueta,
}: {
  id: string;
  etiqueta: ReactNode;
  /** Añade «(opcional)» en --ink-3. */
  opcional?: boolean;
  ayuda?: ReactNode;
  /** Mensaje concreto y accionable. Muestra «!» rojo + texto. */
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
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-err` : null].filter(Boolean).join(" ");
  let control = children;
  if (isValidElement(children) && (children.props as { id?: string }).id === id && (describe || error)) {
    const hijo = children as ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" }>;
    const previo = hijo.props["aria-describedby"];
    control = cloneElement(hijo, {
      "aria-describedby": [...new Set(`${previo ?? ""} ${describe}`.split(/\s+/).filter(Boolean))].join(" ") || undefined,
      ...(error ? { "aria-invalid": true } : {}),
    });
  }
  return (
    <div className={unir("k-fld", className)}>
      {sinEtiqueta ? <span className="lb" id={`${id}-lb`}>{et}</span> : <label htmlFor={id}>{et}</label>}
      {control}
      {ayuda && <span className="k-ayuda" id={`${id}-ayuda`}>{ayuda}</span>}
      {error && <span className="k-err" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

/** Texto de una línea (50 px, 16 px de letra). `invalido` pinta el borde rojo de 2 px. */
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
 * Buscador de tabla o de cabecera (44 px, lupa). Sin etiqueta visible:
 * `etiquetaAccesible` es su aria-label y, por defecto, su placeholder.
 * `atajo="/"` muestra la tecla.
 */
export function Buscador({
  etiquetaAccesible, placeholder, atajo, className, ...rest
}: { etiquetaAccesible: string; atajo?: string } & Omit<ComponentProps<"input">, "aria-label" | "type">) {
  return (
    <label className={unir("k-campo", className)}>
      <Lupa />
      <input type="search" aria-label={etiquetaAccesible} placeholder={placeholder ?? etiquetaAccesible} {...rest} />
      {atajo && <kbd aria-hidden="true">{atajo}</kbd>}
    </label>
  );
}

/**
 * Bloque de un formulario largo: tarjeta con título
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
