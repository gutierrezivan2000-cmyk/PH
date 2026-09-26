import type { CSSProperties } from "react";

/**
 * Iconografía del kit: trazo 2, remates rectos (SPEC §f.2). Todos son
 * decorativos (aria-hidden): el texto del control dice qué hace.
 */
type P = { className?: string; style?: CSSProperties };

/** Flecha de remate recto. «avanza» al final de acciones que avanzan, «crea» (+) en las que crean, «vuelve» en «← Atrás». */
export function Flecha({ tipo = "avanza", className = "k-ar", style }: P & { tipo?: "avanza" | "crea" | "vuelve" }) {
  const d = tipo === "crea" ? "M8 2v12M2 8h12" : "M2 8h11M9 4l4 4-4 4";
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}
      style={tipo === "vuelve" ? { transform: "scaleX(-1)", ...style } : style}>
      <path d={d} />
    </svg>
  );
}

/** Chevrón: «der» por defecto; «abajo» para menús y selects; «izq» para el mes anterior. */
export function Chevron({ dir = "der", className = "k-ar", style }: P & { dir?: "der" | "abajo" | "izq" | "arriba" }) {
  // «der» no fija transform en línea: así el CSS puede girarlo (select, menú «Más»).
  const rot = { der: undefined, abajo: "rotate(90deg)", izq: "scaleX(-1)", arriba: "rotate(-90deg)" }[dir];
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}
      style={rot ? { transform: rot, ...style } : style}>
      <path d="M5 3l5 5-5 5" />
    </svg>
  );
}

export function Lupa({ className = "k-ar", style }: P) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className} style={style}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export function Cruz({ className = "k-ar", style }: P) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}
