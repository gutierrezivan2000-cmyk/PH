import Link from "next/link";
import { CalendarRange, CircleAlert, CircleCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { estiloDeEstado, type TipoEstado } from "./Estado";
import { Flecha } from "./Iconos";
import { Loseta } from "./Loseta";
import { iconoDeAccion, type Tono } from "./modulos";
import { unir } from "./util";

const NIVELES: Record<"a" | "b" | "c", { Icono: LucideIcon; tono: Tono }> = {
  a: { Icono: CircleAlert, tono: "red" },
  b: { Icono: estiloDeEstado("semana").Icono, tono: "orange" },
  c: { Icono: CalendarRange, tono: "blue" },
};

/**
 * Tarjeta de urgencia de Inicio: ficha de color + número grande + qué significa.
 * El color CODIFICA la urgencia: a = vencidas (rojo) · b = esta semana (naranja) ·
 * c = próximos 30 días (azul). Con n = 0 la tarjeta se vuelve verde con ✓ («todo en orden»):
 * usa leyendas como «Nada vencido», «Semana libre», «Nada en 30 días».
 *
 *   <Urgencias>
 *     <Urgencia nivel="a" n={3} titulo="Vencidas" detalle="Requieren acción hoy" />
 *     <Urgencia nivel="b" n={2} titulo="Esta semana" detalle="Vie 25 y sáb 26 sep" />
 *     <Urgencia nivel="c" n={4} titulo="Próximos 30 días" detalle="Hasta el 24 oct" />
 *   </Urgencias>
 */
export function Urgencia({ nivel, n, titulo, detalle }: { nivel: "a" | "b" | "c"; n: number; titulo: string; detalle?: ReactNode }) {
  const libre = n === 0;
  const { Icono, tono } = libre ? { Icono: CircleCheck, tono: "green" as Tono } : NIVELES[nivel];
  return (
    <h3 className={`k-cubo k-cubo-${nivel}`} data-h={tono}>
      <Loseta icono={Icono} tono={tono} />
      <span className={unir("k-num", libre && "cero")}>{n}</span>
      <span className="cap"><b>{titulo}</b>{detalle && <span>{detalle}</span>}</span>
    </h3>
  );
}

/** Rejilla de las tres tarjetas de urgencia (en pantallas estrechas, una debajo de otra). */
export function Urgencias({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={unir("k-urgencias", className)}>{children}</div>;
}

export type DiaTira = {
  /** Letra del día («L», «M»…) o «Hoy». */
  etiqueta: string;
  /** Número del día del mes. */
  dia: number;
  estado?: "pasado" | "hoy" | "normal";
  /** Evento rotulado debajo («Extintores»). Pinta el día en --day-mark. */
  evento?: string;
};

/**
 * Tira semanal L–D (bajo «Esta semana» en Inicio). Días pasados atenuados, hoy en
 * violeta, días con obligaciones en naranja con el evento rotulado.
 * Es decorativa (aria-hidden): la lista de debajo lleva la información.
 * Los días con evento se ensanchan (2,5fr) para que quepa el rótulo.
 * Dentro de <ListaObligaciones> pasa `comoItem` (se pinta como <li>).
 */
export function TiraSemanal({ dias, className, comoItem }: { dias: DiaTira[]; className?: string; comoItem?: boolean }) {
  const cols = dias.map((d) => (d.evento ? "2.5fr" : d.estado === "hoy" ? "1.25fr" : "1fr")).join(" ");
  const Etiqueta = comoItem ? "li" : "div";
  return (
    <Etiqueta className={unir("k-semana", className)} aria-hidden="true" style={{ gridTemplateColumns: cols }}>
      {dias.map((d, i) => (
        <span key={i} className={unir(d.estado === "pasado" && "pas", d.estado === "hoy" && "hoy", d.evento && "con")}>
          {d.etiqueta}<b>{d.dia}</b>{d.evento && <em>{d.evento}</em>}
        </span>
      ))}
    </Etiqueta>
  );
}

/**
 * Fila de obligación (listas del triaje): ficha de color por urgencia · qué · cuándo
 * (con el color de su urgencia) · copropiedad · verbo con icono a la derecha (Convocar, Renovar…).
 * Sin `accion`, la fila no lleva verbo (las de 30 días).
 * El verbo necesita un nombre accesible que contenga el texto visible:
 * accion.etiquetaAccesible = «Convocar: Asamblea ordinaria 2026 · Los Pinos».
 * Sin verbo, `href` hace que TODA la fila enlace (las de 30 días → la bitácora):
 * el título es el enlace y un ::after cubre la fila (hover y foco en la fila).
 * Úsala dentro de <ListaObligaciones>.
 */
export function FilaObligacion({ tipo, que, cuando, donde, accion, href }: {
  tipo: Extract<TipoEstado, "vencido" | "semana" | "sin" | "ok" | "pendiente">;
  que: ReactNode; cuando: ReactNode; donde?: ReactNode;
  accion?: { texto: string; href: string; etiquetaAccesible?: string };
  /** Solo sin `accion`: la fila entera enlaza aquí (ruta existente). */
  href?: string;
}) {
  const { Icono, tono } = estiloDeEstado(tipo);
  const IconoAccion = accion ? iconoDeAccion(accion.texto).Icono : null;
  return (
    <li className={unir("k-ob", !accion && "sin-accion")} data-h={tono}>
      <Loseta icono={Icono} tono={tono} />
      <span className="que">{!accion && href ? <Link className="k-ob-a" href={href}>{que}</Link> : que}</span>
      <span className="cuando">{cuando}</span>
      {donde && <span className="donde">{donde}</span>}
      {accion && IconoAccion && (
        <Link className="acc" href={accion.href} aria-label={accion.etiquetaAccesible}>
          <IconoAccion aria-hidden="true" focusable="false" /> {accion.texto}
        </Link>
      )}
    </li>
  );
}

/**
 * Lista del triaje (Inicio): <ol> de filas y, SOLO en móvil, su
 * encabezado repetido («Vencidas 3») porque las tarjetas quedan arriba como
 * sumario. `etiquetaAccesible` es el nombre de la lista («3 obligaciones vencidas»).
 * Hijos: <FilaObligacion>, <TiraSemanal comoItem> y <MasEnLista>.
 */
export function ListaObligaciones({ titulo, conteo, etiquetaAccesible, children, className }: {
  titulo: string; conteo: number;
  /** Nombre de la lista para lectores (aria-label). No se ve. */
  etiquetaAccesible: string; children: ReactNode; className?: string;
}) {
  return (
    <ol className={unir("k-obs", className)} aria-label={etiquetaAccesible}>
      <li className="k-lista-h" aria-hidden="true"><b>{titulo}</b><span>{conteo}</span></li>
      {children}
    </ol>
  );
}

/** «1 más en la bitácora →»: enlace al pie de una lista recortada (máx. 3 filas). */
export function MasEnLista({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link className="k-mas-lista" href={href}>{children} <Flecha /></Link>
    </li>
  );
}
