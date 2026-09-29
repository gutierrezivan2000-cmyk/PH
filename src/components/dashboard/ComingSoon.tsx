"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Boton, CabeceraPieza, EnObra, Pagina, Pieza, moduloDe } from "@/components/kit";

/**
 * Reemplaza el contenido de una página pausada. Deliberadamente NO toca la
 * ruta ni sus APIs — solo lo que se renderiza — para que reactivarla más
 * adelante sea con retirar un `if` en la página, no reconstruir nada.
 *
 * Aspecto «Guía»: la cabecera de la función (su icono y su color), una tarjeta
 * «Próximamente» sobre una trama suave, «Estamos construyendo esta sección.» y
 * lo que traerá. Ese texto es la `description` de cada página, escrita por
 * producto y fiel al código pausado (no se prometen funciones que no existen).
 * La única acción lleva a una ruta que existe (no hay flujo de «Avisarme»).
 * `icon` se conserva en la firma por compatibilidad: el icono sale del registro de funciones.
 */
export function ComingSoon({
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  const modulo = moduloDe(usePathname());

  return (
    <Pagina>
      <Pieza>
        <CabeceraPieza titulo={title} subtitulo="Esta función llegará pronto." />
        <EnObra
          nombre={title}
          icono={modulo?.icono}
          tono={modulo?.tono}
          trae={description}
          minAlto="max(300px, calc(100dvh - var(--cab-h) - var(--demo-banner-h, 0px) - var(--topbar-h, 0px) - 300px))"
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
