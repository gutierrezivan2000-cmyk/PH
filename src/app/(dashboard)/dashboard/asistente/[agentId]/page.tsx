"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { AGENTS, isValidAgentId, isIncludedAgent, INCLUDED_AGENT_IDS, type AgentId } from "@/lib/agents";
import {
  Send,
  Plus,
  Trash2,
  ArrowLeft,
  Loader2,
  Bot,
  MessageCircle,
  Brain,
  ChevronRight,
  Upload,
  X,
  Paperclip,
  Image as ImageIcon,
  Mic,
  FileText,
  Download,
  Copy,
  Check,
  Lock,
  Search,
  ArrowUp,
  Scale,
  Share2,
  MoreHorizontal,
  Building2,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { Badge } from "@/components/ui/badge";
import { AudioRecorder } from "@/components/dashboard/AudioRecorder";
import { saveAudio, getPendingAudios, deleteAudio } from "@/lib/audio-storage";
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB_LABEL, isImageMediaType } from "@/lib/chat-limits";
import { tinte } from "@/lib/tinte";
import { formatoTamano } from "@/lib/upload-limits";
import { SUGERENCIAS } from "@/lib/agent-sugerencias";
import { RespuestaMarkdown } from "@/components/agents/RespuestaMarkdown";

interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: { name: string; url: string; type: string; size: number; generado?: boolean }[];
  createdAt: string;
}

interface PendingAttachment {
  file: File;
  preview?: string;
  persistedId?: string;
}

/* ── Agent color map ── */
const AGENT_COLORS: Record<string, string> = {
  themis: "var(--accent-hi)",
  chronos: "var(--info)",
  metra: "var(--ok)",
  nomethes: "var(--warn)",
  hermes: "var(--pink)",
  logistes: "var(--logistes)",
};

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return "Esta semana";
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
}

function groupChatsByDate(chats: Chat[]): { label: string; items: Chat[] }[] {
  const groups: Record<string, Chat[]> = {};
  const order: string[] = [];
  for (const chat of chats) {
    const label = formatRelativeDate(chat.updatedAt);
    if (!groups[label]) { groups[label] = []; order.push(label); }
    groups[label].push(chat);
  }
  return order.map((label) => ({ label, items: groups[label] }));
}

