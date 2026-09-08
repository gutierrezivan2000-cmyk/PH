"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/components/ThemeProvider";

const OPCIONES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "auto", label: "Seguir al dispositivo", Icon: Monitor },
  { value: "light", label: "Tema claro", Icon: Sun },
  { value: "dark", label: "Tema oscuro", Icon: Moon },
];

/**
 * Selector de tema de tres estados. Se muestran los tres a la vez —en vez de un
 * interruptor que alterna— para que «automático» sea visible: con un interruptor
 * de dos posiciones no hay forma de volver a seguir al dispositivo.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className="inline-flex items-center gap-0.5 rounded-full p-0.5"
      style={{
        background: "rgb(var(--veil-rgb) / 0.06)",
        border: "1px solid rgb(var(--veil-rgb) / 0.12)",
      }}
    >
      {OPCIONES.map(({ value, label, Icon }) => {
        const activo = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={activo}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              compact ? "h-6 w-6" : "h-7 w-7"
            }`}
            style={{
              background: activo ? "rgb(var(--accent-rgb) / 0.18)" : "transparent",
              color: activo ? "var(--accent-text)" : "var(--ink-3)",
            }}
          >
            <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          </button>
        );
      })}
    </div>
  );
}
