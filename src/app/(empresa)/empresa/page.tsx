export const dynamic = "force-dynamic";

import Link from "next/link";
import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";
import {
  Building2,
  FileText,
  AlertTriangle,
  FolderOpen,
  Layers,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

async function loadOverview(userId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalProperties, generationsThisMonth, totalDocuments, recentReported, recent] =
    await Promise.all([
      db.property.count({ where: { userId } }),
      db.generation.count({
        where: { userId, status: "completed", createdAt: { gte: startOfMonth } },
      }),
      db.propertyDocument.count({ where: { property: { userId } } }),
      db.generation.groupBy({
        by: ["propertyId"],
        where: { userId, status: "completed", createdAt: { gte: last30 } },
      }),
      db.generation.findMany({
        where: { userId },
        include: { property: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  return {
    totalProperties,
    generationsThisMonth,
    totalDocuments,
    withoutRecentReport: Math.max(0, totalProperties - recentReported.length),
    recent,
  };
}

export default async function EmpresaOverviewPage() {
  const elite = await eliteGate();
  const data = await loadOverview(elite.userId);
  const monthlyCap = elite.plan === "beta" ? null : PLANS.elite.limits.generationsPerMonth;

  const kpis = [
    {
      label: "Propiedades",
      value: data.totalProperties.toLocaleString("es-CO"),
      sub: "en tu portafolio",
      icon: Building2,
      tint: "#7c5cff",
    },
    {
      label: "Generaciones del mes",
      value: monthlyCap
        ? `${data.generationsThisMonth} / ${monthlyCap}`
        : data.generationsThisMonth.toLocaleString("es-CO"),
      sub: monthlyCap ? "informes/actas completados" : "ilimitado en beta",
      icon: FileText,
      tint: "#4cd6a0",
    },
    {
      label: "Sin informe reciente",
      value: data.withoutRecentReport.toLocaleString("es-CO"),
      sub: "en los últimos 30 días",
      icon: AlertTriangle,
      tint: data.withoutRecentReport > 0 ? "#ffb958" : "#4cd6a0",
    },
    {
      label: "Documentos cargados",
      value: data.totalDocuments.toLocaleString("es-CO"),
      sub: "reglamentos y manuales",
      icon: FolderOpen,
      tint: "#5fb4ff",
    },
  ];

  return (
    <EmpresaShell elite={elite}>
      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
        <PageHeader
          section="Portafolio"
          title="Resumen"
          description="Vista general de todas tus copropiedades y su actividad este mes."
          action={
            <Link
              href="/empresa/generar"
              className="inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "#7c5cff", boxShadow: "0 4px 20px rgba(124,92,255,0.35)" }}
            >
              <Layers className="h-4 w-4" />
              Generar en lote
            </Link>
          }
        />

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: `${k.tint}1a`, color: k.tint }}
                >
                  <k.icon className="h-4 w-4" />
                </div>
              </div>
              <p
                className="text-[10px] uppercase text-muted-foreground/70 mb-1"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
              >
                {k.label}
              </p>
              <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                {k.value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <Link
            href="/empresa/propiedades"
            className="group rounded-2xl border border-border bg-card p-5 flex items-center gap-4 hover:border-[#7c5cff]/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(124,92,255,0.12)", color: "#9a7fff" }}>
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Gestionar propiedades</p>
              <p className="text-[12px] text-muted-foreground">Buscar, filtrar y administrar tu portafolio a escala</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Link>
          <Link
            href="/empresa/generar"
            className="group rounded-2xl border border-border bg-card p-5 flex items-center gap-4 hover:border-[#7c5cff]/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(76,214,160,0.12)", color: "#4cd6a0" }}>
              <Layers className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Generar en lote</p>
              <p className="text-[12px] text-muted-foreground">Producir informes y actas de varias propiedades a la vez</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Link>
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Actividad reciente</p>
            <Link href="/empresa/propiedades" className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Ver todo <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <FileText className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aún no hay generaciones. Empieza generando en lote.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recent.map((g) => (
                <li key={g.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-secondary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {g.property?.name ?? "Propiedad eliminada"}
                    </p>
                    <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                      {MONTHS[(g.month - 1) % 12]} {g.year}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                  <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap" style={{ fontFamily: "var(--font-mono)" }}>
                    {new Date(g.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </EmpresaShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge variant="ok">Listo</Badge>;
  if (status === "processing" || status === "pending") return <Badge variant="warn">En proceso</Badge>;
  if (status === "failed") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}
