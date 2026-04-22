export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidAgentId } from "@/lib/agents";

export async function GET(
  _req: NextRequest,
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

    try {
      const chats = await db.agentChat.findMany({
        where: { userId: session.user.id, agentId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });
      return NextResponse.json(chats);
    } catch (err) {
      console.error("[api/agents/chats] table may not exist:", err);
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error("[api/agents/chats] Error:", error);
    return NextResponse.json([]);
  }
}

export async function DELETE(
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

    await db.agentChat.deleteMany({
      where: { id: chatId, userId: session.user.id, agentId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/agents/chats] Delete error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
