"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { AGENTS, isValidAgentId, type AgentId } from "@/lib/agents";
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
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { Badge } from "@/components/ui/badge";
import { AudioRecorder } from "@/components/dashboard/AudioRecorder";
import { saveAudio, getPendingAudios, deleteAudio } from "@/lib/audio-storage";

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
  attachments?: { name: string; url: string; type: string; size: number }[];
  createdAt: string;
}

interface PendingAttachment {
  file: File;
  preview?: string;
  persistedId?: string;
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
  const [showSidebar, setShowSidebar] = useState(true);
  const [memory, setMemory] = useState("");
  const [showMemory, setShowMemory] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

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

  // Load chats
  useEffect(() => {
    if (!isValid) return;
    fetch(`/api/agents/${agentId}/chats`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setChats(data);
      })
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

  // Restore pending audio recordings persisted in IndexedDB
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
      .catch(() => { /* IndexedDB unavailable, ignore */ });
  }, [agentId, isValid]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    fetch(`/api/agents/${agentId}/chat?chatId=${activeChatId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch(console.error)
      .finally(() => setLoadingMessages(false));
  }, [activeChatId, agentId]);

  if (!isValid) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Agente no encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/asistente")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
      </div>
    );
  }

  const agent = AGENTS[agentId as AgentId];

  const saveMemory = async () => {
    setSavingMemory(true);
    try {
      await fetch(`/api/agents/${agentId}/memory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: memory }),
      });
    } catch {
      // ignore
    } finally {
      setSavingMemory(false);
      setShowMemory(false);
    }
  };

  const handleAudioRecorded = async (file: File) => {
    let persistedId: string | undefined;
    try {
      persistedId = await saveAudio(agentId, file);
    } catch (err) {
      console.warn("[audio] persist failed:", err);
    }
    setAttachments((prev) => [...prev, { file, persistedId }].slice(0, 5));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).slice(0, 5);
    const newAttachments: PendingAttachment[] = newFiles.map((file) => {
      const att: PendingAttachment = { file };
      if (file.type.startsWith("image/")) {
        att.preview = URL.createObjectURL(file);
      }
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

  const sendMessage = async () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isLoading) return;

    setIsLoading(true);
    setUploadStatus("");

    try {
      // Upload attachments
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

      // Optimistic user message
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
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: activeChatId,
          message: trimmed || "(adjuntos)",
          attachments: uploaded,
        }),
      });

      if (!res.ok) {
        let errorMsg = "Error al enviar.";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch { /* ignore parse error */ }
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: "assistant", content: errorMsg, createdAt: new Date().toISOString() },
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
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: m.content + text } : m
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
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: m.content + "\n\n" + error } : m
                    )
                  );
                }
              } catch { /* ignore */ }
            } else if (eventType === "title_update") {
              try {
                const { title: newTitle } = JSON.parse(data);
                const targetChatId = newChatId || activeChatId;
                if (newTitle && targetChatId) {
                  setChats((prev) =>
                    prev.map((c) =>
                      c.id === targetChatId ? { ...c, title: newTitle } : c
                    )
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
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  };

  const exportChat = async (format: "txt" | "pdf") => {
    if (!activeChatId || exporting) return;
    setExporting(true);
    setShowExportMenu(false);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/chat/export?chatId=${activeChatId}&format=${format}`
      );
      if (!res.ok) throw new Error("Export failed");
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
      // ignore
    } finally {
      setExporting(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5" />;
    if (type.startsWith("audio/")) return <Mic className="h-3.5 w-3.5" />;
    return <FileText className="h-3.5 w-3.5" />;
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-52px)] lg:h-screen">
      <Header
        title={agent.name}
        subtitle={agent.title}
        breadcrumbs={[
          { label: "Asistente IA", href: "/dashboard/asistente" },
          { label: agent.name },
        ]}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Chat sidebar — overlay on mobile, inline on lg+ */}
        {showSidebar && (
          <>
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
              onClick={() => setShowSidebar(false)}
            />
            <div className="fixed inset-y-0 left-0 z-40 w-[280px] sm:w-[300px] lg:relative lg:inset-auto lg:z-auto lg:w-64 xl:w-72 border-r border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#12141f]/95 lg:dark:bg-white/[0.02] flex flex-col flex-shrink-0 lg:backdrop-blur-none dark:backdrop-blur-2xl lg:dark:backdrop-blur-none shadow-2xl lg:shadow-none">
              <div className="p-3 border-b border-gray-200 dark:border-white/10 flex items-center gap-2">
                <Button
                  onClick={startNewChat}
                  className="flex-1 gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-md shadow-violet-500/20 h-9 text-xs"
                  size="sm"
                >
                  <Plus className="h-3.5 w-3.5" /> Nuevo chat
                </Button>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-2">
                {loadingChats ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : chats.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8 px-4">
                    No tienes conversaciones con {agent.name}. Empieza una nueva.
                  </p>
                ) : (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`group flex items-center gap-2 px-3 py-2.5 mx-2 rounded-xl cursor-pointer transition-all text-xs ${
                        activeChatId === chat.id
                          ? "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300"
                          : "hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300"
                      }`}
                      onClick={() => { setActiveChatId(chat.id); if (window.innerWidth < 1024) setShowSidebar(false); }}
                    >
                      <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                      <span className="flex-1 truncate font-medium">{chat.title}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Memory */}
              <div className="border-t border-gray-200 dark:border-white/10 p-3">
                <button
                  onClick={() => setShowMemory(!showMemory)}
                  className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors w-full"
                >
                  <Brain className="h-3.5 w-3.5" />
                  Memoria del agente
                  <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${showMemory ? "rotate-90" : ""}`} />
                </button>
                {showMemory && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                      rows={4}
                      placeholder="Escribe notas que el agente recordara entre sesiones..."
                      className="w-full text-xs px-3 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-violet-400/50"
                      maxLength={10000}
                    />
                    <Button
                      onClick={saveMemory}
                      disabled={savingMemory}
                      size="sm"
                      className="w-full h-7 text-xs rounded-lg"
                    >
                      {savingMemory ? "Guardando..." : "Guardar memoria"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toggle sidebar on mobile */}
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-gray-200 dark:border-white/10">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex-shrink-0"
            >
              <MessageCircle className="h-4 w-4 text-gray-500" />
            </button>
            <span className="text-xs text-gray-500 flex-1 truncate">
              {activeChatId ? chats.find((c) => c.id === activeChatId)?.title : "Nueva conversacion"}
            </span>
            {activeChatId && messages.length > 0 && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={exporting}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
                  title="Exportar conversacion"
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 text-gray-500" />
                  )}
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#1e2030] border border-gray-200 dark:border-white/10 rounded-xl shadow-lg z-50 py-1 min-w-[140px]">
                    <button
                      onClick={() => exportChat("txt")}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-2"
                    >
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                      Exportar TXT
                    </button>
                    <button
                      onClick={() => exportChat("pdf")}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-2"
                    >
                      <FileText className="h-3.5 w-3.5 text-red-400" />
                      Exportar PDF
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {!activeChatId && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 sm:px-6">
                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${agent.gradient} flex items-center justify-center mb-3 sm:mb-4 shadow-lg`}>
                  <agent.icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {agent.name}
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-1">
                  {agent.title}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md leading-relaxed">
                  {agent.description} Escribe tu pregunta o sube un archivo para comenzar.
                </p>
              </div>
            ) : loadingMessages ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="p-3 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${agent.gradient} flex items-center justify-center mr-3 mt-1 flex-shrink-0`}>
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div className="max-w-[85%] sm:max-w-[80%] space-y-2">
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {msg.attachments.map((att, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-100 dark:bg-violet-500/15 rounded-lg text-xs text-violet-700 dark:text-violet-300">
                              {getFileIcon(att.type)}
                              <span className="truncate max-w-[120px]">{att.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === "user"
                            ? "bg-violet-600 text-white rounded-2xl rounded-br-md shadow-md shadow-violet-500/20"
                            : "bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md border border-gray-200 dark:border-white/10"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
                  <div className="flex justify-start">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${agent.gradient} flex items-center justify-center mr-3 mt-1 flex-shrink-0`}>
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

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="px-3 sm:px-6 lg:px-8 pt-2">
              <div className="max-w-3xl mx-auto flex flex-wrap gap-1.5 sm:gap-2">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-white/10">
                    {att.preview ? (
                      <img src={att.preview} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[120px]">{att.file.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{(att.file.size / 1024 / 1024).toFixed(1)}MB</Badge>
                    <button onClick={() => removeAttachment(i)} className="p-0.5 hover:bg-red-100 dark:hover:bg-red-500/10 rounded">
                      <X className="h-3 w-3 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#12141f]/60 dark:backdrop-blur-2xl px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
            <div className="max-w-3xl mx-auto">
              {uploadStatus && (
                <p className="text-xs text-violet-600 mb-1">{uploadStatus}</p>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.m4a,.webm"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex-shrink-0"
                  title="Adjuntar archivo"
                >
                  <Upload className="h-4 w-4 text-gray-500" />
                </button>
                <AudioRecorder onRecorded={handleAudioRecorded} disabled={isLoading} />
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); autoResize(); }}
                    onKeyDown={handleKeyDown}
                    placeholder={`Preguntale a ${agent.name}...`}
                    rows={1}
                    className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400/50 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all resize-none overflow-hidden"
                    disabled={isLoading}
                    maxLength={4000}
                  />
                </div>
                <Button
                  onClick={sendMessage}
                  disabled={isLoading || (!input.trim() && attachments.length === 0)}
                  className={`h-10 w-10 rounded-xl bg-gradient-to-r ${agent.gradient} shadow-md p-0 flex-shrink-0`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
