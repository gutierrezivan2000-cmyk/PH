"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Minus, Shield, Zap } from "lucide-react";
import Script from "next/script";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

declare global {
  interface Window {
    ePayco?: {
      checkout: {
        configure: (config: { key: string; test: boolean }) => {
          open: (data: Record<string, string>) => void;
        };
      };
    };
  }
}

// Mono label helper style
const monoLabel = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
};

// Add-on agent data
const ADDON_AGENTS = [
  { id: "metra",    monogram: "M", color: "#4cd6a0", name: "Metra",    role: "Analista Financiera" },
  { id: "nomethes", monogram: "N", color: "#ffb958", name: "Nomethes", role: "Consultor de Decisiones" },
  { id: "hermes",   monogram: "H", color: "#ff6fa8", name: "Hermes",   role: "Redactor de Comunicaciones" },
  { id: "logistes", monogram: "L", color: "#8a92ff", name: "Logistes", role: "Coordinador Operativo" },
];

export default function SuscripcionPage() {
  const [loading, setLoading] = useState(false);
  const [epaycoReady, setEpaycoReady] = useState(false);
  const [error, setError] = useState("");

  const handleSubscribe = useCallback(async (planType: "pro" | "elite") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/epayco/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planType }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.error) {
        setError(data.error);
        return;
      }

      if (!data.checkoutConfig || !data.publicKey) {
        setError("Error de configuracion. Intenta de nuevo.");
        return;
      }

      if (!window.ePayco) {
        setError("El modulo de pago aun no ha cargado. Intenta en unos segundos.");
        return;
      }

      const handler = window.ePayco.checkout.configure({
        key: data.publicKey,
        test: data.isTest,
      });

      handler.open(data.checkoutConfig);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      {!IS_DEMO && (
        <Script
          src="https://checkout.epayco.co/checkout.js"
          onLoad={() => setEpaycoReady(true)}
          strategy="afterInteractive"
        />
      )}

      <Header title="Suscripcion" subtitle="Gestiona tu plan y uso" />

      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto space-y-8">
        <UsageCard />

        {error && (
          <div
            className="px-4 py-3 rounded-2xl text-sm"
            style={{
              background: "rgba(255,111,111,0.08)",
              border: "1px solid rgba(255,111,111,0.20)",
              color: "#ff6f6f",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Pricing Grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">

          {/* ── Column 1: Plan Profesional ───────────────────────────── */}
          <div
            className="rounded-2xl flex flex-col"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              padding: "28px 24px",
            }}
          >
            {/* Eyebrow + chip row */}
            <div className="flex items-start justify-between mb-5">
              <p style={{ ...monoLabel, color: "var(--muted-foreground)" }}>Plan profesional</p>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  letterSpacing: "0.08em",
                  background: "rgba(95,180,255,0.12)",
                  color: "#5fb4ff",
                  border: "1px solid rgba(95,180,255,0.25)",
                  whiteSpace: "nowrap",
                }}
              >
                Trial 7 días
              </span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-1 mb-2">
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: "var(--muted-foreground)",
                  textTransform: "uppercase",
                  alignSelf: "flex-start",
                  marginTop: 14,
                  marginRight: 1,
                }}
              >
                USD
              </span>
              <span
                style={{
                  fontFamily: "'Geist', sans-serif",
                  fontSize: 54,
                  fontWeight: 400,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  color: "var(--foreground)",
                }}
              >
                20
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: "var(--muted-foreground)",
                  alignSelf: "flex-end",
                  marginBottom: 6,
                }}
              >
                /mes
              </span>
            </div>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
              Hasta 3 propiedades
            </p>

            {IS_DEMO && (
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold mb-4" style={{ background: "rgba(255,185,88,0.10)", color: "#ffb958", border: "1px solid rgba(255,185,88,0.20)" }}>
                <Zap className="h-3 w-3" /> Demo activo
              </div>
            )}

            {/* Features */}
            <ul className="space-y-3 mb-8 flex-1">
              {[
                "Hasta 3 propiedades",
                "15 generaciones / mes (3/día)",
                "Themis + Chronos incluidos",
                "Soporte chat in-app",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(124,92,255,0.15)" }}
                  >
                    <Check className="h-2.5 w-2.5" style={{ color: "#7c5cff" }} />
                  </div>
                  {f}
                </li>
              ))}
              {/* Off item */}
              <li className="flex items-center gap-2.5 text-sm" style={{ color: "var(--muted-foreground)", opacity: 0.55 }}>
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <Minus className="h-2.5 w-2.5" />
                </div>
                Generación en lote
              </li>
            </ul>

            {/* CTA */}
            {IS_DEMO ? (
              <div
                className="rounded-xl p-3 text-center"
                style={{ background: "rgba(255,185,88,0.08)", border: "1px solid rgba(255,185,88,0.15)" }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Shield className="h-4 w-4" style={{ color: "#ffb958" }} />
                  <p className="text-sm font-semibold" style={{ color: "#ffb958" }}>Demo activo</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleSubscribe("pro")}
                disabled={loading || !epaycoReady}
                className="w-full h-11 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  background: "transparent",
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Procesando..." : "Empezar gratis"}
              </button>
            )}
          </div>

          {/* ── Column 2: Plan Elite (highlighted) ──────────────────── */}
          <div
            className="rounded-2xl flex flex-col relative overflow-hidden"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(124,92,255,0.20) 0%, #15151a 65%)",
              border: "1px solid rgba(124,92,255,0.40)",
              padding: "28px 24px",
              boxShadow: "0 0 0 1px rgba(124,92,255,0.15), 0 8px 40px rgba(124,92,255,0.20)",
            }}
          >
            {/* Glow orb */}
            <div
              className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full blur-3xl"
              style={{ background: "rgba(124,92,255,0.25)" }}
            />

            {/* Ribbon */}
            <div className="absolute top-0 right-0">
              <div
                className="text-[9px] font-semibold px-3 py-1 rounded-bl-xl"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  letterSpacing: "0.08em",
                  background: "rgba(124,92,255,0.35)",
                  color: "#c4b0ff",
                  border: "1px solid rgba(124,92,255,0.40)",
                  borderTopWidth: 0,
                  borderRightWidth: 0,
                }}
              >
                recomendado para 4+ propiedades
              </div>
            </div>

            {/* Eyebrow + chip row */}
            <div className="flex items-start justify-between mb-5 mt-2">
              <p style={{ ...monoLabel, color: "#9a7fff" }}>Plan elite</p>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  letterSpacing: "0.08em",
                  background: "rgba(124,92,255,0.20)",
                  color: "#a78bff",
                  border: "1px solid rgba(124,92,255,0.35)",
                  whiteSpace: "nowrap",
                }}
              >
                +10 docs/día
              </span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-1 mb-2 relative">
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: "rgba(167,139,255,0.70)",
                  textTransform: "uppercase",
                  alignSelf: "flex-start",
                  marginTop: 14,
                  marginRight: 1,
                }}
              >
                USD
              </span>
              <span
                style={{
                  fontFamily: "'Geist', sans-serif",
                  fontSize: 54,
                  fontWeight: 400,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  background: "linear-gradient(135deg, #ffffff 30%, #a78bff 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                200
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: "rgba(167,139,255,0.70)",
                  alignSelf: "flex-end",
                  marginBottom: 6,
                }}
              >
                /mes
              </span>
            </div>
            <p className="text-sm mb-6" style={{ color: "rgba(246,245,247,0.55)" }}>
              Propiedades ilimitadas
            </p>

            {IS_DEMO && (
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold mb-4" style={{ background: "rgba(255,185,88,0.10)", color: "#ffb958", border: "1px solid rgba(255,185,88,0.20)" }}>
                <Zap className="h-3 w-3" /> Demo activo
              </div>
            )}

            {/* Features */}
            <ul className="space-y-3 mb-8 flex-1 relative">
              {[
                ["Propiedades ilimitadas", true],
                ["50 generaciones / mes (10/día)", false],
                ["Themis + Chronos incluidos", false],
                ["Generación en lote", false],
                ["Soporte prioritario · WhatsApp directo", false],
              ].map(([f, bold]) => (
                <li key={f as string} className="flex items-center gap-2.5 text-sm text-foreground">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(124,92,255,0.25)" }}
                  >
                    <Check className="h-2.5 w-2.5" style={{ color: "#a78bff" }} />
                  </div>
                  <span style={bold ? { fontWeight: 700 } : undefined}>{f as string}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            {IS_DEMO ? (
              <div
                className="rounded-xl p-3 text-center relative"
                style={{ background: "rgba(255,185,88,0.08)", border: "1px solid rgba(255,185,88,0.15)" }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Shield className="h-4 w-4" style={{ color: "#ffb958" }} />
                  <p className="text-sm font-semibold" style={{ color: "#ffb958" }}>Demo activo</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleSubscribe("elite")}
                disabled={loading || !epaycoReady}
                className="relative w-full h-11 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: "#7c5cff",
                  boxShadow: "0 4px 20px rgba(124,92,255,0.45)",
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Procesando..." : "Subir a Elite"}
              </button>
            )}
          </div>

          {/* ── Column 3: Add-ons ───────────────────────────────────── */}
          <div
            className="rounded-2xl flex flex-col"
            style={{
              background: "repeating-linear-gradient(135deg, transparent 0px, transparent 12px, rgba(124,92,255,0.025) 12px, rgba(124,92,255,0.025) 13px), var(--card)",
              border: "1px solid var(--border)",
              padding: "28px 24px",
            }}
          >
            {/* Eyebrow */}
            <p style={{ ...monoLabel, color: "var(--muted-foreground)" }} className="mb-6">
              Add-ons · $5/mes c/u
            </p>

            {/* Agent list */}
            <ul className="space-y-4 flex-1">
              {ADDON_AGENTS.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  {/* Monogram */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                    style={{ background: a.color }}
                  >
                    {a.monogram}
                  </div>
                  {/* Name + role */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-foreground leading-none">{a.name}</p>
                    <p
                      className="mt-0.5 leading-none"
                      style={{ ...monoLabel, fontSize: 9, color: "var(--muted-foreground)" }}
                    >
                      {a.role}
                    </p>
                  </div>
                  {/* Price */}
                  <span
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#a78bff",
                      letterSpacing: "0.04em",
                      flexShrink: 0,
                    }}
                  >
                    +$5
                  </span>
                </li>
              ))}
            </ul>

            {/* Bundle chip */}
            <div className="flex justify-end mt-8">
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  background: "rgba(124,92,255,0.15)",
                  color: "#a78bff",
                  border: "1px solid rgba(124,92,255,0.30)",
                }}
              >
                Paquete 4 agentes · USD 15/mes · −25%
              </span>
            </div>
          </div>

        </div>

        <p
          className="text-xs text-center"
          style={{ color: "var(--muted-foreground)", opacity: 0.65 }}
        >
          Pago seguro procesado por ePayco. Acepta tarjetas de crédito, débito, PSE y más.
        </p>
      </div>
    </div>
  );
}
