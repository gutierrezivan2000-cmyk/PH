export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS, isValidAgentId } from "@/lib/agents";
import { PLANS } from "@/lib/epayco";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { agentId } = await params;
    if (!isValidAgentId(agentId)) {
      return NextResponse.json({ error: "Agente no valido" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");
    if (!chatId) {
      return NextResponse.json({ error: "chatId requerido" }, { status: 400 });
    }

    const chat = await db.agentChat.findFirst({
      where: { id: chatId, userId: session.user.id, agentId },
    });
    if (!chat) {
      return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
    }

    const messages = await db.agentMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, attachments: true, createdAt: true },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[api/agents/chat] GET error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { agentId } = await params;
    if (!isValidAgentId(agentId)) {
      return NextResponse.json({ error: "Agente no valido" }, { status: 400 });
    }

    const body = await req.json();
    const { chatId: existingChatId, message, attachments: reqAttachments } = body as {
      chatId?: string;
      message: string;
      attachments?: { name: string; url: string; type: string; size: number }[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "El mensaje es requerido" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // ── Check usage limits ──────────────────────────────────────────────────
    const subscription = await db.subscription.findFirst({
      where: { userId },
    });

    const planLimits =
      subscription?.planId === "plan-elite-ph"
        ? PLANS.elite.limits
        : PLANS.pro.limits;

    const now = new Date();

    // Start of today
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Start of week (Monday)
    const day = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((day + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    // Count daily messages
    const dailyCount = await db.agentMessage.count({
      where: {
        role: "user",
        chat: { userId },
        createdAt: { gte: startOfDay },
      },
    });

    if (dailyCount >= planLimits.agentMessagesPerDay) {
      return NextResponse.json(
        {
          error: `Has alcanzado el limite diario de ${planLimits.agentMessagesPerDay} mensajes. Intenta manana.`,
        },
        { status: 429 }
      );
    }

    // Count weekly messages
    const weeklyCount = await db.agentMessage.count({
      where: {
        role: "user",
        chat: { userId },
        createdAt: { gte: startOfWeek },
      },
    });

    if (weeklyCount >= planLimits.agentMessagesPerWeek) {
      return NextResponse.json(
        {
          error: `Has alcanzado el limite semanal de ${planLimits.agentMessagesPerWeek} mensajes. Intenta la proxima semana.`,
        },
        { status: 429 }
      );
    }

    // ── Create or reuse chat ────────────────────────────────────────────────
    let chatId = existingChatId;
    let isNewChat = false;

    if (!chatId) {
      const chat = await db.agentChat.create({
        data: {
          userId,
          agentId,
          title: "Nuevo chat",
        },
      });
      chatId = chat.id;
      isNewChat = true;
    }

    // ── Save user message ───────────────────────────────────────────────────
    await db.agentMessage.create({
      data: {
        chatId,
        role: "user",
        content: message,
        attachments: reqAttachments && reqAttachments.length > 0 ? reqAttachments : undefined,
      },
    });

    // ── Build system prompt with memory ─────────────────────────────────────
    const agent = AGENTS[agentId];
    let systemPrompt = agent.systemPrompt;

    const memory = await db.agentMemory.findFirst({
      where: { userId, agentId },
    });

    if (memory?.content) {
      systemPrompt += `\n\nContexto del usuario (memoria):\n${memory.content}`;
    }

    // ── Load last 30 messages ───────────────────────────────────────────────
    const recentMessages = await db.agentMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: { role: true, content: true },
    });

    const anthropicMessages = recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // ── Call Anthropic API ──────────────────────────────────────────────────
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      temperature: 0.5,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";

    // ── Save assistant message ──────────────────────────────────────────────
    await db.agentMessage.create({
      data: {
        chatId,
        role: "assistant",
        content: reply,
      },
    });

    // ── Update chat title for new chats ─────────────────────────────────────
    let title: string | undefined;

    if (isNewChat) {
      title = message.length > 60 ? message.slice(0, 60) + "..." : message;
      await db.agentChat.update({
        where: { id: chatId },
        data: { title },
      });
    }

    return NextResponse.json({
      chatId,
      reply,
      title,
    });
  } catch (error) {
    console.error("[api/agents/chat] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
