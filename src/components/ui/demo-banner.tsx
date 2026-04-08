import { Zap } from "lucide-react";

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div className="bg-amber-400 text-amber-900 text-sm font-medium px-4 py-2 flex items-center justify-center gap-2">
      <Zap className="h-4 w-4" />
      <span>
        MODO DEMO — Los datos son simulados. Los documentos generados son reales y descargables.
      </span>
    </div>
  );
}
