export const dynamic = "force-dynamic";

import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { db } from "@/lib/db";
import Link from "next/link";
import { TrendingUp, Users, BarChart2, XCircle } from "lucide-react";
import { calcMrr, normalizePlanId } from "@/lib/plan";

// ---- Helpers ----
const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.13em",
  textTransform: "uppercase" as const,
  fontSize: 10,
};

const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const AGENT_COLORS: Record<string, string> = {
  metra: "var(--ok)",
  nomethes: "var(--warn)",
  hermes: "var(--pink)",
  logistes: "var(--logistes)",
};

// ---- Data loading ----
async function loadMetrics() {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    allActiveSubs,
    canceledLast30,
    activeSubsLastMonth,
    gen30d,
    chats30d,
    props,
    ticketsCreated,
    ticketsResolved,
    urgentResolvedTickets,
  ] = await Promise.all([
    db.user.count(),

    db.subscription.findMany({
      where: { status: "active" },
      select: { planId: true, addonAgents: true, createdAt: true },
    }),

    db.subscription.count({
      where: { status: "canceled", updatedAt: { gte: last30 } },
    }),

    db.subscription.count({
      where: { status: "active", createdAt: { lte: last60 } },
    }),

    db.generation.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: last30 } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),

    db.agentChat.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: last30 } },
      _count: { id: true },
    }),

    db.property.groupBy({
      by: ["userId"],
      _count: { id: true },
    }),

    db.ticket.count({ where: { createdAt: { gte: startOfMonth } } }),

    db.ticket.count({
      where: { status: { in: ["resolved", "closed"] }, updatedAt: { gte: startOfMonth } },
    }),

    db.ticket.findMany({
      where: {
        priority: { in: ["urgent", "high"] },
        status: { in: ["resolved", "closed"] },
        updatedAt: { gte: last30 },
      },
      select: { createdAt: true, updatedAt: true },
    }),
  ]);

  // MRR
  const mrrCurrent = allActiveSubs.reduce((s, sub) => s + calcMrr(sub.planId, sub.addonAgents), 0);
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const mrrLastMonth = allActiveSubs
    .filter((s) => s.createdAt < startOfCurrentMonth)
    .reduce((s, sub) => s + calcMrr(sub.planId, sub.addonAgents), 0);
  const mrrDelta = mrrCurrent - mrrLastMonth;
  const mrrDeltaPct = mrrLastMonth > 0 ? ((mrrDelta / mrrLastMonth) * 100).toFixed(1) : null;

  // Active users
  const activeUserIds = new Set([...gen30d.map((g) => g.userId), ...chats30d.map((c) => c.userId)]);
  const activeUsers30d = activeUserIds.size;

  // Conversion
  const conversionRate =
    totalUsers > 0 ? ((allActiveSubs.length / totalUsers) * 100).toFixed(1) : "0";

  // Churn
  const churnRate =
    activeSubsLastMonth > 0
      ? ((canceledLast30 / activeSubsLastMonth) * 100).toFixed(1)
      : "0";

  // MRR by month — last 6 months
  const mrrByMonth: { label: string; mrr: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const subsAtMonthEnd = await db.subscription.findMany({
      where: {
        createdAt: { lte: monthEnd },
        OR: [
          { status: "active" },
          { status: { in: ["canceled", "past_due"] }, updatedAt: { gte: monthDate } },
        ],
      },
      select: { planId: true, addonAgents: true },
    });
    const monthMrr = subsAtMonthEnd.reduce((s, sub) => s + calcMrr(sub.planId, sub.addonAgents), 0);
    mrrByMonth.push({ label: MONTH_ABBR[monthDate.getMonth()], mrr: monthMrr });
  }

  // Plan distribution
  let proCount = 0, eliteCount = 0;
  for (const s of allActiveSubs) {
    const p = normalizePlanId(s.planId);
    if (p === "elite") eliteCount++;
    else if (p === "pro") proCount++;
  }
  const noSubCount = Math.max(0, totalUsers - proCount - eliteCount);

  // Top users
  const genMap = Object.fromEntries(gen30d.map((g) => [g.userId, g._count.id]));
  const chatMap = Object.fromEntries(chats30d.map((c) => [c.userId, c._count.id]));
  const propMap = Object.fromEntries(props.map((p) => [p.userId, p._count.id]));
  const topIds = [...new Set([...gen30d.map((g) => g.userId), ...chats30d.map((c) => c.userId)])].slice(0, 20);
  const topUsersData = await db.user.findMany({
    where: { id: { in: topIds } },
    select: { id: true, name: true, email: true },
  });
  const topUsers = topUsersData
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      generations: genMap[u.id] || 0,
      chats: chatMap[u.id] || 0,
      properties: propMap[u.id] || 0,
    }))
    .sort((a, b) => b.generations + b.chats - (a.generations + a.chats))
    .slice(0, 10);

  // Addon counts
  const addonCounts: Record<string, number> = { metra: 0, nomethes: 0, hermes: 0, logistes: 0 };
  for (const s of allActiveSubs) {
    for (const a of s.addonAgents ?? []) {
      if (a in addonCounts) addonCounts[a]++;
    }
  }

  // SLA
  const urgentSla24h = urgentResolvedTickets.filter((t) => {
    const ms = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
    return ms <= 86400000;
  }).length;

  return {
    mrrCurrent,
    mrrLastMonth,
    mrrDelta,
    mrrDeltaPct,
    activeUsers30d,
    totalUsers,
    conversionRate,
    activeSubs: allActiveSubs.length,
    churnRate,
    canceledLast30,
    mrrByMonth,
    planDistribution: { pro: proCount, elite: eliteCount, noSub: noSubCount },
    topUsers,
    addonCounts,
    tickets: { created: ticketsCreated, resolved: ticketsResolved, urgentSla24h, urgentTotal: urgentResolvedTickets.length },
  };
}

