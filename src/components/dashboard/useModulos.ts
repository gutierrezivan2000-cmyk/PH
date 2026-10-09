"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { MODULOS_PAUSADOS, moduloVisible, type ComingSoonKey } from "@/lib/feature-flags";

type Mapa = Partial<Record<ComingSoonKey, boolean>>;
let pedido: Promise<Mapa> | null = null;

function cargar(): Promise<Mapa> {
  pedido ??= fetch("/api/modulos")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.modulos ?? {}) as Mapa)
    .catch(() => ({} as Mapa));
  return pedido;
}

/**
 * Qué módulos en lanzamiento gradual ve esta sesión. Mientras el servidor responde se usa el rol (los admins ven todo al
 * instante); después manda el servidor, que además conoce la lista `PILOTO_EMAILS`.
 */
export function useModulos(): { visible: (clave: ComingSoonKey) => boolean; listo: boolean } {
  const { data: session } = useSession();
  const [servidor, setServidor] = useState<Mapa | null>(null);
  useEffect(() => {
    let activo = true;
    cargar().then((m) => activo && setServidor(m));
    return () => {
      activo = false;
    };
  }, []);
  const role = session?.user?.role;
  return {
    listo: servidor !== null,
    visible: (clave) => (servidor ? Boolean(servidor[clave]) : moduloVisible(clave, { role })),
  };
}

export { MODULOS_PAUSADOS };
