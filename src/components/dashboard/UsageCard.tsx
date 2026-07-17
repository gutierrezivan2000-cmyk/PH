"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, TrendingUp, Calendar, Sparkles } from "lucide-react";

interface UsageData {
  monthlyGenerations: number;
  dailyGenerations: number;
  monthlyTokens: number;
  monthlyCost: number;
  limits: {
    generationsPerDay: number;
    generationsPerMonth: number;
  };
  planStatus?: string;
  planName?: "pro" | "business" | "elite" | null;
  trialEndsAt?: string | null;
  periodEndsAt?: string | null;
}

function PlanStatusChip({ usage }: { usage: UsageData }) {
  const status = usage.planStatus;
  if (!status) return null;

  if (status === "trialing" && usage.trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(usage.trialEndsAt).getTime() - Date.now()) / 86400000)
    );
    const urgent = daysLeft <= 2;
    return (
      <Link
        href="/dashboard/suscripcion"
        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors"
        style={{
          background: urgent ? "rgba(255,185,88,0.10)" : "rgba(124,92,255,0.08)",
          borderColor: urgent ? "rgba(255,185,88,0.30)" : "rgba(124,92,255,0.30)",
        }}
      >
        <Sparkles className="h-3.5 w-3.5" style={{ color: urgent ? "#ffb958" : "#9a7fff" }} />
        <span
          className="text-[11px] font-medium"
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
            color: urgent ? "#ffb958" : "#9a7fff",
          }}
        >
          PRUEBA GRATIS · {daysLeft === 0 ? "TERMINA HOY" : `${daysLeft} DÍA${daysLeft === 1 ? "" : "S"}`}
        </span>
      </Link>
    );
  }

  if (status === "grace") {
    return (
      <Link
        href="/dashboard/suscripcion"
        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors"
        style={{ background: "rgba(255,185,88,0.10)", borderColor: "rgba(255,185,88,0.30)" }}
      >
        <Sparkles className="h-3.5 w-3.5" style={{ color: "#ffb958" }} />
        <span
          className="text-[11px] font-medium"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: "#ffb958" }}
        >
          PLAN VENCIDO · RENOVAR (PERÍODO DE GRACIA)
        </span>
      </Link>
    );
  }

  if (status === "trial_expired" || status === "past_due" || status === "canceled" || status === "expired") {
    const label =
      status === "trial_expired"
        ? "PRUEBA FINALIZADA · ELIGE UN PLAN"
        : status === "expired"
        ? "PLAN VENCIDO · RENOVAR"
        : "PLAN INACTIVO · REACTIVAR";
    return (
      <Link
        href="/dashboard/suscripcion"
        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors"
        style={{
          background: "rgba(255,111,111,0.10)",
          borderColor: "rgba(255,111,111,0.30)",
        }}
      >
        <Sparkles className="h-3.5 w-3.5" style={{ color: "#ff8585" }} />
        <span
          className="text-[11px] font-medium"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: "#ff8585" }}
        >
          {label}
        </span>
      </Link>
    );
  }

  return null;
}

export function UsageCard() {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((res) => res.json())
      .then(setUsage)
      .catch(console.error);
  }, []);

  if (!usage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(124,92,255,0.10)", color: "#9a7fff" }}
          >
            <Activity className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Uso del plan</h3>
        </div>
        <div className="h-24 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-[#7c5cff] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Beta testers have unrestricted access — show an unlimited state instead of
  // misleading "X / 3" bars.
  if (usage.planStatus === "beta") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(124,92,255,0.10)", color: "#9a7fff" }}
            >
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Uso del plan</h3>
              <p
                className="text-[10px] uppercase text-muted-foreground/70 mt-0.5"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
              >
                Acceso completo de prueba
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium"
            style={{
              background: "rgba(124,92,255,0.10)",
              borderColor: "rgba(124,92,255,0.40)",
              color: "#9a7fff",
              fontFamily: "var(--font-mono)",
            }}
          >
            <Sparkles className="h-3 w-3" />
            <span>BETA</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
              {usage.monthlyGenerations}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">este mes</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
              {usage.dailyGenerations}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">hoy</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm font-semibold" style={{ color: "#9a7fff" }}>Generaciones ilimitadas</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">durante la fase de prueba</p>
          </div>
        </div>
      </div>
    );
  }

  const monthlyPercent = Math.min((usage.monthlyGenerations / usage.limits.generationsPerMonth) * 100, 100);
  const dailyPercent = Math.min((usage.dailyGenerations / usage.limits.generationsPerDay) * 100, 100);
  const monthlyRemaining = usage.limits.generationsPerMonth - usage.monthlyGenerations;

  const getBarColor = (percent: number) => {
    if (percent >= 90) return "#ff6f6f";
    if (percent >= 70) return "#ffb958";
    return "#7c5cff";
  };

  const monthlyColor = getBarColor(monthlyPercent);
  const dailyColor = getBarColor(dailyPercent);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 transition-all duration-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(124,92,255,0.10)", color: "#9a7fff" }}
          >
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Uso del plan</h3>
            <p
              className="text-[10px] uppercase text-muted-foreground/70 mt-0.5"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
            >
              {monthlyRemaining > 0
                ? `${monthlyRemaining} generaciones restantes`
                : "Límite alcanzado"}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium"
          style={{
            background: "rgba(124,92,255,0.10)",
            borderColor: "rgba(124,92,255,0.40)",
            color: "#9a7fff",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span className="tabular-nums">{Math.round(monthlyPercent)}%</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Monthly */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-xs font-medium text-muted-foreground">Mensuales</span>
            </div>
            <span className="text-xs font-medium tabular-nums text-foreground" style={{ fontFamily: "var(--font-mono)" }}>
              {usage.monthlyGenerations}
              <span className="text-muted-foreground/60"> / {usage.limits.generationsPerMonth}</span>
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${monthlyPercent}%`, background: monthlyColor }}
            />
          </div>
        </div>

        {/* Daily */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-xs font-medium text-muted-foreground">Hoy</span>
            </div>
            <span className="text-xs font-medium tabular-nums text-foreground" style={{ fontFamily: "var(--font-mono)" }}>
              {usage.dailyGenerations}
              <span className="text-muted-foreground/60"> / {usage.limits.generationsPerDay}</span>
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${dailyPercent}%`, background: dailyColor }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
