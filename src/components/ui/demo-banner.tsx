import { Zap } from "lucide-react";

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-[11px] font-medium border-b"
      style={{
        background: "rgba(244,199,128,0.10)",
        borderColor: "rgba(244,199,128,0.30)",
        color: "#f4c780",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      <Zap className="h-3 w-3" />
      <span>MODO DEMO · datos simulados · documentos reales descargables</span>
    </div>
  );
}
