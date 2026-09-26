"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMING_SOON, type ComingSoonKey } from "@/lib/feature-flags";
import { AGENT_IDS, isComingSoonAgent } from "@/lib/agents";
import { Chevron, Flecha, GrupoIndice, Indice, ItemIndice } from "@/components/kit";

/* ════════════════════════════════════════════════════════════════════
   ÍNDICE lateral del dashboard (SPEC «Índice» §f.1).
   La navegación es la tabla de contenido de un libro: 01–15 con líneas
   guía y, donde iría el número de página, un DATO VIVO. Ese dato sale
   SOLO de APIs que ya existen (IMPL §8); si no hay dato real, nada.
   ════════════════════════════════════════════════════════════════════ */

export type EntradaIndice = {
  name: string;
  href: string;
  n: string;
  /** Si la función está en COMING_SOON, el ítem se dibuja achurado con «pronto». */
  comingSoon?: ComingSoonKey;
};
export type GrupoNav = { letra: string; label: string; items: EntradaIndice[] };

// Grouped navigation: 15 flat entries were hard to scan. Sections mirror how
// an administrator actually thinks about their work.
export const NAV_GROUPS: GrupoNav[] = [
  {
    letra: "A",
    label: "Día a día",
    items: [
      { name: "Inicio", href: "/dashboard", n: "01" },
      { name: "Generar", href: "/dashboard/generar", n: "02" },
      { name: "Bitácora", href: "/dashboard/calendario", n: "03" },
      { name: "Asistente IA", href: "/dashboard/asistente", n: "04" },
    ],
  },
  {
    letra: "B",
    label: "Finanzas",
    items: [
      { name: "Cartera", href: "/dashboard/cartera", n: "05", comingSoon: "cartera" },
      { name: "Presupuesto", href: "/dashboard/presupuesto", n: "06", comingSoon: "presupuesto" },
    ],
  },
  {
    letra: "C",
    label: "Comunidad",
    items: [
      { name: "Residentes", href: "/dashboard/residentes", n: "07" },
      { name: "PQRS", href: "/dashboard/pqrs", n: "08", comingSoon: "pqrs" },
      { name: "Comunicados", href: "/dashboard/comunicados", n: "09", comingSoon: "comunicados" },
      { name: "Asambleas", href: "/dashboard/asambleas", n: "10", comingSoon: "asambleas" },
      { name: "Certificados", href: "/dashboard/certificados", n: "11", comingSoon: "certificados" },
    ],
  },
  {
    letra: "D",
    label: "Administración",
    items: [
      { name: "Propiedades", href: "/dashboard/propiedades", n: "12" },
      { name: "Historial", href: "/dashboard/historial", n: "13" },
      { name: "Suscripción", href: "/dashboard/suscripcion", n: "14" },
      { name: "Configuración", href: "/dashboard/configuracion", n: "15" },
    ],
  },
];

// Enterprise "Portafolio" — only for Elite subscribers and beta testers.
// Va fuera de la numeración 01–15: es otra consola (/empresa), no una entrada del libro.
export const PORTAFOLIO_ENTRY: EntradaIndice = { name: "Portafolio", href: "/empresa", n: "—" };

/** Índice propio de /empresa (SPEC §g /empresa): A Portafolio · 01–03. */
export const NAV_EMPRESA: EntradaIndice[] = [
  { name: "Portafolio", href: "/empresa", n: "01" },
  { name: "Generar en lote", href: "/empresa/generar", n: "02" },
  { name: "Propiedades", href: "/empresa/propiedades", n: "03" },
];

const RAICES = new Set(["/dashboard", "/empresa"]);

/** Estado activo de una entrada: la ruta exacta o cualquier subruta (las raíces, solo exactas). */
export function esActiva(pathname: string | null, href: string): boolean {
  const p = pathname || "";
  return p === href || (!RAICES.has(href) && p.startsWith(href));
}

/** Entrada del índice que corresponde a una ruta (para el número NN de la cabecera y de «en obra»). */
export function entradaIndice(pathname: string | null): EntradaIndice | null {
  const todas = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_EMPRESA];
  return todas.find((e) => esActiva(pathname, e.href)) ?? null;
}

/** Agentes lanzados (no «Próximamente»), de la configuración real de lib/agents. */
const AGENTES_ACTIVOS = AGENT_IDS.filter((id) => !isComingSoonAgent(id)).length;

/* ── datos vivos del índice ─────────────────────────────────────────── */

