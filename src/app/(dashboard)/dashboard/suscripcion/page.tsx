"use client";

import { useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, CreditCard, Loader2 } from "lucide-react";

export default function SuscripcionPage() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
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
            <CardTitle className="text-2xl">Plan Profesional</CardTitle>
            <div className="mt-2">
              <span className="text-4xl font-bold">$20</span>
              <span className="text-muted-foreground">/mes USD</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6">
              {[
                "15 generaciones mensuales",
                "3 generaciones diarias",
                "Informe + Acta + Presentacion",
                "Todos los formatos de entrada",
                "Historial completo",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  {f}
                </li>
              ))}
            </ul>
            <Button onClick={handleSubscribe} className="w-full gap-2" size="lg" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {loading ? "Redirigiendo..." : "Suscribirse con Stripe"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
