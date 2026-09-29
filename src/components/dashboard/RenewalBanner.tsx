"use client";

import { useEffect, useState } from "react";
import { Aviso } from "@/components/kit";

type Usage = { planStatus?: string; periodEndsAt?: string | null; /** Momento de la lectura (Date.now fuera del render). */ leidoEn: number };

const DAY = 24 * 60 * 60 * 1000;

/**
 * Aviso de renovación: aviso EN LÍNEA rojo si el plan ya venció, azul si está por
 * renovarse, y la acción «Renovar». Mismas condiciones y textos de siempre.
 */
export function RenewalBanner() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && d && setUsage({ ...d, leidoEn: Date.now() }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!usage) return null;
  const { planStatus, periodEndsAt, leidoEn } = usage;

  const endsSoon =
    planStatus === "active" &&
    periodEndsAt &&
    new Date(periodEndsAt).getTime() - leidoEn < 5 * DAY;

  const variant =
    planStatus === "expired"
      ? "expired"
      : planStatus === "grace"
      ? "grace"
      : endsSoon
      ? "soon"
      : null;
  if (!variant) return null;

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long" }) : "";

  const config = {
    expired: {
      tipo: "error" as const,
      titulo: "Tu plan venció.",
      texto: "Renuévalo para seguir generando documentos.",
    },
    grace: {
      tipo: "error" as const,
      titulo: "Tu plan venció y estás en período de gracia.",
      texto: "Renuévalo para no perder el acceso.",
    },
    soon: {
      tipo: "info" as const,
      titulo: `Tu plan se renueva el ${fmt(periodEndsAt)}.`,
      texto: "Renuévalo en Suscripción para no interrumpir el servicio.",
    },
  }[variant];

  return (
    <div style={{ padding: "12px var(--pad) 0" }}>
      <Aviso
        enLinea
        rol={null}
        tipo={config.tipo}
        titulo={config.titulo}
        texto={config.texto}
        accion={{ etiqueta: "Renovar", href: "/dashboard/suscripcion" }}
      />
    </div>
  );
}
