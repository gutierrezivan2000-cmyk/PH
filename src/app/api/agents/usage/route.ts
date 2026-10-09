export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";
import { accessibleAgents } from "@/lib/plan";
import { INCLUDED_AGENT_IDS } from "@/lib/agents";
import { limitesDelPlan, minutosDeAudioDesde, usoDelChat } from "@/lib/uso-chat-servidor";
import { periodoMensualBogota } from "@/lib/uso-chat";

const IS_DEMO = process.env.DEMO_MODE === "true";

/** El uso del chat (porcentaje) y los minutos de transcripción de la cuenta: lo que muestra el panel del asistente. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Coming-soon agents are locked for everyone (demo included) — only the
    // launched agents (Themis + Chronos) are accessible.
    let limits = limitesDelPlan(null);
    let accessible: string[] = [...INCLUDED_AGENT_IDS];
    try {
      const sub = await db.subscription.findUnique({ where: { userId } });
      limits = limitesDelPlan(sub?.planId);
      if (!IS_DEMO) {
        accessible = accessibleAgents(sub);
      }
    } catch {
      // default to pro limits + included agents
    }

    // El porcentaje del chat: null si no aplica (demo) o no se pudo calcular; `ilimitado` en las cuentas beta y la prueba de pruebas.
    const uso = IS_DEMO ? null : await usoDelChat(userId, now);
    const chat = uso === null ? null : uso.ilimitado ? { ilimitado: true as const } : {
      ilimitado: false as const,
      presupuestoUsd: uso.presupuestoUsd,
      porcentajeRestante: uso.estado.porcentajeRestante,
      ventana: uso.estado.ventana,
      renovaEn: uso.estado.renovaEn.toISOString(),
      agotado: uso.estado.agotado,
    };

    let transcriptionMinutesDay = 0;
    let transcriptionMinutesMonth = 0;
    try {
      // El mes incluye el audio de los documentos: es el mismo cupo que el del chat (ver uso-chat-servidor).
      const [daySum, mes] = await Promise.all([
        db.usageRecord.aggregate({
          where: { userId, type: "transcription", date: { gte: startOfDay } },
          _sum: { tokens: true },
        }),
        minutosDeAudioDesde(userId, periodoMensualBogota(now).inicio),
      ]);
      transcriptionMinutesDay = Math.ceil((daySum._sum.tokens ?? 0) / 60);
      transcriptionMinutesMonth = mes;
    } catch (err) {
      console.error("[api/agents/usage] transcription aggregate error:", err);
    }

    return NextResponse.json({
      chat,
      transcriptionMinutesDay,
      transcriptionMinutesMonth,
      accessibleAgents: accessible,
      limits: {
        chatBudgetUsd: limits.chatBudgetUsd,
        transcriptionMinutesPerDay: limits.transcriptionMinutesPerDay,
        transcriptionMinutesPerMonth: limits.transcriptionMinutesPerMonth,
      },
    });
  } catch (error) {
    console.error("[api/agents/usage] Error:", error);
    return NextResponse.json(
      {
        chat: null,
        transcriptionMinutesDay: 0,
        transcriptionMinutesMonth: 0,
        limits: {
          chatBudgetUsd: PLANS.pro.limits.chatBudgetUsd,
          transcriptionMinutesPerDay: PLANS.pro.limits.transcriptionMinutesPerDay,
          transcriptionMinutesPerMonth: PLANS.pro.limits.transcriptionMinutesPerMonth,
        },
      },
      { status: 200 }
    );
  }
}
