"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

      <Header title="Suscripcion" />
      <div className="p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
        <UsageCard />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative overflow-hidden border-2 ${
                plan.highlighted ? "border-primary/40 glow-primary" : "border-border/40"
              }`}
            >
              <div className="absolute top-0 right-0">
                <div className={`${
                  plan.highlighted
                    ? "bg-gradient-to-r from-primary to-purple-400"
                    : "bg-gradient-to-r from-gray-600 to-gray-500"
                } text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl flex items-center gap-1`}>
                  <plan.badgeIcon className="h-3 w-3" /> {plan.badge}
                </div>
              </div>

              <CardContent className="p-8 pt-10">
                <h3 className="text-xl font-bold mb-0.5">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-4xl font-extrabold ${plan.highlighted ? "text-gradient" : ""}`}>
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period} {plan.currency}</span>
                </div>

                {IS_DEMO && (
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-1 mt-2 mb-4">
                    <Zap className="h-3 w-3" /> Demo
                  </Badge>
                )}

                <ul className="space-y-2.5 my-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-emerald-600" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>

                {IS_DEMO ? (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Shield className="h-4 w-4 text-amber-600" />
                      <p className="text-sm text-amber-800 font-semibold">
                        Demo activo
                      </p>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    className={`w-full gap-2 h-11 rounded-2xl ${
                      plan.highlighted ? "" : "bg-gray-800 hover:bg-gray-700"
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
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Pago seguro procesado por ePayco. Acepta tarjetas de credito, debito, PSE y mas.
        </p>
      </div>
    </div>
  );
}
