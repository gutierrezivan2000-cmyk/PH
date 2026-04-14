import { X, Check } from "lucide-react";

export function ProblemSolution() {
  const without = [
    "Horas redactando informes manualmente",
    "Actas que no cumplen la Ley 675",
    "Presentaciones improvisadas sin datos",
    "Errores y olvidos en cada documento",
    "Estres antes de cada asamblea",
  ];

  const withSophia = [
    "Informes completos en menos de 3 minutos",
    "Actas 100% alineadas con la Ley 675",
    "Presentaciones profesionales con datos clave",
    "IA que no olvida ningun detalle",
    "Tranquilidad y confianza total",
  ];

  return (
    <section className="py-24 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">El antes y despues</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Transforma tu gestion documental
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {/* Without */}
          <div className="bg-red-50/50 border border-red-200/40 rounded-2xl p-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <X className="h-4 w-4 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-red-900">Sin SOPH.IA</h3>
            </div>
            <ul className="space-y-4">
              {without.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="h-3 w-3 text-red-500" />
                  </div>
                  <span className="text-sm text-red-800">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* With */}
          <div className="bg-emerald-50/50 border border-emerald-200/40 rounded-2xl p-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Check className="h-4 w-4 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-emerald-900">Con SOPH.IA</h3>
            </div>
            <ul className="space-y-4">
              {withSophia.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="h-3 w-3 text-emerald-600" />
                  </div>
                  <span className="text-sm text-emerald-800">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