export type DatosIndice = {
  /** Bitácora: obligaciones pendientes con fecha ya pasada (GET /api/calendar, mismo criterio que Inicio). */
  vencidas: number | null;
  /** Generar: copropiedades cuyo «Informe de gestión» del mes sigue pendiente (GET /api/calendar, categoría «informe»). */
  porGenerar: number | null;
  /** Historial: generaciones completadas (GET /api/generations, que devuelve como máximo 100 → `tope`). */
  documentos: { n: number; tope: boolean } | null;
  /** Acceso a /empresa: plan Élite o beta (GET /api/usage). */
  elite: boolean;
};

const SIN_DATOS: DatosIndice = { vencidas: null, porGenerar: null, documentos: null, elite: false };

type ItemCalendario = { status?: string; dueDate?: string; category?: string };

/** Días desde hoy hasta una fecha «AAAA-MM-DD» en hora local (negativo = ya pasó). */
function diasHasta(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - base.getTime()) / 86400000);
}

/**
 * Carga los datos vivos del índice y del dock desde rutas GET existentes.
 * Se pide al montar el armazón y, como mucho, cada 30 s al cambiar de pantalla
 * (así el conteo se refresca tras marcar una obligación o generar un informe).
 * Si una ruta falla, su dato queda en null y el índice no muestra nada.
 */
export function useDatosIndice(pathname: string | null): DatosIndice {
  const [datos, setDatos] = useState<DatosIndice>(SIN_DATOS);
  const ultima = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (Date.now() - ultima.current < 30_000) return;
    ultima.current = Date.now();
    const json = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([json("/api/calendar"), json("/api/generations"), json("/api/usage")]).then(([cal, gens, uso]) => {
      if (!montado.current) return;
      const items: ItemCalendario[] | null = Array.isArray(cal?.items) ? cal.items : null;
      const pendientes = items?.filter((it) => it.status === "pending" && typeof it.dueDate === "string") ?? null;
      setDatos({
        vencidas: pendientes ? pendientes.filter((it) => diasHasta(it.dueDate as string) < 0).length : null,
        porGenerar: pendientes ? pendientes.filter((it) => it.category === "informe").length : null,
        documentos: Array.isArray(gens)
          ? { n: gens.filter((g: { status?: string }) => g.status === "completed").length, tope: gens.length >= 100 }
          : null,
        elite: Boolean(uso && (uso.planName === "elite" || uso.planStatus === "beta")),
      });
    });
  }, [pathname]);

  return datos;
}

/** Texto del dato vivo de cada entrada (con unidad), o nada si no hay dato real. */
function datoDe(href: string, datos?: DatosIndice): { texto: string; tipo: "pend" | "alerta" | "tot" } | undefined {
  if (href === "/dashboard/asistente" && AGENTES_ACTIVOS > 0) {
    return { texto: `${AGENTES_ACTIVOS} ${AGENTES_ACTIVOS === 1 ? "activo" : "activos"}`, tipo: "tot" };
  }
  if (!datos) return undefined;
  if (href === "/dashboard/generar" && datos.porGenerar) {
    return { texto: `${datos.porGenerar} por generar`, tipo: "pend" };
  }
  if (href === "/dashboard/calendario" && datos.vencidas) {
    return { texto: `${datos.vencidas} ${datos.vencidas === 1 ? "vencida" : "vencidas"}`, tipo: "alerta" };
  }
  if (href === "/dashboard/historial" && datos.documentos?.n) {
    return { texto: `${datos.documentos.n}${datos.documentos.tope ? "+" : ""} doc.`, tipo: "tot" };
  }
  return undefined;
}

/* ── estilos locales del armazón (no existen en el kit; ver pendientes) ── */
/* Índice compacto por alto REAL. El kit compacta todo a ≤ 820 px de ventana,
   pero el índice completo pide ~905 px y el banner de demo (30 px) y el grupo
   Élite (~64 px) le restan sitio. Primero se pliega solo el pie a una línea
   (avatar + tema + flecha, ~100 px menos); si aún no cabe, también las filas. */
const pieCompacto = (c: string) => `
  ${c} .k-indice-pie { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 14px 10px 22px; }
  ${c} .k-yo > div:not(.k-yo-a) { display: none; }
  ${c} .k-tema button { min-height: 32px; }
  ${c} .k-salir { width: 32px; justify-content: center; }
  ${c} .k-salir span { display: none; }`;
