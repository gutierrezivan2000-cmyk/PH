export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";
import { normalizePlanId, accessibleAgents } from "@/lib/plan";
import { INCLUDED_AGENT_IDS } from "@/lib/agents";

const IS_DEMO = process.env.DEMO_MODE === "true";

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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let limits: {
      agentMessagesPerDay: number;
      agentMessagesPerWeek: number;
      transcriptionMinutesPerDay: number;
      transcriptionMinutesPerMonth: number;
    } = { ...PLANS.pro.limits };
    // In demo mode every agent is unlocked; otherwise compute from subscription.
    let accessible: string[] = IS_DEMO
      ? ["themis", "chronos", "metra", "nomethes", "hermes", "logistes"]
      : [...INCLUDED_AGENT_IDS];
    try {
      const sub = await db.subscription.findUnique({ where: { userId } });
      if (normalizePlanId(sub?.planId) === "elite") {
        limits = { ...PLANS.elite.limits };
      }
      if (!IS_DEMO) {
        accessible = accessibleAgents(sub);
      }
    } catch {
      // default to pro limits + included agents
    }

    let dailyCount = 0;
    let weeklyCount = 0;
    let transcriptionMinutesDay = 0;
    let transcriptionMinutesMonth = 0;

    try {
      const chatIds = await db.agentChat.findMany({
        where: { userId },
        select: { id: true },
      });
      const chatIdList = chatIds.map((c) => c.id);

      if (chatIdList.length > 0) {
        const [d, w] = await Promise.all([
          db.agentMessage.count({
            where: {
              chatId: { in: chatIdList },
              role: "user",
              createdAt: { gte: startOfDay },
            },
          }),
          db.agentMessage.count({
            where: {
              chatId: { in: chatIdList },
              role: "user",
              createdAt: { gte: startOfWeek },
            },
          }),
        ]);
        dailyCount = d;
        weeklyCount = w;
      }
    } catch (err) {
      console.error("[api/agents/usage] count error (tables may not exist):", err);
    }

    try {
      const [daySum, monthSum] = await Promise.all([
        db.usageRecord.aggregate({
          where: { userId, type: "transcription", date: { gte: startOfDay } },
          _sum: { tokens: true },
        }),
        db.usageRecord.aggregate({
          where: { userId, type: "transcription", date: { gte: startOfMonth } },
          _sum: { tokens: true },
        }),
      ]);
      transcriptionMinutesDay = Math.ceil((daySum._sum.tokens ?? 0) / 60);
      transcriptionMinutesMonth = Math.ceil((monthSum._sum.tokens ?? 0) / 60);
    } catch (err) {
      console.error("[api/agents/usage] transcription aggregate error:", err);
    }

    return NextResponse.json({
      daily: dailyCount,
      weekly: weeklyCount,
      transcriptionMinutesDay,
      transcriptionMinutesMonth,
      accessibleAgents: accessible,
      limits: {
        agentMessagesPerDay: limits.agentMessagesPerDay,
        agentMessagesPerWeek: limits.agentMessagesPerWeek,
        transcriptionMinutesPerDay: limits.transcriptionMinutesPerDay,
        transcriptionMinutesPerMonth: limits.transcriptionMinutesPerMonth,
      },
    });
  } catch (error) {
    console.error("[api/agents/usage] Error:", error);
    return NextResponse.json(
      {
        daily: 0,
        weekly: 0,
        transcriptionMinutesDay: 0,
        transcriptionMinutesMonth: 0,
        limits: {
          agentMessagesPerDay: PLANS.pro.limits.agentMessagesPerDay,
          agentMessagesPerWeek: PLANS.pro.limits.agentMessagesPerWeek,
          transcriptionMinutesPerDay: PLANS.pro.limits.transcriptionMinutesPerDay,
          transcriptionMinutesPerMonth: PLANS.pro.limits.transcriptionMinutesPerMonth,
        },
      },
      { status: 200 }
    );
  }
}
