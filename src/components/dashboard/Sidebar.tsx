"use client";

import { ChevronDown, ChevronsLeft, ChevronsRight, Hourglass, LogOut } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { COMING_SOON, puedeVerReuniones, type ComingSoonKey } from "@/lib/feature-flags";
import { GrupoIndice, Indice, ItemIndice, Loseta, MODULOS, type ClaveModulo } from "@/components/kit";
import { AGENTES_ACTIVOS, type DatosIndice } from "@/components/dashboard/datosIndice";
import { abrirSoporte, useSoporteAbierto, useSoporteDisponible } from "@/components/dashboard/soporte";

// Los datos vivos del menú viven en ./datosIndice (caché compartida con las pantallas).
export { useDatosIndice, type DatosIndice } from "@/components/dashboard/datosIndice";

/* ════════════════════════════════════════════════════════════════════
   MENÚ lateral del dashboard («Guía»).
   Cada función tiene su icono y su color (MODULOS, en el kit) y, a la
   derecha, un DATO VIVO cuando lo hay. Ese dato sale SOLO de APIs que ya
   existen; si no hay dato real, nada.
   ════════════════════════════════════════════════════════════════════ */

export type EntradaIndice = {
  name: string;
  href: string;
  /** Función a la que pertenece (su icono y su color). */
  modulo: ClaveModulo;
  /** Si la función está en COMING_SOON, el ítem se dibuja en gris con «Pronto». */
  comingSoon?: ComingSoonKey;
  /** Función en piloto: solo se muestra si la bandera correspondiente lo permite para esta sesión. */
  piloto?: "reuniones";
};
export type GrupoNav = { label: string; items: EntradaIndice[] };

const de = (modulo: ClaveModulo, name?: string, comingSoon?: ComingSoonKey, piloto?: EntradaIndice["piloto"]): EntradaIndice =>
  ({ name: name ?? MODULOS[modulo].nombre, href: MODULOS[modulo].href, modulo, comingSoon, piloto });

// Agrupado como piensa un administrador: 15 entradas planas eran difíciles de recorrer.
export const NAV_GROUPS: GrupoNav[] = [
  {
    label: "Día a día",
    items: [de("inicio"), de("reuniones", undefined, undefined, "reuniones"), de("generar"), de("bitacora"), de("asistente")],
  },
  { label: "Finanzas", items: [de("cartera", undefined, "cartera"), de("presupuesto", undefined, "presupuesto")] },
  {
    label: "Comunidad",
    items: [
      de("residentes"), de("pqrs", undefined, "pqrs"), de("comunicados", undefined, "comunicados"),
      de("asambleas", undefined, "asambleas"), de("certificados", undefined, "certificados"),
    ],
  },
  { label: "Administración", items: [de("propiedades"), de("historial"), de("suscripcion"), de("configuracion")] },
];

// «Portafolio» — solo para suscriptores Élite y beta testers. Es otra consola (/empresa).
export const PORTAFOLIO_ENTRY: EntradaIndice = de("portafolio");

/** Menú propio de /empresa. */
export const NAV_EMPRESA: EntradaIndice[] = [de("portafolio"), de("generarLote"), de("propiedadesEmpresa")];

const RAICES = new Set(["/dashboard", "/empresa"]);

/** Estado activo de una entrada: la ruta exacta o cualquier subruta (las raíces, solo exactas). */
export function esActiva(pathname: string | null, href: string): boolean {
  const p = pathname || "";
  return p === href || (!RAICES.has(href) && p.startsWith(href));
}

/** Entrada del menú que corresponde a una ruta (para el título de la cabecera y de «en obra»). */
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

