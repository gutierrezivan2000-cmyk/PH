"use client";

import { useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2, Zap } from "lucide-react";

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
      <div className="p-6 max-w-2xl space-y-6">
        <UsageCard />

        <Card className="border-2 border-primary">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-2xl">Plan Profesional</CardTitle>
              {IS_DEMO && (
                <Badge className="bg-amber-500 text-white gap-1">
                  <Zap className="h-3 w-3" /> Demo Activo
                </Badge>
              )}
            </div>
            <div className="mt-2">
              <span className="text-4xl font-bold">$20</span>
              <span className="text-muted-foreground">/mes USD</span>
            </div>
            {IS_DEMO && (
              <p className="text-sm text-amber-600 mt-1">
                En el demo la suscripcion esta activa automaticamente
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6">
              {[
                "15 generaciones mensuales",
                "3 generaciones diarias",
                "Informe de gestion en PDF",
                "Acta legal en PDF",
                "Presentacion PPTX profesional",
                "Todos los formatos de entrada",
                "Historial completo",
                "Multiples propiedades",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {IS_DEMO ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <p className="text-sm text-amber-800 font-medium">
                  Suscripcion activa (modo demo)
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  En produccion, los pagos se procesan via Stripe con tarjeta de credito.
                </p>
              </div>
            ) : (
              <Button
                onClick={handleSubscribe}
                className="w-full gap-2"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {loading ? "Redirigiendo..." : "Suscribirse con Stripe"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
