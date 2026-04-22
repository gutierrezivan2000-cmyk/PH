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
      const memory = await db.agentMemory.findUnique({
        where: { userId_agentId: { userId: session.user.id, agentId } },
      });
      return NextResponse.json({ content: memory?.content ?? "" });
    } catch (err) {
      console.error("[api/agents/memory] table may not exist:", err);
      return NextResponse.json({ content: "" });
    }
  } catch (error) {
    console.error("[api/agents/memory] Error:", error);
    return NextResponse.json({ content: "" });
  }
}

export async function PUT(
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

    const { content } = await req.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "Contenido invalido" }, { status: 400 });
    }

    const trimmed = content.trim().slice(0, 10000);

    const memory = await db.agentMemory.upsert({
      where: { userId_agentId: { userId: session.user.id, agentId } },
      update: { content: trimmed },
      create: { userId: session.user.id, agentId, content: trimmed },
    });

    return NextResponse.json({ content: memory.content });
  } catch (error) {
    console.error("[api/agents/memory] PUT error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
