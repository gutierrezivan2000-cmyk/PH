"use client";

import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMING_SOON, type ComingSoonKey } from "@/lib/feature-flags";
import { Chevron, Flecha, GrupoIndice, Indice, ItemIndice } from "@/components/kit";
import { AGENTES_ACTIVOS, type DatosIndice } from "@/components/dashboard/datosIndice";
import { abrirSoporte, useSoporteAbierto, useSoporteDisponible } from "@/components/dashboard/soporte";

// Los datos vivos del índice viven en ./datosIndice (caché compartida con las pantallas).
export { useDatosIndice, type DatosIndice } from "@/components/dashboard/datosIndice";

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
   pero el índice completo pide ~955 px (medido: marca 72 + lista 723 + pie 160,
   con la entrada «Soporte») y el banner de demo (30 px) y el grupo Élite (~64 px)
   le restan sitio. Primero se pliega solo el pie a una línea (avatar + tema +
   flecha, 100 px menos); si aún no cabe (~855 px), también las filas. */
const pieCompacto = (c: string) => `
  ${c} .k-indice-pie { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 14px 10px 22px; }
  ${c} .k-yo > div:not(.k-yo-a) { display: none; }
  ${c} .k-tema button { min-height: 36px; }
  ${c} .k-salir { width: 32px; justify-content: center; }
  ${c} .k-salir span { display: none; }`;
const filasCompactas = (c: string) => `
  ${c} .k-indice-lista { padding-top: 2px; padding-bottom: 6px; }
  ${c} .k-grupo-idx { margin-top: 4px; }
  ${c} .k-grupo-h { padding: 5px 10px 2px; }
  ${c} .k-it { min-height: 28px; }
  ${c} .k-idx-ayuda { margin-top: 6px; padding-top: 2px; }
  ${c} .k-idx-tit { padding-top: 4px; }`;
// Solo el índice largo del dashboard (el de /empresa tiene 4 entradas y siempre cabe).
const N = ".k-col-indice[data-largo]:not([data-plegado])";
const E = ".k-col-indice[data-largo][data-elite]:not([data-plegado])";
const DEMO = ":root:has([data-demo-banner]) ";
const segunAlto = (max: number, css: string) => `@media (min-width: 861px) and (max-height: ${max}px) { ${css} }`;
const CSS_COMPACTO = [
  segunAlto(954, pieCompacto(N)),
  segunAlto(984, pieCompacto(DEMO + N)),
  segunAlto(1018, pieCompacto(E)),
  segunAlto(1048, pieCompacto(DEMO + E)),
  segunAlto(854, filasCompactas(N)),
  segunAlto(884, filasCompactas(DEMO + N)),
  segunAlto(918, filasCompactas(E)),
  segunAlto(948, filasCompactas(DEMO + E)),
  // ≤ 820 px el kit ya compacta filas y pie; aquí solo el bloque «Soporte».
  segunAlto(820, filasCompactas(".k-col-indice[data-largo]:not([data-plegado])")),
].join("\n");

const CSS_INDICE = `
.k-idx-tit { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; padding: 8px 0 0 10px;
  font: 800 12px/1 var(--f-sans); font-stretch: 125%; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); }
.k-plegar { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 28px; margin: -2px 0; padding: 0 8px;
  font: 600 13px/1 var(--f-sans); font-stretch: 100%; letter-spacing: 0; text-transform: none; color: var(--ink-2); background: transparent; cursor: pointer; }
.k-plegar::after { content: ""; position: absolute; inset: -6px 0; }
.k-plegar:hover { background: var(--hl); color: var(--ink); }
.k-plegar svg { width: 13px; height: 13px; }
.k-yo .plan { color: var(--ink-2); }
/* «Soporte» (abre el chat de soporte) cierra la lista, separado de las entradas numeradas. */
.k-idx-ayuda { margin-top: 12px; padding-top: 6px; border-top: 1px solid var(--line); }
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
  .k-col-indice[data-plegado] .k-salir { width: 44px; justify-content: center; }
  .k-col-indice[data-plegado] .k-salir span { display: none; }
}
${CSS_COMPACTO}
@media (max-width: 860px) {
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
  // «Soporte» abre el panel del chat de soporte (antes, un botón flotante que tapaba contenido).
  const soporteDisponible = useSoporteDisponible();
  const soporteAbierto = useSoporteAbierto();

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
      <ThemeToggle ciclo={plegado} />
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
        {soporteDisponible && (
          <div className="k-grupo-idx k-idx-ayuda">
            <button
              type="button"
              className="k-it"
              onClick={() => {
                onClose();
                abrirSoporte();
              }}
              aria-expanded={soporteAbierto}
              aria-controls="soporte-sophia"
              title={plegado ? "Soporte" : undefined}
            >
              <span className="n" aria-hidden="true">
                —
              </span>
              <span className="l">Soporte</span>
              <span className="dots" aria-hidden="true" />
            </button>
          </div>
        )}
      </Indice>
    </div>
  );
}
