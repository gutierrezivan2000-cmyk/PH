"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition, useRef, type ReactNode } from "react";
import {
  AccionesFila,
  BotonFila,
  Buscador,
  Campo,
  Categoria,
  Estado,
  Segmentos,
  Selector,
  Tabla,
  type TipoEstado,
} from "@/components/kit";

interface Props {
  defaultQ: string;
  defaultGroup: string;
  defaultReporte: string;
  defaultSort: string;
  groups: string[];
}

export function PropertyFilters({ defaultQ, defaultGroup, defaultReporte, defaultSort, groups }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (q: string, group: string, reporte: string, sort: string) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (group !== "all") params.set("group", group);
      if (reporte !== "all") params.set("reporte", reporte);
      if (sort !== "recent") params.set("sort", sort);
      const url = `${pathname}${params.toString() ? `?${params}` : ""}`;
      startTransition(() => router.push(url));
    },
    [router, pathname]
  );

  const handleQ = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      push(value, defaultGroup, defaultReporte, defaultSort);
    }, 400);
  };

  return (
    <div className="emp-filtros">
      <style href="k-empresa-filtros" precedence="default">{CSS_FILTROS}</style>
      <div className="emp-filtros-a">
        <Segmentos
          etiquetaAccesible="Filtrar por informe reciente"
          valor={defaultReporte}
          alCambiar={(id) => push(defaultQ, defaultGroup, id, defaultSort)}
          items={[
            { id: "all", etiqueta: "Todas" },
            { id: "con", etiqueta: "Con informe en 30 días" },
            { id: "sin", etiqueta: "Sin informe en 30 días" },
          ]}
        />
        <Buscador
          etiquetaAccesible="Buscar por nombre o ciudad"
          placeholder="Buscar por nombre o ciudad…"
          defaultValue={defaultQ}
          onChange={(e) => handleQ(e.target.value)}
        />
      </div>

      <div className="emp-filtros-b">
        {groups.length > 0 && (
          <Campo id="emp-grupo" etiqueta="Grupo">
            <Selector
              id="emp-grupo"
              defaultValue={defaultGroup}
              onChange={(e) => push(defaultQ, e.target.value, defaultReporte, defaultSort)}
            >
              <option value="all">Todos los grupos</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Selector>
          </Campo>
        )}

        <Campo id="emp-orden" etiqueta="Ordenar por">
          <Selector
            id="emp-orden"
            defaultValue={defaultSort}
            onChange={(e) => push(defaultQ, defaultGroup, defaultReporte, e.target.value)}
          >
            <option value="recent">Más recientes</option>
            <option value="name">Nombre (A–Z)</option>
            <option value="units">Más unidades</option>
          </Selector>
        </Campo>

        <span className="emp-cargando k-meta" role="status">
          {isPending ? "Cargando…" : ""}
        </span>
      </div>
    </div>
  );
}

const CSS_FILTROS = `
.emp-filtros { margin-bottom: 22px; }
.emp-filtros-a { display: flex; align-items: flex-end; gap: 12px 24px; flex-wrap: wrap; }
.emp-filtros-a > .k-seg { flex: none; }
.emp-filtros-a > .k-campo { flex: 1 1 280px; }
.emp-filtros-b { display: flex; align-items: flex-end; gap: 0 16px; flex-wrap: wrap; margin-top: 18px; }
.emp-filtros-b > .k-fld { width: 240px; max-width: 100%; margin-bottom: 0; }
.emp-filtros-b > .emp-cargando { align-self: center; margin-left: auto; min-height: 1.3em; }
@media (max-width: 860px) {
  .emp-filtros-a > .k-seg, .emp-filtros-a > .k-campo { flex: 1 1 100%; }
  .emp-filtros-b { gap: 12px; }
  .emp-filtros-b > .k-fld { flex: 1 1 140px; width: auto; }
}
`;

