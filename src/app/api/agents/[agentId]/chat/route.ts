export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS, isValidAgentId } from "@/lib/agents";
import { PLANS } from "@/lib/epayco";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } };

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

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const day = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((day + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

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

    // ── Build system prompt with memory + property docs ─────────────────────
    const agent = AGENTS[agentId];
    let systemPrompt = agent.systemPrompt;

    let memoryContent = "";
    try {
      const memory = await db.agentMemory.findFirst({ where: { userId, agentId } });
      memoryContent = memory?.content ?? "";
    } catch (err) {
      console.error("[api/agents/chat] memory fetch failed:", err);
    }

    if (memoryContent) {
      systemPrompt += `\n\nContexto del usuario (memoria):\n${memoryContent}`;
    }

    try {
      const properties = await db.property.findMany({
        where: { userId },
        include: { documents: true },
        take: 5,
      });
      if (properties.length > 0) {
        const propInfo = properties.map((p) => {
          let info = `- ${p.name}`;
          if (p.address) info += `, ${p.address}`;
          if (p.city) info += `, ${p.city}`;
          if (p.units) info += ` (${p.units} unidades)`;
          const docs = p.documents.map((d) => {
            const label = d.type === "manual_convivencia" ? "Manual de Convivencia" : d.type === "reglamento_interno" ? "Reglamento Interno" : d.type;
            return `  ${label}: ${d.name}`;
          });
          if (docs.length > 0) info += `\n  Documentos:\n${docs.join("\n")}`;
          return info;
        }).join("\n");
        systemPrompt += `\n\nPropiedades del usuario:\n${propInfo}`;
      }
    } catch (err) {
      console.error("[api/agents/chat] properties fetch failed:", err);
    }

    // ── Load last 30 messages and build Anthropic payload ───────────────────
    const recentMessages = await db.agentMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: { role: true, content: true, attachments: true },
    });

    const anthropicMessages = recentMessages.map((m) => {
      const atts = m.attachments as { name: string; url: string; type: string; size: number }[] | null;
      const imageAtts = atts?.filter((a) => a.type.startsWith("image/")) ?? [];
      const docAtts = atts?.filter((a) => !a.type.startsWith("image/")) ?? [];

      if (m.role === "user" && (imageAtts.length > 0 || docAtts.length > 0)) {
        const contentBlocks: ContentBlock[] = [];

        for (const img of imageAtts) {
          contentBlocks.push({
            type: "image",
            source: { type: "url", url: img.url },
          });
        }

        let textContent = m.content;
        if (docAtts.length > 0) {
          const docList = docAtts.map((d) => `[Archivo adjunto: ${d.name} (${d.type})]`).join("\n");
          textContent = `${docList}\n\n${m.content}`;
        }
        contentBlocks.push({ type: "text", text: textContent });

        return { role: "user" as const, content: contentBlocks };
      }

      return { role: m.role as "user" | "assistant", content: m.content };
    });

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
