import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function Testimonials() {
  const testimonials = [
    {
      name: "Carolina Mendez",
      role: "Administradora de P.H.",
      location: "Bogota",
      text: "SOPH.IA me ahorra mas de 12 horas al mes. Antes dedicaba todo un fin de semana a los informes, ahora los tengo listos en minutos. La calidad es impecable.",
      rating: 5,
    },
    {
      name: "Roberto Alvarez",
      role: "Gerente de Administracion",
      location: "Medellin",
      text: "La mejor inversion que he hecho para mi empresa. Administro 8 propiedades y SOPH.IA me permite generar todos los documentos sin contratar personal adicional.",
      rating: 5,
    },
    {
      name: "Patricia Gomez",
      role: "Contadora - Revisora Fiscal",
      location: "Cali",
      text: "Las actas cumplen perfectamente con la Ley 675. Mis clientes estan encantados con la calidad y yo tengo mas tiempo para otras tareas. Totalmente recomendado.",
      rating: 5,
    },
  ];

  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Testimonios</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Lo que dicen nuestros usuarios
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <Card key={t.name} className="border-border/40 hover:shadow-md transition-all duration-200">
              <CardContent className="p-6">
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                {/* Quote */}
                <p className="text-sm text-foreground leading-relaxed mb-6">
                  &ldquo;{t.text}&rdquo;
                </p>
                {/* Author */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-purple-300/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {t.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role} — {t.location}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
