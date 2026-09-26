"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Boton, CabeceraPieza, EnObra, Pagina, Pieza } from "@/components/kit";
import { entradaIndice } from "@/components/dashboard/Sidebar";

/** Qué traerá cada pantalla pausada (texto de la placa, SPEC §g «Pausadas»), por número de entrada. */
const TRAE: Record<string, string> = {
  "05": "Cartera por unidad, intereses de mora y paz y salvos.",
  "06": "Presupuesto anual por rubro y su ejecución mes a mes.",
  "08": "Peticiones, quejas y reclamos de los residentes con su seguimiento.",
  "09": "Circulares por correo y WhatsApp a toda la copropiedad o por torre.",
  "10": "Convocatoria, quórum por coeficientes y votaciones en vivo.",
  "11": "Paz y salvos y certificados de residencia en PDF.",
};

/**
 * Reemplaza el contenido de una página pausada. Deliberadamente NO toca la
 * ruta ni sus APIs — solo lo que se renderiza — para que reactivarla más
 * adelante sea con retirar un `if` en la página, no reconstruir nada.
 *
 * Aspecto «Índice» (SPEC §f.18): el lienzo del contenido entero achurado, como
 * la fase sin construir de un plano, y una placa sólida con «NN Nombre ·
 * próximamente», «Esta sección está en obra.» y lo que traerá. La única acción
 * lleva a una ruta que existe (no hay flujo de «Avisarme»).
 * `icon` se conserva en la firma por compatibilidad; el diseño no usa iconos.
 */
export function ComingSoon({
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  const pathname = usePathname();
  const nn = entradaIndice(pathname)?.n ?? "—";

  return (
    <Pagina>
      <Pieza>
        <CabeceraPieza nn={nn} titulo={title} />
        <EnObra
          nn={nn}
          nombre={title}
          trae={TRAE[nn] ?? description}
          minAlto="max(300px, calc(100dvh - var(--cab-h) - var(--demo-banner-h, 0px) - var(--topbar-h, 0px) - 260px))"
          accion={
            <Boton variante="secundario" href="/dashboard" flecha="vuelve">
              Volver al inicio
            </Boton>
          }
        />
      </Pieza>
    </Pagina>
  );
}
