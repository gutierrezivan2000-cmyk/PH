import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-gradient-to-br from-primary via-purple-600 to-primary rounded-3xl p-12 lg:p-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-10" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Deja de perder horas en documentos
            </h2>
            <p className="text-purple-100 text-lg mb-4 max-w-xl mx-auto">
              Unete a los administradores que ya generan sus informes, actas y presentaciones en minutos con SOPH.IA.
            </p>
            <p className="text-purple-200 text-sm mb-8">
              Empieza hoy — 7 dias gratis, sin tarjeta de credito.
            </p>
            <Link href="/login">
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 shadow-xl h-14 px-10 text-base rounded-2xl"
              >
                Empezar ahora — es gratis
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
