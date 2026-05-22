export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const ADDON_AGENTS = ["metra", "nomethes", "hermes", "logistes"] as const;
type AddonAgent = (typeof ADDON_AGENTS)[number];

function calcMrr(planId: string | null | undefined, addonAgents: string[]): number {
  let mrr = 0;
  if (planId === "elite") mrr += 200;
  else if (planId === "pro") mrr += 20;
  mrr += (addonAgents?.length || 0) * 5;
  return mrr;
}

export async function GET(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const onlyWithSub = searchParams.get("onlyWithSub") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (onlyWithSub) {
    where.subscription = { isNot: null };
  }

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      subscription: {
        select: {
          id: true,
          planId: true,
          status: true,
          addonAgents: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Per-addon stats: count of users with each addon
  const addonStats: Record<AddonAgent, { count: number; mrr: number }> = {
    metra: { count: 0, mrr: 0 },
    nomethes: { count: 0, mrr: 0 },
    hermes: { count: 0, mrr: 0 },
    logistes: { count: 0, mrr: 0 },
  };

  for (const u of users) {
    if (!u.subscription?.addonAgents) continue;
    for (const agent of u.subscription.addonAgents) {
      if (agent in addonStats) {
        addonStats[agent as AddonAgent].count += 1;
        addonStats[agent as AddonAgent].mrr += 5;
      }
    }
  }

  const enriched = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    planId: u.subscription?.planId ?? null,
    subStatus: u.subscription?.status ?? "none",
    addonAgents: u.subscription?.addonAgents ?? [],
    monthlyTotal: u.subscription
      ? calcMrr(u.subscription.planId, u.subscription.addonAgents)
      : 0,
  }));

  return NextResponse.json({ users: enriched, addonStats });
}

export async function PATCH(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  let body: { userId: string; agent: AddonAgent; enabled: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, agent, enabled } = body;

  if (!userId || !agent || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Missing fields: userId, agent, enabled" }, { status: 400 });
  }

  if (!ADDON_AGENTS.includes(agent)) {
    return NextResponse.json(
      { error: `Invalid agent. Must be one of: ${ADDON_AGENTS.join(", ")}` },
      { status: 400 }
    );
  }

  // Confirm target user exists
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Upsert subscription
  let subscription = await db.subscription.findUnique({ where: { userId } });

  let updatedAddons: string[];

  if (!subscription) {
    // Create stub subscription with the addon already set
    updatedAddons = enabled ? [agent] : [];
    subscription = await db.subscription.create({
      data: {
        userId,
        status: "inactive",
        addonAgents: updatedAddons,
      },
    });
  } else {
    const current = subscription.addonAgents ?? [];
    if (enabled) {
      updatedAddons = current.includes(agent) ? current : [...current, agent];
    } else {
      updatedAddons = current.filter((a) => a !== agent);
    }
    subscription = await db.subscription.update({
      where: { userId },
      data: { addonAgents: updatedAddons },
    });
  }

  // Audit log
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  await logAdminAction({
    adminId: admin.userId,
    action: "addon.toggle",
    targetType: "subscription",
    targetId: subscription.id,
    metadata: { userId, agent, enabled },
    ipAddress: ip,
  });

  return NextResponse.json({
    ok: true,
    addonAgents: updatedAddons,
  });
}
