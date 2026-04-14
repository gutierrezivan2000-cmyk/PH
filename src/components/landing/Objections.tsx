import { ShieldCheck, Lock, UserCheck, RefreshCw } from "lucide-react";

export function Objections() {
  const objections = [
    {
      icon: ShieldCheck,
      question: "¿Los documentos realmente cumplen la Ley 675?",
      answer:
        "Si. SOPH.IA fue entrenada especificamente con la legislacion colombiana de propiedad horizontal. Cada acta y cada informe sigue la estructura legal requerida por la Ley 675 y sus decretos reglamentarios.",
    },
    {
      icon: Lock,
      question: "¿Mis datos estan seguros?",
      answer:
        "Absolutamente. Usamos encriptacion de grado bancario. Tus documentos se procesan de forma segura y nunca compartimos tu informacion con terceros. Cumplimos con las politicas de proteccion de datos.",
    },
    {
      icon: UserCheck,
      question: "¿Puede reemplazar a mi equipo?",
      answer:
        "SOPH.IA no reemplaza — potencia. Automatiza la redaccion repetitiva para que tu y tu equipo se enfoquen en la gestion estrategica, la atencion a copropietarios y las decisiones importantes.",
    },
    {
      icon: RefreshCw,
      question: "¿Que pasa si no me gusta el resultado?",
      answer:
        "Puedes regenerar cualquier documento las veces que necesites dentro de tu plan. Ademas, puedes agregar notas e instrucciones especificas para personalizar el resultado a tu gusto.",
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Resolvemos tus dudas</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Sabemos lo que estas pensando
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            Estas son las preguntas mas comunes que recibimos antes de que los administradores prueben SOPH.IA.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {objections.map((obj) => (
            <div key={obj.question} className="bg-white rounded-2xl border border-border/40 p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <obj.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-sm">{obj.question}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{obj.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
