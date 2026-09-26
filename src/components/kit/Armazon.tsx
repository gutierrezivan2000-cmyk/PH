"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { BotonIcono } from "./Boton";
import { Cuadro } from "./Estado";
import { Chevron, Cruz, Flecha, Lupa } from "./Iconos";
import { nombreCorto, unir } from "./util";

/* ════════════════════════════════════════════════════════════════════
   Piezas del armazón (SPEC §f.1). Son presentacionales: rutas, conteos y
   estado (abierto/cerrado, copropiedad elegida) los pone el layout.
   Estructura:
     <Armazon indice={<Indice …/>}>          ← data-shell="app" + rejilla índice | principal
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

/** Logotipo: cuadrado --brand con «S» + «SOPH.IA» a 125 %. El violeta SOLO aquí. */
export function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <>
      <span className="k-marca-s" aria-hidden="true" style={compacta ? { width: 30, height: 30, fontSize: 19 } : undefined}>S</span>
      <span className="k-marca-w" style={compacta ? { fontSize: 16 } : undefined}>SOPH<span>.</span>IA</span>
    </>
  );
}

/**
 * Índice lateral (280 px; 248 en ≤ 1180). En ≤ 860 px es un diálogo a pantalla
 * completa que se abre desde el dock: con `abierto`, role="dialog" aria-modal,
 * foco a la entrada activa, el contenido principal (`idPrincipal`) queda inert,
 * Escape o «Cerrar ×» cierran y el foco vuelve a quien lo abrió.
 */
export function Indice({ children, pie, abierto = false, alCerrar, idPrincipal = "k-principal", hrefInicio = "/dashboard" }: {
  children: ReactNode; pie?: ReactNode; abierto?: boolean; alCerrar?: () => void;
  idPrincipal?: string; hrefInicio?: string;
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
    <nav ref={nav} className="k-indice" aria-label="Índice" data-abierto={abierto || undefined}
      role={abierto ? "dialog" : undefined} aria-modal={abierto || undefined}>
      <div className="k-marca">
        <Link href={hrefInicio} style={{ display: "flex", alignItems: "center", gap: 12 }} aria-label="SOPH.IA · Inicio"><Marca /></Link>
        {alCerrar && (
          <button type="button" className="k-btn k-sec k-cerrar" onClick={alCerrar}>Cerrar <Cruz /></button>
        )}
      </div>
      <div className="k-indice-lista">{children}</div>
      {pie && <div className="k-indice-pie">{pie}</div>}
    </nav>
  );
}

/** Grupo del índice: «A Día a día», «B Finanzas»… */
export function GrupoIndice({ letra, titulo, children }: { letra: string; titulo: string; children: ReactNode }) {
  return (
    <div className="k-grupo-idx" role="group" aria-label={titulo}>
      <div className="k-grupo-h" aria-hidden="true"><b>{letra}</b> {titulo}</div>
      {children}
    </div>
  );
}

/**
 * Entrada del índice: número mono, nombre, línea de puntos y, donde iría el
 * número de página, un DATO VIVO con unidad:
 *   pend   = pendiente accionable («2 por generar», en negrita)
 *   alerta = vencidas («3 vencidas», caja naranja)
 *   tot    = total apagado («168 u.», «38 doc.», «2 activos»)
 * Sin dato real → nada (solo los puntos). `pronto` = pantalla pausada (cuadrito achurado + «pronto»).
 */
export function ItemIndice({ n, href, children, actual, dato, pronto, alNavegar }: {
  n: string; href: string; children: ReactNode; actual?: boolean;
  dato?: { texto: string; tipo: "pend" | "alerta" | "tot" };
  pronto?: boolean; alNavegar?: () => void;
}) {
  return (
    <Link href={href} className={unir("k-it", pronto && "pronto")} aria-current={actual ? "page" : undefined} onClick={alNavegar}>
      <span className="n" aria-hidden="true">{n}</span>
      <span className="l">{children}</span>
      <span className="dots" aria-hidden="true" />
      {pronto ? (
        <span className="c"><i aria-hidden="true" />pronto</span>
      ) : dato ? (
        <span className={unir("c", dato.tipo)}><span className="k-sr">· </span>{dato.texto}</span>
      ) : null}
    </Link>
  );
}

/** Pie del índice: usuario, selector de tema y «Cerrar sesión →». */
export function PieIndice({ nombre, correo, alSalir }: { nombre: string; correo?: string; alSalir: () => void }) {
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <>
      <div className="k-yo" title={correo ? `${nombre} · ${correo}` : nombre}>
        <div className="k-yo-a" aria-hidden="true">{iniciales}</div>
        <div style={{ minWidth: 0 }}><b>{nombre}</b>{correo && <span>{correo}</span>}</div>
      </div>
      <SelectorTema />
      <button type="button" className="k-salir" onClick={alSalir} aria-label="Cerrar sesión">
        <span>Cerrar sesión</span><Flecha />
      </button>
    </>
  );
}

