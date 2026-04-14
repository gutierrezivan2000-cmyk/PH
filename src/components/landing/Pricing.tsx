import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ArrowRight, Clock, Star, Sparkles } from "lucide-react";

export function Pricing() {
  const plans = [
    {
      name: "Plan Profesional",
      price: "$20",
      description: "Hasta 3 propiedades",
      badge: "Popular",
      badgeIcon: Star,
      highlighted: false,
      features: [
        "Hasta 3 propiedades",
        "15 generaciones por mes",
        "Informe de gestion en PDF",
        "Acta legal en PDF (Ley 675)",
        "Presentacion PPTX profesional",
        "Todos los formatos de entrada",
        "Historial completo",
        "Soporte por WhatsApp",
      ],
    },
    {
      name: "Plan Elite",
      price: "$200",
      description: "Sin limites — para grandes operaciones",
      badge: "Recomendado",
      badgeIcon: Sparkles,
      highlighted: true,
      features: [
        "Propiedades ilimitadas",
        "50 generaciones por mes",
        "10 generaciones diarias",
        "Todo lo del plan Profesional",
        "Generaciones en lote",
        "Soporte prioritario",
        "Reportes avanzados",
        "Capacitacion personalizada",
      ],
    },
  ];

  return (
    <section id="precios" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Precios Transparentes</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Invierte menos de lo que vale una hora de tu tiempo
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            Sin costos ocultos. Cancela cuando quieras. 7 dias de prueba gratis.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative overflow-hidden border-2 ${
                plan.highlighted
                  ? "border-primary/30 glow-primary"
                  : "border-border/40 hover:border-primary/20"
              } transition-colors`}
            >
              <div className="absolute top-0 right-0">
                <div
                  className={`${
                    plan.highlighted
                      ? "bg-gradient-to-r from-primary to-purple-400"
                      : "bg-gradient-to-r from-gray-600 to-gray-500"
                  } text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl flex items-center gap-1`}
                >
                  <plan.badgeIcon className="h-3 w-3" /> {plan.badge}
                </div>
              </div>

              <CardContent className="p-8 pt-10">
                <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-5xl font-extrabold ${plan.highlighted ? "text-gradient" : ""}`}>
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground text-lg">/mes USD</span>
                </div>
                <p className="text-sm text-primary font-medium mb-8 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  7 dias de prueba gratis
                </p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-full ${
                          plan.highlighted ? "bg-primary/10" : "bg-emerald-100"
                        } flex items-center justify-center flex-shrink-0 mt-0.5`}
                      >
                        <Check className={`h-3 w-3 ${plan.highlighted ? "text-primary" : "text-emerald-600"}`} />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/login" className="block">
                  <Button
                    className={`w-full h-12 text-base rounded-2xl ${
                      plan.highlighted ? "shadow-lg shadow-primary/25" : ""
                    }`}
                    variant={plan.highlighted ? "default" : "outline"}
                    size="lg"
                  >
                    Comenzar gratis
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-center text-muted-foreground mt-8">
          Sin tarjeta de credito requerida para la prueba. Pago seguro via ePayco.
        </p>
      </div>
    </section>
  );
}