// ---- Sub-components ----

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  tint: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: `radial-gradient(120% 100% at 100% 0%, ${tint}, transparent 60%), var(--card)`,
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: tint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          color: accent,
        }}
      >
        <Icon size={16} />
      </div>
      <p style={{ ...MONO, color: "var(--ink-3)", marginBottom: 8 }}>{label}</p>
      <p
        style={{
          fontSize: 26,
          fontWeight: 600,
          color: "var(--foreground)",
          letterSpacing: "-0.025em",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ ...MONO, fontSize: 10, color: "var(--ink-4)" }}>{sub}</p>
      )}
    </div>
  );
}

function SectionCard({ title, label, children }: { title: string; label?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 24,
      }}
    >
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
        {label && <p style={{ ...MONO, color: "var(--ink-3)", marginBottom: 4 }}>{label}</p>}
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          {title}
        </p>
      </div>
      <div style={{ padding: 22 }}>{children}</div>
    </div>
  );
}

// ---- Page ----
export default async function MetricasPage() {
  return (
    <AdminGate>
      <MetricasContent />
    </AdminGate>
  );
}

async function MetricasContent() {
  const d = await loadMetrics();

  const maxMrr = Math.max(...d.mrrByMonth.map((m) => m.mrr), 1);
  const addonEntries = Object.entries(d.addonCounts) as [string, number][];
  const maxAddon = Math.max(...addonEntries.map(([, v]) => v), 1);
  const planTotal = d.planDistribution.pro + d.planDistribution.elite + d.planDistribution.noSub;

  return (
    <div style={{ padding: "24px 24px 80px", maxWidth: 1100 }}>
      <PageHeader
        section="05 · Métricas"
        title="Dashboard analítico"
        description="Resumen de KPIs clave, uso del producto y distribución de suscripciones."
      />

      {/* Section 1 — KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <KpiCard
          icon={TrendingUp}
          label="MRR actual"
          value={`$${d.mrrCurrent.toLocaleString("es-CO")}`}
          sub={
            d.mrrDeltaPct
              ? `${d.mrrDelta >= 0 ? "+" : ""}$${d.mrrDelta} / ${d.mrrDelta >= 0 ? "+" : ""}${d.mrrDeltaPct}%`
              : `vs mes anterior $${d.mrrLastMonth}`
          }
          tint="rgb(var(--accent-rgb) / 0.1)"
          accent="var(--accent-hi)"
        />
        <KpiCard
          icon={Users}
          label="Usuarios activos (30d)"
          value={d.activeUsers30d.toLocaleString("es-CO")}
          sub={`de ${d.totalUsers} usuarios totales`}
          tint="rgb(var(--info-rgb) / 0.1)"
          accent="var(--info)"
        />
        <KpiCard
          icon={BarChart2}
          label="Tasa de conversión"
          value={`${d.conversionRate}%`}
          sub={`${d.activeSubs} subs activas / ${d.totalUsers} usuarios`}
          tint="rgb(var(--ok-rgb) / 0.1)"
          accent="var(--ok)"
        />
        <KpiCard
          icon={XCircle}
          label="Churn (30d)"
          value={`${d.churnRate}%`}
          sub={`${d.canceledLast30} cancelaciones en 30d`}
          tint="rgb(var(--danger-rgb) / 0.08)"
          accent="var(--danger)"
        />
      </div>

      {/* Section 2 — MRR chart */}
      <SectionCard label="MRR mensual" title="Últimos 6 meses">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 140 }}>
          {d.mrrByMonth.map((m) => {
            const pct = maxMrr > 0 ? (m.mrr / maxMrr) * 100 : 0;
            const barH = Math.max(pct * 1.2, m.mrr > 0 ? 4 : 0);
            return (
              <div
                key={m.label}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <p
                  style={{
                    ...MONO,
                    fontSize: 9,
                    color: m.mrr > 0 ? "var(--accent-text)" : "var(--ink-4)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {m.mrr > 0 ? `$${m.mrr}` : "—"}
                </p>
                <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end" }}>
                  <div
                    style={{
                      width: "100%",
                      height: `${barH}%`,
                      minHeight: m.mrr > 0 ? 4 : 0,
                      borderRadius: "4px 4px 0 0",
                      background:
                        m.mrr > 0
                          ? "linear-gradient(180deg, var(--accent-hi) 0%, var(--accent) 100%)"
                          : "rgb(var(--veil-rgb) / 0.06)",
                      border: m.mrr === 0 ? "1px solid rgb(var(--veil-rgb) / 0.08)" : undefined,
                      transition: "height 0.3s",
                    }}
                  />
                </div>
                <p style={{ ...MONO, color: "var(--ink-3)", letterSpacing: "0.08em" }}>
                  {m.label}
                </p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Section 3 — Plan distribution */}
      <SectionCard label="Distribución" title="Distribución por plan">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Pro", count: d.planDistribution.pro, color: "var(--info-text)" },
            { label: "Elite", count: d.planDistribution.elite, color: "var(--accent-text)" },
            { label: "Sin suscripción", count: d.planDistribution.noSub, color: "var(--ink-4)" },
          ].map((p) => {
            const pct = planTotal > 0 ? ((p.count / planTotal) * 100).toFixed(1) : "0";
            return (
              <div key={p.label}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <p style={{ ...MONO, color: "var(--ink-2)" }}>{p.label}</p>
                  <p style={{ ...MONO, color: "var(--ink-3)" }}>
                    {p.count} · {pct}%
                  </p>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: "rgb(var(--veil-rgb) / 0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 3,
                      background: p.color,
                      transition: "width 0.4s",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Section 4 — Top users */}
      <SectionCard label="Top usuarios" title="Más activos en 30 días">
        <div>
          {d.topUsers.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-4)", textAlign: "center", padding: "20px 0" }}>
              Sin datos de actividad aún.
            </p>
          ) : (
            d.topUsers.map((u, i) => (
              <Link
                key={u.id}
                href={`/admin/usuarios/${u.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr 80px 80px 80px",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom:
                      i < d.topUsers.length - 1 ? "1px solid rgb(var(--veil-rgb) / 0.05)" : undefined,
                  }}
                >
                  <p
                    style={{
                      ...MONO,
                      fontSize: 11,
                      color: i < 3 ? "var(--accent-text)" : "var(--ink-4)",
                      fontWeight: 700,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
                      {u.name || u.email}
                    </p>
                    <p style={{ ...MONO, fontSize: 9, color: "var(--ink-4)" }}>{u.email}</p>
                  </div>
                  <p style={{ ...MONO, fontSize: 10, color: "var(--ok-text)", textAlign: "center" }}>
                    {u.generations} gen
                  </p>
                  <p style={{ ...MONO, fontSize: 10, color: "var(--info-text)", textAlign: "center" }}>
                    {u.chats} chats
                  </p>
                  <p style={{ ...MONO, fontSize: 10, color: "var(--warn-text)", textAlign: "center" }}>
                    {u.properties} prop
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </SectionCard>

      {/* Section 5 — Add-ons */}
      <SectionCard label="Add-ons" title="Add-ons más activos">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", height: 100 }}>
          {addonEntries.map(([id, count]) => {
            const color = AGENT_COLORS[id] || "var(--accent-text)";
            const pct = maxAddon > 0 ? (count / maxAddon) * 100 : 0;
            const name = id.charAt(0).toUpperCase() + id.slice(1);
            return (
              <div
                key={id}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <p style={{ ...MONO, fontSize: 9, color, letterSpacing: "0.06em" }}>
                  {count > 0 ? count : "—"}
                </p>
                <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end" }}>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(pct, count > 0 ? 5 : 0)}%`,
                      borderRadius: "4px 4px 0 0",
                      background: count > 0 ? color : "var(--ink-4)",
                      opacity: count > 0 ? 0.85 : 1,
                    }}
                  />
                </div>
                <p style={{ ...MONO, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                  {name}
                </p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Section 6 — Tickets */}
      <SectionCard label="Soporte" title="Tickets este mes">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
          {[
            { label: "Creados", value: d.tickets.created, color: "var(--ink-2)" },
            { label: "Resueltos", value: d.tickets.resolved, color: "var(--ok-text)" },
            {
              label: "SLA urgentes (<24h)",
              value: `${d.tickets.urgentSla24h} / ${d.tickets.urgentTotal}`,
              color: "var(--warn-text)",
            },
          ].map((t) => (
            <div
              key={t.label}
              style={{
                background: "rgb(var(--veil-rgb) / 0.03)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "14px 16px",
              }}
            >
              <p style={{ ...MONO, color: "var(--ink-3)", marginBottom: 8 }}>{t.label}</p>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: t.color,
                  letterSpacing: "-0.02em",
                }}
              >
                {t.value}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
