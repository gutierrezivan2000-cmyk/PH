"use client";

import { useState, useCallback, useEffect } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Check, Loader2, Shield, Zap } from "lucide-react";
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

const monoLabel = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
};

type PlanId = "pro" | "business" | "elite";

const PLAN_CARDS: {
  id: PlanId;
  label: string;
  priceCop: string;
  usd: string;
  tagline: string;
  chip: string;
  cta: string;
  featured: boolean;
  ribbon?: string;
  features: string[];
}[] = [
  {
    id: "pro",
    label: "Plan Pro",
    priceCop: "99.900",
    usd: "≈ USD 24",
    tagline: "Para empezar",
    chip: "Trial 7 días",
    cta: "Empezar gratis",
    featured: false,
    features: [
      "Hasta 3 propiedades",
      "15 generaciones / mes (3/día)",
      "Themis + Chronos incluidos",
      "Soporte por chat",
    ],
  },
  {
    id: "business",
    label: "Plan Business",
    priceCop: "299.900",
    usd: "≈ USD 73",
    tagline: "Para administradores en crecimiento",
    chip: "Más elegido",
    cta: "Subir a Business",
    featured: true,
    ribbon: "recomendado · 4 a 10 propiedades",
    features: [
      "Hasta 10 propiedades",
      "40 generaciones / mes (5/día)",
      "Themis + Chronos incluidos",
      "Generación en lote",
      "Soporte prioritario",
    ],
  },
  {
    id: "elite",
    label: "Plan Elite",
    priceCop: "749.900",
    usd: "≈ USD 183",
    tagline: "Para grandes administradores",
    chip: "Ilimitado",
    cta: "Subir a Elite",
    featured: false,
    features: [
      "Propiedades ilimitadas",
      "100 generaciones / mes (10/día)",
      "Themis + Chronos incluidos",
      "Generación en lote",
      "Soporte prioritario · WhatsApp directo",
    ],
  },
];

const COMING_SOON_AGENTS = [
  { id: "metra",    color: "#4cd6a0", name: "Metra",    role: "Analista Financiera" },
  { id: "nomethes", color: "#ffb958", name: "Nomethes", role: "Consultor de Decisiones" },
  { id: "hermes",   color: "#ff6fa8", name: "Hermes",   role: "Redactor de Comunicaciones" },
  { id: "logistes", color: "#8a92ff", name: "Logistes", role: "Coordinador Operativo" },
];

