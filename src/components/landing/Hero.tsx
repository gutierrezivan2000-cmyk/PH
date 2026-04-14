import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Sparkles, Play } from "lucide-react";

export function Hero() {
  return (
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
          Tus informes de{" "}
          <span className="text-gradient">Propiedad Horizontal</span>{" "}
          en minutos
        </h1>

        <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Deja de perder horas redactando documentos. <strong className="text-foreground">SOPH.IA</strong> genera
          automaticamente el informe de gestion, el acta legal y la presentacion
          profesional que necesitas cada mes.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/login">
            <Button size="lg" className="text-base px-8 h-14 rounded-2xl shadow-lg shadow-primary/25 w-full sm:w-auto">
              Empieza gratis — 7 dias
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="#demo">
            <Button size="lg" variant="outline" className="text-base px-8 h-14 rounded-2xl w-full sm:w-auto gap-2">
              <Play className="h-4 w-4" />
              Ver demo
            </Button>
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-500" /> Sin tarjeta de credito
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-500" /> Listo en 2 minutos
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-500" /> Cumple Ley 675
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-500" /> Cancela cuando quieras
          </span>
        </div>
      </div>
    </section>
  );
}
