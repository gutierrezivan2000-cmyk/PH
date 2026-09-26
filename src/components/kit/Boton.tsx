import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Chevron, Flecha } from "./Iconos";
import { unir } from "./util";

export type VarianteBoton = "primario" | "secundario" | "fantasma" | "peligro";

type PropsBoton = {
  /** primario = negativo (uno por zona) · secundario = contorno · fantasma = texto subrayado · peligro = contorno naranja. */
  variante?: VarianteBoton;
  /** 40 filas, barras y avisos · 44 por defecto · 56 una sola acción principal por flujo. */
  tam?: 40 | 44 | 56;
  /** Solo con variante="peligro": relleno naranja (el botón que confirma dentro de un modal). */
  lleno?: boolean;
  /** Si llega, se pinta un <Link> de Next. */
  href?: string;
  /** Flecha al final («avanza», «crea» = +) o al principio («vuelve» = ← Atrás). */
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
 * Botón del kit (SPEC §f.2, §i.2). Recto, sin sombra, foco de 3 px.
 *
 *   <Boton href="/dashboard/generar" flecha="avanza">Generar informe</Boton>
 *   <Boton variante="secundario">Guardar borrador</Boton>
 *   <Boton variante="peligro" lleno onClick={desactivar}>Desactivar portal</Boton>
 *   <Boton cargando={guardando} textoCargando="Guardando…">Guardar cambios</Boton>
 */
export function Boton({
  variante = "primario", tam = 44, lleno, href, flecha, ancho, cargando, textoCargando, descargar, nuevaPestana,
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
  const contenido = (
    <>
      {flecha === "vuelve" && <Flecha tipo="vuelve" />}
      <span>{cargando && textoCargando ? textoCargando : children}</span>
      {flecha && flecha !== "vuelve" && <Flecha tipo={flecha} />}
    </>
  );

  if (href) {
    if (inactivo) {
      // Un enlace deshabilitado no navega: se pinta como texto con aria-disabled.
      return <span className={cls} aria-disabled="true" role="link" aria-busy={cargando || undefined}>{contenido}</span>;
    }
    if (descargar || nuevaPestana) {
      return (
        <a href={href} className={cls} id={rest.id} title={rest.title} aria-label={rest["aria-label"]}
          download={descargar === true ? "" : descargar || undefined}
          target={nuevaPestana ? "_blank" : undefined} rel={nuevaPestana ? "noopener noreferrer" : undefined}>
          {contenido}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} id={rest.id} title={rest.title}
        aria-label={rest["aria-label"]} aria-describedby={rest["aria-describedby"]}>
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

/**
 * Botón-icono cuadrado de 44 px (40 con tam={40}). SIEMPRE con `etiqueta`:
 * es su nombre accesible. Úsalo solo donde el SPEC lo prevé (buscar en ≤ 1180,
 * cerrar ×, flechas de mes, quitar archivo). Acciones con verbo → <Boton>.
 */
export function BotonIcono({
  etiqueta, children, tam = 44, sinBorde, className, type = "button", ...rest
}: { etiqueta: string; children: ReactNode; tam?: 40 | 44; sinBorde?: boolean } & Omit<ComponentProps<"button">, "children" | "aria-label">) {
  return (
    <button type={type} aria-label={etiqueta} title={etiqueta}
      className={unir("k-ic", tam === 40 && "k-40", sinBorde && "k-sin-borde", className)} {...rest}>
      {children}
    </button>
  );
}

/**
 * Acción de fila de tabla (40 px, 44 en móvil): UNA acción principal con texto
 * + <MenuMas>. Botones contiguos se solapan 1,5 px.
 *   <BotonFila onClick={copiar}>Copiar enlace</BotonFila>
 */
export function BotonFila({
  children, href, className, type = "button", ...rest
}: { children: ReactNode; href?: string } & Omit<ComponentProps<"button">, "children">) {
  if (href) return <Link href={href} className={unir("k-bt", className)}>{children}</Link>;
  return <button type={type} className={unir("k-bt", className)} {...rest}>{children}</button>;
}

/**
 * Enlace «ver» con flecha: «Abrir bitácora 03 →». `ref` es el número de
 * entrada del índice (mono 12 px). Para enlaces de sección y pies de lista.
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
