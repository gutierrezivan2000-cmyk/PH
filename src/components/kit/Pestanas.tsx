"use client";

import type { ReactNode } from "react";
import { unir } from "./util";

export type ItemPestana = { id: string; etiqueta: ReactNode; conteo?: ReactNode; deshabilitado?: boolean; titulo?: string };

/**
 * Segmentos subrayados (SPEC §f.9): filtros y subsecciones. Botones de 44 px,
 * el activo en --ink con barra de 6 px; el conteo en <b> --ink-3.
 * modo "filtro" (por defecto) → role="group" + aria-pressed.
 * modo "pestanas" → role="tablist" + aria-selected (+ `panelId(id)` para aria-controls).
 * Hace scroll horizontal dentro de sí mismo si no cabe; nunca desborda la página.
 *
 *   <Segmentos etiqueta="Filtrar por estado" valor={f} alCambiar={setF}
 *     items={[{ id: "todas", etiqueta: "Todas", conteo: 48 }, { id: "sin", etiqueta: "Sin correo", conteo: 2 }]} />
 */
export function Segmentos({ items, valor, alCambiar, etiqueta, modo = "filtro", grande, panelId, className }: {
  items: ItemPestana[]; valor: string; alCambiar: (id: string) => void; etiqueta: string;
  modo?: "filtro" | "pestanas"; grande?: boolean; panelId?: (id: string) => string; className?: string;
}) {
  const esTabs = modo === "pestanas";
  return (
    <div className={unir("k-seg", grande && "k-48", className)} role={esTabs ? "tablist" : "group"} aria-label={etiqueta}>
      {items.map((it) => {
        const activo = it.id === valor;
        return (
          <button key={it.id} type="button" disabled={it.deshabilitado} title={it.titulo}
            role={esTabs ? "tab" : undefined}
            aria-pressed={esTabs ? undefined : activo}
            aria-selected={esTabs ? activo : undefined}
            aria-controls={esTabs && panelId ? panelId(it.id) : undefined}
            tabIndex={esTabs && !activo ? -1 : undefined}
            onKeyDown={esTabs ? (e) => moverFoco(e, items, valor, alCambiar) : undefined}
            onClick={() => alCambiar(it.id)}>
            {it.etiqueta}{it.conteo !== undefined && <b>{it.conteo}</b>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pestañas unidas (SPEC §f.9): recuadro de 2 px, 48 px de alto, la activa en
 * --accent. Para elegir copropiedad dentro de una pantalla (Residentes). `fin`
 * añade un texto a la derecha («47 de 48 con enlace · 46 con correo»).
 * `vista` = versión de 1,5 px y 44 px para «Lista | Mes».
 *
 *   <PestanasUnidas etiqueta="Copropiedad" valor={id} alCambiar={setId}
 *     items={props.map(p => ({ id: p.id, etiqueta: p.name, conteo: `${p.units} u.` }))} fin="47 de 48 con enlace" />
 */
export function PestanasUnidas({ items, valor, alCambiar, etiqueta, fin, vista, className }: {
  items: ItemPestana[]; valor: string; alCambiar: (id: string) => void; etiqueta: string;
  fin?: ReactNode; vista?: boolean; className?: string;
}) {
  return (
    <div className={unir("k-pest", vista && "k-vista", className)} role="group" aria-label={etiqueta}>
      {items.map((it) => (
        <button key={it.id} type="button" aria-pressed={it.id === valor} disabled={it.deshabilitado}
          title={it.titulo} onClick={() => alCambiar(it.id)}>
          {it.etiqueta}{it.conteo !== undefined && <small>{it.conteo}</small>}
        </button>
      ))}
      {fin && <span className="fin">{fin}</span>}
    </div>
  );
}

function moverFoco(
  e: React.KeyboardEvent<HTMLButtonElement>, items: ItemPestana[], valor: string, alCambiar: (id: string) => void,
) {
  const activos = items.filter((i) => !i.deshabilitado);
  const i = activos.findIndex((x) => x.id === valor);
  let sig = -1;
  if (e.key === "ArrowRight") sig = (i + 1) % activos.length;
  else if (e.key === "ArrowLeft") sig = (i - 1 + activos.length) % activos.length;
  else if (e.key === "Home") sig = 0;
  else if (e.key === "End") sig = activos.length - 1;
  if (sig < 0) return;
  e.preventDefault();
  alCambiar(activos[sig].id);
  const lista = e.currentTarget.parentElement;
  requestAnimationFrame(() => lista?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
}
