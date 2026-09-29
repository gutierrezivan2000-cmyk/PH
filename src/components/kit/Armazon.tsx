"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as TeclaReact, type ReactNode } from "react";
import { Building2, ChevronDown, ChevronUp, Hourglass, LogOut, Menu, Monitor, Moon, Sun, X, type LucideIcon } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { BotonIcono } from "./Boton";
import { Cuadro } from "./Estado";
import { Lupa } from "./Iconos";
import { Loseta } from "./Loseta";
import type { Tono } from "./modulos";
import { nombreCorto, unir } from "./util";

/* ════════════════════════════════════════════════════════════════════
   Piezas del armazón. Son presentacionales: rutas, conteos y estado
   (abierto/cerrado, copropiedad elegida) los pone el layout.
   Estructura:
     <Armazon indice={<Indice …/>}>          ← data-shell="app" + rejilla menú | principal
       <CabeceraApp …/> <Cornisa …/>
       <main>…</main>
       <Dock …/>
     </Armazon>
   ════════════════════════════════════════════════════════════════════ */

/** Raíz del armazón: lleva data-shell="app" (activa los tokens) y la rejilla índice | principal. */
export function Armazon({ indice, children, idPrincipal = "k-principal", className }: {
  indice: ReactNode; children: ReactNode; idPrincipal?: string; className?: string;
}) {
  return (
    <div data-shell="app" className={unir("k-app", className)}>
      <div className="k-col-indice">{indice}</div>
      <div className="k-principal" id={idPrincipal}>{children}</div>
    </div>
  );
}

/** Logotipo: ficha violeta-fucsia con la «S» + «SOPH.IA». `compacta` se acepta y se ignora (lo decide el CSS). */
export function Marca({ compacta }: { compacta?: boolean }) {
  void compacta;
  return (
    <>
      <span className="k-marca-s" aria-hidden="true">S</span>
      <span className="k-marca-w">SOPH<span>.</span>IA</span>
    </>
  );
}

/**
 * Menú lateral (292 px; 264 en ≤ 1180). En ≤ 860 px es un diálogo a pantalla
 * completa que se abre desde el dock: con `abierto`, role="dialog" aria-modal,
 * foco a la entrada activa, el contenido principal (`idPrincipal`) queda inert,
 * Escape o «Cerrar» cierran y el foco vuelve a quien lo abrió.
 */
export function Indice({ children, pie, abierto = false, alCerrar, idPrincipal = "k-principal", hrefInicio = "/dashboard", accionMarca }: {
  children: ReactNode; pie?: ReactNode; abierto?: boolean; alCerrar?: () => void;
  idPrincipal?: string; hrefInicio?: string;
  /** Control a la derecha del logotipo (escritorio): «Ocultar el menú». */
  accionMarca?: ReactNode;
}) {
  const nav = useRef<HTMLElement>(null);
  const alCerrarRef = useRef(alCerrar);
  useEffect(() => { alCerrarRef.current = alCerrar; }, [alCerrar]);

  useEffect(() => {
    if (!abierto) return;
    // Solo es diálogo en móvil; si la ventana creció, se cierra sin más.
    if (!window.matchMedia("(max-width: 860px)").matches) { alCerrarRef.current?.(); return; }
    const previo = document.activeElement as HTMLElement | null;
    const principal = document.getElementById(idPrincipal);
    principal?.setAttribute("inert", "");
    const enfocar = () =>
      (nav.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? nav.current?.querySelector<HTMLElement>("a,button"))?.focus();
    const cuadro = requestAnimationFrame(enfocar);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrarRef.current?.(); };
    const ancho = window.matchMedia("(max-width: 860px)");
    const cambio = () => { if (!ancho.matches) alCerrarRef.current?.(); };
    document.addEventListener("keydown", tecla);
    ancho.addEventListener("change", cambio);
    return () => {
      cancelAnimationFrame(cuadro);
      document.removeEventListener("keydown", tecla);
      ancho.removeEventListener("change", cambio);
      principal?.removeAttribute("inert");
      previo?.focus?.();
    };
  }, [abierto, idPrincipal]);

  return (
    <nav ref={nav} className="k-indice" aria-label="Menú" data-abierto={abierto || undefined}
      role={abierto ? "dialog" : undefined} aria-modal={abierto || undefined}>
      <div className="k-marca">
        {/* El logotipo también cierra el diálogo móvil: navegar no basta para cerrarlo. */}
        <Link href={hrefInicio} className="k-marca-a" aria-label="SOPH.IA · Inicio" onClick={alCerrar}><Marca /></Link>
        {accionMarca}
        {alCerrar && (
          <button type="button" className="k-btn k-sec k-cerrar" data-h="slate" onClick={alCerrar}><X aria-hidden="true" focusable="false" /><span>Cerrar</span></button>
        )}
      </div>
      <div className="k-indice-lista">{children}</div>
      {pie && <div className="k-indice-pie">{pie}</div>}
    </nav>
  );
}

