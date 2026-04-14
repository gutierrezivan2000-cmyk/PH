export function SocialProof() {
  const stats = [
    { value: "500+", label: "Documentos generados" },
    { value: "50+", label: "Administradores activos" },
    { value: "< 3 min", label: "Tiempo promedio" },
    { value: "4.9/5", label: "Satisfaccion" },
  ];

  return (
    <section className="py-16 border-y border-border/40 bg-white/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground mb-8 font-semibold">
          La confianza de administradores en toda Latinoamerica
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl sm:text-4xl font-bold text-gradient">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
