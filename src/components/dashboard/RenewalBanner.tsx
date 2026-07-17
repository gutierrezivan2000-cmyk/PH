"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CreditCard } from "lucide-react";

type Usage = { planStatus?: string; periodEndsAt?: string | null };

const DAY = 24 * 60 * 60 * 1000;

export function RenewalBanner() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setUsage(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!usage) return null;
  const { planStatus, periodEndsAt } = usage;

  const endsSoon =
    planStatus === "active" &&
    periodEndsAt &&
    new Date(periodEndsAt).getTime() - Date.now() < 5 * DAY;

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
    iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "long" }) : "";

  const config = {
    expired: {
      color: "#ff6f6f",
      bg: "rgba(255,111,111,0.10)",
      border: "rgba(255,111,111,0.30)",
      text: "Tu plan venció. Renuévalo para seguir generando documentos.",
    },
    grace: {
      color: "#ffb958",
      bg: "rgba(255,185,88,0.10)",
      border: "rgba(255,185,88,0.30)",
      text: "Tu plan venció y estás en período de gracia. Renuévalo para no perder el acceso.",
    },
    soon: {
      color: "#ffb958",
      bg: "rgba(255,185,88,0.08)",
      border: "rgba(255,185,88,0.22)",
      text: `Tu plan se renueva el ${fmt(periodEndsAt)}. Renuévalo en Suscripción para no interrumpir el servicio.`,
    },
  }[variant];

  return (
    <div
      className="flex items-center gap-3 px-4 sm:px-6 py-2.5 border-b"
      style={{ background: config.bg, borderColor: config.border }}
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: config.color }} />
      <p className="text-[13px] flex-1 min-w-0" style={{ color: config.color }}>
        {config.text}
      </p>
      <Link
        href="/dashboard/suscripcion"
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
        style={{ background: config.color, color: "#0a0a0a" }}
      >
        <CreditCard className="h-3.5 w-3.5" />
        Renovar
      </Link>
    </div>
  );
}
