"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Boton, Marca } from "@/components/kit";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  /**
   * Acción primaria de la pantalla (columnas 10–12). En Inicio, por defecto,
   * «Generar informe →»; pasa `null` para quitarla.
   */
  accion?: ReactNode;
}

/**
 * ¿La página ya tiene su propio título? (una <CabeceraPieza> del kit o
 * cualquier otro <h1> fuera de esta cabecera). Si lo tiene, el título de la
 * cabecera deja de ser <h1> —uno solo por pantalla— y en móvil cede el sitio
 * al logotipo. Con <CabeceraPieza> además se calla el subtítulo: la pieza ya
 * lo dice (si no, la misma pantalla se describía dos veces). Se vigila el DOM
 * porque muchas pantallas pintan su título solo cuando terminan de cargar.
 */
function usePaginaConTitulo(): { titulo: boolean; pieza: boolean } {
  const [estado, setEstado] = useState({ titulo: false, pieza: false });
  useEffect(() => {
    const raiz = document.querySelector("[data-shell='app'] main") ?? document.body;
    const mirar = () => {
      const pieza = Boolean(raiz.querySelector(".k-pieza-h"));
      const titulo = pieza || Array.from(raiz.querySelectorAll("h1")).some((h) => !h.closest(".k-cab"));
      setEstado((e) => (e.titulo === titulo && e.pieza === pieza ? e : { titulo, pieza }));
    };
    mirar();
    const mo = new MutationObserver(mirar);
    mo.observe(raiz, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return estado;
}

/* Estilos locales de la barra superior (el kit no trae subtítulo ni migas en .k-cab). */
const CSS_CABECERA = `
.k-cab > .k-cab-sub { flex: 1 1 0; min-width: 0; margin: 0; font-size: 14.5px; line-height: 1.3; color: var(--ink-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-cab-ruta .miga { font-size: 15px; font-weight: 700; color: var(--accent-text); text-decoration: none; white-space: nowrap; border-radius: 8px; padding: 4px 6px; margin: 0 -2px; }
.k-cab-ruta .miga:hover { background: var(--hl); }
.k-cab-ruta .sep { font-size: 15px; color: var(--ink-3); }
.k-cab-marca a { display: flex; align-items: center; gap: 10px; min-height: 44px; }
@media (max-width: 1180px) {
  .k-cab > .k-cab-sub { display: none; }
}
@media (max-width: 860px) {
  .k-cab[data-sin-titulo] > .k-cab-marca { flex: none; }
  .k-cab[data-sin-titulo] > .k-cab-marca .k-marca-w { display: none; }
  .k-cab[data-sin-titulo] > .k-cab-ruta { display: flex; flex: 1 1 auto; }
  .k-cab[data-sin-titulo] .k-cab-ruta .tit { font-size: 22px; }
  .k-cab-ruta .miga, .k-cab-ruta .sep { display: none; }
}
`;

/**
 * Barra superior del armazón «Guía»: sticky, 72 px, borde inferior fino. Título de
 * la pantalla a la izquierda, subtítulo en el centro y la acción primaria a la
 * derecha. En móvil muestra el logotipo (y el título, si la página aún no tiene uno propio).
 */
export function Header({ title, subtitle, breadcrumbs, accion }: HeaderProps) {
  const pathname = usePathname();
  const { titulo: conTitulo, pieza: conPieza } = usePaginaConTitulo();
  const enEmpresa = (pathname || "").startsWith("/empresa");
  const migas = (breadcrumbs ?? []).filter((c) => c.href);

  const accionFinal =
    accion !== undefined ? (
      accion
    ) : pathname === "/dashboard" ? (
      <Boton href="/dashboard/generar">
        Generar informe
      </Boton>
    ) : null;

  const Titulo = conTitulo ? "p" : "h1";

  return (
    <header
      className="k-cab"
      data-migas={migas.length > 0 || undefined}
      data-sin-titulo={!conTitulo || undefined}
    >
      <style href="k-cabecera-local" precedence="default">
        {CSS_CABECERA}
      </style>
      <div className="k-cab-marca">
        <Link href={enEmpresa ? "/empresa" : "/dashboard"} aria-label="SOPH.IA · Inicio">
          <Marca compacta />
        </Link>
      </div>
      <div className="k-cab-ruta">
        {migas.length > 0 && (
          <nav aria-label="Ruta" style={{ display: "contents" }}>
            {migas.map((c, i) => (
              <Fragment key={i}>
                <Link href={c.href as string} className="miga">
                  {c.label}
                </Link>
                <span className="sep" aria-hidden="true">
                  /
                </span>
              </Fragment>
            ))}
          </nav>
        )}
        <Titulo className="tit" title={title}>
          {title}
        </Titulo>
      </div>
      {subtitle && !conPieza && (
        <p className="k-cab-sub" title={subtitle}>
          <span>{subtitle}</span>
        </p>
      )}
      {accionFinal && <div className="acc">{accionFinal}</div>}
    </header>
  );
}
