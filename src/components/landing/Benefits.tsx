import { Clock, ShieldCheck, TrendingUp, Headphones, Globe, Repeat } from "lucide-react";

export function Benefits() {
  const benefits = [
    {
      icon: Clock,
      title: "Ahorra +10 horas al mes",
      description: "Automatiza la redaccion de informes, actas y presentaciones. Invierte ese tiempo en lo que realmente importa.",
    },
    {
      icon: ShieldCheck,
      title: "Cumplimiento legal garantizado",
      description: "Documentos alineados con la Ley 675 y normativas vigentes. Sin riesgo de errores juridicos.",
    },
    {
      icon: TrendingUp,
      title: "Resultados profesionales",
      description: "Impresiona a copropietarios y consejos de administracion con documentos de calidad ejecutiva.",
    },
    {
      icon: Globe,
      title: "Cualquier formato de entrada",
      description: "PDF, Word, Excel, fotos, audios — sube cualquier archivo. SOPH.IA lo procesa todo.",
    },
    {
      icon: Repeat,
      title: "Consistencia mes a mes",
      description: "Misma calidad profesional cada mes. Sin variaciones por cansancio, prisa o falta de tiempo.",
    },
    {
      icon: Headphones,
      title: "Soporte personalizado",
      description: "Equipo de soporte por WhatsApp listo para ayudarte en cualquier momento.",
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-background to-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Ventajas</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Por que los administradores eligen SOPH.IA
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="bg-white rounded-2xl border border-border/40 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <benefit.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
