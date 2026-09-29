import { unir } from "./util";

/**
 * Esqueleto de carga (SPEC §f.15): bloques planos --surface-4 con LA FORMA
 * REAL del contenido; pulso a --surface-5 solo sin «reducir movimiento».
 * Nada de brillos que barren. Lleva «Cargando…» para lectores.
 *
 * variante "bloque": título 28 px al 60 % + líneas al 80 % y 45 %.
 * variante "tabla": `filas` filas de 56 px | 1fr | 90 px separadas por --line.
 * variante "completo": las dos cosas (pantalla de tabla).
 *
 *   {cargando ? <Esqueleto variante="tabla" filas={6} /> : <Tabla … />}
 */
export function Esqueleto({ variante = "completo", filas = 3, etiquetaAccesible = "Cargando…", className }: {
  variante?: "bloque" | "tabla" | "completo"; filas?: number;
  /** Texto para lectores («Cargando vencimientos…»). No se ve. */
  etiquetaAccesible?: string; className?: string;
}) {
  return (
    <div role="status" className={className}>
      <div className={unir("k-esq")} aria-hidden="true">
        {variante !== "tabla" && <><i className="t" /><i className="m" /><i className="c" /></>}
        {variante !== "bloque" && Array.from({ length: filas }, (_, n) => (
          <div className="fila" key={n}><i /><i /><i /></div>
        ))}
      </div>
      <span className="k-sr">{etiquetaAccesible}</span>
    </div>
  );
}
