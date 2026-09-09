"use client";

import { useEffect, useRef } from "react";
import { Zap } from "lucide-react";

export function DemoBanner() {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Publica el alto real del banner en `--demo-banner-h`.
   *
   * El chat del agente ocupa el alto exacto de la ventana
   * (`100dvh - cabecera - var(--demo-banner-h)`), así que si esta cifra no
   * coincide con la realidad el cuadro de escritura se descuadra por abajo.
   * Estuvo un rato fijada a 26px, que es lo que mide en escritorio; en un
   * teléfono el texto se parte en dos líneas y pasa a medir 46px, veinte de
   * diferencia. Se mide en vez de suponerse, y se vuelve a medir al cambiar el
   * tamaño de la ventana porque el salto de línea depende del ancho.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publicar = () =>
      document.documentElement.style.setProperty(
        "--demo-banner-h",
        `${Math.round(el.getBoundingClientRect().height)}px`
      );
    publicar();
    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--demo-banner-h");
    };
  }, []);

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div
      ref={ref}
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-[11px] font-medium border-b"
      style={{
        background: "rgb(var(--legal-rgb) / 0.10)",
        borderColor: "rgb(var(--legal-rgb) / 0.30)",
        color: "var(--legal)",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      <Zap className="h-3 w-3" />
      <span>MODO DEMO · datos simulados · documentos reales descargables</span>
    </div>
  );
}
