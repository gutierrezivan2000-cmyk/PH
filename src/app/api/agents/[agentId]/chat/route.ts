export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS, isValidAgentId } from "@/lib/agents";
import { PLANS } from "@/lib/epayco";
import { ensureAgentTables, isMissingRelationError } from "@/lib/ensure-agent-tables";
import { parseAttachments, type ParsedAttachment } from "@/lib/parse-attachment";

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

    try {
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
    } catch (err) {
      console.error("[api/agents/chat] GET db error:", err);
      return NextResponse.json({ messages: [] });
    }
  } catch (error) {
    console.error("[api/agents/chat] GET error:", error);
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  let step = "init";
  try {
    step = "auth";
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    step = "validate-agent";
    const { agentId } = await params;
    if (!isValidAgentId(agentId)) {
      return NextResponse.json({ error: "Agente no valido" }, { status: 400 });
    }

    step = "parse-body";
    const body = await req.json();
    const { chatId: existingChatId, message, attachments: reqAttachments } = body as {
      chatId?: string;
      message: string;
      attachments?: { name: string; url: string; type: string; size: number }[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "El mensaje es requerido" }, { status: 400 });
    }

    step = "check-api-key";
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("[api/agents/chat] ANTHROPIC_API_KEY is not set");
      return NextResponse.json(
        { error: "El servicio de IA no esta configurado. Contacta al administrador." },
        { status: 500 }
      );
    }

    // ── Scriptor-specific guard: size cap and Whisper availability ─────────
    step = "scriptor-validation";
    if (agentId === "scriptor") {
      const audioAtts = (reqAttachments || []).filter(
        (a) => a.type?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|webm)$/i.test(a.name)
      );
      const MAX_AUDIO_MB = 25;
      const oversized = audioAtts.find((a) => a.size > MAX_AUDIO_MB * 1024 * 1024);
      if (oversized) {
        return NextResponse.json(
          {
            error: `El archivo ${oversized.name} excede el limite de ${MAX_AUDIO_MB}MB para transcripcion. Divide el audio o usa una calidad menor.`,
          },
          { status: 413 }
        );
      }
      if (!process.env.OPENAI_API_KEY && audioAtts.length > 0) {
        return NextResponse.json(
          { error: "La transcripcion no esta configurada (falta OPENAI_API_KEY). Contacta al administrador." },
          { status: 500 }
        );
      }
    }

    const userId = session.user.id;

    // ── Usage limits (fail-open if tables missing) ─────────────────────────
    step = "usage-limits";
    let planLimits: { agentMessagesPerDay: number; agentMessagesPerWeek: number } = {
      ...PLANS.pro.limits,
    };

    try {
      const subscription = await db.subscription.findFirst({ where: { userId } });
      if (subscription?.planId === "plan-elite-ph") {
        planLimits = { ...PLANS.elite.limits };
      }
    } catch (err) {
      console.error("[api/agents/chat] subscription check failed:", err);
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const day = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((day + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    try {
      const chatIds = await db.agentChat.findMany({
        where: { userId },
        select: { id: true },
      });
      const chatIdList = chatIds.map((c) => c.id);

      if (chatIdList.length > 0) {
        const dailyCount = await db.agentMessage.count({
          where: {
            chatId: { in: chatIdList },
            role: "user",
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
            chatId: { in: chatIdList },
            role: "user",
            createdAt: { gte: startOfWeek },
          },
        });

        if (weeklyCount >= planLimits.agentMessagesPerWeek) {
          return NextResponse.json(
            {
              error: `Has alcanzado el limite semanal de ${planLimits.agentMessagesPerWeek} mensajes.`,
            },
            { status: 429 }
          );
        }
      }
    } catch (err) {
      console.error("[api/agents/chat] usage check failed:", err);
    }

    // ── Create or reuse chat ────────────────────────────────────────────────
    step = "create-chat";
    let chatId = existingChatId;
    let isNewChat = false;

    try {
      if (!chatId) {
        try {
          const chat = await db.agentChat.create({
            data: { userId, agentId, title: "Nuevo chat" },
          });
          chatId = chat.id;
          isNewChat = true;
        } catch (innerErr) {
          if (isMissingRelationError(innerErr)) {
            console.warn("[api/agents/chat] tables missing, running auto-migration");
            await ensureAgentTables();
            const chat = await db.agentChat.create({
              data: { userId, agentId, title: "Nuevo chat" },
            });
            chatId = chat.id;
            isNewChat = true;
          } else {
            throw innerErr;
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[api/agents/chat] create chat failed:", errMsg, err);
      return NextResponse.json(
        {
          error: `No se pudo crear el chat: ${errMsg}`,
        },
        { status: 503 }
      );
    }

    // ── Save user message ───────────────────────────────────────────────────
    step = "save-user-message";
    try {
      await db.agentMessage.create({
        data: {
          chatId: chatId!,
          role: "user",
          content: message,
          attachments:
            reqAttachments && reqAttachments.length > 0 ? reqAttachments : undefined,
        },
      });
    } catch (err) {
      console.error("[api/agents/chat] save user message failed:", err);
      return NextResponse.json(
        { error: "No se pudo guardar el mensaje." },
        { status: 500 }
      );
    }

    // ── Build system prompt with memory + property docs ─────────────────────
    step = "build-system-prompt";
    const agent = AGENTS[agentId];
    let systemPrompt = agent.systemPrompt;

    try {
      const memory = await db.agentMemory.findFirst({ where: { userId, agentId } });
      if (memory?.content) {
        systemPrompt += `\n\nContexto del usuario (memoria):\n${memory.content}`;
      }
    } catch (err) {
      console.error("[api/agents/chat] memory fetch failed:", err);
    }

    try {
      const properties = await db.property.findMany({
        where: { userId },
        include: { documents: true },
        take: 5,
      });
      if (properties.length > 0) {
        const propInfo = properties
          .map((p) => {
            let info = `- ${p.name}`;
            if (p.address) info += `, ${p.address}`;
            if (p.city) info += `, ${p.city}`;
            if (p.units) info += ` (${p.units} unidades)`;
            const docs = p.documents.map((d) => {
              const label =
                d.type === "manual_convivencia"
                  ? "Manual de Convivencia"
                  : d.type === "reglamento_interno"
                    ? "Reglamento Interno"
                    : d.type;
              return `  ${label}: ${d.name}`;
            });
            if (docs.length > 0) info += `\n  Documentos:\n${docs.join("\n")}`;
            return info;
          })
          .join("\n");
        systemPrompt += `\n\nPropiedades del usuario:\n${propInfo}`;
      }
    } catch (err) {
      console.error("[api/agents/chat] properties fetch failed:", err);
    }

    // ── Load recent messages ───────────────────────────────────────────────
    step = "load-messages";
    let recentMessages: { role: string; content: string; attachments: unknown }[] = [];
    try {
      recentMessages = await db.agentMessage.findMany({
        where: { chatId: chatId! },
        orderBy: { createdAt: "asc" },
        take: 30,
        select: { role: true, content: true, attachments: true },
      });
    } catch (err) {
      console.error("[api/agents/chat] load messages failed:", err);
      recentMessages = [{ role: "user", content: message, attachments: null }];
    }

    // Parse documents from the current message (extract text from PDFs, DOCX, XLSX, audio)
    step = "parse-current-attachments";
    let parsedCurrent: ParsedAttachment[] = [];
    if (reqAttachments && reqAttachments.length > 0) {
      try {
        parsedCurrent = await parseAttachments(reqAttachments);
      } catch (err) {
        console.error("[api/agents/chat] parseAttachments failed:", err);
      }
    }
    const parsedByUrl = new Map(parsedCurrent.map((p) => [p.url, p]));

    step = "build-anthropic-messages";
    const anthropicMessages = recentMessages.map((m, idx) => {
      const atts = m.attachments as
        | { name: string; url: string; type: string; size: number }[]
        | null
        | undefined;
      const imageAtts = Array.isArray(atts) ? atts.filter((a) => a.type?.startsWith("image/")) : [];
      const docAtts = Array.isArray(atts) ? atts.filter((a) => !a.type?.startsWith("image/")) : [];
      const isLastUser = idx === recentMessages.length - 1 && m.role === "user";

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
          const docSections = docAtts.map((d) => {
            const parsed = isLastUser ? parsedByUrl.get(d.url) : undefined;
            if (parsed && parsed.text) {
              return `=== Archivo adjunto: ${d.name} (${d.type}) ===\n${parsed.text}\n=== Fin del archivo ===`;
            }
            return `[Archivo adjunto: ${d.name} (${d.type})]`;
          });
          textContent = `${docSections.join("\n\n")}\n\n${m.content}`;
        }
        contentBlocks.push({ type: "text", text: textContent });

        return { role: "user" as const, content: contentBlocks };
      }

      return { role: m.role as "user" | "assistant", content: m.content };
    });

    // ── Call Anthropic API ──────────────────────────────────────────────────
    step = "call-anthropic";
    let reply = "";
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic();

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        temperature: 0.5,
        system: systemPrompt,
        messages: anthropicMessages,
      });

      reply =
        response.content[0]?.type === "text" ? response.content[0].text : "";
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[api/agents/chat] Anthropic API error:", errMsg, err);
      return NextResponse.json(
        { error: `Error del servicio de IA: ${errMsg}` },
        { status: 502 }
      );
    }

    if (!reply) {
      return NextResponse.json(
        { error: "El agente no pudo generar una respuesta." },
        { status: 500 }
      );
    }

    // ── Save assistant message ──────────────────────────────────────────────
    step = "save-assistant-message";
    try {
      await db.agentMessage.create({
        data: { chatId: chatId!, role: "assistant", content: reply },
      });
    } catch (err) {
      console.error("[api/agents/chat] save assistant message failed:", err);
    }

    // ── Update chat title for new chats ─────────────────────────────────────
    step = "update-title";
    let title: string | undefined;
    if (isNewChat) {
      title = message.length > 60 ? message.slice(0, 60) + "..." : message;
      try {
        await db.agentChat.update({ where: { id: chatId! }, data: { title } });
      } catch (err) {
        console.error("[api/agents/chat] update title failed:", err);
      }
    }

    return NextResponse.json({ chatId, reply, title });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[api/agents/chat] Error at step '${step}':`, errMsg, error);
    return NextResponse.json(
      { error: `Error interno en paso '${step}': ${errMsg}` },
      { status: 500 }
    );
  }
}