/* ════════════════════════════════════════════════════════════════════
   Tablas del portafolio. Viven aquí porque <Tabla> del kit es de cliente
   (sus columnas son funciones) y las páginas de /empresa son de servidor:
   la página pasa filas planas y estas envolturas definen las columnas.
   ════════════════════════════════════════════════════════════════════ */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «29 ago» (o «29 ago 2025» si no es de este año). */
export function fechaCorta(valor: Date | string, conAnio?: boolean) {
  const d = new Date(valor);
  const anio = conAnio ?? d.getFullYear() !== new Date().getFullYear();
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}${anio ? ` ${d.getFullYear()}` : ""}`;
}

/** «Febrero 2026». */
export function periodo(month: number, year: number) {
  const m = MESES[(month - 1) % 12] ?? "";
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${year}`;
}

/** Estado de una generación: forma + color + palabra (textos de siempre). */
export function estadoGeneracion(status: string): { tipo: TipoEstado; palabra: string } {
  if (status === "completed") return { tipo: "ok", palabra: "Listo" };
  if (status === "processing" || status === "pending") return { tipo: "enCurso", palabra: "En proceso" };
  if (status === "failed") return { tipo: "vencido", palabra: "Error" };
  return { tipo: "pendiente", palabra: status };
}

export type FilaPropiedad = {
  id: string;
  name: string;
  city: string | null;
  groupLabel: string | null;
  units: number | null;
  lastGenAt: Date | string | null;
  documentos: number;
  generaciones: number;
};

/** Tabla-índice de copropiedades de /empresa/propiedades (una fila por copropiedad, 76 px). */
export function TablaPropiedades({ filas, vacio }: { filas: FilaPropiedad[]; vacio?: ReactNode }) {
  return (
    <>
    <EstilosTablas />
    <Tabla<FilaPropiedad>
      etiquetaAccesible="Copropiedades del portafolio"
      filas={filas}
      claveFila={(p) => p.id}
      alta
      vacio={vacio}
      columnas={[
        {
          id: "unidades",
          titulo: "Unidades",
          ancho: "minmax(0, 0.9fr)",
          principal: true,
          celda: (p) =>
            p.units ? (
              <span className="emp-cifra">
                {p.units.toLocaleString("es-CO")}
                <small> u.</small>
              </span>
            ) : (
              <span className="k-apoyo">Sin dato</span>
            ),
        },
        {
          id: "propiedad",
          titulo: "Propiedad",
          ancho: "minmax(0, 3fr)",
          celda: (p) => (
            <span className="emp-nom">
              <b>{p.name}</b>
              <span>{p.city || "Sin ciudad"}</span>
            </span>
          ),
        },
        {
          id: "grupo",
          titulo: "Grupo",
          ancho: "minmax(0, 1.3fr)",
          celda: (p) => (p.groupLabel ? <Categoria>{p.groupLabel}</Categoria> : <span className="k-apoyo">Sin grupo</span>),
        },
        {
          id: "informe",
          titulo: "Último informe",
          ancho: "minmax(0, 1.5fr)",
          celda: (p) =>
            p.lastGenAt ? (
              <span className="k-fecha">{fechaCorta(p.lastGenAt, true)}</span>
            ) : (
              <Estado tipo="falta" tamLetra={14}>Nunca</Estado>
            ),
        },
        {
          id: "docs",
          titulo: "Documentos",
          ancho: "minmax(0, 1fr)",
          alinear: "fin",
          claseCelda: "k-td-cifra emp-num",
          celda: (p) => (
            <>
              {p.documentos}
              <span className="emp-lbl"> documentos</span>
            </>
          ),
        },
        {
          id: "gens",
          titulo: "Generaciones",
          ancho: "minmax(0, 1fr)",
          alinear: "fin",
          claseCelda: "k-td-cifra emp-num",
          celda: (p) => (
            <>
              {p.generaciones}
              <span className="emp-lbl"> generaciones</span>
            </>
          ),
        },
        {
          id: "acc",
          titulo: "Acciones",
          tituloOculto: true,
          alinear: "fin",
          ancho: "auto",
          claseCelda: "k-td-acc",
          celda: (p) => (
            <AccionesFila>
              <BotonFila href={`/empresa/propiedades/${p.id}`} aria-label={`Abrir ${p.name}`}>
                Abrir
              </BotonFila>
            </AccionesFila>
          ),
        },
      ]}
    />
    </>
  );
}