export default function SuscripcionPage() {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  // Track ePayco readiness, but never let it permanently disable the buttons:
  // on SPA re-mount next/script's onLoad won't fire again, so we also seed the
  // state from window on mount and fall back to a click-time check.
  const [epaycoReady, setEpaycoReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.ePayco) setEpaycoReady(true);
  }, []);

  const handleSubscribe = useCallback(async (planType: PlanId) => {
    setLoadingPlan(planType);
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
        setError("Error de configuración. Intenta de nuevo.");
        return;
      }
      if (!window.ePayco) {
        setError("El módulo de pago aún no ha cargado. Espera unos segundos e intenta de nuevo.");
        return;
      }

      const handler = window.ePayco.checkout.configure({
        key: data.publicKey,
        test: data.isTest,
      });
      handler.open(data.checkoutConfig);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoadingPlan(null);
    }
  }, []);

  return (
    <div>
      {!IS_DEMO && (
        <Script
          src="https://checkout.epayco.co/checkout.js"
          onReady={() => setEpaycoReady(true)}
          onLoad={() => setEpaycoReady(true)}
          strategy="afterInteractive"
        />
      )}

      <Header title="Suscripción" subtitle="Gestiona tu plan y uso" />

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

        {/* ── Pricing grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {PLAN_CARDS.map((plan) => {
            const isLoading = loadingPlan === plan.id;
            return (
              <div
                key={plan.id}
                className="rounded-2xl flex flex-col relative overflow-hidden"
                style={
                  plan.featured
                    ? {
                        background: "radial-gradient(ellipse at 50% 0%, rgba(124,92,255,0.20) 0%, #15151a 65%)",
                        border: "1px solid rgba(124,92,255,0.40)",
                        padding: "28px 24px",
                        boxShadow: "0 0 0 1px rgba(124,92,255,0.15), 0 8px 40px rgba(124,92,255,0.20)",
                      }
                    : {
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        padding: "28px 24px",
                      }
                }
              >
                {plan.featured && (
                  <>
                    <div
                      className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full blur-3xl"
                      style={{ background: "rgba(124,92,255,0.25)" }}
                    />
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
                        {plan.ribbon}
                      </div>
                    </div>
                  </>
                )}

                {/* Eyebrow + chip */}
                <div className={`flex items-start justify-between mb-5 ${plan.featured ? "mt-2" : ""}`}>
                  <p style={{ ...monoLabel, color: plan.featured ? "#9a7fff" : "var(--muted-foreground)" }}>
                    {plan.label}
                  </p>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      letterSpacing: "0.08em",
                      background: plan.featured ? "rgba(124,92,255,0.20)" : "rgba(95,180,255,0.12)",
                      color: plan.featured ? "#a78bff" : "#5fb4ff",
                      border: `1px solid ${plan.featured ? "rgba(124,92,255,0.35)" : "rgba(95,180,255,0.25)"}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plan.chip}
                  </span>
                </div>

                {/* Price (COP) */}
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      color: "var(--muted-foreground)",
                      textTransform: "uppercase",
                      alignSelf: "flex-start",
                      marginTop: 12,
                    }}
                  >
                    $
                  </span>
                  <span
                    style={{
                      fontFamily: "'Geist', sans-serif",
                      fontSize: 44,
                      fontWeight: 400,
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                      ...(plan.featured
                        ? {
                            background: "linear-gradient(135deg, #ffffff 30%, #a78bff 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                          }
                        : { color: "var(--foreground)" }),
                    }}
                  >
                    {plan.priceCop}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--muted-foreground)", alignSelf: "flex-end", marginBottom: 6 }}>
                    COP/mes
                  </span>
                </div>
                <p className="mb-1" style={{ ...monoLabel, fontSize: 10, color: "var(--muted-foreground)" }}>
                  {plan.usd} · el administrador factura por propiedad
                </p>
                <p className="text-sm mb-6 mt-2" style={{ color: "var(--muted-foreground)" }}>
                  {plan.tagline}
                </p>

                {IS_DEMO && (
                  <div
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold mb-4"
                    style={{ background: "rgba(255,185,88,0.10)", color: "#ffb958", border: "1px solid rgba(255,185,88,0.20)" }}
                  >
                    <Zap className="h-3 w-3" /> Demo activo
                  </div>
                )}

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: plan.featured ? "rgba(124,92,255,0.25)" : "rgba(124,92,255,0.15)" }}
                      >
                        <Check className="h-2.5 w-2.5" style={{ color: plan.featured ? "#a78bff" : "#7c5cff" }} />
                      </div>
                      <span style={i === 0 ? { fontWeight: 700 } : undefined}>{f}</span>
                    </li>
                  ))}
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
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loadingPlan !== null}
                    className="w-full h-11 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={
                      plan.featured
                        ? { background: "#7c5cff", color: "#fff", boxShadow: "0 4px 20px rgba(124,92,255,0.45)" }
                        : { border: "1px solid var(--border)", color: "var(--foreground)", background: "transparent" }
                    }
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isLoading ? "Procesando..." : plan.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Coming-soon agents strip ────────────────────────────────── */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: "repeating-linear-gradient(135deg, transparent 0px, transparent 12px, rgba(124,92,255,0.025) 12px, rgba(124,92,255,0.025) 13px), var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <p style={{ ...monoLabel, color: "var(--muted-foreground)" }} className="mb-4">
            Más agentes · Próximamente
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {COMING_SOON_AGENTS.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                  style={{ background: a.color }}
                >
                  {a.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-foreground leading-none truncate">{a.name}</p>
                  <p className="mt-0.5 leading-none" style={{ ...monoLabel, fontSize: 9, color: "var(--muted-foreground)" }}>
                    Próximamente
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--muted-foreground)", opacity: 0.75 }}>
            Estos agentes especializados se lanzarán como complementos de tu plan. Te avisaremos cuando estén disponibles.
          </p>
        </div>

        <p className="text-xs text-center" style={{ color: "var(--muted-foreground)", opacity: 0.65 }}>
          Cobro en COP procesado por ePayco. Acepta tarjetas de crédito, débito, PSE y más.
        </p>
      </div>
    </div>
  );
}
