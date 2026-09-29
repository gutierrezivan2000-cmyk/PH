import Link from "next/link";
import { ArrowLeft, ArrowRight, LoaderCircle, Plus, type LucideIcon } from "lucide-react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Chevron, Flecha } from "./Iconos";
import { iconoDeAccion, textoDe, type Tono } from "./modulos";
import { unir } from "./util";

export type VarianteBoton = "primario" | "secundario" | "fantasma" | "peligro";

type PropsBoton = {
  /** primario = relleno de color (uno por zona) · secundario = contorno · fantasma = solo texto · peligro = rojo. */
  variante?: VarianteBoton;
  /** 40 filas, barras y avisos · 44 por defecto · 56 una sola acción principal por flujo. */
  tam?: 40 | 44 | 56;
  /** Solo con variante="peligro": relleno rojo (el botón que confirma dentro de un modal). */
  lleno?: boolean;
  /** Icono propio. Sin él, se deduce del verbo («Descargar» → ↓, «Agregar» → +). `false` = sin icono. */
  icono?: LucideIcon | false;
  /** Color de la intención. Sin él, se deduce del verbo (crear = verde, descargar = azul, eliminar = rojo…). */
  tono?: Tono;
  /** Si llega, se pinta un <Link> de Next (se reenvían onClick, style, data-* y aria-*). */
  href?: string;
  /** Pista de dirección: «avanza» (→ al final), «crea» (+ verde) o «vuelve» (← al principio). */
  flecha?: "avanza" | "crea" | "vuelve";
  /** Ancho completo. «movil» = solo en ≤ 860 px. */
  ancho?: boolean | "movil";
  /** Estado de carga: el texto cambia a `textoCargando` (gerundio) y el botón queda aria-disabled. */
  cargando?: boolean;
  textoCargando?: string;
  /** Con `href`: descarga el archivo (atributo download; string = nombre del archivo). Pinta un <a> nativo. */
  descargar?: boolean | string;
  /** Con `href`: abre en otra pestaña (rel="noopener noreferrer"). Pinta un <a> nativo. */
  nuevaPestana?: boolean;
  children: ReactNode;
} & Omit<ComponentProps<"button">, "children">;

/**
 * Botón del kit «Guía»: SIEMPRE icono + verbo, con el color de su intención.
 * El icono y el color se deducen del verbo (ver `iconoDeAccion`); `icono` y `tono`
 * los fijan a mano cuando hace falta.
 *
 *   <Boton href="/dashboard/generar">Generar informe</Boton>            → ✨ violeta-fucsia
 *   <Boton variante="secundario">Guardar borrador</Boton>              → 💾 contorno
 *   <Boton variante="peligro" lleno onClick={desactivar}>Desactivar portal</Boton>
 *   <Boton cargando={guardando} textoCargando="Guardando…">Guardar cambios</Boton>
 */
export function Boton({
  variante = "primario", tam = 44, lleno, icono, tono, href, flecha, ancho, cargando, textoCargando, descargar, nuevaPestana,
  children, className, disabled, onClick, type = "button", ...rest
}: PropsBoton) {
  const cls = unir(
    "k-btn",
    variante === "secundario" && "k-sec",
    variante === "fantasma" && "k-fan",
    variante === "peligro" && "k-pel",
    lleno && variante === "peligro" && "k-lleno",
    tam === 40 && "k-40",
    tam === 56 && "k-56",
    ancho === true && "k-ancho",
    ancho === "movil" && "k-movil-ancho",
    className,
  );
  const inactivo = Boolean(disabled || cargando);
  const { Icono, alFinal, color } = elegirIcono(children, { icono, tono, flecha });
  const Pintado = cargando ? LoaderCircle : Icono;
  const icon = Pintado && (
    <Pintado aria-hidden="true" focusable="false" className={cargando ? "k-spin" : undefined} />
  );
  const contenido = (
    <>
      {!alFinal && icon}
      <span>{cargando && textoCargando ? textoCargando : children}</span>
      {alFinal && icon}
    </>
  );
  const aire = { "data-h": variante === "peligro" ? undefined : color } as const;

  if (href) {
    // Con href se reenvía todo lo que sirve en un enlace (onClick, style, data-*, aria-*…);
    // lo exclusivo de <button> se descarta.
    const enlace = propsDeEnlace(rest);
    if (inactivo) {
      // Un enlace deshabilitado no navega: se pinta como texto con aria-disabled.
      return <span {...(enlace as ComponentProps<"span">)} {...aire} className={cls} aria-disabled="true" role="link" aria-busy={cargando || undefined}>{contenido}</span>;
    }
    if (descargar || nuevaPestana) {
      return (
        <a {...enlace} {...aire} href={href} className={cls} onClick={onClick as ComponentProps<"a">["onClick"]}
          download={descargar === true ? "" : descargar || undefined}
          target={nuevaPestana ? "_blank" : undefined} rel={nuevaPestana ? "noopener noreferrer" : undefined}>
          {contenido}
        </a>
      );
    }
    return (
      <Link {...enlace} {...aire} href={href} className={cls} onClick={onClick as ComponentProps<"a">["onClick"]}>
        {contenido}
      </Link>
    );
  }

  // En carga se usa aria-disabled (no disabled) para no perder el foco del teclado.
  const alHacerClic = (e: MouseEvent<HTMLButtonElement>) => {
    if (cargando) { e.preventDefault(); return; }
    onClick?.(e);
  };
  return (
    <button
      type={type}
      {...aire}
      className={cls}
      disabled={disabled}
      aria-disabled={cargando ? true : undefined}
      aria-busy={cargando || undefined}
      onClick={alHacerClic}
      {...rest}
    >
      {contenido}
    </button>
  );
}

