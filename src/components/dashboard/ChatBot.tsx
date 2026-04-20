"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle, Send, X, Sparkles, Bot } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatBot() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Focus input when chat opens
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
          history: updatedMessages.slice(0, -1), // exclude the current message — API adds it
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || "Error al enviar el mensaje.";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: errorMsg },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error de conexion. Verifica tu internet e intenta de nuevo.",
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

  // Don't render if not authenticated
  if (!session?.user) return null;

  return (
    <>
      {/* Chat Panel */}
      <div
        className={`fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px] transition-all duration-300 ease-out ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex flex-col h-[520px] max-h-[70vh] rounded-3xl border border-white/30 dark:border-white/10 bg-white/70 dark:bg-[#12141f]/90 backdrop-blur-xl shadow-2xl shadow-violet-500/10 dark:shadow-black/30 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/20 dark:border-white/10 bg-gradient-to-r from-violet-600/90 to-purple-600/90 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  SOPH.IA Asistente
                </h3>
                <p className="text-[11px] text-white/70">
                  Propiedad Horizontal
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-xl hover:bg-white/20 transition-colors"
              aria-label="Cerrar chat"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-500/20 dark:to-purple-500/20 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Hola, soy SOPH.IA
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Tu asistente de Propiedad Horizontal. Preguntame sobre la Ley
                  675, asambleas, actas, informes de gestion, presupuestos,
                  cartera, mantenimiento y mas.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-violet-600 text-white rounded-2xl rounded-br-md"
                      : "bg-gray-100/80 dark:bg-white/10 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md border border-gray-200/50 dark:border-white/10"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100/80 dark:bg-white/10 border border-gray-200/50 dark:border-white/10 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/20 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tu pregunta..."
                className="flex-1 px-4 py-2.5 text-sm bg-white/80 dark:bg-white/10 border border-gray-200/60 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-300 dark:focus:border-violet-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all"
                disabled={isLoading}
                maxLength={2000}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-md shadow-violet-500/20"
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
        className={`fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 active:scale-90 shadow-lg ${
          isOpen
            ? "bg-gray-700 hover:bg-gray-800 shadow-gray-500/20 rotate-0"
            : "bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/30 animate-subtle-pulse"
        }`}
        aria-label={isOpen ? "Cerrar asistente" : "Abrir asistente SOPH.IA"}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Pulse animation styles */}
      <style jsx global>{`
        @keyframes subtle-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(139, 92, 246, 0);
          }
        }
        .animate-subtle-pulse {
          animation: subtle-pulse 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
