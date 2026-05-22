export const dynamic = "force-dynamic";

import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import Link from "next/link";
import { CreditCard, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { SuscripcionesFilters } from "./SuscripcionesFilters";

const PAGE_SIZE = 50;

function calcMrr(planId: string | null | undefined, addonAgents: string[]): number {
  let mrr = 0;
  if (planId === "elite") mrr += 200;
  else if (planId === "pro") mrr += 20;
  mrr += (addonAgents?.length || 0) * 5;
  return mrr;
}

interface SearchParams {
  q?: string;
  status?: string;
  page?: string;
}

async function loadSubs(sp: SearchParams) {
  const q = sp.q?.trim() || "";
  const status = sp.status || "active";
  const page = Math.max(1, parseInt(sp.page || "1", 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (status !== "all") where.status = status;
  if (q) {
    where.user = {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [subscriptions, total, allActive, pastDueCount, canceledLast30] =
    await Promise.all([
      db.subscription.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      db.subscription.count({ where }),
      db.subscription.findMany({
        where: { status: "active" },
        select: { planId: true, addonAgents: true },
      }),
      db.subscription.count({ where: { status: "past_due" } }),
      db.subscription.count({ where: { status: "canceled", updatedAt: { gte: last30 } } }),
    ]);

  const mrr = allActive.reduce(
    (sum, s) => sum + calcMrr(s.planId, s.addonAgents),
    0
  );

  return {
    subscriptions: subscriptions.map((s) => ({
      ...s,
      mrr: calcMrr(s.planId, s.addonAgents),
    })),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    stats: { mrr, activeCount: allActive.length, pastDueCount, canceledLast30 },
  };
}

function daysDiff(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function SuscripcionesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  return (
    <AdminGate>
      <SuscripcionesContent sp={sp} />
    </AdminGate>
  );
}

async function SuscripcionesContent({ sp }: { sp: SearchParams }) {
  const { subscriptions, total, page, totalPages, stats } = await loadSubs(sp);

  const q = sp.q || "";
  const status = sp.status || "active";

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const vals = { q, status, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(vals)) {
      if (v && v !== "all" && v !== "1") params.set(k, v);
    }
    return `/admin/suscripciones${params.toString() ? `?${params}` : ""}`;
  }

  function statusBadge(s: string) {
    if (s === "active") return <Badge variant="ok">activa</Badge>;
    if (s === "past_due") return <Badge variant="destructive">past_due</Badge>;
    if (s === "canceled") return <Badge variant="secondary">cancelada</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  }

  const statItems = [
    {
      label: "MRR estimado",
      value: `$${stats.mrr.toLocaleString("es-CO")}`,
      color: "#4cd6a0",
    },
    {
      label: "Activas",
      value: stats.activeCount.toLocaleString("es-CO"),
      color: "#4cd6a0",
    },
    {
      label: "Past due",
      value: stats.pastDueCount.toLocaleString("es-CO"),
      color: "#ffb958",
    },
    {
      label: "Canceladas 30d",
      value: stats.canceledLast30.toLocaleString("es-CO"),
      color: "#ff6f6f",
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader
        section="02 · Suscripciones"
        title="Suscripciones"
        description={`${total.toLocaleString("es-CO")} suscripciones con el filtro actual.`}
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {statItems.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-card px-4 py-3.5"
          >
            <p
              className="text-[9.5px] uppercase text-muted-foreground/60 mb-1.5"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
            >
              {item.label}
            </p>
            <p
              className="text-xl font-semibold tracking-tight"
              style={{ color: item.color }}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <SuscripcionesFilters defaultQ={q} defaultStatus={status} />

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <CreditCard className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No hay suscripciones que coincidan.
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
                    "Plan",
                    "Estado",
                    "Vencimiento",
                    "Add-ons",
                    "MRR",
                    "ePayco Sub ID",
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
                {subscriptions.map((s) => {
                  const diff = s.currentPeriodEnd ? daysDiff(new Date(s.currentPeriodEnd)) : null;
                  let expiryLabel = "—";
                  let expiryColor = "rgba(255,255,255,0.40)";
                  if (diff !== null) {
                    if (diff >= 0) {
                      expiryLabel = `vence en ${diff}d`;
                      expiryColor = diff <= 7 ? "#ffb958" : "#4cd6a0";
                    } else {
                      expiryLabel = `venció hace ${Math.abs(diff)}d`;
                      expiryColor = "#ff6f6f";
                    }
                  }

                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-secondary/50 transition-colors group"
                    >
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div
                            className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white"
                            style={{
                              background: s.user.image
                                ? undefined
                                : "linear-gradient(135deg, #7c5cff, #5a3cf0)",
                            }}
                          >
                            {s.user.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s.user.image}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              (s.user.name?.[0] || s.user.email[0]).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-foreground truncate max-w-[130px]">
                              {s.user.name || s.user.email.split("@")[0]}
                            </p>
                            <p
                              className="text-[10px] text-muted-foreground/60 truncate max-w-[130px]"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {s.user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3">
                        {s.planId === "elite" ? (
                          <Badge variant="warn">Elite</Badge>
                        ) : s.planId === "pro" ? (
                          <Badge variant="accent">Pro</Badge>
                        ) : (
                          <Badge variant="outline">{s.planId || "Free"}</Badge>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">{statusBadge(s.status)}</td>

                      {/* Expiry */}
                      <td className="px-4 py-3">
                        <span
                          className="text-[11px] whitespace-nowrap"
                          style={{ fontFamily: "var(--font-mono)", color: expiryColor }}
                        >
                          {expiryLabel}
                        </span>
                      </td>

                      {/* Addons */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className="text-[12px] text-muted-foreground"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {s.addonAgents?.length || 0}
                        </span>
                      </td>

                      {/* MRR */}
                      <td className="px-4 py-3">
                        <span
                          className="text-[12px] font-medium"
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: s.mrr > 0 ? "#4cd6a0" : "rgba(255,255,255,0.30)",
                          }}
                        >
                          ${s.mrr}
                        </span>
                      </td>

                      {/* ePayco Sub ID */}
                      <td className="px-4 py-3 max-w-[140px]">
                        {s.epaycoSubscriptionId ? (
                          <span
                            className="text-[10px] text-muted-foreground/50 truncate block"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {s.epaycoSubscriptionId.slice(0, 18)}…
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Link */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/suscripciones/${s.id}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-all"
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-all"
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
