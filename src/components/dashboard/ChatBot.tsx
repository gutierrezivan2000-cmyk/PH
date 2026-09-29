"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Boton, BotonSugerencia, Loseta, MODULOS } from "@/components/kit";
import { cerrarSoporte, registrarSoporte, useSoporteAbierto } from "@/components/dashboard/soporte";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatBot() {
  const { data: session } = useSession();
  const pathname = usePathname();
  // Se abre desde la entrada «Ayuda y soporte» del menú (o del colofón de Inicio):
  // el rediseño «Guía» no tiene botones flotantes.
  const isOpen = useSoporteAbierto();
  const conSesion = Boolean(session?.user);
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
    // saltaba al final en vez de al índice.
    if (messages.length === 0 && !isLoading) return;
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Solo con sesión el panel existe: así la entrada «Ayuda y soporte» del menú no queda muerta.
  useEffect(() => {
    if (!conSesion) return;
    return registrarSoporte();
  }, [conSesion]);

  const sendMessage = async (texto?: string) => {
    const trimmed = (texto ?? input).trim();
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

  /* Aspecto «Guía»: tarjeta flotante redondeada con la ficha de color de soporte. Abajo a la
     derecha; en móvil, sobre el dock (z 35: por encima del dock, por debajo del menú móvil,
     los modales y los avisos). */
  const posicion =
    "fixed right-4 sm:right-6 z-[35] bottom-6 max-[860px]:bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom)+12px)]";
  const soporte = MODULOS.soporte;
  const SUGERENCIAS = ["¿Cómo genero un informe?", "¿Cómo subo mis archivos?", "¿Cómo agrego una propiedad?"];

  return (
    <section
      id="soporte-sophia"
      aria-labelledby="soporte-sophia-t"
      aria-hidden={!isOpen}
      inert={!isOpen}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cerrarSoporte();
        }
      }}
      className={`${posicion} w-[min(410px,calc(100vw-2rem))] motion-safe:transition-opacity motion-safe:duration-200 ${
        isOpen ? "visible opacity-100" : "invisible opacity-0"
      } ${isAgentChat ? "hidden lg:block" : ""}`}
    >
      <div
        className="flex flex-col h-[560px] max-h-[min(72vh,calc(100dvh-var(--dock-h)-140px))] overflow-hidden"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line-strong)",
          borderRadius: 28,
          boxShadow: "var(--shadow-pop)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--line)", background: "linear-gradient(115deg, var(--c-sky-soft), transparent 70%)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Loseta icono={soporte.icono} tono={soporte.tono} />
            <div className="min-w-0">
              <h2 id="soporte-sophia-t" style={{ margin: 0, font: "800 17px/1.2 var(--f-sans)", letterSpacing: "-.01em" }}>
                Soporte SOPH.IA
              </h2>
              <p className="k-meta" style={{ margin: "3px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--ok)" }} />
                Te respondemos al instante
              </p>
            </div>
          </div>
          <Boton variante="fantasma" tam={40} onClick={cerrarSoporte} aria-label="Cerrar el chat de soporte">
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
              <div className="flex flex-col items-start gap-2" style={{ marginTop: 4 }}>
                {SUGERENCIAS.map((s) => (
                  <BotonSugerencia key={s} onClick={() => sendMessage(s)}>{s}</BotonSugerencia>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div
                key={i}
                className="self-end max-w-[85%] whitespace-pre-wrap"
                style={{
                  background: "linear-gradient(140deg, var(--c-violet-a), var(--c-violet-b))",
                  borderRadius: "20px 20px 6px 20px",
                  padding: "10px 14px 11px",
                  fontSize: 15,
                  lineHeight: 1.45,
                  color: "#fff",
                }}
              >
                {msg.content}
              </div>
            ) : (
              <div key={i} className="self-start max-w-[94%] flex gap-2.5">
                <Loseta icono={soporte.icono} tono={soporte.tono} tam={32} />
                <div style={{ background: "var(--surface-2)", borderRadius: "6px 20px 20px 20px", padding: "10px 14px 11px", minWidth: 0 }}>
                  <p className="k-meta" style={{ margin: "0 0 3px", fontWeight: 800, color: "var(--ink-2)" }}>
                    Soporte
                  </p>
                  <p className="whitespace-pre-wrap" style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--ink)" }}>
                    {msg.content}
                  </p>
                </div>
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
        <div className="flex items-center gap-2 p-3" style={{ borderTop: "1px solid var(--line)" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta…"
            aria-label="Tu pregunta para el soporte"
            className="k-in flex-1"
            style={{ minHeight: 46, fontSize: 15, borderRadius: 999, paddingLeft: 18 }}
            disabled={isLoading}
            maxLength={2000}
          />
          <Boton
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            aria-label="Enviar mensaje"
            tono="violet"
          >
            Enviar
          </Boton>
        </div>
      </div>
    </section>
  );
}
