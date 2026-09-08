"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "auto";
export type Resolved = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: Resolved;
}

/** Clave en localStorage. La comparte el script anti-parpadeo de layout.tsx. */
export const THEME_KEY = "sophia-theme";

/**
 * Modo por defecto: seguir al dispositivo. Cuando el dispositivo no pide claro
 * —o no dice nada— se sirve OSCURO, que es la identidad de la app.
 * Para que el oscuro sea el predeterminado incluso en dispositivos en claro,
 * basta cambiar esta constante a "dark".
 */
export const DEFAULT_THEME: Theme = "auto";

const ThemeContext = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  resolved: "dark",
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** Solo el claro se detecta: cualquier otra cosa (incluido «sin preferencia») cae a oscuro. */
function deviceIsLight(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function resolveTheme(theme: Theme): Resolved {
  if (theme === "auto") return deviceIsLight() ? "light" : "dark";
  return theme;
}

/**
 * Aplica el tema al documento. Escribe TRES cosas porque el proyecto usa tres
 * mecanismos de color a la vez: `data-theme` para los tokens propios, la clase
 * `dark` para las variantes `dark:` de Tailwind y la paleta de shadcn, y
 * `color-scheme` para que los controles nativos (scrollbars, selects, fechas)
 * dejen de pintarse oscuros sobre un fondo claro.
 */
export function applyTheme(resolved: Resolved) {
  const el = document.documentElement;
  el.dataset.theme = resolved;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
}

function readStored(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    // localStorage puede fallar (modo privado, cookies bloqueadas).
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // El primer render debe coincidir con lo que ya pintó el script del <head>,
  // que corre antes y no puede leerse desde aquí sin provocar un desajuste de
  // hidratación: se arranca con el valor por defecto y se sincroniza al montar.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [resolved, setResolved] = useState<Resolved>("dark");

  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    const r = resolveTheme(stored);
    setResolved(r);
    applyTheme(r);
  }, []);

  // En modo automático hay que seguir al dispositivo mientras la pestaña vive:
  // el usuario puede cambiar el tema del sistema sin recargar.
  useEffect(() => {
    if (theme !== "auto" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r: Resolved = mq.matches ? "light" : "dark";
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // Sin almacenamiento el tema dura lo que la pestaña.
    }
    const r = resolveTheme(t);
    setResolved(r);
    applyTheme(r);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>{children}</ThemeContext.Provider>
  );
}
