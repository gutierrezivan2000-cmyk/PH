export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401 } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const role = searchParams.get("role") || "all";
  const planStatus = searchParams.get("planStatus") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // Build filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }

  if (role !== "all") {
    where.role = role;
  }

  // Plan status filter operates on subscription.status
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
        _count: {
          select: {
            properties: true,
            generations: true,
            tickets: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.user.count({ where }),
  ]);

  // Compute 30d generations per user in one query
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const userIds = users.map((u) => u.id);
  const gen30d = await db.generation.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, createdAt: { gte: last30 } },
    _count: { id: true },
  });
  const gen30dMap = Object.fromEntries(gen30d.map((g) => [g.userId, g._count.id]));

  const enriched = users.map((u) => ({
    ...u,
    generations30d: gen30dMap[u.id] || 0,
  }));

  return NextResponse.json({ users: enriched, total, page, pageSize: PAGE_SIZE });
}
