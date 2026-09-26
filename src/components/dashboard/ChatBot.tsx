"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Boton, Cruz } from "@/components/kit";

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
    // Sin mensajes no hay nada que desplazar. Hacerlo al montar movía el punto
    // de partida del tabulador de Chromium al final de la página: el primer Tab
    // saltaba al botón flotante en vez de al índice.
    if (messages.length === 0 && !isLoading) return;
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

  /* Aspecto «Índice»: capa flotante recta (borde 2 px + --shadow-pop), sin
     degradados ni burbujas. Sobre el dock en móvil (z 35: por encima del dock,
     por debajo del índice móvil, los modales y los avisos). */
  const posicion =
    "fixed right-4 sm:right-6 z-[35] bottom-6 max-[860px]:bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom)+12px)]";

  return (
    <>
      {/* Chat Panel */}
      <section
        id="soporte-sophia"
        aria-labelledby="soporte-sophia-t"
        aria-hidden={!isOpen}
        className={`${posicion} mb-[60px] w-[min(400px,calc(100vw-2rem))] motion-safe:transition-opacity motion-safe:duration-200 ${
          isOpen ? "visible opacity-100" : "invisible opacity-0"
        } ${isAgentChat ? "hidden lg:block" : ""}`}
      >
        <div
          className="flex flex-col h-[520px] max-h-[min(70vh,calc(100dvh-var(--dock-h)-140px))]"
          style={{
            background: "var(--surface-0)",
            border: "2px solid var(--rule)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "2px solid var(--rule)" }}
          >
            <div className="min-w-0">
              <h2 id="soporte-sophia-t" className="k-rotulo k-14" style={{ margin: 0 }}>
                Soporte SOPH.IA
              </h2>
              <p className="k-meta" style={{ margin: "4px 0 0" }}>
                Asistente · en línea
              </p>
            </div>
            <Boton variante="fantasma" tam={40} onClick={() => setIsOpen(false)} aria-label="Cerrar chat">
              Cerrar
            </Boton>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            {messages.length === 0 && (
              <div className="flex flex-col justify-end h-full gap-3">
                <p className="k-t22" style={{ margin: 0 }}>
                  Hola, soy el soporte de SOPH.IA
                </p>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: "var(--ink-2)" }}>
                  Te ayudo con el uso de la plataforma: cómo generar documentos,
                  subir archivos, gestionar propiedades y activar agentes.
                </p>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div
                  key={i}
                  className="self-end max-w-[85%] whitespace-pre-wrap"
                  style={{
                    background: "var(--surface-2)",
                    borderLeft: "4px solid var(--rule)",
                    padding: "10px 12px 11px",
                    fontSize: 15,
                    lineHeight: 1.45,
                    color: "var(--ink)",
                  }}
                >
                  {msg.content}
                </div>
              ) : (
                <div key={i} className="self-start max-w-[92%]">
                  <p className="k-meta" style={{ margin: "0 0 4px", fontWeight: 700, color: "var(--ink-2)" }}>
                    Soporte
                  </p>
                  <p className="whitespace-pre-wrap" style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--ink)" }}>
                    {msg.content}
                  </p>
                </div>
              )
            )}

            {isLoading && (
              <span className="k-escribe" role="status">
                <span aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                Escribiendo…
              </span>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 p-3" style={{ borderTop: "2px solid var(--rule)" }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta…"
              aria-label="Tu pregunta para el soporte"
              className="k-in flex-1"
              style={{ minHeight: 44, fontSize: 15 }}
              disabled={isLoading}
              maxLength={2000}
            />
            <Boton
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              aria-label="Enviar mensaje"
              flecha="avanza"
            >
              Enviar
            </Boton>
          </div>
        </div>
      </section>

      {/* Floating Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="soporte-sophia"
        aria-label={isOpen ? "Cerrar asistente" : "Soporte: abrir asistente SOPH.IA"}
        className={`k-btn k-sec border-2 bg-[var(--surface-0)] hover:bg-[var(--hl)] shadow-[var(--shadow-pop)] ${posicion} ${
          isAgentChat ? "hidden lg:inline-flex" : ""
        }`}
      >
        <span>{isOpen ? "Cerrar" : "Soporte"}</span>
        {isOpen && <Cruz />}
      </button>
    </>
  );
}
