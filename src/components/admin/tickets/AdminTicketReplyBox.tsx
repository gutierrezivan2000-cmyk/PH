"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Lock } from "lucide-react";

interface AdminTicketReplyBoxProps {
  ticketId: string;
  adminId: string;
  ticketStatus: string;
}

export function AdminTicketReplyBox({ ticketId, ticketStatus }: AdminTicketReplyBoxProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClosed = ticketStatus === "closed" || ticketStatus === "resolved";

  async function handleSend() {
    if (!content.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), internal }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar");
      }
      setContent("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: internal ? "rgba(255,185,88,0.05)" : "var(--card)",
        border: internal ? "1px solid rgba(255,185,88,0.20)" : "1px solid var(--border)",
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={isClosed ? "Este ticket está cerrado." : "Escribir respuesta..."}
        disabled={isClosed || sending}
        rows={4}
        className="w-full px-4 pt-4 pb-2 text-[13.5px] leading-relaxed resize-none bg-transparent placeholder:text-muted-foreground/30 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: "var(--foreground)" }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSend();
          }
        }}
      />

      {error && (
        <p className="px-4 pb-2 text-[11px]" style={{ color: "#ff8585", fontFamily: "var(--font-mono)" }}>
          {error}
        </p>
      )}

      <div
        className="flex items-center justify-between gap-3 px-4 pb-4 pt-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {/* Internal note toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            className="relative h-5 w-9 rounded-full transition-colors cursor-pointer"
            style={{
              background: internal ? "rgba(255,185,88,0.30)" : "rgba(255,255,255,0.08)",
              border: internal ? "1px solid rgba(255,185,88,0.50)" : "1px solid rgba(255,255,255,0.12)",
            }}
            onClick={() => setInternal((v) => !v)}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
              style={{
                background: internal ? "#ffb958" : "rgba(255,255,255,0.30)",
                left: internal ? "calc(100% - 18px)" : "2px",
              }}
            />
          </div>
          <input
            type="checkbox"
            className="sr-only"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
          />
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
              color: internal ? "#ffb958" : "rgba(255,255,255,0.35)",
            }}
          >
            <Lock className="h-3 w-3" />
            Nota interna
          </span>
        </label>

        <button
          onClick={handleSend}
          disabled={!content.trim() || sending || isClosed}
          className="h-9 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{
            background: internal ? "#ffb958" : "#7c5cff",
            color: internal ? "#0a0a0a" : "white",
            boxShadow: internal
              ? "0 4px 14px rgba(255,185,88,0.20)"
              : "0 4px 14px rgba(124,92,255,0.25)",
          }}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {sending ? "Enviando..." : internal ? "Guardar nota" : "Enviar respuesta"}
        </button>
      </div>
    </div>
  );
}
