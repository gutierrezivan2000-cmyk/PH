"use client";

import { useTheme, type Theme } from "@/components/ThemeProvider";

const OPCIONES: { value: Theme; label: string; titulo: string }[] = [
  { value: "auto", label: "Auto", titulo: "Seguir al dispositivo" },
  { value: "light", label: "Claro", titulo: "Tema claro" },
  { value: "dark", label: "Oscuro", titulo: "Tema oscuro" },
];

/**
 * Selector de tema de tres estados. Se muestran los tres a la vez —en vez de un
 * interruptor que alterna— para que «automático» sea visible: con un interruptor
 * de dos posiciones no hay forma de volver a seguir al dispositivo.
 *
 * Aspecto «Índice» (SPEC §f.1, pie del índice): segmentado Auto / Claro / Oscuro
 * con borde de 1,5 px; el elegido en negativo (--accent / --on-accent). Las
 * palabras son el nombre accesible (el title amplía: «Seguir al dispositivo»).
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Tema de la interfaz" className="k-tema">
      {OPCIONES.map(({ value, label, titulo }) => {
        const activo = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={activo}
            title={titulo}
            onClick={() => setTheme(value)}
            style={{
              minHeight: compact ? 32 : undefined,
              background: activo ? "var(--accent)" : undefined,
              color: activo ? "var(--on-accent)" : undefined,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
