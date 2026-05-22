export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401 } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const ADDON_AGENTS = ["metra", "nomethes", "hermes", "logistes"] as const;

function calcMrr(planId: string | null | undefined, addonAgents: string[]): number {
  let mrr = 0;
  if (planId === "elite") mrr += 200;
  else if (planId === "pro") mrr += 20;
  mrr += (addonAgents?.length || 0) * 5;
  return mrr;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  // ---- date helpers ----
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // ---- parallel base queries ----
  const [
    totalUsers,
    allActiveSubs,
    allSubs,
    canceledLast30,
    activeSubsLastMonth,
    gen30d,
    chats30d,
    props30d,
    ticketsThisMonth,
    resolvedThisMonth,
    urgentResolved,
  ] = await Promise.all([
    // total users
    db.user.count(),

    // all active subscriptions with planId + addons for MRR
    db.subscription.findMany({
      where: { status: "active" },
      select: { planId: true, addonAgents: true, createdAt: true, updatedAt: true },
    }),

    // all subs (for plan distribution)
    db.subscription.findMany({
      select: { planId: true, status: true },
    }),

    // canceled in last 30d
    db.subscription.count({
      where: { status: "canceled", updatedAt: { gte: last30 } },
    }),

    // how many were active 30-60 days ago (approx churn denominator)
    db.subscription.count({
      where: { status: "active", createdAt: { lte: last60 } },
    }),

    // top users by gen count in 30d
    db.generation.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: last30 } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // top users by agent chat count in 30d
    db.agentChat.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: last30 } },
      _count: { id: true },
    }),

    // top users by property count
    db.property.groupBy({
      by: ["userId"],
      _count: { id: true },
    }),

    // tickets created this month
    db.ticket.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
    }),

    // tickets resolved this month
    db.ticket.count({
      where: {
        status: { in: ["resolved", "closed"] },
        updatedAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
    }),

    // urgent tickets resolved in last 30d (for SLA tracking)
    db.ticket.findMany({
      where: {
        priority: { in: ["urgent", "high"] },
        status: { in: ["resolved", "closed"] },
        updatedAt: { gte: last30 },
      },
      select: { createdAt: true, updatedAt: true },
    }),
  ]);

  // ---- MRR current ----
  const mrrCurrent = allActiveSubs.reduce((sum, s) => sum + calcMrr(s.planId, s.addonAgents), 0);

  // ---- MRR last month (estimate from subs created before start of current month) ----
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const subsLastMonth = allActiveSubs.filter((s) => s.createdAt < startOfCurrentMonth);
  const mrrLastMonth = subsLastMonth.reduce((sum, s) => sum + calcMrr(s.planId, s.addonAgents), 0);
  const mrrDelta = mrrCurrent - mrrLastMonth;
  const mrrDeltaPct = mrrLastMonth > 0 ? ((mrrDelta / mrrLastMonth) * 100).toFixed(1) : null;

  // ---- Usuarios activos 30d ----
  const activeUserIds = new Set([
    ...gen30d.map((g) => g.userId),
    ...chats30d.map((c) => c.userId),
  ]);
  const activeUsers30d = activeUserIds.size;

  // ---- Tasa de conversión ----
  const conversionRate = totalUsers > 0 ? ((allActiveSubs.length / totalUsers) * 100).toFixed(1) : "0";

  // ---- Churn ----
  const churnRate =
    activeSubsLastMonth > 0
      ? ((canceledLast30 / activeSubsLastMonth) * 100).toFixed(1)
      : "0";

  // ---- Plan distribution ----
  let proCount = 0, eliteCount = 0, noSubCount = 0;
  for (const s of allSubs) {
    if (s.status !== "active") continue;
    if (s.planId === "elite") eliteCount++;
    else proCount++;
  }
  noSubCount = totalUsers - (proCount + eliteCount);

  // ---- MRR over last 6 months ----
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    months.push({ key: monthKey(d), label: MONTH_ABBR[d.getMonth()], start: d, end });
  }

  // For each month, count active subs created before month end (approximation)
  const mrrByMonth = await Promise.all(
    months.map(async (m) => {
      const subs = await db.subscription.findMany({
        where: {
          status: { in: ["active", "canceled", "past_due"] },
          createdAt: { lte: m.end },
          OR: [
            { status: "active" },
            { updatedAt: { gte: m.start } }, // canceled/past_due that were active in that period
          ],
        },
        select: { planId: true, addonAgents: true, status: true, updatedAt: true, createdAt: true },
      });
      // Active at end of month = created before end + not canceled before month start
      const activeAtMonthEnd = subs.filter(
        (s) =>
          s.createdAt <= m.end &&
          (s.status === "active" || s.updatedAt >= m.start)
      );
      const monthMrr = activeAtMonthEnd.reduce(
        (sum, s) => sum + calcMrr(s.planId, s.addonAgents),
        0
      );
      return { key: m.key, label: m.label, mrr: monthMrr };
    })
  );

  // ---- Top 10 users by usage ----
  const genMap = Object.fromEntries(gen30d.map((g) => [g.userId, g._count.id]));
  const chatMap = Object.fromEntries(chats30d.map((c) => [c.userId, c._count.id]));
  const propMap = Object.fromEntries(props30d.map((p) => [p.userId, p._count.id]));

  // Collect top user IDs (union of top generators + top chatters)
  const topUserIdSet = new Set<string>();
  gen30d.forEach((g) => topUserIdSet.add(g.userId));
  chats30d.forEach((c) => topUserIdSet.add(c.userId));
  const topUserIds = [...topUserIdSet].slice(0, 20);

  const topUsersData = await db.user.findMany({
    where: { id: { in: topUserIds } },
    select: { id: true, name: true, email: true, image: true },
  });

  const topUsers = topUsersData
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      generations: genMap[u.id] || 0,
      chats: chatMap[u.id] || 0,
      properties: propMap[u.id] || 0,
      score: (genMap[u.id] || 0) + (chatMap[u.id] || 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  // ---- Add-ons most active ----
  const addonCounts: Record<string, number> = {
    metra: 0,
    nomethes: 0,
    hermes: 0,
    logistes: 0,
  };
  for (const s of allActiveSubs) {
    for (const a of s.addonAgents ?? []) {
      if (a in addonCounts) addonCounts[a]++;
    }
  }

  // ---- Ticket SLA ----
  const urgentSla24h = urgentResolved.filter((t) => {
    const diffMs = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
    return diffMs <= 24 * 60 * 60 * 1000;
  }).length;

  return NextResponse.json({
    kpis: {
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
    },
    mrrByMonth,
    planDistribution: {
      pro: proCount,
      elite: eliteCount,
      noSub: noSubCount,
      total: totalUsers,
    },
    topUsers,
    addonCounts,
    tickets: {
      createdThisMonth: ticketsThisMonth,
      resolvedThisMonth,
      urgentSla24h,
      urgentResolved: urgentResolved.length,
    },
  });
}