export default function AgentPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const agentId = params.agentId as string;

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // En pantalla ancha la lista de conversaciones es una columna fija; en móvil
  // es una capa que TAPA el chat. Con un solo estado inicializado en `true`, al
  // entrar desde el teléfono lo primero que se veía era la lista —casi siempre
  // vacía— en vez del agente y sus sugerencias. Se separan: la columna de
  // escritorio sigue abierta por defecto, la capa móvil arranca cerrada, igual
  // que en ChatGPT, Claude o Gemini.
  const [showSidebar, setShowSidebar] = useState(true);
  const [listaMovil, setListaMovil] = useState(false);
  const [memory, setMemory] = useState("");
  const [showMemory, setShowMemory] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Aviso de adjunto rechazado ANTES de subirlo (ver MAX_IMAGE_BYTES).
  const [attachError, setAttachError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  // Sin esto, cualquier fallo de exportación (403 del demo, 500 al render del
  // PDF, red caída) se tragaba en un catch vacío: el usuario pulsaba
  // «Exportar PDF» y no ocurría nada, sin descarga y sin explicación.
  const [exportError, setExportError] = useState("");
  // Aviso mientras el agente construye un archivo: tarda varios segundos.
  const [herramientaEnCurso, setHerramientaEnCurso] = useState("");
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [compositorEnfocado, setCompositorEnfocado] = useState(false);
  // Id del chat recién creado por el envío en curso (ver el efecto de carga).
  const skipReloadForChatId = useRef<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = isValidAgentId(agentId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (!showExportMenu) return;
    const close = () => setShowExportMenu(false);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [showExportMenu]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, []);

  // Resolve agent access (included agents + active add-ons)
  useEffect(() => {
    if (!isValid) return;
    fetch("/api/agents/usage")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.accessibleAgents)
          ? data.accessibleAgents
          : [...INCLUDED_AGENT_IDS];
        setHasAccess(list.includes(agentId));
      })
      .catch(() => setHasAccess(isIncludedAgent(agentId as AgentId)));
  }, [agentId, isValid]);

  // Load chats
  useEffect(() => {
    if (!isValid) return;
    fetch(`/api/agents/${agentId}/chats`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setChats(data); })
      .catch(console.error)
      .finally(() => setLoadingChats(false));
  }, [agentId, isValid]);

  // Load memory
  useEffect(() => {
    if (!isValid) return;
    fetch(`/api/agents/${agentId}/memory`)
      .then((r) => r.json())
      .then((data) => setMemory(data?.content || ""))
      .catch(console.error);
  }, [agentId, isValid]);

  // Restore pending audio recordings
  useEffect(() => {
    if (!isValid) return;
    getPendingAudios(agentId)
      .then((audios) => {
        if (audios.length === 0) return;
        const restored: PendingAttachment[] = audios.map((a) => ({
          file: new File([a.blob], a.fileName, { type: a.mimeType }),
          persistedId: a.id,
        }));
        setAttachments((prev) => [...prev, ...restored].slice(0, 5));
      })
      .catch(() => {});
  }, [agentId, isValid]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChatId) { setMessages([]); return; }
    // El chat que ACABA de crear este mismo envío no se recarga: su respuesta
    // todavía se está escribiendo y aún no existe en la base. Recargar aquí
    // reemplazaba el estado por lo guardado —solo el mensaje del usuario—, la
    // burbuja del asistente desaparecía a media escritura y los deltas
    // siguientes ya no encontraban a quién actualizar. El texto sí quedaba
    // guardado, así que reaparecía al recargar: parecía que el agente no había
    // contestado.
    if (skipReloadForChatId.current === activeChatId) {
      skipReloadForChatId.current = null;
      return;
    }
    setLoadingMessages(true);
    fetch(`/api/agents/${agentId}/chat?chatId=${activeChatId}`)
      .then((r) => r.json())
      .then((data) => { if (data.messages) setMessages(data.messages); })
      .catch(console.error)
      .finally(() => setLoadingMessages(false));
  }, [activeChatId, agentId]);

  if (!isValid) {
    return (
      <div className="p-8 text-center">
        <p style={{ color: "var(--ink-3)" }}>Agente no encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/asistente")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
      </div>
    );
  }

  const agent = AGENTS[agentId as AgentId];
  const agentColor = AGENT_COLORS[agentId] || "var(--accent)";
  /** Tinte del color del agente: fondos y bordes de acento. Ver `lib/tinte`. */
  const tint = (a: number) => tinte(agentColor, a);

  /**
   * Fichas de archivo de un mensaje. `generados` separa los dos casos: los que
   * subió el usuario (antes del texto) y los que produjo el agente (después de
   * la respuesta, y descargables).
   */
  const fichas = (msg: ChatMessage, generados: boolean) => {
    const lista = (msg.attachments || []).filter((a) => !!a.generado === generados);
    if (lista.length === 0) return null;
    return (
      <div
        className={`flex flex-wrap gap-1.5 ${generados ? "mt-2.5" : ""} ${
          msg.role === "user" ? "justify-end" : "justify-start"
        }`}
      >
        {lista.map((att, i) => {
          const Ficha = att.generado ? "a" : "div";
          return (
            <Ficha
              key={i}
              {...(att.generado
                ? { href: att.url, download: att.name, title: `Descargar ${att.name}` }
                : {})}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${
                att.generado ? "cursor-pointer transition-colors" : ""
              }`}
              style={{
                background: "rgb(var(--accent-rgb) / 0.1)",
                border: "1px solid rgb(var(--accent-rgb) / 0.22)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                if (att.generado) e.currentTarget.style.background = "rgb(var(--accent-rgb) / 0.18)";
              }}
              onMouseLeave={(e) => {
                if (att.generado) e.currentTarget.style.background = "rgb(var(--accent-rgb) / 0.1)";
              }}
            >
              <span style={{ color: "var(--accent-text)" }}>{getFileIcon(att.type)}</span>
              <span
                style={{
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--accent-text)",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={att.name}
              >
                {att.name}
              </span>
              {/* El tamaño iba en un morado fijo del tema oscuro
                  (rgba(154,127,255,0.55)); sobre el fondo claro quedaba
                  ilegible. `--ink-4` se adapta a los dos temas. */}
              {formatoTamano(att.size) && (
                <span
                  style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 9,
                    color: "var(--ink-4)",
                  }}
                >
                  {formatoTamano(att.size)}
                </span>
              )}
              {att.generado && (
                <Download className="h-3 w-3" style={{ color: "var(--accent-text)" }} />
              )}
            </Ficha>
          );
        })}
      </div>
    );
  };
  const includedByDefault = isIncludedAgent(agentId as AgentId);

  // Checking add-on access for a non-included agent — show a brief loader so we
  // don't flash the upgrade screen at a user who actually has the add-on.
  if (hasAccess === null && !includedByDefault) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--topbar-h,0px)-var(--demo-banner-h,0px))] lg:h-[calc(100dvh-var(--demo-banner-h,0px))]">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-text)" }} />
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="flex flex-col h-[calc(100dvh-var(--topbar-h,0px)-var(--demo-banner-h,0px))] lg:h-[calc(100dvh-var(--demo-banner-h,0px))]">
        <Header
          title={agent.name}
          subtitle={agent.title}
          breadcrumbs={[
            { label: "Asistente IA", href: "/dashboard/asistente" },
            { label: agent.name },
          ]}
        />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl opacity-50"
            style={{ background: `linear-gradient(135deg, ${tint(0.38)}, ${tint(0.19)})` }}
          >
            <agent.icon className="h-10 w-10 text-white" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-full mb-1"
              style={{
                fontFamily: "var(--hifi-mono, ui-monospace)",
                letterSpacing: "0.12em",
                background: "rgb(var(--accent-rgb) / 0.12)",
                border: "1px solid rgb(var(--accent-rgb) / 0.35)",
                color: "var(--accent-text)",
              }}
            >
              PRÓXIMAMENTE
            </span>
            <h2 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {agent.name} está en camino
            </h2>
            <p className="text-sm max-w-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {agent.description}
            </p>
            <p className="text-xs mt-2 max-w-xs" style={{ color: "var(--ink-4)" }}>
              Estamos afinando este agente. Mientras tanto, Themis y Chronos están
              disponibles para ayudarte.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard/asistente")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver a agentes
          </Button>
        </div>
      </div>
    );
  }

  const saveMemory = async () => {
    setSavingMemory(true);
    try {
      await fetch(`/api/agents/${agentId}/memory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: memory }),
      });
    } catch { /* ignore */ }
    finally {
      setSavingMemory(false);
      setShowMemory(false);
    }
  };

  const handleAudioRecorded = async (file: File) => {
    let persistedId: string | undefined;
    try { persistedId = await saveAudio(agentId, file); }
    catch (err) { console.warn("[audio] persist failed:", err); }
    setAttachments((prev) => [...prev, { file, persistedId }].slice(0, 5));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const seleccionados = Array.from(e.target.files).slice(0, 5);

    // Las imágenes se comprueban aquí y no en el servidor: antes se subía la
    // foto entera (una de móvil pasa de 5 MB), quedaba almacenada y facturada
    // en el blob, y el modelo la descartaba después. Una foto de 12 MP se
    // rechaza ahora en un instante y sin gastar datos.
    const grandes = seleccionados.filter(
      (f) => f.type.startsWith("image/") && f.size > MAX_IMAGE_BYTES
    );
    const noAdmitidas = seleccionados.filter(
      (f) => f.type.startsWith("image/") && !isImageMediaType(f.type)
    );
    const newFiles = seleccionados.filter((f) => !grandes.includes(f) && !noAdmitidas.includes(f));

    const avisos: string[] = [];
    if (grandes.length > 0) {
      avisos.push(
        `${grandes.map((f) => f.name).join(", ")}: la imagen supera ${MAX_IMAGE_MB_LABEL}. Redúcela o toma la foto en menor resolución.`
      );
    }
    if (noAdmitidas.length > 0) {
      avisos.push(`${noAdmitidas.map((f) => f.name).join(", ")}: formato de imagen no admitido (usa JPG, PNG, WEBP o GIF).`);
    }
    setAttachError(avisos.join(" "));

    const newAttachments: PendingAttachment[] = newFiles.map((file) => {
      const att: PendingAttachment = { file };
      if (file.type.startsWith("image/")) att.preview = URL.createObjectURL(file);
      return att;
    });
    setAttachments((prev) => [...prev, ...newAttachments].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const att = prev[idx];
      if (att.preview) URL.revokeObjectURL(att.preview);
      if (att.persistedId) deleteAudio(att.persistedId).catch(() => {});
      return prev.filter((_, i) => i !== idx);
    });
  };

  /** Envía una sugerencia de la pantalla de inicio sin pasar por el cuadro de texto. */
  const copiarMensaje = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId((actual) => (actual === id ? null : actual)), 1800);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer; no se molesta al usuario.
    }
  };

  const enviarSugerencia = (prompt: string) => {
    if (isLoading) return;
    setInput("");
    void sendMessage(prompt);
  };

  const sendMessage = async (textoDirecto?: string) => {
    const trimmed = (textoDirecto ?? input).trim();
    if ((!trimmed && attachments.length === 0) || isLoading) return;

    setIsLoading(true);
    setUploadStatus("");

    try {
      const uploaded: { name: string; url: string; type: string; size: number }[] = [];
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        setUploadStatus(`Subiendo ${i + 1}/${attachments.length}...`);
        const safeName = att.file.name.replace(/[^\w.\-]+/g, "_");
        const result = await upload(`agent-files/${Date.now()}-${safeName}`, att.file, {
          access: "private",
          handleUploadUrl: "/api/upload/token",
          contentType: att.file.type || "application/octet-stream",
        });
        uploaded.push({ name: att.file.name, url: result.url, type: att.file.type, size: att.file.size });
      }

      setUploadStatus("");

      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: trimmed,
        attachments: uploaded.length > 0 ? uploaded : undefined,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      attachments.forEach((a) => {
        if (a.preview) URL.revokeObjectURL(a.preview);
        if (a.persistedId) deleteAudio(a.persistedId).catch(() => {});
      });
      setAttachments([]);
      setAttachError("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: activeChatId,
          message: trimmed || "(adjuntos)",
          attachments: uploaded,
          // En el demo no hay base de datos donde guardar el hilo, así que el
          // navegador lo lleva consigo para que la conversación tenga memoria.
          // El servidor lo ignora fuera del demo.
          ...(process.env.NEXT_PUBLIC_DEMO_MODE === "true"
            ? { history: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })) }
            : {}),
        }),
      });

      if (!res.ok) {
        let errorMsg = "Error al enviar.";
        let errorCode = "";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
          errorCode = data.code || "";
        } catch { /* ignore */ }
        // Stale JWT (user row recreated/deleted behind the session) — only a
        // fresh login fixes it, so clear the cookie and send them there.
        if (errorCode === "session_stale") {
          await signOut({ callbackUrl: "/login" });
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: errorCode === "agent_locked" ? "__AGENT_LOCKED__" : errorMsg,
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && res.body) {
        const assistantMsgId = `asst-${Date.now()}`;
        let assistantMsgAdded = false;
        let newChatId: string | null = null;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventType = "message";
            let data = "";
            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              else if (line.startsWith("data: ")) data = line.slice(6);
            }
            if (!data) continue;

            if (eventType === "meta") {
              try {
                const meta = JSON.parse(data);
                newChatId = meta.chatId;
                if (meta.chatId && !activeChatId) {
                  skipReloadForChatId.current = meta.chatId;
                  setActiveChatId(meta.chatId);
                  setChats((prev) => [
                    {
                      id: meta.chatId,
                      title: meta.title || "Nueva conversacion",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      _count: { messages: 2 },
                    },
                    ...prev,
                  ]);
                }
              } catch { /* ignore */ }
            } else if (eventType === "delta") {
              try {
                const { text } = JSON.parse(data);
                if (!assistantMsgAdded) {
                  setMessages((prev) => [
                    ...prev,
                    { id: assistantMsgId, role: "assistant", content: text, createdAt: new Date().toISOString() },
                  ]);
                  assistantMsgAdded = true;
                } else {
                  setMessages((prev) =>
                    prev.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + text } : m)
                  );
                }
              } catch { /* ignore */ }
            } else if (eventType === "herramienta") {
              try {
                const { nombre } = JSON.parse(data);
                setHerramientaEnCurso(
                  nombre === "generar_hoja_de_calculo" ? "Generando la hoja de cálculo…"
                    : nombre === "generar_documento_word" ? "Generando el documento de Word…"
                    : "Generando el PDF…"
                );
              } catch { /* ignore */ }
            } else if (eventType === "archivo") {
              try {
                const ficha = JSON.parse(data);
                setHerramientaEnCurso("");
                // El archivo puede llegar ANTES del primer texto: si la burbuja
                // aún no existe se crea aquí, o el adjunto se perdería.
                if (!assistantMsgAdded) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: assistantMsgId,
                      role: "assistant",
                      content: "",
                      attachments: [ficha],
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  assistantMsgAdded = true;
                } else {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, attachments: [...(m.attachments || []), ficha] }
                        : m
                    )
                  );
                }
              } catch { /* ignore */ }
            } else if (eventType === "error") {
              try {
                const { error } = JSON.parse(data);
                if (!assistantMsgAdded) {
                  setMessages((prev) => [
                    ...prev,
                    { id: assistantMsgId, role: "assistant", content: error || "Error del agente.", createdAt: new Date().toISOString() },
                  ]);
                  assistantMsgAdded = true;
                } else {
                  setMessages((prev) =>
                    prev.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + "\n\n" + error } : m)
                  );
                }
              } catch { /* ignore */ }
            } else if (eventType === "title_update") {
              try {
                const { title: newTitle } = JSON.parse(data);
                const targetChatId = newChatId || activeChatId;
                if (newTitle && targetChatId) {
                  setChats((prev) =>
                    prev.map((c) => c.id === targetChatId ? { ...c, title: newTitle } : c)
                  );
                }
              } catch { /* ignore */ }
            }
          }
        }

        if (activeChatId) {
          setChats((prev) =>
            prev.map((c) =>
              c.id === activeChatId
                ? { ...c, updatedAt: new Date().toISOString(), _count: { messages: c._count.messages + 2 } }
                : c
            )
          );
        }
      } else {
        const data = await res.json();
        if (!activeChatId && data.chatId) {
          setActiveChatId(data.chatId);
          setChats((prev) => [
            { id: data.chatId, title: data.title || "Nueva conversacion", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), _count: { messages: 2 } },
            ...prev,
          ]);
        } else {
          setChats((prev) =>
            prev.map((c) =>
              c.id === activeChatId
                ? { ...c, updatedAt: new Date().toISOString(), _count: { messages: c._count.messages + 2 } }
                : c
            )
          );
        }
        setMessages((prev) => [
          ...prev,
          { id: `asst-${Date.now()}`, role: "assistant", content: data.reply, createdAt: new Date().toISOString() },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: "Error de conexion. Intenta de nuevo.", createdAt: new Date().toISOString() },
      ]);
    } finally {
      setHerramientaEnCurso("");
      setIsLoading(false);
      setUploadStatus("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
  };

  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`/api/agents/${agentId}/chats?chatId=${chatId}`, { method: "DELETE" });
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) { setActiveChatId(null); setMessages([]); }
    } catch { /* ignore */ }
  };

  const exportChat = async (format: "txt" | "pdf") => {
    if (!activeChatId || exporting) return;
    setExporting(true);
    setShowExportMenu(false);
    setExportError("");
    try {
      const res = await fetch(`/api/agents/${agentId}/chat/export?chatId=${activeChatId}&format=${format}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setExportError(data?.error || `No se pudo exportar la conversación (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="(.+)"/);
      a.download = match ? match[1] : `chat.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("No se pudo conectar para exportar la conversación.");
    } finally { setExporting(false); }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5" />;
    if (type.startsWith("audio/")) return <Mic className="h-3.5 w-3.5" />;
    return <FileText className="h-3.5 w-3.5" />;
  };

  const filteredChats = sidebarSearch.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : chats;

  const chatGroups = groupChatsByDate(filteredChats);

  const activeChat = chats.find((c) => c.id === activeChatId);

  /* ── User initials ── */
  const userInitials = session?.user?.name
    ? session.user.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
    : "AM";

  /* ── Agent monogram ── */
  const agentMonogram = agent.name.slice(0, 2).toUpperCase();

  return (
    <div
      className="flex flex-col h-[calc(100dvh-var(--topbar-h,0px)-var(--demo-banner-h,0px))] lg:h-[calc(100dvh-var(--demo-banner-h,0px))]"
      style={{ background: "var(--surface-0)" }}
    >
      {/* En el teléfono esta cabecera solo repetía «Themis / Asesora Legal»,
          que ya dicen la barra del hilo y el saludo de bienvenida justo
          debajo: entre ella, la barra de la app y la del hilo, el chat
          empezaba pasada la mitad de la pantalla. En sm+ hay sitio de sobra y
          además lleva el selector de tema, así que allí se conserva. */}
      <div className="hidden sm:block">
        <Header
          title={agent.name}
          subtitle={agent.title}
          breadcrumbs={[
            { label: "Asistente IA", href: "/dashboard/asistente" },
            { label: agent.name },
          ]}
        />
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ─────────────────────────────────────────────
            SIDEBAR
        ───────────────────────────────────────────── */}
        {(showSidebar || listaMovil) && (
          <>
            {/* Mobile backdrop */}
            {listaMovil && (
              <div
                className="fixed inset-0 z-30 lg:hidden"
                style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(4px)" }}
                onClick={() => setListaMovil(false)}
              />
            )}

            <div
              className={`${listaMovil ? "fixed flex" : "hidden"} ${
                showSidebar ? "lg:flex" : "lg:hidden"
              } inset-y-0 left-0 z-40 w-[280px] sm:w-[300px] lg:relative lg:inset-auto lg:z-auto lg:w-64 xl:w-72 flex-col flex-shrink-0`}
              style={{
                background: "var(--hifi-surface-1)",
                borderRight: "1px solid rgb(var(--veil-rgb) / 0.07)",
              }}
            >
              {/* Sidebar header */}
              <div
                className="p-4 space-y-3"
                style={{ borderBottom: "1px solid var(--hifi-hairline)" }}
              >
                {/* Eyebrow + agent name */}
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      style={{
                        fontFamily: "'Geist Mono', ui-monospace, monospace",
                        fontSize: 9,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--ink-4)",
                      }}
                    >
                      Conversaciones
                    </p>
                    <p
                      style={{
                        fontFamily: "'Geist Mono', ui-monospace, monospace",
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: agentColor,
                        marginTop: 2,
                      }}
                    >
                      {agent.name}
                    </p>
                  </div>
                  <button
                    className="lg:hidden p-1.5 rounded-lg transition-colors hover:opacity-70"
                    onClick={() => setListaMovil(false)}
                    aria-label="Cerrar conversaciones"
                    style={{ color: "var(--ink-4)" }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* New chat button */}
                <button
                  onClick={startNewChat}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 transition-all duration-150 hover:opacity-90 active:scale-[0.98] cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-lo) 100%)",
                    boxShadow: "0 2px 12px rgb(var(--accent-rgb) / 0.25)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva conversación
                </button>

                {/* Search */}
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
                    style={{ color: "var(--ink-4)" }}
                  />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder="Buscar conversaciones..."
                    className="w-full focus:outline-none"
                    style={{
                      paddingLeft: 32,
                      paddingRight: 12,
                      paddingTop: 8,
                      paddingBottom: 8,
                      background: "var(--surface-3)",
                      border: "1px solid var(--hifi-hairline)",
                      borderRadius: 10,
                      fontSize: 12,
                      color: "var(--ink)",
                      fontFamily: "'Geist', system-ui, sans-serif",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = "1px solid rgb(var(--accent-rgb) / 0.4)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = "1px solid rgb(var(--veil-rgb) / 0.07)";
                    }}
                  />
                </div>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto py-2">
                {loadingChats ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-4)" }} />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <p
                    className="text-center py-8 px-4 leading-relaxed"
                    style={{ fontSize: 12, color: "var(--ink-4)" }}
                  >
                    {sidebarSearch ? "Sin resultados" : `No tienes conversaciones con ${agent.name}. Empieza una nueva.`}
                  </p>
                ) : (
                  chatGroups.map((group) => (
                    <div key={group.label}>
                      {/* Section label */}
                      <p
                        className="px-4 pt-3 pb-1"
                        style={{
                          fontFamily: "'Geist Mono', ui-monospace, monospace",
                          fontSize: 9,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "var(--ink-4)",
                        }}
                      >
                        {group.label}
                      </p>

                      {group.items.map((chat) => {
                        const isActive = activeChatId === chat.id;
                        return (
                          <div
                            key={chat.id}
                            className="group relative mx-2 mb-0.5 rounded-xl cursor-pointer transition-all duration-150"
                            style={{
                              background: isActive
                                ? "radial-gradient(ellipse at 0% 50%, rgb(var(--accent-rgb) / 0.12) 0%, rgb(var(--accent-rgb) / 0.04) 100%)"
                                : "transparent",
                              borderLeft: isActive
                                ? "2px solid var(--accent)"
                                : "2px solid transparent",
                              boxShadow: isActive
                                ? "inset 0 0 0 1px rgb(var(--accent-rgb) / 0.15)"
                                : "none",
                            }}
                            onClick={() => {
                              setActiveChatId(chat.id);
                              setListaMovil(false);
                            }}
                          >
                            <div className="px-3 py-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <span
                                  className="truncate flex-1"
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: isActive ? "var(--ink)" : "var(--ink-2)",
                                  }}
                                >
                                  {chat.title}
                                </span>
                                <span
                                  style={{
                                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                                    fontSize: 9,
                                    color: "var(--ink-4)",
                                    flexShrink: 0,
                                    paddingTop: 2,
                                  }}
                                >
                                  {new Date(chat.updatedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}
                                </span>
                              </div>
                              <p
                                className="mt-0.5"
                                style={{
                                  fontSize: 11,
                                  color: "var(--ink-4)",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {chat._count.messages} mensajes
                              </p>
                            </div>

                            {/* Delete button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                              className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all duration-150"
                              style={{ background: "rgb(var(--danger-rgb) / 0.1)" }}
                            >
                              <Trash2 className="h-3 w-3" style={{ color: "var(--danger-text)" }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Memory section */}
              <div
                className="p-3"
                style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)" }}
              >
                <button
                  onClick={() => setShowMemory(!showMemory)}
                  className="flex items-center gap-2 w-full transition-colors"
                  style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)" }}
                >
                  <Brain className="h-3.5 w-3.5" style={{ color: agentColor }} />
                  Memoria del agente
                  <ChevronRight
                    className="h-3 w-3 ml-auto transition-transform"
                    style={{ transform: showMemory ? "rotate(90deg)" : "none" }}
                  />
                </button>
                {showMemory && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                      rows={4}
                      placeholder="Escribe notas que el agente recordara entre sesiones..."
                      className="w-full resize-none focus:outline-none"
                      maxLength={10000}
                      style={{
                        fontSize: 12,
                        padding: "8px 12px",
                        background: "var(--surface-3)",
                        border: "1px solid var(--hifi-hairline)",
                        borderRadius: 10,
                        color: "var(--ink)",
                        fontFamily: "'Geist', system-ui, sans-serif",
                      }}
                    />
                    <button
                      onClick={saveMemory}
                      disabled={savingMemory}
                      className="w-full rounded-lg py-1.5 text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      style={{
                        background: "rgb(var(--accent-rgb) / 0.15)",
                        border: "1px solid rgb(var(--accent-rgb) / 0.3)",
                        color: "var(--accent-text)",
                      }}
                    >
                      {savingMemory ? "Guardando..." : "Guardar memoria"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────
            MAIN CHAT AREA
        ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--surface-0)" }}>

          {/* Chat header bar */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--hifi-hairline)" }}
          >
            {/* Sidebar toggle */}
            <button
              onClick={() => {
                if (window.innerWidth < 1024) setListaMovil((v) => !v);
                else setShowSidebar((v) => !v);
              }}
              aria-label="Conversaciones"
              title="Conversaciones"
              className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: "var(--ink-3)" }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--ink)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--ink-3)"}
            >
              <MessageCircle className="h-4 w-4" />
            </button>

            {/* El nombre del agente ya aparece en la cabecera de la página y en
                la columna de conversaciones: repetirlo aquí lo dejaba cuatro
                veces en pantalla. Esta barra se queda solo con el hilo actual,
                que es lo único que cambia. */}
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              <div
                className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{
                  width: 26,
                  height: 26,
                  background: tint(0.12),
                  border: `1px solid ${tint(0.22)}`,
                }}
              >
                <agent.icon className="h-3.5 w-3.5" style={{ color: agentColor }} />
              </div>
              <h3
                className="truncate"
                style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3 }}
              >
                {activeChat ? activeChat.title : `Nueva conversación con ${agent.name}`}
              </h3>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {activeChatId && messages.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={exporting}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{
                      color: "var(--ink-3)",
                      border: "1px solid var(--hifi-hairline)",
                      background: "transparent",
                    }}
                    title="Exportar conversacion"
                  >
                    {exporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {showExportMenu && (
                    <div
                      className="absolute right-0 top-full mt-1 py-1 min-w-[140px] z-50"
                      style={{
                        background: "var(--surface-3)",
                        border: "1px solid rgb(var(--veil-rgb) / 0.1)",
                        borderRadius: 12,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.40)",
                      }}
                    >
                      <button
                        onClick={() => exportChat("txt")}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
                        style={{ fontSize: 12, color: "var(--ink-2)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgb(var(--veil-rgb) / 0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <FileText className="h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                        Exportar TXT
                      </button>
                      <button
                        onClick={() => exportChat("pdf")}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
                        style={{ fontSize: 12, color: "var(--ink-2)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgb(var(--veil-rgb) / 0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <FileText className="h-3.5 w-3.5" style={{ color: "var(--danger-text)" }} />
                        Exportar PDF
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {exportError && (
            <div className="px-4 sm:px-6 lg:px-8 pt-2">
              <p className="max-w-3xl mx-auto text-[12px] flex items-start gap-2" style={{ color: "var(--danger-text)" }}>
                <span className="flex-1">{exportError}</span>
                <button onClick={() => setExportError("")} className="cursor-pointer" style={{ color: "var(--ink-3)" }}>
                  Cerrar
                </button>
              </p>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto">
            {!activeChatId && messages.length === 0 ? (
              /* Pantalla de inicio. Antes era solo el nombre del agente y una
                 descripción: el usuario se quedaba ante un cursor sin saber qué
                 pedir. Ahora arranca con preguntas concretas de su oficio, que
                 de paso enseñan lo que el agente sabe hacer. */
              <div className="h-full overflow-y-auto ui-scroll">
                <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
                  <div
                    className="flex items-center justify-center rounded-3xl mb-6"
                    style={{
                      width: 60,
                      height: 60,
                      background: `linear-gradient(135deg, ${tint(0.2)}, ${tint(0.05)})`,
                      border: `1px solid ${tint(0.25)}`,
                      boxShadow: `0 8px 32px ${tint(0.13)}`,
                    }}
                  >
                    <agent.icon className="h-7 w-7" style={{ color: agentColor }} />
                  </div>

                  <h2
                    style={{
                      fontWeight: 600,
                      fontSize: 26,
                      letterSpacing: "-0.02em",
                      color: "var(--ink)",
                      marginBottom: 6,
                      textAlign: "center",
                    }}
                  >
                    Hola, soy {agent.name}
                  </h2>
                  <p
                    style={{
                      fontSize: 14,
                      color: "var(--ink-3)",
                      maxWidth: 460,
                      lineHeight: 1.6,
                      textAlign: "center",
                      marginBottom: 28,
                    }}
                  >
                    {agent.description}
                  </p>

                  <div className="w-full" style={{ maxWidth: 680 }}>
                    <p
                      style={{
                        fontFamily: "'Geist Mono', ui-monospace, monospace",
                        fontSize: 9.5,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--ink-4)",
                        marginBottom: 10,
                        textAlign: "center",
                      }}
                    >
                      Prueba con
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(SUGERENCIAS[agentId as AgentId] || []).map((sug) => (
                        <button
                          key={sug.titulo}
                          onClick={() => enviarSugerencia(sug.prompt)}
                          className="text-left rounded-2xl px-4 py-3.5 transition-all cursor-pointer group"
                          style={{
                            background: "rgb(var(--veil-rgb) / 0.04)",
                            border: "1px solid rgb(var(--veil-rgb) / 0.10)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgb(var(--accent-rgb) / 0.08)";
                            e.currentTarget.style.borderColor = "rgb(var(--accent-rgb) / 0.32)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgb(var(--veil-rgb) / 0.04)";
                            e.currentTarget.style.borderColor = "rgb(var(--veil-rgb) / 0.10)";
                          }}
                        >
                          <span
                            className="block"
                            style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", marginBottom: 3 }}
                          >
                            {sug.titulo}
                          </span>
                          <span
                            className="block"
                            style={{
                              fontSize: 11.5,
                              color: "var(--ink-4)",
                              lineHeight: 1.45,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {sug.prompt}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p
                      className="text-center"
                      style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 18, lineHeight: 1.6 }}
                    >
                      También puedes adjuntar documentos o grabar una nota de voz, y pedirle que te
                      entregue el resultado en Excel, Word o PDF.
                    </p>
                  </div>
                </div>
              </div>
            ) : loadingMessages ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--ink-4)" }} />
              </div>
            ) : (
              <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
                {messages.map((msg) => {
                  /* Locked add-on agent — render upsell card instead of a bubble */
                  if (msg.content === "__AGENT_LOCKED__") {
                    return (
                      <div key={msg.id} className="flex justify-start">
                        <div
                          className="rounded-2xl w-full max-w-md"
                          style={{
                            background: "radial-gradient(120% 100% at 0% 0%, rgb(var(--accent-rgb) / 0.12), transparent 70%), var(--surface-2)",
                            border: "1px solid rgb(var(--accent-rgb) / 0.4)",
                            padding: 20,
                          }}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div
                              className="flex items-center justify-center rounded-xl flex-shrink-0"
                              style={{
                                width: 36,
                                height: 36,
                                background: "rgb(var(--accent-rgb) / 0.15)",
                                border: "1px solid rgb(var(--accent-rgb) / 0.3)",
                              }}
                            >
                              <Lock className="h-4 w-4" style={{ color: "var(--accent-text)" }} />
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                              {agent.name} es un agente complemento
                            </p>
                          </div>
                          <p className="mb-4" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
                            Actívalo por $5 USD/mes y desbloquea {agent.title?.toLowerCase() ?? "sus capacidades"}.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => router.push("/dashboard/suscripcion")}
                              className="rounded-full px-4 py-2 transition-all duration-150 hover:opacity-90 active:scale-[0.98] cursor-pointer"
                              style={{
                                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-lo) 100%)",
                                boxShadow: "0 2px 12px rgb(var(--accent-rgb) / 0.25)",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#fff",
                              }}
                            >
                              Ver planes y add-ons
                            </button>
                            <button
                              onClick={() => window.open(process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_URL || "https://wa.me/573001112233", "_blank")}
                              className="rounded-full px-4 py-2 transition-all duration-150 hover:opacity-80 cursor-pointer"
                              style={{
                                background: "transparent",
                                border: "1px solid rgb(var(--veil-rgb) / 0.1)",
                                fontSize: 12,
                                fontWeight: 500,
                                color: "var(--ink-2)",
                              }}
                            >
                              Hablar con soporte
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {/* Agent avatar */}
                    {msg.role === "assistant" && (
                      <div
                        className="flex items-center justify-center rounded-xl flex-shrink-0 mt-1"
                        style={{
                          width: 32,
                          height: 32,
                          background: tint(0.14),
                          border: `1px solid ${tint(0.24)}`,
                          fontFamily: "'Geist Mono', ui-monospace, monospace",
                          fontSize: 10,
                          fontWeight: 600,
                          color: agentColor,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {agentMonogram}
                      </div>
                    )}

                    <div className={msg.role === "user" ? "max-w-[82%] sm:max-w-[78%] space-y-1.5" : "flex-1 min-w-0 space-y-1.5"}>
                      {/* Los archivos que SUBIÓ el usuario van antes del
                          texto: acompañan a la pregunta. Los que GENERÓ el
                          agente van después de la respuesta, que es donde el
                          usuario los busca —«aquí tienes tu archivo»— y no
                          antes de haber leído nada. */}
                      {fichas(msg, false)}

                      {/* El mensaje del usuario va en burbuja; la respuesta del
                          agente NO. Encerrar una respuesta larga —con listas,
                          tablas o un artículo citado— en una burbuja estrecha
                          es lo que hacía que el chat se viera apretado y
                          costara leerlo. Es el patrón de ChatGPT, Claude y
                          Gemini: el usuario en globo, el asistente sobre la
                          página. */}
                      {msg.role === "user" ? (
                        <div
                          className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                          style={{
                            background: "var(--surface-3)",
                            border: "1px solid rgb(var(--veil-rgb) / 0.1)",
                            color: "var(--ink)",
                            borderRadius: "16px 16px 4px 16px",
                          }}
                        >
                          {msg.content}
                        </div>
                      ) : (
                        <div className="group/msg">
                          {msg.content ? (
                            <RespuestaMarkdown>{msg.content}</RespuestaMarkdown>
                          ) : null}
                          {fichas(msg, true)}
                          {msg.content && (
                            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                              <button
                                onClick={() => copiarMensaje(msg.id, msg.content)}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                                style={{ color: "var(--ink-4)", fontSize: 11 }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgb(var(--veil-rgb) / 0.06)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                title="Copiar respuesta"
                              >
                                {copiadoId === msg.id ? (
                                  <>
                                    <Check className="h-3 w-3" style={{ color: "var(--ok-text)" }} />
                                    <span style={{ color: "var(--ok-text)" }}>Copiado</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* User avatar */}
                    {msg.role === "user" && (
                      <div
                        className="flex items-center justify-center rounded-xl flex-shrink-0 mt-1"
                        style={{
                          width: 32,
                          height: 32,
                          background: "rgb(var(--accent-rgb) / 0.15)",
                          border: "1px solid rgb(var(--accent-rgb) / 0.3)",
                          fontFamily: "'Geist Mono', ui-monospace, monospace",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--accent-text)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {userInitials}
                      </div>
                    )}
                  </div>
                  );
                })}

                {/* Typing indicator */}
                {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
                  <div className="flex gap-3 justify-start">
                    <div
                      className="flex items-center justify-center rounded-xl flex-shrink-0"
                      style={{
                        width: 32,
                        height: 32,
                        background: tint(0.14),
                        border: `1px solid ${tint(0.24)}`,
                        fontFamily: "'Geist Mono', ui-monospace, monospace",
                        fontSize: 10,
                        fontWeight: 600,
                        color: agentColor,
                      }}
                    >
                      {agentMonogram}
                    </div>
                    <div
                      className="flex items-center gap-1.5 px-4 py-3"
                      style={{
                        background: "var(--hifi-surface-1)",
                        border: "1px solid var(--hifi-hairline)",
                        borderRadius: "16px 16px 16px 4px",
                      }}
                    >
                      <span className="hifi-typing-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: agentColor, display: "block", opacity: 0.4 }} />
                      <span className="hifi-typing-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: agentColor, display: "block", opacity: 0.4 }} />
                      <span className="hifi-typing-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: agentColor, display: "block", opacity: 0.4 }} />
                      {/* Construir y subir un archivo tarda varios segundos: sin
                          decirlo, los tres puntos parecen que se colgó. */}
                      {herramientaEnCurso && (
                        <span className="text-[12px] ml-1.5" style={{ color: "var(--ink-3)" }}>
                          {herramientaEnCurso}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {attachError && (
            <div className="px-4 sm:px-6 lg:px-8 pt-2">
              <p className="max-w-3xl mx-auto text-[12px]" style={{ color: "var(--danger-text)" }}>
                {attachError}
              </p>
            </div>
          )}

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="px-4 sm:px-6 lg:px-8 pt-2">
              <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--hifi-hairline)",
                    }}
                  >
                    {att.preview ? (
                      <img src={att.preview} alt="" className="w-7 h-7 rounded object-cover" />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5" style={{ color: "var(--ink-4)" }} />
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--ink-2)",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {att.file.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Geist Mono', ui-monospace, monospace",
                        fontSize: 9,
                        color: "var(--ink-4)",
                      }}
                    >
                      {(att.file.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <button
                      onClick={() => removeAttachment(i)}
                      className="p-0.5 rounded transition-colors hover:opacity-70"
                      style={{ color: "var(--ink-4)" }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Compose area ── */}
          <div
            className="px-4 sm:px-6 lg:px-8 pt-3 pb-5"
            style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)" }}
          >
            <div className="max-w-3xl mx-auto">
              {uploadStatus && (
                <p
                  className="mb-1"
                  style={{ fontSize: 11, color: "var(--accent-text)", fontFamily: "'Geist Mono', ui-monospace, monospace" }}
                >
                  {uploadStatus}
                </p>
              )}

              {/* Compose card */}
              {/* El cuadro de escritura es lo que invita a empezar: se le da
                  presencia con sombra y un borde que reacciona al foco, en vez
                  de la caja plana anterior. */}
              <div
                className="rounded-3xl transition-all"
                style={{
                  background: "var(--hifi-surface-1)",
                  border: `1px solid ${compositorEnfocado ? "rgb(var(--accent-rgb) / 0.45)" : "rgb(var(--veil-rgb) / 0.10)"}`,
                  boxShadow: compositorEnfocado
                    ? "0 6px 28px rgb(var(--accent-rgb) / 0.12)"
                    : "0 4px 20px rgba(0,0,0,0.10)",
                }}
              >
                {/* Textarea */}
                <div className="px-4 pt-3 pb-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); autoResize(); }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setCompositorEnfocado(true)}
                    onBlur={() => setCompositorEnfocado(false)}
                    placeholder={`Escríbele a ${agent.name}… o pídele un Excel, un Word o un PDF`}
                    rows={1}
                    disabled={isLoading}
                    maxLength={4000}
                    className="w-full resize-none focus:outline-none"
                    style={{
                      background: "transparent",
                      fontSize: 14,
                      color: "var(--ink)",
                      fontFamily: "'Geist', system-ui, sans-serif",
                      lineHeight: 1.6,
                      maxHeight: 160,
                      overflow: "hidden",
                    }}
                  />
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2 px-3 pb-3 pt-1">
                  {/* File input hidden */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.m4a,.webm"
                  />

                  {/* Attachment button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
                    title="Adjuntar archivo"
                    style={{
                      width: 32,
                      height: 32,
                      background: "transparent",
                      border: "1px solid rgb(var(--veil-rgb) / 0.09)",
                      color: "var(--ink-3)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgb(var(--accent-rgb) / 0.4)";
                      e.currentTarget.style.color = "var(--accent-text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgb(var(--veil-rgb) / 0.09)";
                      e.currentTarget.style.color = "var(--ink-3)";
                    }}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>

                  {/* Audio recorder */}
                  <AudioRecorder onRecorded={handleAudioRecorded} disabled={isLoading} />

                  {/* El contador solo aparece cuando de verdad importa. Verlo
                      en «0/4000» desde el primer momento hacía parecer el
                      cuadro un formulario con límite en vez de una conversación. */}
                  <span
                    className="flex-1"
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      color: input.length > 3800 ? "var(--warn-text)" : "var(--ink-4)",
                    }}
                  >
                    {input.length > 3400 ? `${input.length}/4000` : ""}
                  </span>

                  {/* Send */}
                  <button
                    onClick={() => void sendMessage()}
                    disabled={isLoading || (!input.trim() && attachments.length === 0)}
                    className="flex items-center justify-center rounded-xl transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-lo) 100%)",
                      boxShadow: "0 2px 12px rgb(var(--accent-rgb) / 0.3)",
                    }}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <ArrowUp className="h-4 w-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