const filasCompactas = (c: string) => `
  ${c} .k-indice-lista { padding-top: 2px; }
  ${c} .k-grupo-idx { margin-top: 4px; }
  ${c} .k-grupo-h { padding: 5px 10px 2px; }
  ${c} .k-it { min-height: 28px; }`;
// Solo el índice largo del dashboard (el de /empresa tiene 4 entradas y siempre cabe).
const N = ".k-col-indice[data-largo]:not([data-plegado])";
const E = ".k-col-indice[data-largo][data-elite]:not([data-plegado])";
const DEMO = ":root:has([data-demo-banner]) ";
const segunAlto = (max: number, css: string) => `@media (min-width: 861px) and (max-height: ${max}px) { ${css} }`;
const CSS_COMPACTO = [
  segunAlto(903, pieCompacto(N)),
  segunAlto(933, pieCompacto(DEMO + N)),
  segunAlto(967, pieCompacto(E)),
  segunAlto(997, pieCompacto(DEMO + E)),
  segunAlto(831, filasCompactas(DEMO + N)),
  segunAlto(865, filasCompactas(E)),
  segunAlto(895, filasCompactas(DEMO + E)),
].join("\n");

const CSS_INDICE = `
.k-idx-tit { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; padding: 8px 0 0 10px;
  font: 800 12px/1 var(--f-sans); font-stretch: 125%; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); }
.k-plegar { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 28px; margin: -2px 0; padding: 0 8px;
  font: 600 13px/1 var(--f-sans); font-stretch: 100%; letter-spacing: 0; text-transform: none; color: var(--ink-2); background: transparent; cursor: pointer; }
.k-plegar::after { content: ""; position: absolute; inset: -6px 0; }
.k-plegar:hover { background: var(--hl); color: var(--ink); }
.k-plegar svg { width: 13px; height: 13px; }
/* Sobre la fila activa (negativo) la caja naranja conserva su tinta: --on-accent en claro daría 3,2:1. */
.k-it[aria-current="page"] .c.alerta { color: var(--on-danger); }
/* Entrada «pronto» activa: sobre el negativo, la tinta apagada es --on-accent-2 (8,5:1), no --ink-3. */
.k-it.pronto[aria-current="page"] .l { color: var(--on-accent); }
.k-it.pronto[aria-current="page"] .c { color: var(--on-accent-2); }
.k-it.pronto[aria-current="page"] .c i { background: none; box-shadow: inset 0 0 0 1.5px var(--on-accent-2); }
.k-yo .plan { color: var(--ink-2); }
@media (min-width: 861px) {
  /* El índice arranca bajo el banner de demo: su alto no puede ser la ventana entera. */
  .k-col-indice > .k-indice { height: calc(100dvh - var(--demo-banner-h, 0px)); }
  /* Índice plegado: solo los números (el nombre queda para lectores de pantalla y en el title). */
  .k-app:has(> .k-col-indice[data-plegado]) { --nav-w: 76px; }
  .k-col-indice[data-plegado] .k-marca { padding: 0; justify-content: center; }
  .k-col-indice[data-plegado] .k-marca-w { display: none; }
  .k-col-indice[data-plegado] .k-idx-tit { justify-content: center; padding: 4px 0 0; }
  .k-col-indice[data-plegado] .k-idx-tit > span { display: none; }
  .k-col-indice[data-plegado] .k-grupo-idx { margin-top: 6px; }
  .k-col-indice[data-plegado] .k-grupo-h { justify-content: center; padding: 4px 0 2px; font-size: 0; }
  .k-col-indice[data-plegado] .k-grupo-h b { font-size: 13px; }
  .k-col-indice[data-plegado] .k-it { justify-content: center; gap: 5px; padding: 0; min-height: 30px; }
  .k-col-indice[data-plegado] .k-it .n { width: auto; font-size: 13px; }
  .k-col-indice[data-plegado] .k-it .dots { display: none; }
  .k-col-indice[data-plegado] .k-it .l,
  .k-col-indice[data-plegado] .k-it .c.tot { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .k-col-indice[data-plegado] .k-it .c { font-size: 0; line-height: 0; padding: 0; }
  .k-col-indice[data-plegado] .k-it .c.alerta { width: 8px; height: 8px; }
  .k-col-indice[data-plegado] .k-it .c.pend { width: 8px; height: 8px; box-shadow: inset 0 0 0 2px currentColor; }
  .k-col-indice[data-plegado] .k-it.pronto .c i { width: 8px; height: 8px; }
  .k-col-indice[data-plegado] .k-indice-pie { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 8px; padding: 10px 8px 10px; }
  .k-col-indice[data-plegado] .k-yo > div:not(.k-yo-a) { display: none; }
  .k-col-indice[data-plegado] .k-tema { grid-template-columns: minmax(0, 1fr); width: 100%; }
  .k-col-indice[data-plegado] .k-tema button { min-height: 28px; font-size: 12px; }
  .k-col-indice[data-plegado] .k-tema button + button { border-left: 0; border-top: 1.5px solid var(--rule); }
  .k-col-indice[data-plegado] .k-salir { width: 44px; justify-content: center; }
  .k-col-indice[data-plegado] .k-salir span { display: none; }
}
${CSS_COMPACTO}
@media (max-width: 860px) {
  /* El índice es un diálogo fijo: su columna no debe ocupar una fila de la rejilla
     (en páginas cortas la fila vacía se estiraba y empujaba la cabecera hacia abajo). */
  .k-col-indice { display: contents; }
  .k-plegar { display: none; }
  .k-idx-tit { padding-top: 14px; }
}
`;

