"use client";

import { useEffect, useRef } from "react";

/**
 * Banner de modo demo del armazón «Índice» (dashboard). Vive aquí y no en
 * src/components/ui, que no se toca: esa carpeta la comparte /admin (IMPL §4).
 * `data-demo-banner` lo usa el índice para compactarse cuando el banner le
 * quita alto a la ventana.
 */
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

  // Aspecto «Índice»: una línea de cornisa, tinta sobre el lienzo y filete fino.
  // Rótulo en MAYÚSCULAS a 125 % (1–2 palabras) y el resto en frase normal.
  return (
    <div
      ref={ref}
      role="note"
      data-demo-banner=""
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-center"
      style={{
        minHeight: 30,
        padding: "5px var(--pad, 16px)",
        background: "var(--surface-0)",
        borderBottom: "1px solid var(--line)",
        color: "var(--ink-2)",
        fontSize: 13,
        lineHeight: 1.3,
      }}
    >
      <b
        style={{
          color: "var(--ink)",
          fontSize: 12,
          fontWeight: 800,
          fontStretch: "125%",
          letterSpacing: ".06em",
          textTransform: "uppercase",
        }}
      >
        Modo demo
      </b>
      <span>Datos simulados · documentos reales descargables</span>
    </div>
  );
}
