"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import {
  User,
  ArrowLeft,
  Paperclip,
  Send,
  Loader2,
  Shield,
} from "lucide-react";
import Link from "next/link";

interface TicketMessage {
  id: string;
  ticketId: string;
  fromAdmin: boolean;
  authorId: string;
  content: string;
  attachments: Array<{ name: string; url: string; size: number }> | null;
  internal: boolean;
  createdAt: string;
}

interface TicketData {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  messages: TicketMessage[];
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  pending: "Pendiente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case "open":
      return { background: "rgba(255,111,111,0.10)", color: "#ff8585", border: "1px solid rgba(255,111,111,0.25)" };
    case "pending":
      return { background: "rgba(255,185,88,0.10)", color: "#ffb958", border: "1px solid rgba(255,185,88,0.25)" };
    case "resolved":
      return { background: "rgba(76,214,160,0.10)", color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.25)" };
    default:
      return { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.10)" };
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const monoSmall: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

export default function SoporteTicketPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = params.id;
  const bottomRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    try {
      // GET /api/tickets/[id] returns the full ticket with messages and
      // enforces ownership server-side (403 if not the owner; internal admin
      // notes are filtered out).
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (res.status === 403 || res.status === 404) {
        setError("Ticket no encontrado o no tienes acceso.");
        return;
      }
      if (!res.ok) throw new Error("Error al cargar el ticket");
      const data = await res.json();
      setTicket(data.ticket);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    if (ticket) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [ticket]);

  async function handleSend() {
    if (!reply.trim() || !ticket) return;
    setSending(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar");
      }
      setReply("");
      await loadTicket();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSending(false);
    }
  }

  const isClosed = ticket?.status === "closed" || ticket?.status === "resolved";

  return (
    <div>
      <Header
        title="Soporte"
        breadcrumbs={[
          { label: "Configuración", href: "/dashboard/configuracion" },
          { label: "Ticket" },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
        {/* Back */}
        <Link
          href="/dashboard/configuracion"
          className="inline-flex items-center gap-2 text-sm mb-5 transition-colors hover:text-foreground"
          style={{ color: "rgba(255,255,255,0.40)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a configuración
        </Link>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "rgba(255,255,255,0.30)" }} />
          </div>
        ) : error ? (
          <div
            className="p-6 rounded-2xl text-center"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm" style={{ color: "#ff8585" }}>{error}</p>
            <button
              onClick={() => router.push("/dashboard/configuracion")}
              className="mt-3 text-sm underline"
              style={{ color: "rgba(255,255,255,0.40)" }}
            >
              Volver
            </button>
          </div>
        ) : ticket ? (
          <>
            {/* Ticket header */}
            <div
              className="p-5 rounded-2xl mb-4"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
                  style={{ ...monoSmall, ...statusStyle(ticket.status) }}
                >
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
                <span
                  className="px-2.5 py-1 rounded-lg text-[10px]"
                  style={{
                    ...monoSmall,
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.40)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {ticket.category}
                </span>
              </div>
              <h1 className="text-lg font-semibold text-foreground">{ticket.subject}</h1>
              <p
                className="text-[11px] mt-1"
                style={{ ...monoSmall, color: "rgba(255,255,255,0.30)", textTransform: "none" }}
              >
                #{ticket.id.slice(-8)} · Abierto {formatDate(ticket.createdAt)}
              </p>

              {isClosed && (
                <div
                  className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "rgba(76,214,160,0.08)",
                    border: "1px solid rgba(76,214,160,0.20)",
                    color: "#4cd6a0",
                  }}
                >
                  Este ticket está {ticket.status === "resolved" ? "resuelto" : "cerrado"}. No puedes añadir más respuestas.
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="space-y-3 mb-4">
              {(ticket.messages || []).filter((m) => !m.internal).map((msg) => {
                const isAdmin = msg.fromAdmin;
                const attachments = msg.attachments ?? [];

                let cardStyle: React.CSSProperties;
                if (isAdmin) {
                  cardStyle = {
                    background: "rgba(124,92,255,0.08)",
                    border: "1px solid rgba(124,92,255,0.20)",
                    borderRadius: "1rem",
                    padding: "16px",
                  };
                } else {
                  cardStyle = {
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "1rem",
                    padding: "16px",
                  };
                }

                return (
                  <div key={msg.id} style={cardStyle}>
                    <div className="flex items-center gap-2 mb-3">
                      {isAdmin ? (
                        <>
                          <div
                            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(124,92,255,0.15)" }}
                          >
                            <Shield className="h-3.5 w-3.5" style={{ color: "#9a7fff" }} />
                          </div>
                          <span className="text-[13px] font-medium" style={{ color: "#9a7fff" }}>
                            Equipo SOPH.IA
                          </span>
                        </>
                      ) : (
                        <>
                          {session?.user?.image ? (
                            <img
                              src={session.user.image}
                              alt=""
                              className="h-7 w-7 rounded-lg flex-shrink-0"
                              style={{ border: "1px solid var(--border)" }}
                            />
                          ) : (
                            <div
                              className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: "rgba(255,255,255,0.07)" }}
                            >
                              <User className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.40)" }} />
                            </div>
                          )}
                          <span className="text-[13px] font-medium text-foreground">
                            {session?.user?.name || session?.user?.email || "Tú"}
                          </span>
                        </>
                      )}
                      <span
                        className="ml-auto text-[11px]"
                        style={{ ...monoSmall, color: "rgba(255,255,255,0.25)", textTransform: "none" }}
                      >
                        {formatDate(msg.createdAt)}
                      </span>
                    </div>

                    <p
                      className="text-[13.5px] leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--foreground)" }}
                    >
                      {msg.content}
                    </p>

                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {attachments.map((att, i) => (
                          <a
                            key={i}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.10)",
                            }}
                          >
                            <Paperclip className="h-3 w-3" style={{ color: "rgba(255,255,255,0.40)" }} />
                            <span className="text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.55)" }}>
                              {att.name}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            {!isClosed && (
              <div
                className="rounded-2xl overflow-hidden sticky bottom-4"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escribir respuesta..."
                  rows={3}
                  disabled={sending}
                  className="w-full px-4 pt-4 pb-2 text-[13.5px] leading-relaxed resize-none bg-transparent placeholder:text-muted-foreground/30 focus:outline-none disabled:opacity-50"
                  style={{ color: "var(--foreground)" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                {replyError && (
                  <p className="px-4 pb-2 text-[11px]" style={{ color: "#ff8585", fontFamily: "var(--font-mono)" }}>
                    {replyError}
                  </p>
                )}
                <div
                  className="flex items-center justify-end gap-3 px-4 pb-4 pt-2"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <p
                    className="text-[11px] flex-1"
                    style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.25)" }}
                  >
                    Ctrl+Enter para enviar
                  </p>
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    className="h-9 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: "#7c5cff",
                      color: "white",
                      boxShadow: "0 4px 14px rgba(124,92,255,0.25)",
                    }}
                  >
                    {sending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {sending ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
