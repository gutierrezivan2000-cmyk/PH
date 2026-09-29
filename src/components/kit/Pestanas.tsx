"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Tono } from "./modulos";
import { unir } from "./util";

/** `etiqueta` = texto VISIBLE del segmento o pestaña. `icono`/`tono` = ficha de icono opcional (en su color). */
export type ItemPestana = {
  id: string; etiqueta: ReactNode; conteo?: ReactNode; deshabilitado?: boolean; titulo?: string;
  icono?: LucideIcon; tono?: Tono;
};

/**
 * Segmentos: filtros y subsecciones en una pista redondeada. Botones de 42 px, el activo
 * elevado con borde violeta; el conteo en una pastilla <b>; icono de color opcional.
 * modo "filtro" (por defecto) → role="group" + aria-pressed.
 * modo "pestanas" → role="tablist" + aria-selected (+ `panelId(id)` para aria-controls).
 * Hace scroll horizontal dentro de sí mismo si no cabe; nunca desborda la página.
 *
 *   <Segmentos etiquetaAccesible="Filtrar por estado" valor={f} alCambiar={setF}
 *     items={[{ id: "todas", etiqueta: "Todas", conteo: 48 }, { id: "sin", etiqueta: "Sin correo", conteo: 2 }]} />
 */
export function Segmentos({ items, valor, alCambiar, etiquetaAccesible, modo = "filtro", grande, panelId, className }: {
  items: ItemPestana[]; valor: string; alCambiar: (id: string) => void;
  /** Nombre del grupo para lectores (aria-label). No se ve. */
  etiquetaAccesible: string;
  modo?: "filtro" | "pestanas"; grande?: boolean; panelId?: (id: string) => string; className?: string;
}) {
  const esTabs = modo === "pestanas";
  return (
    <div className={unir("k-seg", grande && "k-48", className)} role={esTabs ? "tablist" : "group"} aria-label={etiquetaAccesible}>
      {items.map((it) => {
        const activo = it.id === valor;
        return (
          <button key={it.id} type="button" disabled={it.deshabilitado} title={it.titulo} data-h={it.tono}
            role={esTabs ? "tab" : undefined}
            aria-pressed={esTabs ? undefined : activo}
            aria-selected={esTabs ? activo : undefined}
            aria-controls={esTabs && panelId ? panelId(it.id) : undefined}
            tabIndex={esTabs && !activo ? -1 : undefined}
            onKeyDown={esTabs ? (e) => moverFoco(e, items, valor, alCambiar) : undefined}
            onClick={() => alCambiar(it.id)}>
            {it.icono && <it.icono aria-hidden="true" focusable="false" />}
            {it.etiqueta}{it.conteo !== undefined && <b>{it.conteo}</b>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pestañas unidas: para elegir copropiedad dentro de una pantalla (Residentes). `fin`
 * añade un texto a la derecha («47 de 48 con enlace · 46 con correo»).
 * `vista` = versión compacta para «Lista | Mes».
 *
 *   <PestanasUnidas etiquetaAccesible="Copropiedad" valor={id} alCambiar={setId}
 *     items={props.map(p => ({ id: p.id, etiqueta: p.name, conteo: `${p.units} u.` }))} fin="47 de 48 con enlace" />
 */
export function PestanasUnidas({ items, valor, alCambiar, etiquetaAccesible, fin, vista, className }: {
  items: ItemPestana[]; valor: string; alCambiar: (id: string) => void;
  /** Nombre del grupo para lectores (aria-label). No se ve. */
  etiquetaAccesible: string;
  fin?: ReactNode; vista?: boolean; className?: string;
}) {
  return (
    <div className={unir("k-pest", vista && "k-vista", className)} role="group" aria-label={etiquetaAccesible}>
      {items.map((it) => (
        <button key={it.id} type="button" aria-pressed={it.id === valor} disabled={it.deshabilitado} data-h={it.tono}
          title={it.titulo} onClick={() => alCambiar(it.id)}>
          {it.icono && <it.icono aria-hidden="true" focusable="false" />}
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
