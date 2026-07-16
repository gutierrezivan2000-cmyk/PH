export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { MonthlyDataCard } from "@/components/empresa/MonthlyDataCard";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import {
  ArrowLeft,
  FilePlus2,
  MapPin,
  Building2,
  Layers3,
  FileText,
  FolderOpen,
  ArrowUpRight,
} from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DOC_TYPE_LABELS: Record<string, string> = {
  reglamento_interno: "Reglamento interno",
  manual_convivencia: "Manual de convivencia",
  otro: "Otro documento",
};

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const elite = await eliteGate();
  const { id } = await params;

  const property = await db.property.findFirst({
    where: { id, userId: elite.userId },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
  if (!property) notFound();

  const generations = await db.generation.findMany({
    where: { propertyId: id, userId: elite.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <EmpresaShell elite={elite}>
      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-5xl">
        <Link
          href="/empresa/propiedades"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a propiedades
        </Link>

        <PageHeader
          section="Portafolio · Propiedad"
          title={property.name}
          description={[property.address, property.city].filter(Boolean).join(" · ") || undefined}
          action={
            <Link
              href="/dashboard/generar"
              className="inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "#7c5cff", boxShadow: "0 4px 20px rgba(124,92,255,0.35)" }}
            >
              <FilePlus2 className="h-4 w-4" />
              Generar informe
            </Link>
          }
        />

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <InfoTile icon={MapPin} label="Ciudad" value={property.city || "—"} />
          <InfoTile icon={Building2} label="Unidades" value={property.units ? String(property.units) : "—"} />
          <InfoTile icon={Layers3} label="Grupo" value={property.groupLabel || "Sin grupo"} />
        </div>

        {/* Monthly input staging for batch generation */}
        <MonthlyDataCard propertyId={property.id} />

        {/* Documents */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Documentos</p>
            <span className="text-[11px] text-muted-foreground/60 ml-auto" style={{ fontFamily: "var(--font-mono)" }}>
              {property.documents.length}
            </span>
          </div>
          {property.documents.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
              Sin reglamento ni manual cargados. Puedes subirlos desde{" "}
              <Link href="/dashboard/propiedades" className="text-[#9a7fff] hover:underline">Propiedades</Link>.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {property.documents.map((doc) => (
                <li key={doc.id} className="px-5 py-3 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-[11px] text-muted-foreground">{DOC_TYPE_LABELS[doc.type] || doc.type}</p>
                  </div>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Generations timeline */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Historial de generaciones</p>
            <span className="text-[11px] text-muted-foreground/60 ml-auto" style={{ fontFamily: "var(--font-mono)" }}>
              {generations.length}
            </span>
          </div>
          {generations.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
              Esta propiedad aún no tiene informes generados.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {generations.map((g) => (
                <li key={g.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-secondary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground">
                      {MONTHS[(g.month - 1) % 12]} {g.year}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60" style={{ fontFamily: "var(--font-mono)" }}>
                      {new Date(g.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                  <Link
                    href={`/dashboard/generar/${g.id}`}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Ver <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </EmpresaShell>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
        <p className="text-[10px] uppercase text-muted-foreground/70" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}>
          {label}
        </p>
      </div>
      <p className="text-[15px] font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge variant="ok">Listo</Badge>;
  if (status === "processing" || status === "pending") return <Badge variant="warn">En proceso</Badge>;
  if (status === "failed") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}
