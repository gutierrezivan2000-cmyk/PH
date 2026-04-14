import { Upload, Zap, FileText } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      step: "01",
      icon: Upload,
      title: "Sube tu informacion",
      description:
        "Textos, fotos, audios, PDFs, Excel, Word — cualquier formato con tu gestion mensual.",
    },
    {
      step: "02",
      icon: Zap,
      title: "La IA procesa todo",
      description:
        "SOPH.IA analiza, estructura y redacta toda la informacion automaticamente en segundos.",
    },
    {
      step: "03",
      icon: FileText,
      title: "Descarga tus documentos",
      description:
        "Informe PDF, Acta legal PDF y Presentacion PPTX. Listos para entregar a la asamblea.",
    },
  ];

  return (
    <section id="como-funciona" className="py-24 bg-gradient-to-b from-secondary/50 to-background relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Simple y Rapido</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Tres pasos, cero complicaciones</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            No necesitas ser experto en tecnologia. Si sabes adjuntar un archivo, ya sabes usar SOPH.IA.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />

          {steps.map((item) => (
            <div key={item.step} className="text-center relative">
              <div className="w-24 h-24 bg-white rounded-3xl shadow-lg shadow-primary/10 flex items-center justify-center mx-auto mb-6 relative">
                <item.icon className="h-10 w-10 text-primary" />
                <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-400 text-white text-xs font-bold flex items-center justify-center shadow-md">
                  {item.step}
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
