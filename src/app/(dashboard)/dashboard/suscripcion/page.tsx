"use client";

import { useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2, Zap, Star, Shield } from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function SuscripcionPage() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Suscripcion" />
      <div className="p-8 max-w-2xl space-y-6">
        <UsageCard />

        <Card className="relative overflow-hidden border-2 border-primary/30 glow-sm">
          {/* Badge */}
          <div className="absolute top-0 right-0">
            <div className="bg-gradient-to-r from-primary to-purple-400 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl flex items-center gap-1">
              <Star className="h-3 w-3" /> Tu plan
            </div>
          </div>

          <CardContent className="p-8 pt-10">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-2xl font-bold">Plan Profesional</h3>
              {IS_DEMO && (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-1">
                  <Zap className="h-3 w-3" /> Demo
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-1 mt-3 mb-1">
              <span className="text-5xl font-extrabold text-gradient">$20</span>
              <span className="text-muted-foreground text-lg">/mes USD</span>
            </div>
            {IS_DEMO && (
              <p className="text-sm text-amber-600 mb-6">
                En el demo la suscripcion esta activa automaticamente
              </p>
            )}

            <ul className="space-y-3 mb-8 mt-6">
              {[
                "15 generaciones mensuales",
                "3 generaciones diarias",
                "Informe de gestion en PDF",
                "Acta legal en PDF (Ley 675)",
                "Presentacion PPTX profesional",
                "Todos los formatos de entrada",
                "Historial completo",
                "Multiples propiedades",
              ].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Check className="h-3 w-3 text-emerald-600" />
                  </div>
                  {f}
                </li>
              ))}
            </ul>

            {IS_DEMO ? (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-5 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-amber-600" />
                  <p className="text-sm text-amber-800 font-semibold">
                    Suscripcion activa (modo demo)
                  </p>
                </div>
                <p className="text-xs text-amber-700">
                  En produccion, los pagos se procesan via Stripe con tarjeta de credito.
                </p>
              </div>
            ) : (
              <Button
                onClick={handleSubscribe}
                className="w-full gap-2 h-12 rounded-2xl"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {loading ? "Redirigiendo a Stripe..." : "Suscribirse con Stripe"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
