"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import {
  Send,
  Sparkles,
  Bot,
  FileText,
  Scale,
  BarChart3,
  Calculator,
  Users,
  ShieldCheck,
  Lightbulb,
  BookOpen,
  Loader2,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  {
    icon: FileText,
    title: "Preparar Informe de Gestion",
    description: "Te guio paso a paso para organizar la informacion de tu informe mensual",
    prompt: "Quiero preparar mi informe de gestion mensual. Ayudame a organizar la informacion que necesito incluir.",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    icon: Scale,
    title: "Redactar Acta de Reunion",
    description: "Estructura el orden del dia y puntos clave para tu acta legal",
    prompt: "Necesito preparar el acta de la reunion del consejo de administracion. Ayudame a definir el orden del dia y los puntos que debo incluir.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    icon: BarChart3,
    title: "Analizar Cartera y Finanzas",
    description: "Interpreta estados financieros, cartera morosa y presupuestos",
    prompt: "Quiero analizar la situacion financiera de mi copropiedad. Que indicadores clave deberia revisar y como interpreto la cartera morosa?",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    icon: Calculator,
    title: "Elaborar Presupuesto",
    description: "Calcula y estructura el presupuesto anual de la copropiedad",
    prompt: "Necesito elaborar el presupuesto anual de la copropiedad. Que rubros debo incluir y como calculo las expensas comunes?",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Users,
    title: "Gestionar Asamblea",
    description: "Planifica convocatorias, quorum y votaciones segun la Ley 675",
    prompt: "Voy a convocar una asamblea de copropietarios. Explicame los requisitos de convocatoria, quorum y como manejar las votaciones segun la Ley 675.",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Consultar Normativa PH",
    description: "Resuelve dudas sobre la Ley 675, reglamentos y obligaciones legales",
    prompt: "Tengo una duda legal sobre propiedad horizontal. Cuales son las principales obligaciones del administrador segun la Ley 675?",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
  },
  {
    icon: Lightbulb,
    title: "Toma de Decisiones",
    description: "Evalua opciones para obras, proveedores, polizas y mas",
    prompt: "Necesito tomar una decision importante para la copropiedad. Como puedo evaluar opciones de proveedores y presentar las alternativas al consejo?",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-500/10",
  },
  {
    icon: BookOpen,
    title: "Resolver PQRS",
    description: "Redacta respuestas profesionales a peticiones de residentes",
    prompt: "Un copropietario presento una queja formal. Como debo responder una PQRS de forma profesional y dentro de los tiempos legales?",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
  },
];

export default function AsistentePage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, []);

  const sendMessage = async (text?: string) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage].slice(-30);
    setMessages(updatedMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Error al enviar el mensaje." },
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
        { role: "assistant", content: "Error de conexion. Verifica tu internet e intenta de nuevo." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestion = (prompt: string) => {
    sendMessage(prompt);
  };

  return (
    <div className="flex flex-col h-screen">
      <Header title="Asistente IA" subtitle="Tu espacio de trabajo inteligente para Propiedad Horizontal" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="p-6 lg:p-8 max-w-4xl mx-auto">
              {/* Welcome */}
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Hola{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  Soy SOPH.IA, tu asistente inteligente. Puedo ayudarte a organizar informes, redactar actas, analizar finanzas y mucho mas.
                </p>
              </div>

              {/* Suggestion cards */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => handleSuggestion(item.prompt)}
                    className="group text-left p-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-violet-300 dark:hover:border-violet-500/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-200`}>
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{item.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.description}</p>
                  </button>
                ))}
              </div>

              {/* What can I do section */}
              <div className="mt-8 p-5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Que puedo hacer por ti?</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  {[
                    "Organizar la informacion para tu informe de gestion",
                    "Estructurar actas con formato legal (Ley 675)",
                    "Interpretar estados financieros y cartera",
                    "Calcular presupuestos y expensas comunes",
                    "Planificar asambleas y verificar quorum",
                    "Resolver dudas legales de Propiedad Horizontal",
                    "Redactar respuestas a PQRS y comunicados",
                    "Evaluar opciones para toma de decisiones",
                  ].map((item) => (
                    <p key={item} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2 py-0.5">
                      <span className="text-violet-400 mt-0.5">-</span>
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-violet-600 text-white rounded-2xl rounded-br-md shadow-md shadow-violet-500/20"
                        : "bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md border border-gray-200 dark:border-white/10"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#12141f]/60 dark:backdrop-blur-2xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoResize(); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe tu pregunta o instruccion..."
                  rows={1}
                  className="w-full px-4 py-3 text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-300 dark:focus:border-violet-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all resize-none overflow-hidden"
                  disabled={isLoading}
                  maxLength={4000}
                />
              </div>
              <Button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="h-11 w-11 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-md shadow-violet-500/20 p-0 flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-2 text-center">
              SOPH.IA responde sobre Propiedad Horizontal, normativa colombiana y uso de la plataforma.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
