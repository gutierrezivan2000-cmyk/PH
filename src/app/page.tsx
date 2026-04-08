import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Presentation,
  Shield,
  Upload,
  Zap,
  Building2,
  ChevronRight,
  Check,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-foreground">PH Gestion</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Iniciar Sesion</Button>
            </Link>
            <Link href="/login">
              <Button>Comenzar Gratis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-primary/5 via-white to-primary/10 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
            Informes y Actas de
            <span className="text-primary block mt-2">Propiedad Horizontal</span>
            <span className="text-muted-foreground text-2xl sm:text-3xl lg:text-4xl block mt-4 font-normal">
              generados con IA en minutos
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Sube tus documentos, fotos, audios y hojas de calculo. Nuestra IA genera
            automaticamente el informe de gestion, el acta legal y la presentacion
            profesional que necesitas cada mes.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="text-lg px-8 py-6">
                Empieza con 7 dias gratis
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            Todo lo que necesitas en un solo lugar
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <FileText className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Informe de Gestion</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Genera informes mensuales completos y profesionales con todas las
                  secciones requeridas: administrativa, financiera, mantenimiento y mas.
                </p>
              </CardContent>
            </Card>
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Shield className="h-10 w-10 text-green-600 mb-2" />
                <CardTitle>Acta Legal</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Actas que cumplen con los estandares legales de la Ley 675 y normativas
                  de propiedad horizontal en Latinoamerica.
                </p>
              </CardContent>
            </Card>
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Presentation className="h-10 w-10 text-purple-600 mb-2" />
                <CardTitle>Presentacion PPTX</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Presentacion visual profesional en PowerPoint lista para la asamblea,
                  con graficos y diseno corporativo.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            Como funciona
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">1. Sube tu informacion</h3>
              <p className="text-muted-foreground">
                Textos, fotos, audios, PDFs, Excel, Word. Acepta cualquier formato con la
                informacion de tu gestion mensual.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">2. La IA procesa todo</h3>
              <p className="text-muted-foreground">
                Nuestra inteligencia artificial analiza toda la informacion y genera los
                documentos automaticamente.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">3. Descarga tus documentos</h3>
              <p className="text-muted-foreground">
                Obten el informe en PDF, el acta legal en PDF y la presentacion en PPTX.
                Todo listo para entregar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-4">Precio simple y transparente</h2>
          <p className="text-center text-muted-foreground mb-12">
            Todo incluido, sin costos ocultos.
          </p>
          <div className="max-w-md mx-auto">
            <Card className="border-2 border-primary shadow-lg">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl">Plan Profesional</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold">$20</span>
                  <span className="text-muted-foreground">/mes USD</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">7 dias de prueba gratis</p>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {[
                    "Hasta 15 generaciones por mes",
                    "Informe de gestion en PDF",
                    "Acta legal en PDF",
                    "Presentacion PPTX profesional",
                    "Sube textos, fotos, audios, Excel, PDF, Word",
                    "Historial de documentos generados",
                    "Multiples propiedades",
                    "Soporte por correo",
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/login" className="block mt-8">
                  <Button className="w-full" size="lg">
                    Comenzar prueba gratuita
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              <span className="font-semibold text-white">PH Gestion</span>
            </div>
            <p className="text-sm">
              {new Date().getFullYear()} PH Gestion. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
