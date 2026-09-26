import Link from "next/link";
import type { ReactNode } from "react";
import { Cuadro, type TipoEstado } from "./Estado";
import { Flecha } from "./Iconos";
import { unir } from "./util";

/**
 * Escala de urgencia de Inicio (SPEC §f.6, §i.4). EL TAMAÑO DEL NUMERAL
 * CODIFICA LA URGENCIA: a = vencidas (264 px, --signal) · b = esta semana
 * (184 px) · c = próximos 30 días (118 px). SOLO en Inicio 01.1.
 * Con n = 0 el numeral pasa a --ink-4; usa las leyendas «Nada vencido»,
 * «Semana libre», «Nada en 30 días».
 *
 *   <Urgencias>
 *     <Urgencia nivel="a" n={3} titulo="Vencidas" detalle="Requieren acción hoy" />
 *     <Urgencia nivel="b" n={2} titulo="Esta semana" detalle="Vie 25 y sáb 26 sep" />
 *     <Urgencia nivel="c" n={4} titulo="Próximos 30 días" detalle="Hasta el 24 oct" />
 *   </Urgencias>
 */
export function Urgencia({ nivel, n, titulo, detalle }: { nivel: "a" | "b" | "c"; n: number; titulo: string; detalle?: ReactNode }) {
  return (
    <h3 className={`k-cubo k-cubo-${nivel}`}>
      <span className={unir("k-num", n === 0 && "cero")}>{n}</span>
      <span className="cap"><b>{titulo}</b>{detalle && <span>{detalle}</span>}</span>
    </h3>
  );
}

/** Rejilla de los tres cubos: columnas 5 + 4 + 3 (en móvil, 1,3fr · 1fr · 0,8fr en una fila). */
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
 * Tira semanal L–D (bajo «Esta semana» en Inicio). Pasados en --ink-3, hoy con
 * recuadro --signal, días con obligaciones en --day-mark con el evento rotulado.
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
 * Fila de obligación (listas del triaje): cuadro · título 18/650 · cuándo 15/600
 * · copropiedad 14 · verbo específico subrayado a la derecha (Convocar, Renovar…).
 * Sin `accion`, la fila no lleva verbo (las de 30 días).
 * El verbo necesita un nombre accesible que contenga el texto visible:
 * accion.etiquetaAccesible = «Convocar: Asamblea ordinaria 2026 · Los Pinos».
 * Úsala dentro de <ol className="k-obs">.
 */
export function FilaObligacion({ tipo, que, cuando, donde, accion }: {
  tipo: Extract<TipoEstado, "vencido" | "semana" | "sin" | "ok" | "pendiente">;
  que: ReactNode; cuando: ReactNode; donde?: ReactNode;
  accion?: { texto: string; href: string; etiquetaAccesible?: string };
}) {
  return (
    <li className={unir("k-ob", !accion && "sin-accion")}>
      <Cuadro tipo={tipo} />
      <span className="que">{que}</span>
      <span className="cuando">{cuando}</span>
      {donde && <span className="donde">{donde}</span>}
      {accion && (
        <Link className="acc" href={accion.href} aria-label={accion.etiquetaAccesible}>
          {accion.texto} <Flecha />
        </Link>
      )}
    </li>
  );
}

/**
 * Lista del triaje (Inicio): <ol> con filete de 2 px y, SOLO en móvil, su
 * encabezado repetido («Vencidas 3») porque los numerales quedan arriba como
 * sumario. `etiqueta` es el nombre accesible («3 obligaciones vencidas»).
 * Hijos: <FilaObligacion>, <TiraSemanal> envuelta en <li> y un <li> con <MasEnLista>.
 */
export function ListaObligaciones({ titulo, conteo, etiqueta, children, className }: {
  titulo: string; conteo: number; etiqueta: string; children: ReactNode; className?: string;
}) {
  return (
    <ol className={unir("k-obs", className)} aria-label={etiqueta}>
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
