"use client";

import type { CSSProperties, ReactNode } from "react";
import { Casilla } from "./Casilla";
import { Chevron } from "./Iconos";
import { unir } from "./util";

export type ColumnaTabla<T> = {
  id: string;
  /** Cabecera (mono 12 px MAYÚSCULAS). Siempre presente para lectores; `tituloOculto` la oculta a la vista. */
  titulo: ReactNode;
  tituloOculto?: boolean;
  /** Pista de la rejilla: "minmax(0, 1fr)" (por defecto), "minmax(0, 2fr)", "120px", "auto"… */
  ancho?: string;
  /** "fin" = alineada a la derecha (cifras, acciones). */
  alinear?: "inicio" | "fin";
  celda: (fila: T) => ReactNode;
  /** En móvil (ficha) va a la columna izquierda de 76 px: el identificador (unidad, fecha). */
  principal?: boolean;
  /** Clases de la celda: k-c-id (unidad mono 18), k-c-nom (nombre + rol), k-c-correo, k-td-cifra, k-td-acc. */
  claseCelda?: string;
};

export type Seleccion<T> = {
  ids: ReadonlySet<string>;
  alCambiar: (ids: Set<string>) => void;
  /** Nombre accesible de la casilla de cada fila: «Seleccionar 101». */
  etiquetaFila: (fila: T) => string;
  /** Nombre de la casilla de cabecera. Por defecto «Seleccionar todas las filas visibles». */
  etiquetaTodas?: string;
};

export type Agrupacion<T> = {
  clave: (fila: T) => string;
  /** Contenido del grupo: el numeral («1») o el título («Septiembre 2026»). */
  titulo: (clave: string, filas: T[]) => ReactNode;
  /** «numeral» (por defecto): cifra de 48 px en la columna 1 que abarca sus filas (piso).
   *  «fila»: una fila-título de 22 px sobre sus filas (mes, copropiedad). */
  estilo?: "numeral" | "fila";
  /** Texto bajo el numeral («Piso»). */
  nota?: ReactNode;
  /** Cabecera de la columna del numeral («Piso»). */
  cabecera?: string;
};

/**
 * Tabla del kit (SPEC §f.7): rejilla con subgrid y roles ARIA completos
 * (table/rowgroup/row/columnheader/cell). Cabecera mono entre filetes de 2 px,
 * filas de 60 px (76 con `alta`), hover y selección que sangran medio medianil.
 * En ≤ 860 px cada fila pasa a FICHA: columna `principal` a la izquierda (76 px),
 * el resto apilado; la cabecera se oculta a la vista pero sigue para lectores.
 *
 *   <Tabla etiqueta="Unidades de Los Pinos" filas={unidades} claveFila={u => u.id}
 *     columnas={[
 *       { id: "u", titulo: "Unidad", ancho: "minmax(0, 1fr)", principal: true, claseCelda: "k-c-id", celda: u => u.label },
 *       { id: "r", titulo: "Residente", ancho: "minmax(0, 3fr)", claseCelda: "k-c-nom", celda: u => <>{u.nombre}<span>{u.rol}</span></> },
 *       { id: "a", titulo: "Acciones", tituloOculto: true, alinear: "fin", ancho: "auto", celda: u => <AccionesFila>…</AccionesFila> },
 *     ]}
 *     seleccion={{ ids: sel, alCambiar: setSel, etiquetaFila: u => `Seleccionar ${u.label}` }}
 *     agrupar={{ clave: u => piso(u), titulo: k => k, nota: "Piso", cabecera: "Piso" }} />
 *
 * `vacio` sustituye a la tabla entera cuando no hay filas (usa <Vacio> o <SinResultados>).
 */
