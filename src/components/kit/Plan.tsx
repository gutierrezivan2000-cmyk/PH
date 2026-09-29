import type { ReactNode } from "react";
import { Cuadro } from "./Estado";
import { unir } from "./util";

/**
 * Tarjeta de plan (SPEC §g 14): recuadro de 2 px; nombre en rótulo 125 %,
 * para quién, precio 48 px/62 % + «COP al mes» + equivalencia, beneficios con
 * filetes (el primero en negrita), acción al pie.
 * `recomendado` → área negativa (--neg-area) con marca de 6 px y etiqueta
 * invertida («Recomendado · de 4 a 10 propiedades»), NUNCA naranja.
 * `actual` → recuadro discontinuo + «Tu plan actual ■».
 *
 *   <TarjetaPlan nombre="Business" para="Para administradores en crecimiento" precio="299.900"
 *     equivalencia="aprox. USD 73 al mes" beneficios={["Hasta 10 propiedades", "40 generaciones al mes"]}
 *     recomendado="Recomendado · de 4 a 10 propiedades"
 *     accion={<Boton flecha="avanza" onClick={…}>Cambiar a Business</Boton>} />
 */
export function TarjetaPlan({ nombre, para, precio, moneda = "COP", periodo = "al mes", equivalencia, beneficios, recomendado, actual, accion, nivel = 3, className, id }: {
  nombre: string; para?: ReactNode; precio: ReactNode; moneda?: string; periodo?: string; equivalencia?: ReactNode;
  beneficios: ReactNode[]; recomendado?: string; actual?: boolean; accion?: ReactNode;
  /** Nivel del encabezado del nombre (3 por defecto). */
  nivel?: 2 | 3 | 4; className?: string; id?: string;
}) {
  const idTitulo = id ? `${id}-t` : undefined;
  const H = nivel === 2 ? "h2" : nivel === 4 ? "h4" : "h3";
  return (
    <article id={id} aria-labelledby={idTitulo} className={unir("k-plan", recomendado && "k-neg", actual && !recomendado && "es-actual", className)}>
      {recomendado && <span className="tag">{recomendado}</span>}
      <H id={idTitulo}>{nombre}</H>
      {para && <div className="para">{para}</div>}
      <div className="precio"><b>{precio}</b><span>{moneda}<br />{periodo}</span></div>
      {equivalencia && <div className="equiv">{equivalencia}</div>}
      <ul>{beneficios.map((b, i) => <li key={i}>{b}</li>)}</ul>
      <div className="pie">
        {actual ? <div className="actual"><span>Tu plan actual</span><Cuadro tipo="ok" /></div> : accion}
      </div>
    </article>
  );
}

/** Leyenda de gráfica: series por VALOR (s1 tinta, s2 tinta-3, s3 trama, s4 contorno; «mal» = excedido/en mora). */
export function LeyendaGrafica({ series }: { series: Array<{ nombre: string; serie: "s1" | "s2" | "s3" | "s4" | "mal" }> }) {
  return (
    <div className="k-leyenda">
      {series.map((s) => <span key={s.nombre}><i className={`k-serie ${s.serie}`} aria-hidden="true" />{s.nombre}</span>)}
    </div>
  );
}
