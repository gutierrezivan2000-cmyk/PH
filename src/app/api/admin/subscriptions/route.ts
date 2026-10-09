export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401 } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { codigoDeUsuario, filtroDeBusqueda } from "@/lib/admin/anonimo";
import { calcMrr } from "@/lib/plan";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const status = searchParams.get("status") || "active";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (status !== "all") {
    where.status = status;
  }

  // Por código, o por correo completo y exacto. Nunca por nombre ni parcial.
  const busqueda = filtroDeBusqueda(q);
  if (busqueda) where.user = busqueda;

  const [subscriptions, total] = await Promise.all([
    db.subscription.findMany({
      where,
      select: {
        id: true, userId: true, planId: true, status: true, addonAgents: true, createdAt: true, updatedAt: true,
        currentPeriodStart: true, currentPeriodEnd: true,
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.subscription.count({ where }),
  ]);

  // Top-level stats (always across all active subs)
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [allActive, pastDueCount, canceledLast30Count] = await Promise.all([
    db.subscription.findMany({
      where: { status: "active" },
      select: { planId: true, addonAgents: true },
    }),
    db.subscription.count({ where: { status: "past_due" } }),
    db.subscription.count({
      where: { status: "canceled", updatedAt: { gte: last30 } },
    }),
  ]);

  const mrr = allActive.reduce(
    (sum, s) => sum + calcMrr(s.planId, s.addonAgents),
    0
  );

  const enriched = subscriptions.map((s) => ({
    ...s,
    user: { id: s.userId, codigo: codigoDeUsuario(s.userId) },
    mrr: calcMrr(s.planId, s.addonAgents),
  }));

  return NextResponse.json({
    subscriptions: enriched,
    total,
    page,
    pageSize: PAGE_SIZE,
    stats: {
      mrr,
      activeCount: allActive.length,
      pastDueCount,
      canceledLast30: canceledLast30Count,
    },
  });
}