export function Tabla<T>({
  etiqueta, columnas, filas, claveFila, seleccion, agrupar, filaConError, alta, vacio, className,
}: {
  etiqueta: string;
  columnas: ColumnaTabla<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  seleccion?: Seleccion<T>;
  agrupar?: Agrupacion<T>;
  filaConError?: (fila: T) => boolean;
  alta?: boolean;
  vacio?: ReactNode;
  className?: string;
}) {
  const conNumeral = Boolean(agrupar && (agrupar.estilo ?? "numeral") === "numeral");
  const pistas = [
    conNumeral ? "72px" : null,
    seleccion ? "32px" : null,
    ...columnas.map((c) => c.ancho ?? "minmax(0, 1fr)"),
  ].filter(Boolean).join(" ");

  const visibles = filas.map(claveFila);
  const nSel = seleccion ? visibles.filter((k) => seleccion.ids.has(k)).length : 0;
  const todas = nSel > 0 && nSel === visibles.length;

  const alternarTodas = () => {
    if (!seleccion) return;
    const s = new Set(seleccion.ids);
    if (todas) visibles.forEach((k) => s.delete(k));
    else visibles.forEach((k) => s.add(k));
    seleccion.alCambiar(s);
  };
  const alternar = (k: string) => {
    if (!seleccion) return;
    const s = new Set(seleccion.ids);
    if (s.has(k)) s.delete(k); else s.add(k);
    seleccion.alCambiar(s);
  };

  const fila = (f: T) => {
    const k = claveFila(f);
    const sel = seleccion?.ids.has(k) ?? false;
    return (
      <div key={k} role="row" className={unir("k-tr", alta && "k-76")}
        data-sel={sel || undefined} data-error={filaConError?.(f) || undefined}>
        {seleccion && (
          <span role="cell" className="k-td-sel">
            <Casilla checked={sel} onChange={() => alternar(k)} aria-label={seleccion.etiquetaFila(f)} />
          </span>
        )}
        {columnas.map((c) => (
          <span key={c.id} role="cell"
            className={unir(c.alinear === "fin" && "k-td-fin", c.principal && "k-td-principal", c.claseCelda)}>
            {c.celda(f)}
          </span>
        ))}
      </div>
    );
  };

  // Grupos en el orden en que aparecen.
  const grupos: Array<{ clave: string; filas: T[] }> = [];
  if (agrupar) {
    const idx = new Map<string, number>();
    for (const f of filas) {
      const k = agrupar.clave(f);
      if (!idx.has(k)) { idx.set(k, grupos.length); grupos.push({ clave: k, filas: [] }); }
      grupos[idx.get(k)!].filas.push(f);
    }
  }

  // Sin filas y con estado vacío: el vacío sustituye a la tabla entera (SPEC §f.12).
  if (filas.length === 0 && vacio) return <>{vacio}</>;

  return (
    <div role="table" aria-label={etiqueta} className={unir("k-tabla", className)}
      style={{ gridTemplateColumns: pistas } as CSSProperties}>
      <div role="rowgroup" className="k-sub">
        <div role="row" className="k-tr th">
          {conNumeral && <span role="columnheader">{agrupar?.cabecera ?? ""}</span>}
          {seleccion && (
            <span role="columnheader" className="k-td-sel">
              <Casilla checked={todas} indeterminada={nSel > 0 && !todas} onChange={alternarTodas}
                aria-label={seleccion.etiquetaTodas ?? "Seleccionar todas las filas visibles"} disabled={filas.length === 0} />
            </span>
          )}
          {columnas.map((c) => (
            <span key={c.id} role="columnheader" className={unir(c.alinear === "fin" && "k-td-fin")}>
              {c.tituloOculto ? <span className="k-sr">{c.titulo}</span> : c.titulo}
            </span>
          ))}
        </div>
      </div>

      {!agrupar ? (
        <div role="rowgroup" className="k-sub">{filas.map(fila)}</div>
      ) : conNumeral ? (
        grupos.map((g) => (
          <div key={g.clave} role="rowgroup" className="k-grupo">
            <div className="k-grupo-n" aria-hidden="true" style={{ gridRow: `1 / span ${g.filas.length}` }}>
              {agrupar.titulo(g.clave, g.filas)}
              {agrupar.nota && <small>{agrupar.nota}</small>}
            </div>
            {g.filas.map(fila)}
          </div>
        ))
      ) : (
        grupos.map((g) => (
          <div key={g.clave} role="rowgroup" className="k-sub">
            <div role="row" className="k-tr k-tr-grupo">
              <span role="cell" aria-colspan={columnas.length + (seleccion ? 1 : 0)} className="k-grupo-n k-22">
                {agrupar.titulo(g.clave, g.filas)}
              </span>
            </div>
            {g.filas.map(fila)}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Contenedor de acciones de una fila: la acción principal con texto + <MenuMas>.
 * Permite el salto de línea que necesita el menú en móvil.
 */
export function AccionesFila({ children }: { children: ReactNode }) {
  return <span className="k-acciones">{children}</span>;
}

/**
 * Barra de lote (SPEC §f.7): aparece SOBRE la tabla cuando hay ≥ 1 fila
 * seleccionada. Área negativa (--neg-area) con marca de 6 px.
 *
 *   {sel.size > 0 && (
 *     <BarraLote n={sel.size} unidad={["seleccionada", "seleccionadas"]} alQuitar={() => setSel(new Set())}>
 *       <BotonLote onClick={enviarTodos}>Enviar enlace por correo</BotonLote>
 *     </BarraLote>
 *   )}
 */
export function BarraLote({ n, unidad = ["seleccionada", "seleccionadas"], alQuitar, children }: {
  n: number; unidad?: [string, string]; alQuitar: () => void; children?: ReactNode;
}) {
  return (
    <div className="k-lote" role="region" aria-label="Acciones en lote">
      <b aria-live="polite">{n} {n === 1 ? unidad[0] : unidad[1]}</b>
      {children}
      <button type="button" className="quitar" onClick={alQuitar}>Quitar selección</button>
    </div>
  );
}

export function BotonLote({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <button type="button" className="bl" onClick={onClick} disabled={disabled}>{children}</button>;
}

/** Pie de tabla: «Mostrando 9 de 48 unidades» + paginación. */
export function PieTabla({ texto, children }: { texto: ReactNode; children?: ReactNode }) {
  return <div className="k-tpie"><span>{texto}</span>{children}</div>;
}

/**
 * Paginación en celdas cuadradas de 40 px unidas (44 en móvil); la actual en --accent.
 * Con muchas páginas: 1 … 4 5 6 … 12.
 */
export function Paginacion({ pagina, total, alCambiar }: { pagina: number; total: number; alCambiar: (p: number) => void }) {
  if (total <= 1) return null;
  const nums: Array<number | "…"> = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - pagina) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <nav className="k-pag" aria-label="Páginas">
      <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
        <Chevron dir="izq" />
      </button>
      {nums.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} aria-hidden="true" style={{ cursor: "default" }}>…</span>
        ) : (
          <button key={p} type="button" aria-current={p === pagina ? "page" : undefined}
            aria-label={`Página ${p}`} onClick={() => alCambiar(p)}>{p}</button>
        ),
      )}
      <button type="button" aria-label="Página siguiente" disabled={pagina >= total} onClick={() => alCambiar(pagina + 1)}>
        <Chevron />
      </button>
    </nav>
  );
}