/** Grupo del menú: «Día a día», «Finanzas»… (`letra` se acepta y no se pinta). */
export function GrupoIndice({ titulo, children }: { letra?: string; titulo: string; children: ReactNode }) {
  return (
    <div className="k-grupo-idx" role="group" aria-label={titulo}>
      <div className="k-grupo-h" aria-hidden="true">{titulo}</div>
      {children}
    </div>
  );
}

/**
 * Entrada del menú: ficha de color con el icono de la función, su nombre y, a la
 * derecha, un DATO VIVO con unidad:
 *   pend   = pendiente accionable («2 por generar», píldora azul)
 *   alerta = vencidas («3 vencidas», píldora roja)
 *   tot    = total apagado («168 u.», «38 doc.», «2 activos»)
 * Sin dato real → nada. `pronto` = pantalla pausada (ficha gris con borde discontinuo y la palabra «Pronto»).
 */
export function ItemIndice({ href, children, actual, dato, pronto, alNavegar, icono, tono, ayuda }: {
  n?: string; href: string; children: ReactNode; actual?: boolean;
  dato?: { texto: string; tipo: "pend" | "alerta" | "tot" };
  pronto?: boolean; alNavegar?: () => void; icono: LucideIcon; tono: Tono;
  /** Qué hace la función, en una frase (tooltip al pasar el cursor). */
  ayuda?: string;
}) {
  return (
    <Link href={href} className={unir("k-it", pronto && "pronto")} data-h={tono} title={ayuda} aria-current={actual ? "page" : undefined} onClick={alNavegar}>
      <Loseta icono={icono} tono={tono} />
      <span className="l">{children}</span>
      {pronto ? (
        <span className="c"><Hourglass aria-hidden="true" focusable="false" />Pronto</span>
      ) : dato ? (
        <span className={unir("c", dato.tipo)}><span className="k-sr">· </span>{dato.texto}</span>
      ) : null}
    </Link>
  );
}

/** Pie del menú: usuario, selector de tema y «Cerrar sesión». */
export function PieIndice({ nombre, correo, alSalir }: { nombre: string; correo?: string; alSalir: () => void }) {
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <>
      <div className="k-yo-fila">
        <div className="k-yo" title={correo ? `${nombre} · ${correo}` : nombre}>
          <div className="k-yo-a" aria-hidden="true">{iniciales}</div>
          <div style={{ minWidth: 0 }}><b>{nombre}</b>{correo && <span>{correo}</span>}</div>
        </div>
        <button type="button" className="k-salir" onClick={alSalir} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut aria-hidden="true" focusable="false" /><span>Salir</span>
        </button>
      </div>
      <SelectorTema />
    </>
  );
}

const OPCIONES_TEMA: Array<[Theme, string, string, LucideIcon]> = [
  ["auto", "Auto", "Seguir al dispositivo", Monitor],
  ["light", "Claro", "Tema claro", Sun],
  ["dark", "Oscuro", "Tema oscuro", Moon],
];

/**
 * Selector de tema Auto / Claro / Oscuro (el único del sistema: ThemeToggle lo usa).
 * Se muestran los tres a la vez, con su icono, no un interruptor, para que «Auto» sea visible.
 * Patrón de radios de WAI-ARIA: role="radiogroup" + role="radio" aria-checked,
 * tabulador itinerante (solo el elegido entra en el orden de tabulación) y
 * flechas ← → ↑ ↓ que eligen y mueven el foco. Escribe la misma clave
 * (`sophia-theme`) que el script del layout raíz.
 * `ciclo` (menú plegado, 84 px de ancho): un solo botón que rota
 * Auto → Claro → Oscuro, con el icono del tema actual.
 */
