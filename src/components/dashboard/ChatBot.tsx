"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, X, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatBot() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage].slice(-20);
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: updatedMessages.slice(0, -1),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || "Error al enviar el mensaje.";
        setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error de conexión. Verifica tu internet e intenta de nuevo.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isAgentChat = /^\/dashboard\/asistente\/[^/]+$/.test(pathname);

  if (!session?.user) return null;

  return (
    <>
      {/* Chat Panel */}
      <div
        className={`fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px] transition-all duration-300 ease-out ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        } ${isAgentChat ? "hidden lg:block" : ""}`}
      >
        <div
          className="flex flex-col h-[520px] max-h-[70vh] rounded-2xl border border-border bg-card overflow-hidden"
          style={{
            boxShadow:
              "0 30px 60px -20px rgba(0,0,0,0.5), 0 0 60px -20px rgba(124,92,255,0.18)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-border"
            style={{
              background:
                "radial-gradient(120% 100% at 0% 0%, rgba(124,92,255,0.16), transparent 70%), var(--card)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
                style={{
                  background: "linear-gradient(135deg, #7c5cff, #5a3cf0)",
                  boxShadow: "0 0 14px rgba(124,92,255,0.40)",
                }}
              >
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  Soporte SOPH.IA
                </h3>
                <p
                  className="text-[10px] uppercase text-muted-foreground/70"
                  style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
                >
                  Asistente · en línea
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Cerrar chat"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(124,92,255,0.10)",
                    border: "1px solid rgba(124,92,255,0.40)",
                    color: "#9a7fff",
                  }}
                >
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Hola, soy el soporte de SOPH.IA
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Te ayudo con el uso de la plataforma: cómo generar documentos,
                  subir archivos, gestionar propiedades y activar agentes.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "text-white"
                      : "text-foreground border border-border"
                  }`}
                  style={{
                    background:
                      msg.role === "user" ? "#7c5cff" : "var(--secondary)",
                    borderRadius:
                      msg.role === "user"
                        ? "14px 14px 4px 14px"
                        : "14px 14px 14px 4px",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="border border-border px-4 py-3 flex items-center gap-1.5"
                  style={{ background: "var(--secondary)", borderRadius: "14px 14px 14px 4px" }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full hifi-typing-dot"
                    style={{ background: "#7c5cff" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full hifi-typing-dot"
                    style={{ background: "#7c5cff" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full hifi-typing-dot"
                    style={{ background: "#7c5cff" }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border bg-background/40">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tu pregunta…"
                className="flex-1 px-3.5 py-2.5 text-[13px] rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-[#7c5cff] focus:ring-[3px] focus:ring-[rgba(124,92,255,0.15)] transition-all"
                disabled={isLoading}
                maxLength={2000}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="p-2.5 rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                style={{
                  background: "#7c5cff",
                  boxShadow: "0 6px 18px -6px rgba(124,92,255,0.50)",
                }}
                aria-label="Enviar mensaje"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 ${
          isAgentChat ? "hidden lg:flex" : ""
        }`}
        style={{
          background: isOpen
            ? "var(--card)"
            : "linear-gradient(135deg, #7c5cff, #5a3cf0)",
          border: isOpen ? "1px solid var(--border)" : "none",
          color: isOpen ? "var(--foreground)" : "white",
          boxShadow: isOpen
            ? "0 8px 24px -8px rgba(0,0,0,0.3)"
            : "0 12px 32px -8px rgba(124,92,255,0.50)",
        }}
        aria-label={isOpen ? "Cerrar asistente" : "Abrir asistente SOPH.IA"}
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>
    </>
  );
}
