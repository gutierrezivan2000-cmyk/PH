import Link from "next/link";
import type { ReactNode } from "react";
import { Estado } from "./Estado";
import { Flecha } from "./Iconos";
import { unir } from "./util";

export type AgenteId = "themis" | "chronos" | "metra" | "nomethes" | "hermes" | "logistes";

/** Trazos de los sigilos (SPEC §f.17): griego MINÚSCULA de un trazo, viewBox 60×80. */
const TRAZOS: Record<AgenteId, ReactNode> = {
  themis:   <><ellipse cx="30" cy="40" rx="16.5" ry="34.5" /><path d="M13.5 40h33" /></>,
  chronos:  <><path d="M2 20c9-6 16-3 20 6l17 38c4 9 10 12 19 9" /><path d="M50 24L13 80" /></>,
  metra:    <><path d="M12.5 80V8" /><path d="M12.5 40c0 15 7 23 17.5 23S47.5 55 47.5 40V8v48c0 7 4 10 10 8" /></>,
  nomethes: <path d="M6 10l23 64c16-17 25-38 24-64" />,
  hermes:   <path d="M50 17c-5-6-12-9-20-9-11 0-17 7-17 15 0 10 8 16 20 16h8M41 39H31c-13 0-21 7-21 17 0 11 9 17 22 17 9 0 16-3 22-10" />,
  logistes: <path d="M5 9c9-3 15 1 19 10l31 60M30 33L6 79" />,
};

/** Datos fijos de cada agente (nombre y oficio). El estado real (activo) lo decide la app. */
export const AGENTES: Record<AgenteId, { nombre: string; oficio: string; especialidad: string; femenino: boolean }> = {
  themis:   { nombre: "Themis",   oficio: "Asesora legal",        especialidad: "Asesora legal · Ley 675, actas y reglamentos", femenino: true },
  chronos:  { nombre: "Chronos",  oficio: "Plazos y calendario",  especialidad: "Plazos y calendario · vencimientos legales", femenino: false },
  metra:    { nombre: "Metra",    oficio: "Finanzas",             especialidad: "Finanzas", femenino: true },
  nomethes: { nombre: "Nomethes", oficio: "Decisiones",           especialidad: "Decisiones", femenino: false },
  hermes:   { nombre: "Hermes",   oficio: "Comunicaciones",       especialidad: "Comunicaciones", femenino: false },
  logistes: { nombre: "Logistes", oficio: "Operaciones",          especialidad: "Operaciones", femenino: false },
};

/**
 * Sigilo de agente: su letra griega en SVG (Archivo no trae griego). Sin color
 * por agente: ACTIVOS en --ai (tinta de sello), en preparación huecos en --ink-3.
 * El trazo se ajusta al tamaño: 9 (≥ 25 px), 10 (≤ 24), 11 (≤ 16).
 * Tamaños: 60 ficha · 48 carril del chat · 22 avatar de respuesta · 12–16 rótulos.
 */
export function Sigilo({ agente, activo = true, ancho = 60, className }:
  { agente: AgenteId; activo?: boolean; ancho?: number; className?: string }) {
  const trazo = ancho <= 16 ? 11 : ancho <= 24 ? 10 : 9;
  return (
    <svg viewBox="0 0 60 80" width={ancho} height={(ancho * 4) / 3} aria-hidden="true" focusable="false"
      className={unir("k-sg", !activo && "hueco", className)} style={{ strokeWidth: trazo }}>
      {TRAZOS[agente]}
    </svg>
  );
}

/**
 * Ficha de agente (SPEC §f.17): recuadro de 2 px, celda del sigilo + texto.
 * Activa: nombre 28 px, «■ Activa», especialidad, FIRMA opcional (una respuesta
 * o aviso REAL entre «…» con su fuente como nota al pie) y «Preguntar a Themis →»
 * que cubre toda la ficha. Sin firma real, pasa `sugerencias` (preguntas
 * sugeridas como botones) o nada: NUNCA inventes una cita.
 * En preparación (`activo={false}`): celda achurada, sigilo hueco, placa
 * «PRÓXIMAMENTE», sin enlace.
 *
 *   <FichaAgente agente="themis" href="/dashboard/asistente/themis" />
 *   <FichaAgente agente="metra" activo={false} />
 */
