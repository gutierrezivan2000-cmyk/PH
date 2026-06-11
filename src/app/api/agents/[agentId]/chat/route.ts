export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS, isValidAgentId } from "@/lib/agents";
import { PLANS } from "@/lib/epayco";
import { normalizePlanId, canAccessAgent } from "@/lib/plan";
import { ensureAgentTables, isMissingRelationError } from "@/lib/ensure-agent-tables";
import { parseAttachments, type ParsedAttachment } from "@/lib/parse-attachment";

const IS_DEMO = process.env.DEMO_MODE === "true";

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

    // ── Subscription/trial gate: no active plan or live trial → no agents.
    step = "check-subscription";
    if (!IS_DEMO) {
      const { checkSubscriptionAccess } = await import("@/lib/usage");
      const access = await checkSubscriptionAccess(session.user.id);
      if (!access.allowed) {
        return NextResponse.json(
          { error: access.reason, code: "subscription_required" },
          { status: 403 }
        );
      }
    }

    // ── Access control: included agents are open; add-on agents require the
    // user's subscription to have them in addonAgents (set by admin/billing).
    step = "check-agent-access";
    if (!IS_DEMO) {
      let accessSub: { addonAgents: string[] } | null = null;
      try {
        accessSub = await db.subscription.findUnique({
          where: { userId: session.user.id },
          select: { addonAgents: true },
        });
      } catch {
        // If we can't read the subscription, fall back to included-only.
      }
      if (!canAccessAgent(agentId, accessSub)) {
        return NextResponse.json(
          {
            error:
              "Este agente es un complemento que aun no tienes activo. Actualiza tu plan para usarlo.",
            code: "agent_locked",
          },
          { status: 403 }
        );
      }
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

    // ── Audio transcription minute-based rate limits ───────────────────────
    // Covers any agent that receives audio attachments.
    // Uses UsageRecord where type="transcription", tokens=seconds.
    step = "transcription-limits";
    const allAudioAtts = (reqAttachments || []).filter(
      (a) => a.type?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|webm)$/i.test(a.name)
    );
    let estimatedMinutesForThisRequest = 0;
    if (allAudioAtts.length > 0) {
      // Conservative estimate: 1 MB ~ 1 minute for typical compressed voice audio.
      const totalBytes = allAudioAtts.reduce((sum, a) => sum + a.size, 0);
      estimatedMinutesForThisRequest = Math.max(1, Math.ceil(totalBytes / (1024 * 1024)));

      try {
        const subPlan = (await db.subscription.findFirst({ where: { userId: session.user.id } }))?.planId;
        const tLimits = normalizePlanId(subPlan) === "elite" ? PLANS.elite.limits : PLANS.pro.limits;
        const dailyCap = tLimits.transcriptionMinutesPerDay;
        const monthlyCap = tLimits.transcriptionMinutesPerMonth;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const startOfDayT = new Date();
        startOfDayT.setHours(0, 0, 0, 0);

        const [monthlyAgg, dailyAgg] = await Promise.all([
          db.usageRecord.aggregate({
            where: { userId: session.user.id, type: "transcription", date: { gte: startOfMonth } },
            _sum: { tokens: true },
          }),
          db.usageRecord.aggregate({
            where: { userId: session.user.id, type: "transcription", date: { gte: startOfDayT } },
            _sum: { tokens: true },
          }),
        ]);

        const secondsUsedMonth = monthlyAgg._sum.tokens ?? 0;
        const secondsUsedDay = dailyAgg._sum.tokens ?? 0;
        const minutesUsedMonth = Math.ceil(secondsUsedMonth / 60);
        const minutesUsedDay = Math.ceil(secondsUsedDay / 60);

        if (minutesUsedDay + estimatedMinutesForThisRequest > dailyCap) {
          return NextResponse.json(
            {
              error: `Has alcanzado el limite diario de ${dailyCap} minutos de transcripcion. Intenta manana. (Usado hoy: ${minutesUsedDay} min)`,
            },
            { status: 429 }
          );
        }
        if (minutesUsedMonth + estimatedMinutesForThisRequest > monthlyCap) {
          return NextResponse.json(
            {
              error: `Has alcanzado el limite mensual de ${monthlyCap} minutos de transcripcion. (Usado este mes: ${minutesUsedMonth} min)`,
            },
            { status: 429 }
          );
        }
      } catch (err) {
        console.error("[api/agents/chat] transcription limit check failed:", err);
      }
    }

    const userId = session.user.id;

    // ── Usage limits (fail-open if tables missing) ─────────────────────────
    step = "usage-limits";
    let planLimits: {
      agentMessagesPerDay: number;
      agentMessagesPerWeek: number;
      transcriptionMinutesPerDay: number;
      transcriptionMinutesPerMonth: number;
    } = { ...PLANS.pro.limits };

    try {
      const subscription = await db.subscription.findFirst({ where: { userId } });
      if (normalizePlanId(subscription?.planId) === "elite") {
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

    // ── Load recent messages with smart context limiting ───────────────────
    // Pulls the most recent messages, applies a character budget walking from
    // newest backward, and truncates very long individual messages. This keeps
    // costs bounded for long conversations and prevents context-window blowup.
    step = "load-messages";
    const HISTORY_MAX_MESSAGES = 50;
    const HISTORY_CHAR_BUDGET = 40_000;
    const PER_MESSAGE_CAP = 4_000;

    let recentMessages: { role: string; content: string; attachments: unknown }[] = [];
    let totalMessageCount = 0;
    let droppedOlderCount = 0;

    try {
      totalMessageCount = await db.agentMessage.count({ where: { chatId: chatId! } });

      const desc = await db.agentMessage.findMany({
        where: { chatId: chatId! },
        orderBy: { createdAt: "desc" },
        take: HISTORY_MAX_MESSAGES,
        select: { role: true, content: true, attachments: true },
      });

      const kept: typeof recentMessages = [];
      let totalChars = 0;
      for (const m of desc) {
        let content = m.content || "";
        if (content.length > PER_MESSAGE_CAP) {
          content =
            content.slice(0, PER_MESSAGE_CAP) +
            `\n\n[...mensaje truncado: ${content.length - PER_MESSAGE_CAP} caracteres omitidos]`;
        }
        if (totalChars + content.length > HISTORY_CHAR_BUDGET && kept.length >= 4) break;
        kept.unshift({ role: m.role, content, attachments: m.attachments });
        totalChars += content.length;
      }

      recentMessages = kept;
      droppedOlderCount = Math.max(0, totalMessageCount - recentMessages.length);
    } catch (err) {
      console.error("[api/agents/chat] load messages failed:", err);
      recentMessages = [{ role: "user", content: message, attachments: null }];
    }

    // Volatile addendum kept OUT of systemPrompt so the prefix stays cacheable.
    // Counts change every request; including them in the cached block would
    // invalidate the cache on every send.
    const volatileSystemNote =
      droppedOlderCount > 0
        ? `[Nota de contexto: Esta conversacion tiene ${totalMessageCount} mensajes en total. Por longitud, solo se incluyen los ${recentMessages.length} mensajes mas recientes. Los ${droppedOlderCount} mensajes anteriores fueron omitidos. Si el usuario menciona algo de antes, pidele que te recuerde el contexto.]`
        : null;

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

    // Record transcription usage now that we've actually processed audio
    // (size-based estimate: 1 MB ~ 1 minute of voice audio).
    if (estimatedMinutesForThisRequest > 0 && allAudioAtts.length > 0) {
      try {
        const seconds = estimatedMinutesForThisRequest * 60;
        // Whisper pricing ~ $0.006 per minute
        const costUsd = estimatedMinutesForThisRequest * 0.006;
        await db.usageRecord.create({
          data: {
            userId: session.user.id,
            type: "transcription",
            tokens: seconds,
            costUsd,
          },
        });
      } catch (err) {
        console.error("[api/agents/chat] record transcription usage failed:", err);
      }
    }

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

    // ── Update chat title for new chats (before stream) ───────────────────
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

    // ── Stream response from Anthropic API ─────────────────────────────────
    step = "stream-anthropic";
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic();
      const encoder = new TextEncoder();

      const readable = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode(`event: meta\ndata: ${JSON.stringify({ chatId, title })}\n\n`)
            );

            // Stable system prefix is marked cacheable (5-min ephemeral). The
            // volatile note (if any) is appended as a separate block AFTER the
            // cache breakpoint so its per-request changes don't invalidate the
            // cached prefix. Min cacheable prefix on Haiku 4.5 is 4096 tokens —
            // shorter prompts silently won't cache, but the marker is harmless.
            const systemBlocks: Array<{
              type: "text";
              text: string;
              cache_control?: { type: "ephemeral" };
            }> = [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
            ];
            if (volatileSystemNote) {
              systemBlocks.push({ type: "text", text: volatileSystemNote });
            }

            const stream = anthropic.messages.stream({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 2048,
              temperature: 0.5,
              system: systemBlocks,
              messages: anthropicMessages,
            });

            let fullReply = "";

            for await (const event of stream) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                fullReply += event.delta.text;
                controller.enqueue(
                  encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: event.delta.text })}\n\n`)
                );
              }
            }

            if (fullReply) {
              try {
                await db.agentMessage.create({
                  data: { chatId: chatId!, role: "assistant", content: fullReply },
                });
              } catch (err) {
                console.error("[api/agents/chat] save assistant message failed:", err);
              }
            }

            // Auto-generate a semantic 3-5 word title for new chats. We already
            // pushed a truncated-message title in the meta event for instant
            // feedback; this replaces it with something better and emits a
            // title_update event so the client can refresh its sidebar.
            if (isNewChat && chatId && fullReply) {
              try {
                const titleResp = await anthropic.messages.create({
                  model: "claude-haiku-4-5-20251001",
                  max_tokens: 30,
                  temperature: 0.3,
                  system:
                    "Eres un generador de titulos de chat. Dada una conversacion, devuelve UNICAMENTE un titulo conciso de 3 a 5 palabras en espanol que resuma el tema. Sin comillas, sin preambulo, sin punto final. Solo el titulo.",
                  messages: [
                    {
                      role: "user",
                      content: `USUARIO: ${message.slice(0, 500)}\n\nASISTENTE: ${fullReply.slice(0, 500)}`,
                    },
                  ],
                });
                const raw =
                  titleResp.content[0]?.type === "text"
                    ? titleResp.content[0].text
                    : "";
                const generatedTitle = raw
                  .trim()
                  .replace(/^["'`]+|["'`.\s]+$/g, "")
                  .slice(0, 80);
                if (generatedTitle && generatedTitle.length >= 3) {
                  try {
                    await db.agentChat.update({
                      where: { id: chatId },
                      data: { title: generatedTitle },
                    });
                    controller.enqueue(
                      encoder.encode(
                        `event: title_update\ndata: ${JSON.stringify({ title: generatedTitle })}\n\n`
                      )
                    );
                  } catch (err) {
                    console.error("[api/agents/chat] semantic title update failed:", err);
                  }
                }
              } catch (err) {
                console.error("[api/agents/chat] semantic title generation failed:", err);
              }
            }

            controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
            controller.close();
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error("[api/agents/chat] stream error:", errMsg);
            try {
              controller.enqueue(
                encoder.encode(`event: error\ndata: ${JSON.stringify({ error: `Error del servicio de IA: ${errMsg}` })}\n\n`)
              );
            } catch { /* controller may already be errored */ }
            try { controller.close(); } catch { /* ignore */ }
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[api/agents/chat] Anthropic init error:", errMsg, err);
      return NextResponse.json(
        { error: `Error del servicio de IA: ${errMsg}` },
        { status: 502 }
      );
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[api/agents/chat] Error at step '${step}':`, errMsg, error);
    return NextResponse.json(
      { error: `Error interno en paso '${step}': ${errMsg}` },
      { status: 500 }
    );
  }
}
