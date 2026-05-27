"use client";

import { createContext, useContext, useEffect } from "react";

type Theme = "light" | "dark" | "auto";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
}

// Dark-only for now. The context API shape is preserved so a future light mode
// can be reintroduced without touching consumers.
const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  setTheme: () => {},
  resolved: "dark",
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("dark");
    el.style.colorScheme = "dark";
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", setTheme: () => {}, resolved: "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}