/** Estilos locales del índice (compartidos con el índice de /empresa). */
export function EstilosIndice() {
  return (
    <style href="k-indice-local" precedence="default">
      {CSS_INDICE}
    </style>
  );
}

/** Iniciales para el avatar cuadrado del pie («Carlos Ramírez» → «CR»). */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Datos vivos (useDatosIndice). Sin ellos el índice solo muestra lo estático. */
  datos?: DatosIndice;
}

export function Sidebar({ open, onClose, collapsed, onToggleCollapse, datos }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const nombre = session?.user?.name || session?.user?.email?.split("@")[0] || "";
  const correo = session?.user?.email || undefined;

  // Plegado solo en escritorio: en ≤ 860 px el índice es un diálogo a pantalla completa.
  const plegado = collapsed && !open;

  const entrada = (item: EntradaIndice) => {
    const pronto = Boolean(item.comingSoon && COMING_SOON[item.comingSoon]);
    const enlace = (
      <ItemIndice
        key={item.href}
        n={item.n}
        href={item.href}
        actual={esActiva(pathname, item.href)}
        pronto={pronto}
        dato={pronto ? undefined : datoDe(item.href, datos)}
        alNavegar={onClose}
      >
        {item.name}
      </ItemIndice>
    );
    // Plegado, el nombre no se ve: el title lo muestra al pasar el cursor.
    return plegado ? (
      <div key={item.href} title={pronto ? `${item.name} · próximamente` : item.name}>
        {enlace}
      </div>
    ) : (
      enlace
    );
  };

  const pie = (
    <>
      {nombre && (
        <div className="k-yo" title={correo ? `${nombre} · ${correo}` : nombre}>
          <div className="k-yo-a" aria-hidden="true">{iniciales(nombre)}</div>
          <div style={{ minWidth: 0 }}>
            <b>{nombre}</b>
            {correo && <span>{correo}</span>}
          </div>
        </div>
      )}
      <ThemeToggle />
      <button
        type="button"
        className="k-salir"
        onClick={() => signOut({ callbackUrl: "/" })}
        aria-label="Cerrar sesión"
        title={plegado ? "Cerrar sesión" : undefined}
      >
        <span>Cerrar sesión</span>
        <Flecha />
      </button>
    </>
  );

  return (
    <div className="k-col-indice" data-largo="" data-plegado={plegado || undefined} data-elite={datos?.elite || undefined}>
      <EstilosIndice />
      <Indice abierto={open} alCerrar={onClose} pie={pie} hrefInicio="/dashboard">
        <div className="k-idx-tit">
          <span aria-hidden="true">Índice</span>
          <button
            type="button"
            className="k-plegar"
            onClick={onToggleCollapse}
            aria-expanded={!plegado}
            aria-label={plegado ? "Desplegar el índice" : "Plegar el índice"}
            title={plegado ? "Desplegar el índice" : "Plegar el índice"}
          >
            {!plegado && <span aria-hidden="true">Plegar</span>}
            <Chevron dir={plegado ? "der" : "izq"} />
          </button>
        </div>
        {NAV_GROUPS.map((grupo) => (
          <GrupoIndice key={grupo.letra} letra={grupo.letra} titulo={grupo.label}>
            {grupo.items.map(entrada)}
          </GrupoIndice>
        ))}
        {datos?.elite && (
          <GrupoIndice letra="E" titulo="Élite">
            {entrada(PORTAFOLIO_ENTRY)}
          </GrupoIndice>
        )}
      </Indice>
    </div>
  );
}
