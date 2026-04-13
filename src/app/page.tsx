import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText,
  Presentation,
  Shield,
  Upload,
  Zap,
  Building2,
  ArrowRight,
  Check,
  Sparkles,
  Clock,
  Star,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-foreground">PH Gestion</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Iniciar Sesion</Button>
            </Link>
            <Link href="/login">
              <Button size="sm">
                Comenzar Gratis
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-44 lg:pb-32 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-br from-primary/20 via-purple-300/20 to-pink-200/20 rounded-full blur-3xl animate-gradient" />
        <div className="absolute top-40 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-200/20 to-transparent rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-full px-4 py-1.5 mb-8">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Potenciado con Inteligencia Artificial</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Informes y Actas de{" "}
            <span className="text-gradient">Propiedad Horizontal</span>{" "}
            en minutos
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Sube tus documentos, fotos y audios. Nuestra IA genera automaticamente
            el informe de gestion, el acta legal y la presentacion
            que necesitas cada mes.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="text-base px-8 h-14 rounded-2xl shadow-lg shadow-primary/25">
                Empieza con 7 dias gratis
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="#como-funciona">
              <Button size="lg" variant="outline" className="text-base px-8 h-14 rounded-2xl">
                Como funciona
              </Button>
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-500" /> Sin tarjeta de credito
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-500" /> Listo en 2 minutos
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-500" /> Cumple Ley 675
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Documentos Profesionales</p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Todo lo que necesitas, un solo clic
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: FileText,
                title: "Informe de Gestion",
                description: "Informes mensuales completos con secciones administrativa, financiera, mantenimiento, seguridad y convivencia.",
                color: "from-blue-500 to-indigo-600",
                bg: "bg-blue-50",
                iconColor: "text-blue-600",
              },
              {
                icon: Shield,
                title: "Acta Legal",
                description: "Actas que cumplen con la Ley 675 y normativas de propiedad horizontal en Colombia y Latinoamerica.",
                color: "from-emerald-500 to-teal-600",
                bg: "bg-emerald-50",
                iconColor: "text-emerald-600",
              },
              {
                icon: Presentation,
                title: "Presentacion PPTX",
                description: "Presentacion visual profesional en PowerPoint lista para la asamblea con graficos y datos clave.",
                color: "from-purple-500 to-pink-600",
                bg: "bg-purple-50",
                iconColor: "text-purple-600",
              },
            ].map((feature) => (
              <Card key={feature.title} className="group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-border/40 overflow-hidden">
                <CardContent className="p-8">
                  <div className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
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

      {/* How it works */}
      <section id="como-funciona" className="py-24 bg-gradient-to-b from-secondary/50 to-background relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Simple y Rapido</p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Tres pasos, cero complicaciones
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />

            {[
              {
                step: "01",
                icon: Upload,
                title: "Sube tu informacion",
                description: "Textos, fotos, audios, PDFs, Excel, Word — cualquier formato con tu gestion mensual.",
              },
              {
                step: "02",
                icon: Zap,
                title: "La IA procesa todo",
                description: "Nuestra inteligencia artificial analiza y estructura toda la informacion automaticamente.",
              },
              {
                step: "03",
                icon: FileText,
                title: "Descarga tus documentos",
                description: "Informe PDF, Acta legal PDF y Presentacion PPTX. Listos para entregar.",
              },
            ].map((item) => (
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

      {/* Social proof */}
      <section className="py-16 border-y border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "500+", label: "Documentos generados" },
              { value: "50+", label: "Administradores activos" },
              { value: "< 3 min", label: "Tiempo promedio" },
              { value: "4.9/5", label: "Satisfaccion" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-gradient">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Precios Transparentes</p>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Elige el plan para tu operacion
            </h2>
            <p className="text-muted-foreground mt-4 text-lg">
              Sin costos ocultos. Cancela cuando quieras. 7 dias de prueba gratis.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Plan Profesional */}
            <Card className="relative overflow-hidden border-2 border-border/40 hover:border-primary/30 transition-colors">
              <div className="absolute top-0 right-0">
                <div className="bg-gradient-to-r from-gray-600 to-gray-500 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl flex items-center gap-1">
                  <Star className="h-3 w-3" /> Popular
                </div>
              </div>

              <CardContent className="p-8 pt-10">
                <h3 className="text-2xl font-bold mb-1">Plan Profesional</h3>
                <p className="text-muted-foreground text-sm mb-6">Hasta 3 propiedades</p>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-5xl font-extrabold">$20</span>
                  <span className="text-muted-foreground text-lg">/mes USD</span>
                </div>
                <p className="text-sm text-primary font-medium mb-8 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  7 dias de prueba gratis
                </p>

                <ul className="space-y-3 mb-8">
                  {[
                    "Hasta 3 propiedades",
                    "15 generaciones por mes",
                    "Informe de gestion en PDF",
                    "Acta legal en PDF (Ley 675)",
                    "Presentacion PPTX profesional",
                    "Todos los formatos de entrada",
                    "Historial completo",
                    "Soporte por WhatsApp",
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-emerald-600" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/login" className="block">
                  <Button variant="outline" className="w-full h-12 text-base rounded-2xl" size="lg">
                    Comenzar gratis
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Plan Elite */}
            <Card className="relative overflow-hidden border-2 border-primary/30 glow-primary">
              <div className="absolute top-0 right-0">
                <div className="bg-gradient-to-r from-primary to-purple-400 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Recomendado
                </div>
              </div>

              <CardContent className="p-8 pt-10">
                <h3 className="text-2xl font-bold mb-1">Plan Elite</h3>
                <p className="text-muted-foreground text-sm mb-6">Mas de 10 propiedades — sin limites</p>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-5xl font-extrabold text-gradient">$200</span>
                  <span className="text-muted-foreground text-lg">/mes USD</span>
                </div>
                <p className="text-sm text-primary font-medium mb-8 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  7 dias de prueba gratis
                </p>

                <ul className="space-y-3 mb-8">
                  {[
                    "Propiedades ilimitadas",
                    "50 generaciones por mes",
                    "10 generaciones diarias",
                    "Todo lo del plan Profesional",
                    "Generaciones en lote",
                    "Soporte prioritario",
                    "Reportes avanzados",
                    "Capacitacion personalizada",
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/login" className="block">
                  <Button className="w-full h-12 text-base rounded-2xl shadow-lg shadow-primary/25" size="lg">
                    Comenzar gratis
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-center text-muted-foreground mt-8">
            Sin tarjeta de credito requerida para la prueba. Pago seguro via ePayco.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-primary via-purple-600 to-primary rounded-3xl p-12 lg:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-grid opacity-10" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Deja de perder horas en documentos
              </h2>
              <p className="text-purple-100 text-lg mb-8 max-w-xl mx-auto">
                Unete a los administradores que ya generan sus informes, actas y presentaciones en minutos.
              </p>
              <Link href="/login">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl h-14 px-10 text-base rounded-2xl">
                  Empezar ahora — es gratis
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold">PH Gestion</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} PH Gestion. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