export type FilaGeneracion = {
  id: string;
  month: number;
  year: number;
  status: string;
  createdAt: Date | string;
  propertyName?: string;
};

/**
 * Generaciones (actividad reciente del portafolio o historial de una copropiedad):
 * fecha · [copropiedad] · periodo · estado · [Ver].
 */
export function TablaGeneraciones({
  filas, etiquetaAccesible, conPropiedad, conEnlace, vacio,
}: {
  filas: FilaGeneracion[];
  etiquetaAccesible: string;
  conPropiedad?: boolean;
  conEnlace?: boolean;
  vacio?: ReactNode;
}) {
  return (
    <>
    <EstilosTablas />
    <Tabla<FilaGeneracion>
      etiquetaAccesible={etiquetaAccesible}
      filas={filas}
      claveFila={(g) => g.id}
      vacio={vacio}
      columnas={[
        {
          id: "fecha",
          titulo: "Fecha",
          ancho: "minmax(0, 1fr)",
          principal: true,
          celda: (g) => <span className="k-fecha">{fechaCorta(g.createdAt)}</span>,
        },
        ...(conPropiedad
          ? [{
              id: "prop",
              titulo: "Propiedad",
              ancho: "minmax(0, 3fr)",
              celda: (g: FilaGeneracion) => <span className="emp-nom emp-16"><b>{g.propertyName}</b></span>,
            }]
          : []),
        {
          id: "periodo",
          titulo: "Periodo",
          ancho: "minmax(0, 2fr)",
          celda: (g) => <span className="emp-periodo">{periodo(g.month, g.year)}</span>,
        },
        {
          id: "estado",
          titulo: "Estado",
          ancho: "minmax(0, 1.5fr)",
          celda: (g) => {
            const e = estadoGeneracion(g.status);
            return <Estado tipo={e.tipo}>{e.palabra}</Estado>;
          },
        },
        ...(conEnlace
          ? [{
              id: "acc",
              titulo: "Acciones",
              tituloOculto: true,
              alinear: "fin" as const,
              ancho: "auto",
              claseCelda: "k-td-acc",
              celda: (g: FilaGeneracion) => (
                <AccionesFila>
                  <BotonFila href={`/dashboard/generar/${g.id}`} aria-label={`Ver ${periodo(g.month, g.year)}`}>
                    Ver
                  </BotonFila>
                </AccionesFila>
              ),
            }]
          : []),
      ]}
    />
    </>
  );
}

/** Estilos de celda compartidos por las tablas del portafolio (React deduplica por `href`). */
function EstilosTablas() {
  return <style href="k-empresa-tablas" precedence="default">{CSS_TABLAS}</style>;
}

const CSS_TABLAS = `
.emp-cifra { font: 800 32px/.8 var(--f-sans); font-stretch: 62%; letter-spacing: -.03em; white-space: nowrap; }
.emp-cifra small { font-size: 15px; font-weight: 600; font-stretch: 100%; letter-spacing: 0; color: var(--ink-3); }
.emp-nom { display: block; min-width: 0; }
.emp-nom b { display: block; font-size: 18px; font-weight: 700; line-height: 1.2; letter-spacing: -.005em; overflow-wrap: anywhere; }
.emp-nom.emp-16 b { font-size: 16px; font-weight: 650; }
.emp-nom > span { display: block; margin-top: 3px; font-size: 14px; line-height: 1.3; color: var(--ink-3); }
.emp-num { font-size: 15px; font-weight: 600; }
.emp-periodo { font-size: 15px; font-weight: 600; }
.emp-lbl { display: none; }
@media (max-width: 860px) {
  .emp-lbl { display: inline; font-weight: 400; color: var(--ink-3); }
  .emp-num { justify-self: start; text-align: left; }
}
`;
