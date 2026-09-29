import type { ReactNode } from "react";
import { Lupa } from "./Iconos";
import { unir } from "./util";

/**
 * Estado vacío (SPEC §f.12): el «0» gigante ES la ilustración (nada de iconos
 * ni emojis). Titular con la situación CONCRETA, párrafo con el siguiente paso,
 * primario + secundario. Filete de 2 px arriba.
 *
 *   <Vacio titulo="Edificio Parque Central 127 aún no tiene unidades."
 *     texto="Sube el listado de copropietarios en Excel o PDF y la IA arma la tabla por ti."
 *     acciones={<><Boton flecha="avanza" onClick={importar}>Importar Excel con IA</Boton>
 *                 <Boton variante="secundario" onClick={agregar}>Agregar a mano</Boton></>} />
 */
export function Vacio({ titulo, texto, acciones, nivel = 2, className }: {
  titulo: ReactNode; texto?: ReactNode; acciones?: ReactNode; nivel?: 2 | 3; className?: string;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <div className={unir("k-vacio", className)}>
      <span className="cero" aria-hidden="true">0</span>
      <H>{titulo}</H>
      {texto && <p>{texto}</p>}
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}

/**
 * Sin resultados: la consulta repetida en un cuadro, titular «No encontramos
 * «905» en Los Pinos.», párrafo y acciones DERIVADAS de la consulta
 * (primario «Agregar la unidad 905 +», secundario, fantasma «Limpiar búsqueda»).
 * Sin «0» gigante.
 */
export function SinResultados({ consulta, titulo, texto, acciones, nivel = 2, className }: {
  consulta: string; titulo: ReactNode; texto?: ReactNode; acciones?: ReactNode; nivel?: 2 | 3; className?: string;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <div className={unir("k-vacio", className)} role="status">
      <div className="q"><Lupa /><span><span className="k-sr">Búsqueda: </span>{consulta}</span></div>
      <H>{titulo}</H>
      {texto && <p>{texto}</p>}
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}

/**
 * Error de carga: ■ naranja + «No pudimos cargar las unidades.» + causa +
 * «Reintentar» (secundario). Nunca una pantalla en blanco.
 */
export function ErrorCarga({ titulo, texto, acciones, nivel = 2, className }: {
  titulo: ReactNode; texto?: ReactNode; acciones?: ReactNode; nivel?: 2 | 3; className?: string;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <div className={unir("k-vacio", className)} role="alert">
      <span className="falla">Error</span>
      <H>{titulo}</H>
      {texto && <p>{texto}</p>}
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}
