"use client";

import { unir } from "./util";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Rejilla de 12 meses (4 × 3) de celdas de 56 px, 15,5 px/700 (paso 2 de Generar).
 * Radios nativos (flechas ← → ↑ ↓ entre meses, Espacio elige), el elegido en
 * violeta y los que no se pueden elegir (futuros) con borde discontinuo. En móvil el rótulo se abrevia («Sep»); el nombre accesible
 * es siempre el mes completo. El año va aparte, con <Segmentos>.
 *
 *   <RejillaMeses nombre="mes" etiquetaAccesible={`Mes del informe · ${anio}`} valor={mes}
 *     alCambiar={setMes} deshabilitado={(m) => anio === hoy.getFullYear() && m > hoy.getMonth() + 1} />
 */
export function RejillaMeses({ nombre, valor, alCambiar, deshabilitado, etiquetaAccesible, className }: {
  /** `name` de los radios (único en la página). */
  nombre: string;
  /** Mes elegido, 1–12 (o null). */
  valor: number | null;
  alCambiar: (mes: number) => void;
  /** Meses que no se pueden elegir (p. ej. los futuros). */
  deshabilitado?: (mes: number) => boolean;
  /** Nombre del grupo para lectores (aria-label), con el año. */
  etiquetaAccesible: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiquetaAccesible} className={unir("k-meses", className)}>
      {MESES.map((m, i) => {
        const mes = i + 1;
        return (
          <label key={m} className="k-mes">
            <input type="radio" className="k-sr" name={nombre} value={mes} checked={valor === mes}
              disabled={deshabilitado?.(mes)} onChange={() => alCambiar(mes)} aria-label={m[0].toUpperCase() + m.slice(1)} />
            <span className="l" aria-hidden="true">{m[0].toUpperCase() + m.slice(1)}</span>
            <span className="c" aria-hidden="true">{CORTOS[i]}</span>
          </label>
        );
      })}
    </div>
  );
}
