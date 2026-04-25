"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Button } from "@/components/ui/button";
import { Check, CreditCard, Loader2, Zap, Star, Shield, Crown } from "lucide-react";
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

  const plans = [
    {
      id: "pro" as const,
      name: "Plan Profesional",
      price: "$20",
      currency: "USD",
      period: "/mes",
      badge: "Popular",
      badgeIcon: Star,
      description: "Hasta 3 propiedades",
      features: [
        "Hasta 3 propiedades",
        "15 generaciones mensuales",
        "3 generaciones diarias",
        "Informe de gestion en PDF",
        "Acta legal en PDF (Ley 675)",
        "Presentacion PPTX profesional",
        "Todos los formatos de entrada",
        "Historial completo",
      ],
      highlighted: false,
      gradient: "from-gray-600 to-gray-500",
    },
    {
      id: "elite" as const,
      name: "Plan Elite",
      price: "$200",
      currency: "USD",
      period: "/mes",
      badge: "Recomendado",
      badgeIcon: Crown,
      description: "Mas de 10 propiedades",
      features: [
        "Propiedades ilimitadas",
        "50 generaciones mensuales",
        "10 generaciones diarias",
        "Informe de gestion en PDF",
        "Acta legal en PDF (Ley 675)",
        "Presentacion PPTX profesional",
        "Todos los formatos de entrada",
        "Historial completo",
        "Soporte prioritario",
        "Generaciones en lote",
      ],
      highlighted: true,
      gradient: "from-violet-600 to-purple-600",
    },
  ];

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
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-4xl mx-auto space-y-6">
        <UsageCard />

        {error && (
          <div className="bg-red-50/80 dark:bg-red-500/10 backdrop-blur border border-red-200/50 dark:border-red-500/20 rounded-2xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative overflow-hidden bg-white dark:bg-white/5 dark:backdrop-blur-xl border rounded-3xl shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                plan.highlighted
                  ? "border-violet-300/50 dark:border-violet-500/30 shadow-violet-200/20 dark:shadow-violet-500/10 hover:shadow-violet-200/30 dark:hover:shadow-violet-500/20"
                  : "border-gray-200 dark:border-white/10 shadow-violet-100/10 dark:shadow-black/20"
              }`}
            >
              {/* Badge */}
              <div className="absolute top-0 right-0">
                <div className={`bg-gradient-to-r ${plan.gradient} text-white text-xs font-bold px-4 py-1.5 rounded-bl-2xl flex items-center gap-1 shadow-lg`}>
                  <plan.badgeIcon className="h-3 w-3" /> {plan.badge}
                </div>
              </div>

              <div className="p-5 pt-8 sm:p-8 sm:pt-10">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-0.5">{plan.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-4xl font-extrabold ${plan.highlighted ? "bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-400 dark:to-purple-400 bg-clip-text text-transparent" : "text-gray-900 dark:text-white"}`}>
                    {plan.price}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">{plan.period} {plan.currency}</span>
                </div>

                {IS_DEMO && (
                  <div className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100/80 dark:bg-amber-500/10 backdrop-blur rounded-lg text-xs font-bold text-amber-700 dark:text-amber-300 mt-2 mb-4">
                    <Zap className="h-3 w-3" /> Demo
                  </div>
                )}

                <ul className="space-y-2.5 my-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <div className="w-5 h-5 rounded-full bg-emerald-100/80 dark:bg-emerald-500/15 backdrop-blur flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>

                {IS_DEMO ? (
                  <div className="bg-amber-50/80 dark:bg-amber-500/10 backdrop-blur border border-amber-200/50 dark:border-amber-500/20 rounded-2xl p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <p className="text-sm text-amber-800 dark:text-amber-300 font-semibold">Demo activo</p>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    className={`w-full gap-2 h-12 rounded-2xl shadow-lg transition-all duration-300 ${
                      plan.highlighted
                        ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/25 hover:shadow-violet-500/40"
                        : "bg-gray-800 hover:bg-gray-700 shadow-gray-500/15"
                    }`}
                    size="lg"
                    disabled={loading || !epaycoReady}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    {loading ? "Procesando..." : "Suscribirse"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Pago seguro procesado por ePayco. Acepta tarjetas de credito, debito, PSE y mas.
        </p>
      </div>
    </div>
  );
}
