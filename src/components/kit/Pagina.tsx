import type { ReactNode } from "react";
import { EnlaceVer } from "./Boton";
import { unir } from "./util";

/**
 * Contenedor de contenido de una pantalla: padding lateral `--pad`
 * (44 / 32 / 16 px). Va dentro del armazón, bajo la cabecera y la cornisa.
 */
export function Pagina({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={unir("k-pagina", className)}>{children}</div>;
}

/** Pieza = pantalla o bloque principal: 48 px arriba, 64 abajo (36/48 en móvil). */
export function Pieza({ children, className, etiqueta, id }:
  { children: ReactNode; className?: string; etiqueta?: string; id?: string }) {
  return <section id={id} aria-label={etiqueta} className={unir("k-pieza", className)}>{children}</section>;
}

/**
 * Cabecera de pieza (SPEC §f.1, §i.4): filete de 4 px con registros de retícula,
 * número de entrada del índice `NN` (48 px, decorativo) + título H1 de 40 px +
 * subtítulo + acciones a la derecha (secundario + primario). En móvil se apila.
 *
 *   <CabeceraPieza nn="07" titulo="Residentes" subtitulo="Portal por unidad, sin usuarios ni contraseñas"
 *     acciones={<><Boton variante="secundario">Importar Excel con IA</Boton><Boton flecha="crea">Agregar unidad</Boton></>} />
 *
 * Una sola por pantalla (es el <h1>). `nn` = número de la pantalla en el índice (01–15);
 * sin número (hojas auxiliares) pasa nn="—".
 */
export function CabeceraPieza({ nn, titulo, subtitulo, acciones, id, className }:
  { nn: string; titulo: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={unir("k-pieza-h k-ticks", className)}>
      <div className={unir("nn", nn === "—" && "nulo")} aria-hidden="true">{nn}</div>
      <div className="tt">
        <h1 id={id}>{titulo}</h1>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}

/**
 * Sección numerada de una pantalla larga (Inicio, Configuración): filete de 4 px,
 * número `NN.n` en mono, rótulo en MAYÚSCULAS 125 % con nota en minúscula, y un
 * enlace a la derecha. Deja 56 px de aire al final (40 en móvil).
 *
 *   <Seccion id="s11" numero="01.1" titulo="Vencimientos" nota="ordenados por urgencia"
 *     enlace={{ href: "/dashboard/calendario", texto: "Abrir bitácora", refIndice: "03" }}>
 *     …
 *   </Seccion>
 *
 * REGLA 10 del SPEC: `NN.n` solo en pantallas largas de varias secciones.
 * En el resto, omite `numero`.
 */
export function Seccion({ id, numero, titulo, nota, enlace, acciones, children, className }: {
  id: string;
  numero?: string;
  titulo: ReactNode;
  nota?: ReactNode;
  enlace?: { href: string; texto: ReactNode; refIndice?: string };
  /** Alternativa a `enlace`: cualquier control a la derecha (p. ej. un <Boton tam={40}>). */
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={unir("k-seccion", className)} aria-labelledby={id}>
      <div className={unir("k-sec-h k-ticks", !numero && "sin-id")}>
        {numero && <span className="id">{numero}</span>}
        <h2 id={id}>{titulo}{nota && <small>{nota}</small>}</h2>
        {enlace && <EnlaceVer href={enlace.href} refIndice={enlace.refIndice}>{enlace.texto}</EnlaceVer>}
        {!enlace && acciones && <div className="acc">{acciones}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Panel (SPEC §f.5): NO es una tarjeta. Filete superior de 2 px + título
 * (rótulo 14 px MAYÚSCULAS, o titular de 22 px con `titular`) y el contenido
 * sobre el lienzo. `recuadro` = marco completo de 2 px, solo para objetos
 * seleccionables o comparables (plan, ficha, zona de progreso).
 *
 *   <Panel titulo="Qué subir" nota="3 de 5 cubiertos">…</Panel>
 */
export function Panel({ titulo, nota, titular, recuadro, children, className, as: Etiqueta = "section", id }: {
  titulo?: ReactNode; nota?: ReactNode; titular?: boolean; recuadro?: boolean;
  children: ReactNode; className?: string; as?: "section" | "div" | "aside" | "article"; id?: string;
}) {
  const idTitulo = id ? `${id}-t` : undefined;
  return (
    <Etiqueta id={id} className={unir("k-panel", recuadro && "k-recuadro", className)} aria-labelledby={titulo && idTitulo ? idTitulo : undefined}>
      {titulo && (
        <h3 id={idTitulo} className={unir("k-panel-h", titular && "k-titular")}>
          <span>{titulo}</span>
          {nota && <small>{nota}</small>}
        </h3>
      )}
      {children}
    </Etiqueta>
  );
}

/** Retícula de 12 columnas (4 en móvil, donde todo pasa a ancho completo). Coloca hijos con style={{ gridColumn: "1 / 8" }}. */
export function Reticula({ children, className, as: Etiqueta = "div" }:
  { children: ReactNode; className?: string; as?: "div" | "section" | "ul" | "ol" }) {
  return <Etiqueta className={unir("k-r12", className)}>{children}</Etiqueta>;
}

/** Colofón: filete de 2 px + dos líneas de pie (marca a la izquierda, ayuda a la derecha). */
export function Colofon({ izquierda, derecha }: { izquierda: ReactNode; derecha?: ReactNode }) {
  return (
    <footer className="k-colofon k-ticks">
      <span>{izquierda}</span>
      {derecha && <span>{derecha}</span>}
    </footer>
  );
}
