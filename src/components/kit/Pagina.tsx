"use client";

import { Sparkles, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { EnlaceVer } from "./Boton";
import { Loseta } from "./Loseta";
import { iconoDeTitulo, moduloDe, textoDe, type Tono } from "./modulos";
import { unir } from "./util";

/**
 * Contenedor de contenido de una pantalla: padding lateral `--pad`
 * (40 / 28 / 16 px). Va dentro del armazón, bajo la cabecera y el alcance.
 */
export function Pagina({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={unir("k-pagina", className)}>{children}</div>;
}

/** Pieza = pantalla o bloque principal. */
export function Pieza({ children, className, etiqueta, id }:
  { children: ReactNode; className?: string; etiqueta?: string; id?: string }) {
  return <section id={id} aria-label={etiqueta} className={unir("k-pieza", className)}>{children}</section>;
}

/**
 * Cabecera de pantalla: ficha grande con el icono y el color de la función + título
 * H1 + una frase que explica para qué sirve + acciones a la derecha (secundaria + primaria).
 * El icono y el color salen de la ruta (los mismos del menú); `icono` y `tono` los cambian.
 * En pantallas estrechas las acciones bajan debajo del título.
 *
 *   <CabeceraPieza titulo="Residentes" subtitulo="Portal por unidad, sin usuarios ni contraseñas"
 *     acciones={<><Boton variante="secundario">Importar Excel con IA</Boton><Boton flecha="crea">Agregar unidad</Boton></>} />
 *
 * Una sola por pantalla (es el <h1>). `nn` (número del antiguo índice) se acepta y se ignora.
 */
export function CabeceraPieza({ titulo, subtitulo, acciones, id, className, icono, tono }:
  { nn?: string; titulo: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; id?: string; className?: string; icono?: LucideIcon; tono?: Tono }) {
  const modulo = moduloDe(usePathname());
  const color = tono ?? modulo?.tono ?? "violet";
  return (
    <div className={unir("k-pieza-h", className)} data-h={color}>
      <Loseta icono={icono ?? modulo?.icono ?? Sparkles} tono={color} tam={60} />
      <div className="tt">
        <h1 id={id}>{titulo}</h1>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}

/**
 * Sección de una pantalla larga (Inicio, Configuración): ficha de icono opcional,
 * título en 22 px con una nota en gris y un enlace o control a la derecha.
 * Deja aire al final (32 px en móvil).
 *
 *   <Seccion id="vencimientos" titulo="Vencimientos" nota="ordenados por urgencia" icono={CalendarClock} tono="orange"
 *     enlace={{ href: "/dashboard/calendario", texto: "Abrir bitácora" }}>
 *     …
 *   </Seccion>
 *
 * `numero` y `enlace.refIndice` se aceptan por compatibilidad y no se pintan.
 */
export function Seccion({ id, titulo, nota, enlace, acciones, icono, tono, children, className }: {
  id: string;
  numero?: string;
  titulo: ReactNode;
  nota?: ReactNode;
  enlace?: { href: string; texto: ReactNode; refIndice?: string };
  /** Alternativa a `enlace`: cualquier control a la derecha (p. ej. un <Boton tam={40}>). */
  acciones?: ReactNode;
  icono?: LucideIcon;
  tono?: Tono;
  children: ReactNode;
  className?: string;
}) {
  const auto = icono ? null : iconoDeTitulo(textoDe(titulo));
  const Icono = icono ?? auto?.Icono;
  return (
    <section className={unir("k-seccion", className)} aria-labelledby={id}>
      <div className="k-sec-h">
        {Icono && <Loseta icono={Icono} tono={tono ?? auto?.tono} tam={36} />}
        <h2 id={id}>{titulo}{nota && <small>{nota}</small>}</h2>
        {enlace && <EnlaceVer href={enlace.href}>{enlace.texto}</EnlaceVer>}
        {!enlace && acciones && <div className="acc">{acciones}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Panel: tarjeta con título (y ficha de icono opcional, en su color). `titular` sube el
 * título a 24 px. `recuadro` = borde de 1,5 px, para objetos seleccionables o comparables
 * (plan, ficha, zona de progreso).
 *
 *   <Panel titulo="Qué subir" nota="3 de 5 cubiertos" icono={Upload} tono="sky">…</Panel>
 *
 * `nivel` = nivel del encabezado (3 por defecto: dentro de una pieza con <h1> y secciones <h2>).
 */
export function Panel({ titulo, nota, titular, recuadro, nivel = 3, icono, tono, children, className, as: Etiqueta = "section", id }: {
  titulo?: ReactNode; nota?: ReactNode; titular?: boolean; recuadro?: boolean; nivel?: 2 | 3 | 4; icono?: LucideIcon; tono?: Tono;
  children: ReactNode; className?: string; as?: "section" | "div" | "aside" | "article"; id?: string;
}) {
  const idTitulo = id ? `${id}-t` : undefined;
  const H = nivel === 2 ? "h2" : nivel === 4 ? "h4" : "h3";
  const auto = icono || !titulo ? null : iconoDeTitulo(textoDe(titulo));
  const Icono = icono ?? auto?.Icono;
  return (
    <Etiqueta id={id} className={unir("k-panel", recuadro && "k-recuadro", className)} aria-labelledby={titulo && idTitulo ? idTitulo : undefined}>
      {titulo && (
        <H id={idTitulo} className={unir("k-panel-h", titular && "k-titular")}>
          {Icono && <Loseta icono={Icono} tono={tono ?? auto?.tono} tam={36} />}
          <span>{titulo}</span>
          {nota && <small>{nota}</small>}
        </H>
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

/**
 * Resumen de lo elegido en dos columnas (paso 5 de Generar: Propiedad, Periodo,
 * Documentos, Archivos). Es una lista de definiciones (<dl>).
 *   <Resumen etiquetaAccesible="Resumen de la generación" filas={[{ etiqueta: "Propiedad", valor: prop.name }, …]} />
 */
export function Resumen({ filas, etiquetaAccesible, className }: {
  filas: Array<{ etiqueta: ReactNode; valor: ReactNode }>; etiquetaAccesible?: string; className?: string;
}) {
  return (
    <dl className={unir("k-resumen", className)} aria-label={etiquetaAccesible}>
      {filas.map((f, i) => (
        <div key={i}><dt>{f.etiqueta}</dt><dd>{f.valor}</dd></div>
      ))}
    </dl>
  );
}

/** Pie de pantalla: filete fino + dos líneas (marca a la izquierda, ayuda a la derecha). */
export function Colofon({ izquierda, derecha }: { izquierda: ReactNode; derecha?: ReactNode }) {
  return (
    <footer className="k-colofon">
      <span>{izquierda}</span>
      {derecha && <span>{derecha}</span>}
    </footer>
  );
}