/** Selector de tema segmentado Auto / Claro / Oscuro. Escribe la misma clave (`sophia-theme`) que el script del layout raíz. */
export function SelectorTema({ grande }: { grande?: boolean }) {
  const { theme, setTheme } = useTheme();
  const opciones: Array<[Theme, string]> = [["auto", "Auto"], ["light", "Claro"], ["dark", "Oscuro"]];
  return (
    <div className="k-tema" role="group" aria-label="Tema" style={grande ? { maxWidth: 420 } : undefined}>
      {opciones.map(([t, et]) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}
          style={grande ? { minHeight: 48, fontSize: 15 } : undefined}>{et}</button>
      ))}
    </div>
  );
}

/**
 * Cabecera de pantalla (sticky, 72 px): ruta «01» + título a la izquierda,
 * buscador en el centro (≤ 1180 → botón-icono de 44 px), acción primaria a la
 * derecha. En móvil muestra el logotipo y oculta la acción (va en la página).
 */
export function CabeceraApp({ nn, titulo, buscador, alBuscar, accion }: {
  nn: string; titulo: string;
  /** Un <Buscador atajo="/" …/> del kit. Sin buscador real, no pases nada. */
  buscador?: ReactNode;
  /** Qué hace el botón-icono de búsqueda en ≤ 1180 (abrir un campo a ancho completo). */
  alBuscar?: () => void;
  accion?: ReactNode;
}) {
  return (
    <header className="k-cab">
      <div className="k-cab-marca"><Marca compacta /></div>
      <div className="k-cab-ruta"><span className="num">{nn}</span><span className="tit">{titulo}</span></div>
      {buscador}
      {buscador && alBuscar && <BotonIcono etiqueta="Buscar" onClick={alBuscar}><Lupa /></BotonIcono>}
      {accion && <div className="acc">{accion}</div>}
    </header>
  );
}

export type CopropiedadCornisa = { id: string; nombre: string; vencidas: number };

/**
 * Cornisa (SPEC §f.1): «running head» + selector de ALCANCE por copropiedad.
 * «Ver · Todas · 3 copropiedades | ■ Los Pinos 2 vencidas | ■ Mirador 93 al día».
 * Orden: más vencidas primero. Nombre corto con el completo en title/aria-label.
 * Entre 861 y 1300 px las «al día» se pliegan en «N al día ▾» (se despliegan al pulsar).
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
  return (
    <div className="k-cornisa" role="group" aria-label="Alcance: copropiedades" data-expandida={abierta ? "true" : "false"}>
      <span className="k" aria-hidden="true">Ver</span>
      <button type="button" aria-pressed={valor === "todas" || !valor} onClick={() => alCambiar?.("todas")}>
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
      {alDia.length > 0 && (
        <button type="button" className="plegado" aria-expanded={abierta} onClick={() => setExpandida(true)}>
          <Cuadro tipo="ok" />{alDia.length} al día <Chevron dir="abajo" />
        </button>
      )}
    </div>
  );
}

export type DestinoDock = {
  href: string; etiqueta: string; actual?: boolean;
  /** Insignia: número + unidad para lectores («3» + «vencidas»). `alerta` = naranja. */
  insignia?: { n: number; unidad: string; alerta?: boolean };
};

/**
 * Dock móvil (≤ 860 px): 4 destinos + «≡ Índice», 60 px + safe-area, sticky abajo.
 * Dashboard: Inicio · Generar · Bitácora · Asistente · Índice.
 * /empresa: Portafolio · Generar en lote · Propiedades · Suscripción · Índice.
 */
export function Dock({ destinos, alAbrirIndice, indiceAbierto }: {
  destinos: DestinoDock[]; alAbrirIndice: () => void; indiceAbierto?: boolean;
}) {
  return (
    <nav className="k-dock" aria-label="Accesos rápidos">
      {destinos.slice(0, 4).map((d) => (
        <Link key={d.href} href={d.href} aria-current={d.actual ? "page" : undefined}>
          {d.etiqueta}
          {d.insignia && d.insignia.n > 0 && (
            <i className={unir("b", d.insignia.alerta && "alerta")}>
              {d.insignia.n}<span className="k-sr"> · {d.insignia.unidad}</span>
            </i>
          )}
        </Link>
      ))}
      <button type="button" onClick={alAbrirIndice} aria-expanded={indiceAbierto ?? false} aria-haspopup="dialog">
        <span className="bars" aria-hidden="true" />Índice
      </button>
    </nav>
  );
}