export function SelectorTema({ grande, ciclo, className }: { grande?: boolean; ciclo?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme();
  const grupo = useRef<HTMLDivElement>(null);
  if (ciclo) {
    const i = Math.max(0, OPCIONES_TEMA.findIndex(([t]) => t === theme));
    const [, actual, , IconoActual] = OPCIONES_TEMA[i];
    const [siguiente, rotuloSiguiente] = OPCIONES_TEMA[(i + 1) % OPCIONES_TEMA.length];
    const etiqueta = `Tema: ${actual}. Cambiar a ${rotuloSiguiente.toLowerCase()}`;
    return (
      <button type="button" className={unir("k-tema-ciclo", className)} onClick={() => setTheme(siguiente)}
        aria-label={etiqueta} title={etiqueta}><IconoActual aria-hidden="true" focusable="false" /></button>
    );
  }
  const teclado = (e: TeclaReact<HTMLButtonElement>) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const i = OPCIONES_TEMA.findIndex(([t]) => t === theme);
    const sig = (Math.max(0, i) + paso + OPCIONES_TEMA.length) % OPCIONES_TEMA.length;
    setTheme(OPCIONES_TEMA[sig][0]);
    grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[sig]?.focus();
  };
  return (
    <div ref={grupo} className={unir("k-tema", grande && "k-48", className)} role="radiogroup" aria-label="Tema de la interfaz">
      {OPCIONES_TEMA.map(([t, et, titulo, Icono]) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} title={titulo}
          tabIndex={theme === t ? 0 : -1} onKeyDown={teclado} onClick={() => setTheme(t)}>
          <Icono aria-hidden="true" focusable="false" />{et}
        </button>
      ))}
    </div>
  );
}

/**
 * Barra superior (sticky, 72 px): título de la pantalla a la izquierda, buscador en
 * el centro (en pantallas estrechas, un botón-icono), acción primaria a la derecha.
 * En móvil muestra el logotipo y oculta la acción (va en la página).
 * `nn` (número del antiguo índice) se acepta y se ignora.
 */
export function CabeceraApp({ titulo, buscador, alBuscar, accion }: {
  nn?: string; titulo: string;
  /** Un <Buscador atajo="/" …/> del kit. Sin buscador real, no pases nada. */
  buscador?: ReactNode;
  /** Qué hace el botón-icono de búsqueda en pantallas estrechas (abrir un campo a ancho completo). */
  alBuscar?: () => void;
  accion?: ReactNode;
}) {
  return (
    <header className="k-cab">
      <div className="k-cab-marca"><Marca compacta /></div>
      <div className="k-cab-ruta"><span className="tit">{titulo}</span></div>
      {buscador}
      {buscador && alBuscar && <BotonIcono etiquetaAccesible="Buscar" onClick={alBuscar}><Lupa /></BotonIcono>}
      {accion && <div className="acc">{accion}</div>}
    </header>
  );
}

export type CopropiedadCornisa = { id: string; nombre: string; vencidas: number };

/**
 * Alcance: selector de la COPROPIEDAD que se está viendo, en chips.
 * «Copropiedad: Todas · 3 | ⚠ Los Pinos 2 vencidas | ✓ Mirador al día».
 * Orden: más vencidas primero. Nombre corto con el completo en title/aria-label.
 * Entre 861 y 1300 px las «al día» se pliegan en «N al día ▾»; el mismo botón las
 * despliega y, abierto, pasa a «Plegar ▴» (aria-expanded).
 * Filtra en el cliente lo ya cargado (estado local): no hace llamadas.
 * Va en Inicio, Bitácora e Historial. En /empresa usa `info` (solo texto).
 */
