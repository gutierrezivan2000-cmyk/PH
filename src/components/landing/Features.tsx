import { Card, CardContent } from "@/components/ui/card";
import { FileText, Shield, Presentation } from "lucide-react";

export function Features() {
  const features = [
    {
      icon: FileText,
      title: "Informe de Gestion",
      description:
        "Informes mensuales completos con secciones administrativa, financiera, mantenimiento, seguridad y convivencia. Listos para entregar.",
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Shield,
      title: "Acta Legal",
      description:
        "Actas que cumplen con la Ley 675 y normativas de propiedad horizontal en Colombia y Latinoamerica. Validadas juridicamente.",
      bg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      icon: Presentation,
      title: "Presentacion PPTX",
      description:
        "Presentacion visual profesional en PowerPoint lista para la asamblea con graficos, datos clave y diseno ejecutivo.",
      bg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
  ];

  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
            Tres documentos, un solo clic
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Todo lo que necesitas para tu asamblea
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            SOPH.IA genera automaticamente los tres documentos esenciales que todo administrador necesita cada mes.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-border/40 overflow-hidden"
            >
              <CardContent className="p-8">
                <div
                  className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                >
                  <feature.icon className={`h-7 w-7 ${feature.iconColor}`} />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
