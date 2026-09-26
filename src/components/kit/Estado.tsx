import type { ReactNode } from "react";
import { unir } from "./util";

/**
 * Tipos de estado (SPEC §f.8): SIEMPRE forma + color + palabra.
 * ok ■ verde (hecho, activo, listo, subido) · pendiente □ (pendiente, falta, en espera)
 * · falta □ ámbar (falta un dato: sin correo) · vencido ■ naranja (vencido, error)
 * · enCurso ◧ (en curso, procesando) · sin □ tenue (sin enlace, inactivo)
 * · enObra ▨ achurado (en obra, próximamente) · semana ■ gris (obligación de esta semana).
 */
export type TipoEstado = "ok" | "pendiente" | "falta" | "vencido" | "enCurso" | "sin" | "enObra" | "semana";

const CUADRO: Record<TipoEstado, string> = {
  ok: "ok", pendiente: "pend", falta: "warn", vencido: "venc", enCurso: "curso", sin: "sin", enObra: "trama", semana: "semana",
};
const TINTA: Record<TipoEstado, string> = {
  ok: "var(--ok-text)", pendiente: "var(--ink-2)", falta: "var(--warn-text)", vencido: "var(--danger-text)",
  enCurso: "var(--ink)", sin: "var(--ink-2)", enObra: "var(--ink-3)", semana: "var(--ink-2)",
};

/** Solo el cuadro de 10 px (decorativo). Úsalo cuando la palabra ya está al lado. */
export function Cuadro({ tipo, className }: { tipo: TipoEstado; className?: string }) {
  return <i aria-hidden="true" className={unir("k-cuadro", CUADRO[tipo], className)} />;
}

/**
 * Estado = cuadro + palabra (15 px/600).
 *   <Estado tipo="ok">Activo</Estado>  <Estado tipo="falta">Sin correo</Estado>  <Estado tipo="vencido">Error</Estado>
 * `neutro`: la palabra en --ink (matrices densas); el cuadro conserva su color.
 * `tam={14}` para celdas y listas compactas.
 */
export function Estado({ tipo, children, neutro, tam, className }:
  { tipo: TipoEstado; children: ReactNode; neutro?: boolean; tam?: 14 | 15 | 16; className?: string }) {
  return (
    <span className={unir("k-estado", className)} style={{ color: neutro ? "var(--ink)" : TINTA[tipo], fontSize: tam }}>
      <Cuadro tipo={tipo} />
      {children}
    </span>
  );
}

/**
 * Insignia = un número en un cuadro (nunca una pastilla). `alerta` = conteo de
 * vencidas (naranja). `unidad` va en texto solo para lectores de pantalla.
 *   <Insignia alerta unidad="vencidas">3</Insignia>
 */
export function Insignia({ children, alerta, unidad, className }:
  { children: ReactNode; alerta?: boolean; unidad?: string; className?: string }) {
  return (
    <span className={unir("k-bdg", alerta && "alerta", className)}>
      {children}
      {unidad && <span className="k-sr"> {unidad}</span>}
    </span>
  );
}

/** Categoría como PALABRA (14 px, --ink-2): legal, póliza, mantenimiento, SG-SST… Sin color ni forma propia. */
export function Categoria({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={unir("k-cat", className)}>{children}</span>;
}

/** Tipo de archivo/documento en mono con borde: XLS, PDF, DOC, INF, ACTA, PRES. */
export function TipoArchivo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={unir("k-tipo", className)}>{children}</span>;
}
