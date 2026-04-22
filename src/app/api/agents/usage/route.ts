export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((day + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    let limits: { agentMessagesPerDay: number; agentMessagesPerWeek: number } = { ...PLANS.pro.limits };
    try {
      const sub = await db.subscription.findUnique({ where: { userId } });
      if (sub?.planId === "plan-elite-ph") {
        limits = { ...PLANS.elite.limits };
      }
    } catch {
      // default to pro
    }

    const chatIds = await db.agentChat.findMany({
      where: { userId },
      select: { id: true },
    });
    const chatIdList = chatIds.map((c) => c.id);

    const [dailyCount, weeklyCount] = await Promise.all([
      chatIdList.length > 0
        ? db.agentMessage.count({
            where: {
              chatId: { in: chatIdList },
              role: "user",
              createdAt: { gte: startOfDay },
            },
          })
        : 0,
      chatIdList.length > 0
        ? db.agentMessage.count({
            where: {
              chatId: { in: chatIdList },
              role: "user",
              createdAt: { gte: startOfWeek },
            },
          })
        : 0,
    ]);

    return NextResponse.json({
      daily: dailyCount,
      weekly: weeklyCount,
      limits: {
        agentMessagesPerDay: limits.agentMessagesPerDay,
        agentMessagesPerWeek: limits.agentMessagesPerWeek,
      },
    });
  } catch (error) {
    console.error("[api/agents/usage] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
