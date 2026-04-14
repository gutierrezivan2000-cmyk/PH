import { Play } from "lucide-react";

export function VideoDemo() {
  return (
    <section id="demo" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/[0.02] to-background" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Mira SOPH.IA en accion</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            De documentos desordenados a informes profesionales
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            Observa como en menos de 3 minutos puedes generar todos los documentos que necesitas para tu asamblea.
          </p>
        </div>

        {/* Video placeholder - replace src with actual video */}
        <div className="relative aspect-video rounded-3xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800 shadow-2xl shadow-primary/10 border border-white/10">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 hover:bg-white/20 transition-colors cursor-pointer group">
                <Play className="h-8 w-8 text-white ml-1 group-hover:scale-110 transition-transform" />
              </div>
              <p className="text-white/60 text-sm">Video demostrativo</p>
            </div>
          </div>
          {/* Decorative mockup elements */}
          <div className="absolute top-6 left-6 flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
            <div className="w-3 h-3 rounded-full bg-green-400/60" />
          </div>
        </div>
      </div>
    </section>
  );
}
