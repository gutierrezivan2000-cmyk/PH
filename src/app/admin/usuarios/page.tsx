export const dynamic = "force-dynamic";

import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import Link from "next/link";
import { Users, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { UsuariosFilters } from "./UsuariosFilters";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  role?: string;
  planStatus?: string;
  page?: string;
}

async function loadUsers(sp: SearchParams) {
  const q = sp.q?.trim() || "";
  const role = sp.role || "all";
  const planStatus = sp.planStatus || "all";
  const page = Math.max(1, parseInt(sp.page || "1", 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (role !== "all") where.role = role;
  if (planStatus === "no_sub") {
    where.subscription = { is: null };
  } else if (planStatus !== "all") {
    where.subscription = { status: planStatus };
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        subscription: true,
        _count: { select: { properties: true, generations: true, tickets: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.user.count({ where }),
  ]);

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const userIds = users.map((u) => u.id);
  const gen30d = await db.generation.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, createdAt: { gte: last30 } },
    _count: { id: true },
  });
  const gen30dMap = Object.fromEntries(gen30d.map((g) => [g.userId, g._count.id]));

  return {
    users: users.map((u) => ({ ...u, generations30d: gen30dMap[u.id] || 0 })),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  return (
    <AdminGate>
      <UsuariosContent sp={sp} />
    </AdminGate>
  );
}

async function UsuariosContent({ sp }: { sp: SearchParams }) {
  const { users, total, page, totalPages } = await loadUsers(sp);

  const q = sp.q || "";
  const role = sp.role || "all";
  const planStatus = sp.planStatus || "all";

  function planBadge(sub: { planId?: string | null } | null) {
    if (!sub?.planId) return <Badge variant="outline">Free</Badge>;
    if (sub.planId === "elite") return <Badge variant="warn">Elite</Badge>;
    if (sub.planId === "pro") return <Badge variant="accent">Pro</Badge>;
    return <Badge variant="outline">{sub.planId}</Badge>;
  }

  function statusBadge(sub: { status?: string } | null) {
    if (!sub) return <Badge variant="secondary" className="opacity-50">—</Badge>;
    if (sub.status === "active") return <Badge variant="ok">activa</Badge>;
    if (sub.status === "past_due") return <Badge variant="destructive">past_due</Badge>;
    if (sub.status === "canceled") return <Badge variant="secondary">cancelada</Badge>;
    return <Badge variant="outline">{sub.status}</Badge>;
  }

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const vals = { q, role, planStatus, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(vals)) {
      if (v && v !== "all" && v !== "1") params.set(k, v);
    }
    return `/admin/usuarios${params.toString() ? `?${params}` : ""}`;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader
        section="01 · Usuarios"
        title="Usuarios"
        description={`${total.toLocaleString("es-CO")} usuarios registrados en la plataforma.`}
      />

      {/* Filters row */}
      <UsuariosFilters
        defaultQ={q}
        defaultRole={role}
        defaultPlanStatus={planStatus}
      />

      {/* Table card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Users className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No hay usuarios que coincidan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b border-border"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  {[
                    "Usuario",
                    "Email",
                    "Empresa / Ciudad",
                    "Plan",
                    "Estado",
                    "Props",
                    "Gen 30d",
                    "Registro",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
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
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-secondary/50 transition-colors group"
                  >
                    {/* Avatar + name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-[160px]">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
                          style={{
                            background: u.image
                              ? undefined
                              : "linear-gradient(135deg, #7c5cff, #5a3cf0)",
                          }}
                        >
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.image}
                              alt={u.name || ""}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            (u.name?.[0] || u.email[0]).toUpperCase()
                          )}
                        </div>
                        <span className="font-medium text-foreground truncate max-w-[120px]">
                          {u.name || <span className="text-muted-foreground/50 italic">Sin nombre</span>}
                        </span>
                        {u.role === "admin" && (
                          <Badge variant="accent" className="text-[9px] px-1.5 py-0.5 ml-0.5">
                            admin
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px]">
                      <span
                        className="truncate block text-[12px]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {u.email}
                      </span>
                    </td>

                    {/* Company / City */}
                    <td className="px-4 py-3">
                      <div className="text-[12px] text-muted-foreground whitespace-nowrap">
                        {u.company || u.city ? (
                          <>
                            {u.company && (
                              <span className="text-foreground/80">{u.company}</span>
                            )}
                            {u.company && u.city && (
                              <span className="text-muted-foreground/40 mx-1">·</span>
                            )}
                            {u.city && <span>{u.city}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-3">{planBadge(u.subscription)}</td>

                    {/* Status */}
                    <td className="px-4 py-3">{statusBadge(u.subscription)}</td>

                    {/* Properties */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className="text-[12px] text-muted-foreground"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {u._count.properties}
                      </span>
                    </td>

                    {/* Generations 30d */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className="text-[12px] text-muted-foreground"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {u.generations30d}
                      </span>
                    </td>

                    {/* Created At */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="text-[11px] text-muted-foreground/60"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {new Date(u.createdAt).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </span>
                    </td>

                    {/* Link */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/usuarios/${u.id}`}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-5 py-3.5 border-t border-border"
            style={{ background: "rgba(255,255,255,0.01)" }}
          >
            <span
              className="text-[11px] text-muted-foreground/60"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
            >
              Página {page} de {totalPages} · {total.toLocaleString("es-CO")} resultados
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground/30 cursor-not-allowed">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </span>
              )}
              {page < totalPages ? (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
                >
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground/30 cursor-not-allowed">
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