/** Iniciales para el avatar del pie («Carlos Ramírez» → «CR»). */
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

  // Plegado solo en escritorio: en ≤ 860 px el menú es un diálogo a pantalla completa.
  const plegado = collapsed && !open;
  // «Ayuda y soporte» abre el panel del chat de soporte (antes, un botón flotante que tapaba contenido).
  const soporteDisponible = useSoporteDisponible();
  const soporteAbierto = useSoporteAbierto();
  const soporte = MODULOS.soporte;
  // Las funciones pausadas («Pronto») no ocupan el menú: van juntas, plegadas, bajo «Próximamente».
  // Si la pantalla actual es una de ellas, el grupo se abre solo.
  const [prontoAbierto, setProntoAbierto] = useState(false);
  const esPronto = (item: EntradaIndice) => Boolean(item.comingSoon && COMING_SOON[item.comingSoon]);
  // Las funciones en piloto (Reuniones) solo aparecen para quien la bandera deja verlas.
  // Aquí basta el rol de la sesión: los admins de ADMIN_EMAILS ya entran con rol admin.
  const verReuniones = puedeVerReuniones({ role: session?.user?.role, demo: process.env.NEXT_PUBLIC_DEMO_MODE === "true" });
  const enPiloto = (item: EntradaIndice) => item.piloto === "reuniones" && !verReuniones;
  const enProntoTodas = NAV_GROUPS.flatMap((g) => g.items).filter(esPronto);
  const prontoVisible = prontoAbierto || enProntoTodas.some((i) => esActiva(pathname, i.href));

  const entrada = (item: EntradaIndice) => {
    const m = MODULOS[item.modulo];
    const pronto = esPronto(item);
    const enlace = (
      <ItemIndice
        key={item.href}
        href={item.href}
        actual={esActiva(pathname, item.href)}
        pronto={pronto}
        dato={pronto ? undefined : datoDe(item.href, datos)}
        alNavegar={onClose}
        icono={m.icono}
        tono={m.tono}
        ayuda={plegado ? undefined : m.queHace}
      >
        {item.name}
      </ItemIndice>
    );
    // Plegado, el nombre no se ve: el title lo muestra al pasar el cursor.
    return plegado ? (
      <div key={item.href} title={pronto ? `${item.name} · próximamente` : `${item.name} · ${m.queHace}`}>
        {enlace}
      </div>
    ) : (
      enlace
    );
  };

  const pie = (
    <>
      <div className="k-yo-fila">
        {nombre && (
          <div className="k-yo" title={correo ? `${nombre} · ${correo}` : nombre}>
            <div className="k-yo-a" aria-hidden="true">{iniciales(nombre)}</div>
            <div style={{ minWidth: 0 }}>
              <b>{nombre}</b>
              {correo && <span>{correo}</span>}
            </div>
          </div>
        )}
        <button
          type="button"
          className="k-salir"
          onClick={() => signOut({ callbackUrl: "/" })}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut aria-hidden="true" focusable="false" />
          <span>Salir</span>
        </button>
      </div>
      <ThemeToggle ciclo={plegado} />
    </>
  );

  const botonPlegar = (
    <button
      type="button"
      className="k-plegar"
      onClick={onToggleCollapse}
      aria-expanded={!plegado}
      aria-label={plegado ? "Mostrar el menú completo" : "Ocultar el menú"}
      title={plegado ? "Mostrar el menú completo" : "Ocultar el menú"}
    >
      {plegado ? <ChevronsRight aria-hidden="true" focusable="false" /> : <ChevronsLeft aria-hidden="true" focusable="false" />}
    </button>
  );

  return (
    <div className="k-col-indice" data-largo="" data-plegado={plegado || undefined} data-elite={datos?.elite || undefined}>
      <Indice abierto={open} alCerrar={onClose} pie={pie} hrefInicio="/dashboard" accionMarca={plegado ? undefined : botonPlegar}>
        {plegado && <div className="k-idx-tit">{botonPlegar}</div>}
        {NAV_GROUPS.map((grupo) => {
          const visibles = grupo.items.filter((i) => !esPronto(i) && !enPiloto(i));
          return visibles.length === 0 ? null : (
            <GrupoIndice key={grupo.label} titulo={grupo.label}>
              {visibles.map(entrada)}
            </GrupoIndice>
          );
        })}
        {datos?.elite && (
          <GrupoIndice titulo="Élite">
            {entrada(PORTAFOLIO_ENTRY)}
          </GrupoIndice>
        )}
        {enProntoTodas.length > 0 && (
          <div className="k-grupo-idx k-pronto" role="group" aria-label="Próximamente">
            <button
              type="button"
              className="k-it"
              data-h="slate"
              aria-expanded={prontoVisible}
              aria-controls="k-pronto-lista"
              title={plegado ? "Próximamente" : "Funciones que llegarán pronto"}
              onClick={() => setProntoAbierto((v) => !v)}
            >
              <Loseta icono={Hourglass} tono="slate" />
              <span className="l">Próximamente</span>
              <span className="c tot">{enProntoTodas.length}</span>
              <ChevronDown className="chev" aria-hidden="true" focusable="false" />
            </button>
            {prontoVisible && <div id="k-pronto-lista" className="k-pronto-lista">{enProntoTodas.map(entrada)}</div>}
          </div>
        )}
        {soporteDisponible && (
          <div className="k-grupo-idx k-idx-ayuda">
            <button
              type="button"
              className="k-it"
              data-h={soporte.tono}
              onClick={() => {
                onClose();
                abrirSoporte();
              }}
              aria-expanded={soporteAbierto}
              aria-controls="soporte-sophia"
              title={plegado ? "Ayuda y soporte" : soporte.queHace}
            >
              <Loseta icono={soporte.icono} tono={soporte.tono} />
              <span className="l">Ayuda y soporte</span>
            </button>
          </div>
        )}
      </Indice>
    </div>
  );
}
