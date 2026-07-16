export const dynamic = "force-dynamic";

import Link from "next/link";
import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { BatchGenerator } from "@/components/empresa/BatchGenerator";
import { PageHeader } from "@/components/admin/PageHeader";
import { ArrowLeft } from "lucide-react";

export default async function EmpresaGenerarPage() {
  const elite = await eliteGate();

  return (
    <EmpresaShell elite={elite}>
      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-5xl">
        <Link
          href="/empresa"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al resumen
        </Link>

        <PageHeader
          section="Portafolio · Generación en lote"
          title="Generar en lote"
          description="Produce los informes y actas del mes de todas las propiedades con datos cargados, en una sola acción."
        />

        <BatchGenerator />
      </div>
    </EmpresaShell>
  );
}
