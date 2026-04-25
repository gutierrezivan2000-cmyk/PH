export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS, isValidAgentId } from "@/lib/agents";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 12 },
  headerTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#4c1d95" },
  headerSub: { fontSize: 9, color: "#6b7280", marginTop: 4 },
  msgBlock: { marginBottom: 10 },
  roleUser: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#7c3aed", marginBottom: 2 },
  roleAssistant: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#059669", marginBottom: 2 },
  timestamp: { fontSize: 7, color: "#9ca3af" },
  content: { fontSize: 10, color: "#1f2937", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 7, color: "#9ca3af", textAlign: "center" },
});

interface ExportMessage {
  role: string;
  content: string;
  createdAt: Date;
}

function ChatPdf({
  agentName,
  agentTitle,
  chatTitle,
  messages,
}: {
  agentName: string;
  agentTitle: string;
  chatTitle: string;
  messages: ExportMessage[];
}) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.headerTitle }, `${agentName} — ${agentTitle}`),
        React.createElement(Text, { style: styles.headerSub }, chatTitle),
        React.createElement(
          Text,
          { style: styles.headerSub },
          `Exportado: ${new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
        )
      ),
      ...messages.map((msg, i) =>
        React.createElement(
          View,
          { key: i, style: styles.msgBlock, wrap: false },
          React.createElement(
            View,
            { style: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 } },
            React.createElement(
              Text,
              { style: msg.role === "user" ? styles.roleUser : styles.roleAssistant },
              msg.role === "user" ? "USUARIO" : agentName.toUpperCase()
            ),
            React.createElement(
              Text,
              { style: styles.timestamp },
              new Date(msg.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })
            )
          ),
          React.createElement(Text, { style: styles.content }, msg.content)
        )
      ),
      React.createElement(
        Text,
        { style: styles.footer, fixed: true },
        `SOPH.IA — ${agentName}`
      )
    )
  );
}

function formatTxt(
  agentName: string,
  agentTitle: string,
  chatTitle: string,
  messages: ExportMessage[]
): string {
  const lines: string[] = [];
  lines.push(`${"=".repeat(60)}`);
  lines.push(`${agentName} — ${agentTitle}`);
  lines.push(chatTitle);
  lines.push(
    `Exportado: ${new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
  );
  lines.push(`${"=".repeat(60)}\n`);

  for (const msg of messages) {
    const ts = new Date(msg.createdAt).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const role = msg.role === "user" ? "USUARIO" : agentName.toUpperCase();
    lines.push(`[${ts}] ${role}:`);
    lines.push(msg.content);
    lines.push("");
  }

  lines.push(`${"—".repeat(60)}`);
  lines.push(`SOPH.IA — ${agentName}`);
  return lines.join("\n");
}

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
    const format = searchParams.get("format") || "txt";

    if (!chatId) {
      return NextResponse.json({ error: "chatId requerido" }, { status: 400 });
    }

    if (format !== "txt" && format !== "pdf") {
      return NextResponse.json({ error: "Formato invalido (txt o pdf)" }, { status: 400 });
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
      select: { role: true, content: true, createdAt: true },
    });

    if (messages.length === 0) {
      return NextResponse.json({ error: "Chat sin mensajes" }, { status: 400 });
    }

    const agent = AGENTS[agentId];
    const chatTitle = chat.title || "Conversacion";
    const safeTitle = chatTitle.replace(/[^\w\s\-]/g, "").replace(/\s+/g, "_").slice(0, 40);

    if (format === "txt") {
      const txt = formatTxt(agent.name, agent.title, chatTitle, messages);
      return new Response(txt, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeTitle}.txt"`,
        },
      });
    }

    const buffer = await renderToBuffer(
      ChatPdf({ agentName: agent.name, agentTitle: agent.title, chatTitle, messages })
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[api/agents/chat/export] Error:", error);
    return NextResponse.json({ error: "Error al exportar" }, { status: 500 });
  }
}