export function Cornisa({ copropiedades, valor, alCambiar, info }: {
  copropiedades?: CopropiedadCornisa[]; valor?: string; alCambiar?: (id: string) => void; info?: ReactNode;
}) {
  const [expandida, setExpandida] = useState(false);
  if (info) {
    return <div className="k-cornisa" role="note"><span className="info">{info}</span></div>;
  }
  const lista = [...(copropiedades ?? [])].sort((a, b) => b.vencidas - a.vencidas);
  const alDia = lista.filter((c) => c.vencidas === 0);
  const elegidaAlDia = alDia.some((c) => c.id === valor);
  const abierta = expandida || elegidaAlDia;
  // El mismo botón pliega y despliega (el foco no se pierde). Si la elegida está
  // «al día», el grupo queda abierto: plegarlo escondería la selección.
  const plegable = alDia.length > 0 && !elegidaAlDia;
  return (
    <div className="k-cornisa" role="group" aria-label="Alcance: copropiedades" data-expandida={abierta ? "true" : "false"}>
      <span className="k" aria-hidden="true"><Building2 focusable="false" />Copropiedad:</span>
      <button type="button" aria-pressed={valor === "todas" || !valor} onClick={() => alCambiar?.("todas")}>
        <Building2 aria-hidden="true" focusable="false" />
        Todas <span className="e">· {lista.length} {lista.length === 1 ? "copropiedad" : "copropiedades"}</span>
      </button>
      {lista.map((c) => (
        <button key={c.id} type="button" aria-pressed={valor === c.id} title={c.nombre}
          className={c.vencidas === 0 ? "aldia" : undefined}
          aria-label={`${c.nombre}: ${c.vencidas === 0 ? "al día" : `${c.vencidas} ${c.vencidas === 1 ? "vencida" : "vencidas"}`}`}
          onClick={() => alCambiar?.(c.id)}>
          <Cuadro tipo={c.vencidas > 0 ? "vencido" : "ok"} />
          {nombreCorto(c.nombre)}{" "}
          <span className={unir("e", c.vencidas > 0 && "v")}>
            {c.vencidas === 0 ? "al día" : `${c.vencidas} ${c.vencidas === 1 ? "vencida" : "vencidas"}`}
          </span>
        </button>
      ))}
      {plegable && (
        <button type="button" className="plegado" aria-expanded={abierta} onClick={() => setExpandida(!abierta)}>
          {abierta ? <>Plegar <ChevronUp aria-hidden="true" focusable="false" /></> : <><Cuadro tipo="ok" />{alDia.length} al día <ChevronDown aria-hidden="true" focusable="false" /></>}
        </button>
      )}
    </div>
  );
}

export type DestinoDock = {
  href: string; etiqueta: string; actual?: boolean;
  /** Icono y color de la función (los mismos que en el menú). */
  icono: LucideIcon; tono: Tono;
  /** Nombre completo para lectores si el rótulo visible se acorta («Lote» → «Generar en lote»). Debe contener el rótulo. */
  etiquetaAccesible?: string;
  /** Insignia: número + unidad para lectores («3» + «vencidas»). `alerta` = roja. */
  insignia?: { n: number; unidad: string; alerta?: boolean };
};

/**
 * Dock móvil (≤ 860 px): 4 destinos + «Menú», con la ficha de color de cada función,
 * 68 px + safe-area, sticky abajo.
 * Dashboard: Inicio · Generar · Bitácora · Asistente · Menú.
 * /empresa: Portafolio · Generar en lote · Propiedades · Suscripción · Menú.
 */
export function Dock({ destinos, alAbrirIndice, indiceAbierto }: {
  destinos: DestinoDock[]; alAbrirIndice: () => void; indiceAbierto?: boolean;
}) {
  return (
    <nav className="k-dock" aria-label="Accesos rápidos">
      {destinos.slice(0, 4).map((d) => (
        <Link key={d.href} href={d.href} data-h={d.tono} aria-current={d.actual ? "page" : undefined} aria-label={d.etiquetaAccesible}>
          <Loseta icono={d.icono} tono={d.tono} />
          <span>{d.etiqueta}</span>
          {d.insignia && d.insignia.n > 0 && (
            <i className={unir("b", d.insignia.alerta && "alerta")}>
              {d.insignia.n}<span className="k-sr"> · {d.insignia.unidad}</span>
            </i>
          )}
        </Link>
      ))}
      <button type="button" data-h="violet" onClick={alAbrirIndice} aria-expanded={indiceAbierto ?? false} aria-haspopup="dialog">
        <Loseta icono={Menu} tono="violet" />
        <span>Menú</span>
      </button>
    </nav>
  );
}
