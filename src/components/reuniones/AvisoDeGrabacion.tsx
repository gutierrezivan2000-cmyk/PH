"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Aviso } from "@/components/kit";
import { grabacionAAvisar, rutaDeLaGrabadora, type GrabacionActiva } from "@/lib/meetings/aviso-grabacion";
import { formatearReloj } from "@/lib/meetings/tipos";
import { grabacionesEnCurso } from "./useGrabadora";

/**
 * Mientras esta pestaña graba una reunión y la persona está en otra pantalla, un aviso en la parte de arriba dice cuánto lleva y
 * la lleva de vuelta. La grabación no se corta al navegar (el motor vive en la pestaña), pero sin esto se olvida que sigue.
 */
export function AvisoDeGrabacion() {
  const pathname = usePathname();
  const [activas, setActivas] = useState<GrabacionActiva[]>([]);
  useEffect(() => {
    const leer = () =>
      setActivas((prev) => {
        const ahora = grabacionesEnCurso();
        // Sin grabaciones no se vuelve a pintar nada cada segundo.
        return ahora.length === 0 && prev.length === 0 ? prev : ahora;
      });
    leer();
    const t = setInterval(leer, 1000);
    return () => clearInterval(t);
  }, []);

  const g = grabacionAAvisar(activas, pathname);
  if (!g) return null;
  return (
    <Aviso
      enLinea
      tipo="aviso"
      titulo="Estás grabando una reunión."
      texto={`Lleva ${formatearReloj(g.transcurridoMs)}. La grabación sigue aunque estés en otra pantalla.`}
      accion={{ etiqueta: "Volver a la grabación", href: rutaDeLaGrabadora(g.meetingId) }}
    />
  );
}