export function FichaAgente({ agente, activo = true, href, firma, sugerencias, nivel = 3, className }: {
  agente: AgenteId; activo?: boolean; href?: string;
  /** Solo datos reales: cita y fuente salen de la API del chat o de las alertas. */
  firma?: { cita: ReactNode; fuente: ReactNode };
  /** Botones de preguntas sugeridas (<BotonSugerencia>). Si hay, el enlace deja de cubrir la ficha. */
  sugerencias?: ReactNode;
  nivel?: 2 | 3;
  className?: string;
}) {
  const a = AGENTES[agente];
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <article className={unir("k-agente", !activo && "prep", className)} aria-label={a.nombre}>
      <div className="sig"><Sigilo agente={agente} activo={activo} /></div>
      <div className="txt">
        {!activo && <span className="placa">Próximamente</span>}
        <div className="top">
          <H>{a.nombre}</H>
          {activo
            ? <Estado tipo="ok" tamLetra={14}>{a.femenino ? "Activa" : "Activo"}</Estado>
            : <Estado tipo="enObra" tamLetra={14}>En preparación</Estado>}
        </div>
        <p>{activo ? a.especialidad : a.oficio}</p>
        {firma && (
          <>
            <p className="firma">«{firma.cita}»<sup>1</sup></p>
            <p className="fuente"><sup>1</sup> {firma.fuente}</p>
          </>
        )}
        {sugerencias && <div className="sugs">{sugerencias}</div>}
        {activo && href && (
          <Link className="ir" href={href}>Preguntar a {a.nombre} <Flecha /></Link>
        )}
      </div>
    </article>
  );
}

/** Pregunta sugerida (40 px, borde --line-strong). En el chat y en las fichas del Asistente. */
export function BotonSugerencia({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  if (href) return <Link className="k-sug" href={href} style={{ display: "inline-flex", alignItems: "center" }}>{children}</Link>;
  return <button type="button" className="k-sug" onClick={onClick}>{children}</button>;
}

/**
 * Franja «En preparación» (SPEC §f.18): recuadro 1,5 px --line-strong con
 * trama; dentro, placas sólidas (el texto nunca va sobre la trama).
 *
 *   <FranjaPreparacion agentes={["metra", "nomethes", "hermes", "logistes"]} />
 *   <FranjaPreparacion rotulo="Más agentes" nota="· próximamente, como complemento" agentes={[…]} />
 */
export function FranjaPreparacion({ agentes, rotulo = "En preparación", nota, className }: {
  agentes: AgenteId[]; rotulo?: string; nota?: ReactNode; className?: string;
}) {
  return (
    <div className={unir("k-prep k-achurado", className)} role="group" aria-label={rotulo}>
      <div className="lbl">{rotulo}{nota && <span>&nbsp;{nota}</span>}</div>
      {agentes.map((id) => (
        <div key={id}>
          <Sigilo agente={id} activo={false} ancho={16} />
          <b>{AGENTES[id].nombre}</b>
          <span className="of">{AGENTES[id].oficio.toLowerCase()}</span>
        </div>
      ))}
    </div>
  );
}

/** Rótulo de la IA («Themis sugiere»): 13 px/800/125 % en --ai con el sigilo de 12×16. */
export function RotuloIA({ agente = "themis", children }: { agente?: AgenteId; children: ReactNode }) {
  return (
    <p className="k-rotulo-ia"><Sigilo agente={agente} ancho={12} />{children}</p>
  );
}

/** «Themis está escribiendo…»: tres cuadros de 8 px que pulsan (estáticos con reducir movimiento). */
export function Escribiendo({ agente = "themis" }: { agente?: AgenteId }) {
  return (
    <span className="k-escribe" role="status">
      <span aria-hidden="true"><i /><i /><i /></span>
      {AGENTES[agente].nombre} está escribiendo…
    </span>
  );
}
