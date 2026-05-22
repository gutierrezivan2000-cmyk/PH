import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { db } from "@/lib/db";
import Link from "next/link";
import {
  Users,
  CreditCard,
  Ticket as TicketIcon,
  TrendingUp,
  Activity,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function loadOverview() {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsers30d,
    activeSubs,
    pastDueSubs,
    openTickets,
    urgentTickets,
    generations30d,
    generations7d,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: last30 } } }),
    db.subscription.count({ where: { status: "active" } }),
    db.subscription.count({ where: { status: "past_due" } }),
    db.ticket.count({ where: { status: { in: ["open", "pending"] } } }),
    db.ticket.count({
      where: {
        status: { in: ["open", "pending"] },
        priority: { in: ["high", "urgent"] },
      },
    }),
    db.generation.count({ where: { createdAt: { gte: last30 } } }),
    db.generation.count({ where: { createdAt: { gte: last7 } } }),
  ]);

  // MRR estimate (Pro $20 + Elite $200 + add-ons $5/each)
  const allActive = await db.subscription.findMany({
    where: { status: "active" },
    select: { planId: true, addonAgents: true },
  });

  let mrr = 0;
  for (const s of allActive) {
    if (s.planId === "elite") mrr += 200;
    else if (s.planId === "pro") mrr += 20;
    mrr += (s.addonAgents?.length || 0) * 5;
  }

  // Recent tickets to surface in the panel
  const recentTickets = await db.ticket.findMany({
    where: { status: { in: ["open", "pending"] } },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { user: { select: { name: true, email: true } } },
  });

  return {
    totalUsers,
    newUsers30d,
    activeSubs,
    pastDueSubs,
    openTickets,
    urgentTickets,
    generations30d,
    generations7d,
    mrr,
    recentTickets,
  };
}

export default async function AdminOverviewPage() {
  return (
    <AdminGate>
      <OverviewContent />
    </AdminGate>
  );
}

async function OverviewContent() {
  const data = await loadOverview();

  const stats: Array<{
    label: string;
    value: string;
    sub?: string;
    href?: string;
    icon: typeof Users;
    tint: string;
    accent: string;
  }> = [
    {
      label: "Usuarios",
      value: data.totalUsers.toLocaleString("es-CO"),
      sub: `+${data.newUsers30d} en 30 días`,
      href: "/admin/usuarios",
      icon: Users,
      tint: "rgba(124,92,255,0.10)",
      accent: "#9a7fff",
    },
    {
      label: "MRR estimado",
      value: `$${data.mrr.toLocaleString("es-CO")}`,
      sub: `${data.activeSubs} suscripciones activas`,
      href: "/admin/suscripciones",
      icon: CreditCard,
      tint: "rgba(76,214,160,0.10)",
      accent: "#4cd6a0",
    },
    {
      label: "Tickets abiertos",
      value: data.openTickets.toLocaleString("es-CO"),
      sub:
        data.urgentTickets > 0
          ? `${data.urgentTickets} urgentes`
          : "Sin urgentes",
      href: "/admin/tickets",
      icon: TicketIcon,
      tint: "rgba(255,185,88,0.10)",
      accent: "#ffb958",
    },
    {
      label: "Generaciones / 30d",
      value: data.generations30d.toLocaleString("es-CO"),
      sub: `${data.generations7d} en 7 días`,
      href: "/admin/metricas",
      icon: Activity,
      tint: "rgba(95,180,255,0.10)",
      accent: "#5fb4ff",
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader
        section="00 · Resumen"
        title="Centro de operaciones"
        description="Vista rápida de usuarios, suscripciones, tickets y uso del producto. Los datos son en tiempo real."
      />

      {data.pastDueSubs > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border mb-6"
          style={{
            background: "rgba(255,111,111,0.06)",
            borderColor: "rgba(255,111,111,0.30)",
          }}
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" style={{ color: "#ff8585" }} />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-foreground">
              {data.pastDueSubs} suscripción{data.pastDueSubs !== 1 ? "es" : ""} con pago atrasado
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Revisa el estado en ePayco antes de cancelar.
            </p>
          </div>
          <Link
            href="/admin/suscripciones?status=past_due"
            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: "rgba(255,111,111,0.40)",
              color: "#ff8585",
            }}
          >
            Ver
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => {
          const inner = (
            <div
              className="group relative rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-px"
              style={{
                background: `radial-gradient(120% 100% at 100% 0%, ${s.tint}, transparent 60%), var(--card)`,
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{ background: s.tint, color: s.accent }}
                >
                  <s.icon className="h-4 w-4" />
                </div>
                <ArrowUpRight
                  className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-px group-hover:-translate-y-px"
                  style={{ color: s.accent }}
                />
              </div>
              <p
                className="text-[10px] uppercase text-muted-foreground/70 mb-2"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
              >
                {s.label}
              </p>
              <p className="text-2xl font-medium tracking-tight text-foreground">
                {s.value}
              </p>
              {s.sub && (
                <p
                  className="text-[11px] mt-1 truncate"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  {s.sub}
                </p>
              )}
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {inner}
            </Link>
          ) : (
            <div key={s.label}>{inner}</div>
          );
        })}
      </div>

      {/* Recent tickets */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p
              className="text-[10px] uppercase text-muted-foreground/70"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
            >
              Cola de soporte
            </p>
            <h2 className="text-[15px] font-semibold tracking-tight mt-1 text-foreground">
              Tickets recientes
            </h2>
          </div>
          <Link
            href="/admin/tickets"
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Ver todos →
          </Link>
        </div>

        {data.recentTickets.length === 0 ? (
          <div className="p-8 text-center">
            <TicketIcon className="h-6 w-6 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No hay tickets abiertos. Buen trabajo.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.recentTickets.map((t) => (
              <Link
                key={t.id}
                href={`/admin/tickets/${t.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-secondary transition-colors"
              >
                <span
                  className="text-[10px] px-2 py-1 rounded-full font-medium"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background:
                      t.priority === "urgent"
                        ? "rgba(255,111,111,0.12)"
                        : t.priority === "high"
                          ? "rgba(255,185,88,0.12)"
                          : "rgba(255,255,255,0.05)",
                    color:
                      t.priority === "urgent"
                        ? "#ff8585"
                        : t.priority === "high"
                          ? "#ffb958"
                          : "rgba(255,255,255,0.55)",
                  }}
                >
                  {t.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground truncate">
                    {t.subject}
                  </p>
                  <p
                    className="text-[11px] text-muted-foreground/70 truncate"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {t.user.email} · {t.category} · {new Date(t.createdAt).toLocaleDateString("es-CO")}
                  </p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
