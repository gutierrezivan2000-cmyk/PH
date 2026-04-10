import { Zap } from "lucide-react";

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div className="bg-gradient-to-r from-amber-400 to-orange-400 text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-2 shadow-sm">
      <Zap className="h-4 w-4" />
      <span>
        MODO DEMO — Datos simulados. Documentos generados reales y descargables.
      </span>
    </div>
  );
}
