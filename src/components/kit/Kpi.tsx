import type { ReactNode } from "react";
import { unir } from "./util";

/**
 * KPI (SPEC §f.6): filete de 2 px arriba, cifra 48 px/62 % (32 con tam={32}),
 * etiqueta 15 px y variación 14 px CON PALABRA («+4 este mes»). Nunca más de
 * 4 por fila. Cifras monetarias: «$ 12.480.000» (Archivo con cifras tabulares).
 * `alerta` pinta la cifra en --danger-text (en mora, excedido).
 *
 *   <Kpis>
 *     <Kpi cifra="38" etiqueta="Documentos generados en 2026" variacion="4 este mes" />
 *     <Kpi cifra="$ 12.480.000" etiqueta="Recaudo del mes" tam={32} />
 *   </Kpis>
 */
export function Kpi({ cifra, unidad, etiqueta, variacion, malo, alerta, tam = 48, className }: {
  cifra: ReactNode; unidad?: ReactNode; etiqueta: ReactNode; variacion?: ReactNode;
  /** La variación es mala noticia (--danger-text). */
  malo?: boolean; alerta?: boolean; tam?: 32 | 48; className?: string;
}) {
  return (
    <div className={unir("k-kpi", tam === 32 && "k-32", alerta && "alerta", className)}>
      <b>{cifra}{unidad && <small> {unidad}</small>}</b>
      <span>{etiqueta}</span>
      {variacion && <em className={malo ? "malo" : undefined}>{variacion}</em>}
    </div>
  );
}

/** Fila de KPIs (se reparten solos; 2 por fila en móvil). */
export function Kpis({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={unir("k-kpis", className)}>{children}</div>;
}

/**
 * Medidor de uso (UsageCard, Suscripción, /empresa): una fila por límite, cada
 * una con su rótulo y sus celdas (llenas = usadas en --ink, vacías en contorno).
 * Sin escala de fechas.
 *
 *   <Medidor filas={[{ etiqueta: "Este mes", usado: 12, total: 15 }, { etiqueta: "Hoy", usado: 1, total: 3 }]} />
 *
 * Con totales grandes (> 40) las celdas se agrupan: cada celda vale total/40.
 */
export function Medidor({ filas, className }: {
  filas: Array<{ etiqueta: string; usado: number; total: number }>; className?: string;
}) {
  return (
    <div className={unir("k-medidor", className)}>
      {filas.map((f) => {
        const total = Math.max(0, f.total);
        const usado = Math.min(Math.max(0, f.usado), total);
        const celdas = Math.min(total, 40);
        const llenas = total > 0 ? Math.round((usado / total) * celdas) : 0;
        return (
          <div key={f.etiqueta} style={{ display: "contents" }}>
            <span className="lb">{f.etiqueta} <b>{usado}/{total}</b></span>
            <div className="k-celdas" role="img" aria-label={`${f.etiqueta}: ${usado} de ${total} usadas`}
              style={{ gridTemplateColumns: `repeat(${Math.max(celdas, 1)}, minmax(0, 1fr))` }}>
              {Array.from({ length: celdas }, (_, i) => <i key={i} className={i < llenas ? undefined : "v"} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
