export const dynamic = "force-dynamic";

import Link from "next/link";
import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Layers, ArrowLeft, CheckCircle2, Clock } from "lucide-react";

export default async function EmpresaGenerarPage() {
  const elite = await eliteGate();

  const steps = [
    "Seleccionas las propiedades (todas, filtradas o marcadas una a una).",
    "Eliges el mes, el periodo y qué documentos generar (informe, acta, presentación).",
    "SOPH.IA los produce en cola, respetando el ritmo del servicio, y ves el avance en vivo (“32 / 50 completadas”).",
  ];

  return (
    <EmpresaShell elite={elite}>
      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-3xl">
        <Link
          href="/empresa"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al resumen
        </Link>

        <PageHeader
          section="Portafolio · Generación en lote"
          title="Generar en lote"
          description="Produce los informes y actas mensuales de muchas copropiedades en una sola acción."
        />

        <div
          className="rounded-2xl border p-8 text-center"
          style={{
            background: "radial-gradient(120% 100% at 50% 0%, rgba(124,92,255,0.12), transparent 70%), var(--card)",
            borderColor: "rgba(124,92,255,0.30)",
          }}
        >
          <div
            className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{ background: "rgba(124,92,255,0.15)", border: "1px solid rgba(124,92,255,0.30)" }}
          >
            <Layers className="h-5 w-5" style={{ color: "#9a7fff" }} />
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-full mb-4"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              background: "rgba(124,92,255,0.12)",
              border: "1px solid rgba(124,92,255,0.35)",
              color: "#9a7fff",
            }}
          >
            <Clock className="h-3 w-3" /> EN CAMINO
          </span>
          <h2 className="text-xl font-medium tracking-[-0.02em] text-foreground mb-2">
            La generación en lote está en construcción
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Ya tienes la vista de portafolio y la gestión de propiedades a escala. El
            siguiente paso es producir todos los documentos del mes de una sola vez.
          </p>

          <ul className="text-left max-w-md mx-auto space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#4cd6a0" }} />
                <span className="text-[13px] text-muted-foreground">{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/empresa/propiedades"
            className="inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "#7c5cff", boxShadow: "0 4px 20px rgba(124,92,255,0.35)" }}
          >
            Ver mis propiedades
          </Link>
          <Link
            href="/dashboard/generar"
            className="inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-medium border border-border text-foreground hover:bg-secondary transition-colors"
          >
            Generar una propiedad ahora
          </Link>
        </div>
      </div>
    </EmpresaShell>
  );
}
