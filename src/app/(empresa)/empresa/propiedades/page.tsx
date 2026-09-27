export const dynamic = "force-dynamic";

import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { Boton, CabeceraPieza, Pagina, PieTabla, Pieza, SinResultados, Vacio } from "@/components/kit";
import { db } from "@/lib/db";
import { PropertyFilters, TablaPropiedades, type FilaPropiedad } from "./PropertyFilters";
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
  if (process.env.DEMO_MODE === "true") {
    const { getDemoPortfolioProperties } = await import("@/lib/demo-store");
    return getDemoPortfolioProperties(userId, sp, PAGE_SIZE);
  }

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

  // Filas planas para la tabla (componente de cliente): solo lo que se pinta.
  const filas: FilaPropiedad[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    groupLabel: p.groupLabel,
    units: p.units,
    lastGenAt: p.lastGenAt,
    documentos: p._count.documents,
    generaciones: p._count.generations,
  }));

  // ¿Vacío porque no hay copropiedades o porque los filtros no encuentran nada?
  const conFiltros = Boolean(q.trim()) || group !== "all" || reporte !== "all";
  const consulta = [q.trim() && `«${q.trim()}»`, group !== "all" && group, reporte === "con" ? "con informe en 30 días" : reporte === "sin" ? "sin informe en 30 días" : ""]
    .filter(Boolean)
    .join(" · ");

  const vacio = conFiltros ? (
    <SinResultados
      consulta={consulta}
      titulo="No hay propiedades que coincidan."
      texto="Prueba con otro nombre o ciudad, o quita los filtros."
      acciones={
        <>
          <Boton href="/dashboard/propiedades" flecha="crea">Agregar una propiedad</Boton>
          <Boton variante="fantasma" href="/empresa/propiedades">Quitar filtros</Boton>
        </>
      }
    />
  ) : (
    <Vacio
      titulo="Aún no tienes copropiedades."
      texto="Agrega la primera desde tu panel y aparecerá aquí, lista para generar en lote."
      acciones={<Boton href="/dashboard/propiedades" flecha="avanza">Agregar la primera</Boton>}
    />
  );

  const cuenta = `${total.toLocaleString("es-CO")} ${total === 1 ? "copropiedad" : "copropiedades"}`;

  return (
    <EmpresaShell elite={elite}>
      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="03"
            titulo="Propiedades"
            subtitulo={`${cuenta} en tu portafolio.`}
            acciones={<Boton href="/empresa/generar" flecha="avanza">Generar en lote</Boton>}
          />

          <PropertyFilters
            defaultQ={q}
            defaultGroup={group}
            defaultReporte={reporte}
            defaultSort={sort}
            groups={groups}
          />

          <TablaPropiedades filas={filas} vacio={vacio} />

          {rows.length > 0 && (
            <PieTabla texto={`Página ${page} de ${Math.max(1, totalPages)} · ${cuenta}`}>
              {totalPages > 1 && (
                <nav className="k-btns" aria-label="Páginas">
                  <Boton variante="secundario" tam={40} flecha="vuelve" href={buildUrl({ page: String(page - 1) })} disabled={page <= 1}>
                    Anterior
                  </Boton>
                  <Boton variante="secundario" tam={40} flecha="avanza" href={buildUrl({ page: String(page + 1) })} disabled={page >= totalPages}>
                    Siguiente
                  </Boton>
                </nav>
              )}
            </PieTabla>
          )}
        </Pieza>
      </Pagina>
    </EmpresaShell>
  );
}
