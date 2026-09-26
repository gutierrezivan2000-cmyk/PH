import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { unir } from "./util";

export type PasoAsistente = {
  nombre: string;
  /** Valor elegido o estado: «Los Pinos», «Sep 2026», «4 listos · 1 con error», «Opcional». */
  valor?: ReactNode;
  /** Solo pasos hechos: enlace para volver a ese paso. */
  href?: string;
  /** Pasos hechos que vuelven con un handler en vez de una ruta. */
  alVolver?: () => void;
};

/**
 * Pasos del asistente (SPEC §f.10): 1–5 numerados. Hechos con numeral --ink-3 y
 * ✓ antes del valor (son enlaces para volver); el actual en área negativa
 * (--neg-area) con marca de 6 px; los futuros con numeral hueco.
 * Retícula de 12: cada paso 2 columnas, el actual el resto. En móvil, fila de
 * celdas (1fr… 2.6fr la actual) y solo la actual muestra su nombre.
 *
 *   <Pasos actual={4} pasos={[
 *     { nombre: "Propiedad", valor: "Los Pinos", alVolver: () => ir(1) },
 *     { nombre: "Periodo", valor: "Sep 2026", alVolver: () => ir(2) },
 *     { nombre: "Documentos", valor: "Informe y acta", alVolver: () => ir(3) },
 *     { nombre: "Archivos", valor: "4 listos" },
 *     { nombre: "Notas", valor: "Opcional" },
 *   ]} />
 */
export function Pasos({ pasos, actual, etiqueta = "Pasos del asistente", className }: {
  pasos: PasoAsistente[]; /** 1-based */ actual: number; etiqueta?: string; className?: string;
}) {
  const n = pasos.length;
  const anchoActual = Math.max(2, 12 - 2 * (n - 1));
  const movil = pasos.map((_, i) => (i + 1 === actual ? "2.6fr" : "1fr")).join(" ");
  return (
    <ol className={unir("k-pasos", className)} aria-label={etiqueta} style={{ "--k-pasos-movil": movil } as CSSProperties}>
      {pasos.map((p, i) => {
        const num = i + 1;
        const estado = num < actual ? "hecho" : num === actual ? "actual" : "futuro";
        const cuerpo = (
          <>
            <b aria-hidden="true">{num}</b>
            <span>
              <span className="k-sr">Paso {num}: </span>
              {p.nombre}
              {estado === "actual" && <span className="k-sr"> (paso actual)</span>}
              {estado === "hecho" && <span className="k-sr"> (hecho)</span>}
              {p.valor && <small>{p.valor}</small>}
            </span>
          </>
        );
        return (
          <li key={i} className={unir("k-paso", estado === "hecho" && "hecho", estado === "futuro" && "futuro")}
            aria-current={estado === "actual" ? "step" : undefined}
            style={{ gridColumn: `span ${estado === "actual" ? anchoActual : 2}` }}>
            {estado === "hecho" && p.href ? (
              <Link href={p.href}>{cuerpo}</Link>
            ) : estado === "hecho" && p.alVolver ? (
              <button type="button" onClick={p.alVolver}>
                {cuerpo}
              </button>
            ) : cuerpo}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Navegación al pie del asistente: «← {anterior}» (secundario) + «Continuar a
 * {siguiente} →» (primario de 56 px). Por debajo de 1100 px, a ancho completo y
 * el primario primero. Pasa los dos <Boton> como hijos.
 */
export function NavPasos({ children }: { children: ReactNode }) {
  return <div className="k-nav-pasos">{children}</div>;
}
