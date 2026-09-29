import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Cuadro } from "./Estado";
import { Loseta } from "./Loseta";
import type { Tono } from "./modulos";
import { unir } from "./util";

/**
 * Tarjeta de plan: ficha de icono opcional, nombre, para quién, precio grande +
 * «COP al mes» + equivalencia, beneficios con ✓ verde (el primero en negrita),
 * acción al pie.
 * `recomendado` → tarjeta índigo intenso con etiqueta («Recomendado · de 4 a 10 propiedades»).
 * `actual` → borde discontinuo violeta + «Tu plan actual ✓».
 *
 *   <TarjetaPlan nombre="Business" icono={Rocket} tono="violet" para="Para administradores en crecimiento" precio="299.900"
 *     equivalencia="aprox. USD 73 al mes" beneficios={["Hasta 10 propiedades", "40 generaciones al mes"]}
 *     recomendado="Recomendado · de 4 a 10 propiedades"
 *     accion={<Boton onClick={…}>Cambiar a Business</Boton>} />
 */
export function TarjetaPlan({ nombre, para, precio, moneda = "COP", periodo = "al mes", equivalencia, beneficios, recomendado, actual, accion, nivel = 3, className, id, icono, tono }: {
  nombre: string; para?: ReactNode; precio: ReactNode; moneda?: string; periodo?: string; equivalencia?: ReactNode;
  icono?: LucideIcon; tono?: Tono;
  beneficios: ReactNode[]; recomendado?: string; actual?: boolean; accion?: ReactNode;
  /** Nivel del encabezado del nombre (3 por defecto). */
  nivel?: 2 | 3 | 4; className?: string; id?: string;
}) {
  const idTitulo = id ? `${id}-t` : undefined;
  const H = nivel === 2 ? "h2" : nivel === 4 ? "h4" : "h3";
  return (
    <article id={id} aria-labelledby={idTitulo} className={unir("k-plan", recomendado && "k-neg", actual && !recomendado && "es-actual", className)}>
      {recomendado && <span className="tag">{recomendado}</span>}
      <H id={idTitulo}>{icono && <Loseta icono={icono} tono={tono} />}{nombre}</H>
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

/** Leyenda de gráfica: cada serie con su color (s1 violeta, s2 azul, s3 verde azulado, s4 ámbar; «mal» = excedido/en mora). */
export function LeyendaGrafica({ series }: { series: Array<{ nombre: string; serie: "s1" | "s2" | "s3" | "s4" | "mal" }> }) {
  return (
    <div className="k-leyenda">
      {series.map((s) => <span key={s.nombre}><i className={`k-serie ${s.serie}`} aria-hidden="true" />{s.nombre}</span>)}
    </div>
  );
}