/** Qué icono lleva un botón, dónde va y de qué color es (por `icono`/`tono`, por `flecha` o por el verbo). */
function elegirIcono(children: ReactNode, o: { icono?: LucideIcon | false; tono?: Tono; flecha?: "avanza" | "crea" | "vuelve" }):
  { Icono: LucideIcon | null; alFinal: boolean; color: Tono | undefined } {
  if (o.icono === false) return { Icono: null, alFinal: false, color: o.tono };
  if (o.icono) return { Icono: o.icono, alFinal: false, color: o.tono ?? iconoDeAccion(textoDe(children)).tono };
  if (o.flecha === "crea") return { Icono: Plus, alFinal: false, color: o.tono ?? "green" };
  if (o.flecha === "vuelve") return { Icono: ArrowLeft, alFinal: false, color: o.tono ?? "slate" };
  const d = iconoDeAccion(textoDe(children));
  // «avanza» sin un verbo con icono propio (Generar → ✨, Descargar → ↓) es simplemente «→» al final.
  if (o.flecha === "avanza" && d.Icono === ArrowRight) return { Icono: ArrowRight, alFinal: true, color: o.tono ?? "violet" };
  return { Icono: d.Icono, alFinal: Boolean(d.fin), color: o.tono ?? d.tono };
}

/** Props de <button> que no tienen sentido en un enlace. */
function propsDeEnlace(rest: Omit<ComponentProps<"button">, "children">): ComponentProps<"a"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { form, formAction, formEncType, formMethod, formNoValidate, formTarget, name, value, ...resto } = rest;
  return resto as unknown as ComponentProps<"a">;
}

/**
 * Botón-icono cuadrado de 44 px (40 con tam={40}). SIEMPRE con `etiquetaAccesible`:
 * es su nombre accesible (y su title). Úsalo solo donde no cabe una palabra (buscar en
 * pantallas estrechas, flechas de mes, quitar archivo). Acciones con verbo → <Boton>.
 */
export function BotonIcono({
  etiquetaAccesible, children, tam = 44, sinBorde, className, type = "button", ...rest
}: { etiquetaAccesible: string; children: ReactNode; tam?: 40 | 44; sinBorde?: boolean } & Omit<ComponentProps<"button">, "children" | "aria-label">) {
  return (
    <button type={type} aria-label={etiquetaAccesible} title={etiquetaAccesible}
      className={unir("k-ic", tam === 40 && "k-40", sinBorde && "k-sin-borde", className)} {...rest}>
      {children}
    </button>
  );
}

/**
 * Acción de fila de tabla o lista (40 px, 44 en móvil): icono de color + verbo.
 * UNA acción principal con texto + <MenuMas>. El icono se deduce del verbo.
 *   <BotonFila onClick={copiar}>Copiar enlace</BotonFila>
 *   <BotonFila href={`/u/${token}`} nuevaPestana>Abrir el portal</BotonFila>
 * Con `href` pinta un enlace (<Link>; con `nuevaPestana`, <a target="_blank">
 * con rel="noopener noreferrer", también para enlaces externos como wa.me).
 */
export function BotonFila({
  children, href, nuevaPestana, icono, tono, className, type = "button", ...rest
}: { children: ReactNode; href?: string; nuevaPestana?: boolean; icono?: LucideIcon | false; tono?: Tono } & Omit<ComponentProps<"button">, "children">) {
  const d = iconoDeAccion(textoDe(children));
  const Icono = icono === false ? null : icono ?? d.Icono;
  const contenido = (
    <>
      {Icono && <Icono aria-hidden="true" focusable="false" />}
      {children}
    </>
  );
  const color = tono ?? d.tono;
  if (href) {
    const enlace = propsDeEnlace(rest);
    if (nuevaPestana) {
      return <a {...enlace} data-h={color} href={href} target="_blank" rel="noopener noreferrer" className={unir("k-bt", className)}>{contenido}</a>;
    }
    return <Link {...enlace} data-h={color} href={href} className={unir("k-bt", className)}>{contenido}</Link>;
  }
  return <button type={type} data-h={color} className={unir("k-bt", className)} {...rest}>{contenido}</button>;
}

/**
 * Enlace «ver» con flecha: «Abrir bitácora →», en una píldora de color de marca.
 * Para enlaces de sección y pies de lista. `refIndice` ya no se pinta (compatibilidad).
 */
export function EnlaceVer({ href, children, refIndice, className, ...rest }:
  { href: string; children: ReactNode; refIndice?: string } & Omit<ComponentProps<typeof Link>, "href" | "children">) {
  return (
    <Link href={href} className={unir("k-ver", className)} {...rest}>
      <span className="t">{children}</span>
      {refIndice && <span className="k-ref">{refIndice}</span>}
      <Flecha />
    </Link>
  );
}

export { Chevron, Flecha };
