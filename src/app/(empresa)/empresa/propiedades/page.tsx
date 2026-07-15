export const dynamic = "force-dynamic";

import Link from "next/link";
import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { Building2, ArrowUpRight, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { PropertyFilters } from "./PropertyFilters";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  group?: string;
  reporte?: string;
  sort?: string;
  page?: string;
}

async function loadProperties(userId: string, sp: SearchParams) {
  const q = sp.q?.trim() || "";
  const group = sp.group || "all";
  const reporte = sp.reporte || "all";
  const sort = sp.sort || "recent";
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const where: Prisma.PropertyWhereInput = { userId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  if (group !== "all") where.groupLabel = group;
  if (reporte === "con") {
    where.generations = { some: { status: "completed", createdAt: { gte: last30 } } };
  } else if (reporte === "sin") {
    where.generations = { none: { status: "completed", createdAt: { gte: last30 } } };
  }

  const orderBy: Prisma.PropertyOrderByWithRelationInput =
    sort === "name" ? { name: "asc" } : sort === "units" ? { units: "desc" } : { createdAt: "desc" };

  const [rows, total, groupRows] = await Promise.all([
    db.property.findMany({
      where,
      include: { _count: { select: { generations: true, documents: true } } },
      orderBy,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.property.count({ where }),
    db.property.findMany({
      where: { userId, groupLabel: { not: null } },
      select: { groupLabel: true },
      distinct: ["groupLabel"],
      orderBy: { groupLabel: "asc" },
    }),
  ]);

  // Last generation date per property (mirrors the admin groupBy-enrichment pattern).
  const ids = rows.map((r) => r.id);
  const lastGen = ids.length
    ? await db.generation.groupBy({
        by: ["propertyId"],
        where: { propertyId: { in: ids } },
        _max: { createdAt: true },
      })
    : [];
  const lastGenMap = Object.fromEntries(lastGen.map((g) => [g.propertyId, g._max.createdAt]));

  return {
    rows: rows.map((r) => ({ ...r, lastGenAt: lastGenMap[r.id] ?? null })),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    groups: groupRows.map((g) => g.groupLabel!).filter(Boolean),
  };
}

export default async function EmpresaPropiedadesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const elite = await eliteGate();
  const sp = await searchParams;
  const { rows, total, page, totalPages, groups } = await loadProperties(elite.userId, sp);

  const q = sp.q || "";
  const group = sp.group || "all";
  const reporte = sp.reporte || "all";
  const sort = sp.sort || "recent";

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const vals = { q, group, reporte, sort, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(vals)) {
      if (v && v !== "all" && v !== "recent" && v !== "1") params.set(k, v);
    }
    return `/empresa/propiedades${params.toString() ? `?${params}` : ""}`;
  }

  const headers = ["Propiedad", "Ciudad", "Grupo", "Unidades", "Últ. informe", "Docs", "Gen.", ""];

  return (
    <EmpresaShell elite={elite}>
      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
        <PageHeader
          section="Portafolio · Propiedades"
          title="Propiedades"
          description={`${total.toLocaleString("es-CO")} copropiedades en tu portafolio.`}
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

        <PropertyFilters
          defaultQ={q}
          defaultGroup={group}
          defaultReporte={reporte}
          defaultSort={sort}
          groups={groups}
        />

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Building2 className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No hay propiedades que coincidan.</p>
              <Link href="/dashboard/propiedades" className="text-[12px] text-[#9a7fff] hover:underline">
                Agregar una propiedad
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border" style={{ background: "rgba(255,255,255,0.02)" }}>
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left whitespace-nowrap"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.40)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary/50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div
                            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
                            style={{ background: "linear-gradient(135deg, #7c5cff, #5a3cf0)" }}
                          >
                            {p.name[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span className="font-medium text-foreground truncate max-w-[200px]">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-[12px] whitespace-nowrap">
                        {p.city || <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.groupLabel ? (
                          <Badge variant="secondary" className="text-[10px]">{p.groupLabel}</Badge>
                        ) : (
                          <span className="text-muted-foreground/30 text-[12px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-[12px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                        {p.units ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[12px]" style={{ fontFamily: "var(--font-mono)" }}>
                        {p.lastGenAt ? (
                          <span className="text-muted-foreground">
                            {new Date(p.lastGenAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" })}
                          </span>
                        ) : (
                          <span style={{ color: "#ffb958" }}>Nunca</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-[12px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                        {p._count.documents}
                      </td>
                      <td className="px-4 py-3 text-center text-[12px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                        {p._count.generations}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/empresa/propiedades/${p.id}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-border" style={{ background: "rgba(255,255,255,0.01)" }}>
              <span className="text-[11px] text-muted-foreground/60" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
                Página {page} de {totalPages} · {total.toLocaleString("es-CO")} resultados
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={buildUrl({ page: String(page - 1) })} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-all">
                    <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground/30 cursor-not-allowed">
                    <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                  </span>
                )}
                {page < totalPages ? (
                  <Link href={buildUrl({ page: String(page + 1) })} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-all">
                    Siguiente <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground/30 cursor-not-allowed">
                    Siguiente <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </EmpresaShell>
  );
}
