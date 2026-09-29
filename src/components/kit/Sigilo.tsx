import { AlarmClock, Compass, Coins, MessageCircle, Scale, Send, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Estado } from "./Estado";
import type { Tono } from "./modulos";
import { unir } from "./util";

export type AgenteId = "themis" | "chronos" | "metra" | "nomethes" | "hermes" | "logistes";

/**
 * Datos fijos de cada agente: nombre, oficio y su icono + color (siempre los mismos).
 * El estado real (activo) lo decide la app.
 * Themis ⚖ violeta · Chronos ⏰ azul · Metra 🪙 verde · Nomethes 🧭 ámbar · Hermes ✈ rosa · Logistes 🔧 verde azulado.
 */
export const AGENTES: Record<AgenteId, { nombre: string; oficio: string; especialidad: string; femenino: boolean; icono: LucideIcon; tono: Tono }> = {
  themis:   { nombre: "Themis",   oficio: "Asesora legal",        especialidad: "Asesora legal · Ley 675, actas y reglamentos", femenino: true, icono: Scale, tono: "violet" },
  chronos:  { nombre: "Chronos",  oficio: "Plazos y calendario",  especialidad: "Plazos y calendario · vencimientos legales", femenino: false, icono: AlarmClock, tono: "blue" },
  metra:    { nombre: "Metra",    oficio: "Finanzas",             especialidad: "Finanzas", femenino: true, icono: Coins, tono: "green" },
  nomethes: { nombre: "Nomethes", oficio: "Decisiones",           especialidad: "Decisiones", femenino: false, icono: Compass, tono: "amber" },
  hermes:   { nombre: "Hermes",   oficio: "Comunicaciones",       especialidad: "Comunicaciones", femenino: false, icono: Send, tono: "pink" },
  logistes: { nombre: "Logistes", oficio: "Operaciones",          especialidad: "Operaciones", femenino: false, icono: Wrench, tono: "teal" },
};

/**
 * Avatar de agente: ficha de color con su icono (60 px por defecto; el CSS de cada contexto
 * lo ajusta). Con `ancho` ≤ 24 se pinta solo el icono coloreado (rótulos y chips).
 * En preparación (`activo={false}`): tono apagado.
 */
export function Sigilo({ agente, activo = true, ancho, className }:
  { agente: AgenteId; activo?: boolean; ancho?: number; className?: string }) {
  const { icono: Icono, tono } = AGENTES[agente];
  const solo = ancho !== undefined && ancho <= 24;
  return (
    <span aria-hidden="true" data-h={tono}
      className={unir("k-sg", solo ? "solo" : "k-tile ico", !activo && "hueco", className)}
      style={ancho !== undefined ? ({ "--t": `${ancho}px` } as CSSProperties) : undefined}>
      <Icono strokeWidth={solo ? 2.4 : 2.1} focusable="false" aria-hidden="true" />
    </span>
  );
}

/**
 * Ficha de agente: tarjeta con el avatar de color del agente + texto.
 * Activa: nombre 27 px, «✓ Activa», especialidad, FIRMA opcional (una respuesta
 * o aviso REAL entre «…» con su fuente como nota al pie) y «Preguntar a Themis»
 * que cubre toda la ficha. Sin firma real, pasa `sugerencias` (preguntas
 * sugeridas como botones) o nada: NUNCA inventes una cita.
 * En preparación (`activo={false}`): tarjeta punteada, avatar apagado,
 * etiqueta «Próximamente», sin enlace.
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
    <article className={unir("k-agente", !activo && "prep", className)} data-h={a.tono} aria-label={a.nombre}>
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
          <Link className="ir" href={href}><MessageCircle aria-hidden="true" focusable="false" />Preguntar a {a.nombre}</Link>
        )}
      </div>
    </article>
  );
}

/** Pregunta sugerida (píldora de 42 px con borde del color del agente). En el chat y en las fichas del Asistente. */
export function BotonSugerencia({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  if (href) return <Link className="k-sug" href={href} style={{ display: "inline-flex", alignItems: "center" }}>{children}</Link>;
  return <button type="button" className="k-sug" onClick={onClick}>{children}</button>;
}

/**
 * Franja «En preparación»: recuadro punteado con trama suave; dentro, píldoras
 * sólidas con el icono de cada agente (el texto nunca va sobre la trama).
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
        <div key={id} data-h={AGENTES[id].tono}>
          <Sigilo agente={id} activo={false} ancho={20} />
          <b>{AGENTES[id].nombre}</b>
          <span className="of">{AGENTES[id].oficio.toLowerCase()}</span>
        </div>
      ))}
    </div>
  );
}

/** Rótulo de la IA («Themis sugiere»): texto en el color de la IA con el icono del agente. */
export function RotuloIA({ agente = "themis", children }: { agente?: AgenteId; children: ReactNode }) {
  return (
    <p className="k-rotulo-ia"><Sigilo agente={agente} ancho={18} />{children}</p>
  );
}

/** «Themis está escribiendo…»: tres puntos que pulsan (quietos con reducir movimiento). */
export function Escribiendo({ agente = "themis" }: { agente?: AgenteId }) {
  return (
    <span className="k-escribe" role="status">
      <span aria-hidden="true"><i /><i /><i /></span>
      {AGENTES[agente].nombre} está escribiendo…
    </span>
  );
}
