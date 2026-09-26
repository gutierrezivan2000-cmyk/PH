"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { upload } from "@vercel/blob/client";
import { Header } from "@/components/dashboard/Header";
import { AudioRecorder } from "@/components/dashboard/AudioRecorder";
import { RespuestaMarkdown } from "@/components/agents/RespuestaMarkdown";
import { AGENTS, isValidAgentId, isIncludedAgent, INCLUDED_AGENT_IDS, type AgentId } from "@/lib/agents";
import { saveAudio, getPendingAudios, deleteAudio } from "@/lib/audio-storage";
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB_LABEL, isImageMediaType } from "@/lib/chat-limits";
import { formatoTamano } from "@/lib/upload-limits";
import { SUGERENCIAS } from "@/lib/agent-sugerencias";
import {
  AGENTES,
  AreaTexto,
  Aviso,
  Boton,
  BotonIcono,
  Buscador,
  CabeceraPieza,
  Chevron,
  Cruz,
  ErrorCarga,
  Escribiendo,
  Esqueleto,
  FichaAgente,
  Flecha,
  MensajeUsuario,
  MenuMas,
  Modal,
  Pagina,
  Pieza,
  RespuestaAgente,
  Sigilo,
  TipoArchivo,
  tipoDeArchivo,
  type AgenteId,
  type ItemMenu,
} from "@/components/kit";

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

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return "Esta semana";
  return fechaCorta(d);
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

/* Fechas con el formato del SPEC («18 sep», «3:42 p. m.»). Salen de los
   createdAt/updatedAt reales que devuelve la API del chat. */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function horaDe(d: Date): string {
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
}

function fechaCorta(d: Date): string {
  const base = `${d.getDate()} ${MESES[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Hora de un mensaje: «3:42 p. m.» si es de hoy; «18 sep · 3:42 p. m.» si no. */
function fechaMensaje(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return mismoDia(d, new Date()) ? horaDe(d) : `${fechaCorta(d)} · ${horaDe(d)}`;
}

/** Fecha de una conversación en la lista: la hora si es de hoy; si no, el día. */
function fechaHilo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return mismoDia(d, new Date()) ? horaDe(d) : fechaCorta(d);
}

/* ════════════════════════════════════════════════════════════════════
   Estilos locales del chat (SPEC §g 04, maqueta secundarias.html c).
   El kit trae la respuesta-documento, el mensaje del usuario, el redactor y
   la ficha de agente; aquí va el armazón propio de esta pantalla: carril de
   conversaciones (3 columnas; 4 en ≤ 1180) + conversación (9; 8), el hilo
   activo en área negativa que sangra medio medianil, las fichas de archivo y
   la bienvenida. El alto del chat es EXACTAMENTE el de la ventana (menos el
   dock móvil y el banner de demo): el contenido hace scroll por dentro.
   ════════════════════════════════════════════════════════════════════ */
const CSS_CHAT = `
.asis-cuerpo { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr); column-gap: var(--g); padding: 0 var(--pad); }
.asis-carril { grid-column: 1 / 4; grid-row: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.asis-conv { position: relative; grid-column: 4 / 13; grid-row: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.asis-cuerpo[data-carril="no"] .asis-conv { grid-column: 2 / 12; }
.asis-velo, .asis-cerrar, .asis-solo-movil { display: none; }

.asis-agente { display: flex; align-items: flex-end; gap: 16px; padding: 18px 0 16px; border-bottom: 2px solid var(--rule); }
.asis-agente > div { min-width: 0; }
.asis-agente .nom { display: block; font: 800 32px/.9 var(--f-sans); font-stretch: 72%; letter-spacing: -.02em; }
.asis-agente .of { display: block; margin-top: 6px; font-size: 14px; line-height: 1.3; color: var(--ink-2); }
.asis-carril > * { flex: none; }
.asis-carril > .k-btn { margin-top: 14px; }
.asis-carril > .k-campo { margin-top: 10px; }
.asis-carril > .asis-hilos { position: relative; flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  margin: 4px calc(var(--g) / -2 - 6px) 0; padding: 0 calc(var(--g) / 2 + 6px) 16px; }
.asis-hilos-t { margin: 16px 0 4px; font-size: 13px; font-weight: 600; color: var(--ink-3); }
.asis-hilos ul { list-style: none; margin: 0; padding: 0; }
.asis-hilo { display: block; width: 100%; padding: 11px 0; border-bottom: 1px solid var(--line); text-align: left;
  font-size: 15px; font-weight: 500; line-height: 1.3; color: var(--ink); background: transparent; cursor: pointer; overflow-wrap: anywhere; }
.asis-hilo small { display: block; margin-top: 3px; font-size: 13px; font-weight: 400; color: var(--ink-3); }
.asis-hilo:hover { background: var(--hl); box-shadow: calc(var(--g) / -2) 0 0 var(--hl), calc(var(--g) / 2) 0 0 var(--hl); }
.asis-hilo[aria-current="true"] { background: var(--neg-area); color: var(--on-neg-area); font-weight: 600;
  box-shadow: calc(var(--g) / -2) 0 0 var(--neg-area), calc(var(--g) / 2) 0 0 var(--neg-area), calc(var(--g) / -2 - 4px) 0 0 var(--neg-area-edge); }
.asis-hilo[aria-current="true"] small { color: var(--on-neg-area-2); }
:root .asis-hilo:focus-visible { outline-offset: -3px; }
:root .asis-hilo[aria-current="true"]:focus-visible { outline-color: var(--on-neg-area); }
.asis-hilos-vacio { margin: 16px 0 0; font-size: 14px; line-height: 1.45; color: var(--ink-3); }
.asis-hilos-vacio + .k-btn { margin-top: 8px; }
.asis-hilos .k-esq { margin-top: 16px; }
.asis-memoria { border-top: 2px solid var(--rule); padding: 4px 0 14px; }
.asis-memoria > button { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 44px;
  font-size: 15px; font-weight: 700; color: var(--ink); background: transparent; cursor: pointer; }
.asis-memoria > button svg { width: 14px; height: 14px; flex: none; }
.asis-memoria > button[aria-expanded="true"] svg { transform: rotate(90deg); }
.asis-memoria p { margin: 0 0 8px; font-size: 13px; line-height: 1.35; color: var(--ink-3); }
.asis-memoria .k-in { min-height: 112px; font-size: 15px; }
.asis-memoria .k-btn { margin-top: 8px; }

.asis-barra { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.asis-barra h2 { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 18px; font-weight: 650; line-height: 1.25;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asis-barra .k-btn { gap: 10px; }
.asis-barra .k-btn svg { width: 12px; height: 12px; }
.asis-barra .k-menu > .peligro small { white-space: nowrap; }
.asis-aviso { padding-top: 12px; }
.asis-conv > * { flex: none; }
/* position: relative contiene lo «solo para lectores» (absoluto) de las respuestas:
   sin esto, el título oculto de las notas al pie alargaba la página entera. */
.asis-conv > .asis-mensajes { position: relative; flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  margin: 0 calc(var(--g) / -2); padding: 0 calc(var(--g) / 2); }
.asis-hilo-conv { display: flex; flex-direction: column; padding: 24px 0 8px; }
.asis-hilo-conv > .k-msg-u:first-child { margin-top: 0; }
.asis-hilo-conv > .k-aviso { margin: 0 0 24px; }
.asis-texto-u { white-space: pre-wrap; overflow-wrap: anywhere; }
.asis-fichas { list-style: none; margin: 2px 0 14px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.k-msg-u > .asis-fichas { margin: 0 0 10px; justify-content: flex-end; }
.asis-ficha { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; max-width: 100%; padding: 6px 12px 6px 8px;
  border: 1.5px solid var(--line-strong); color: var(--ink); background: transparent; }
.asis-ficha .n { min-width: 0; font-size: 15px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
.asis-ficha .p { font-size: 13px; color: var(--ink-3); white-space: nowrap; }
.asis-ficha .d { font-size: 14px; font-weight: 700; white-space: nowrap; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.asis-ficha img { width: 28px; height: 28px; flex: none; object-fit: cover; }
a.asis-ficha { border-color: var(--rule); }
a.asis-ficha:hover { background: var(--hl); }
.asis-escribe .cuerpo { display: flex; flex-direction: column; justify-content: center; gap: 6px; min-height: 56px; }
.asis-escribe .asis-herr { margin: 0; font-size: 14px; color: var(--ink-2); }
.asis-bloq { max-width: 560px; margin-top: 4px; padding: 16px 18px 18px; border: 2px solid var(--rule); }
.asis-bloq h3 { margin: 0; font: 800 22px/1.05 var(--f-sans); font-stretch: 75%; letter-spacing: -.01em; }
.asis-bloq p { margin: 8px 0 14px; font-size: 15px; line-height: 1.45; color: var(--ink-2); }

.asis-bienv { padding: 40px 0 24px; max-width: 780px; }
.asis-bienv h3 { margin: 20px 0 0; font: 800 40px/.95 var(--f-sans); font-stretch: 72%; letter-spacing: -.03em; }
.asis-bienv > p { margin: 12px 0 0; max-width: 60ch; font-size: 17px; line-height: 1.5; color: var(--ink-2); }
.asis-bienv > p.asis-rot { margin-top: 28px; font-size: 13px; font-weight: 600; color: var(--ink-3); }
.asis-bienv > p.asis-nota { margin-top: 18px; font-size: 14px; line-height: 1.45; color: var(--ink-3); }
.asis-sugs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.asis-sug { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-height: 44px; padding: 12px 14px;
  border: 1.5px solid var(--line-strong); background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.asis-sug:hover { border-color: var(--rule); background: var(--hl); }
.asis-sug b { font-size: 15px; font-weight: 700; line-height: 1.25; }
.asis-sug span { font-size: 14px; line-height: 1.4; color: var(--ink-3);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.asis-redactar { padding: 12px 0 14px; }
.asis-redactar .k-redactor textarea { max-height: 160px; overflow-y: auto; }
.asis-redactar .k-redactor .herr { gap: 20px; }
.asis-subiendo { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: var(--ink-2); }
.asis-conteo { font: 500 13px/1 var(--f-mono); color: var(--ink-3); }
.asis-conteo[data-alto] { color: var(--warn-text); }
.asis-pend { list-style: none; margin: 0; padding: 12px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
.asis-pend .asis-ficha { padding-right: 0; }
.asis-adjerr { padding-top: 12px; }

@media (max-width: 1180px) {
  .asis-carril { grid-column: 1 / 5; }
  .asis-conv { grid-column: 5 / 13; }
}
/* Por debajo de 1024 px la lista de conversaciones es una capa que se abre con
   «Conversaciones» (cerrada por defecto: se entra al agente, no a la lista). */
@media (max-width: 1023px) {
  .asis-cuerpo { display: flex; flex-direction: column; }
  .asis-conv { flex: 1 1 auto; }
  .asis-carril { display: none; }
  .asis-carril[data-movil] { display: flex; position: fixed; top: 0; bottom: 0; left: 0; z-index: 41;
    width: min(380px, calc(100vw - 32px)); padding: 0 16px; background: var(--surface-0);
    border-right: 2px solid var(--rule); box-shadow: var(--shadow-pop); }
  .asis-velo { display: block; position: fixed; inset: 0; z-index: 40; background: var(--scrim); }
  .asis-cerrar { display: inline-flex; margin-left: auto; align-self: flex-start; }
  .asis-solo-movil { display: inline-flex; }
  .asis-solo-escritorio { display: none; }
  .asis-hilos { margin: 4px -16px 0; padding: 0 16px 16px; }
  .asis-hilo:hover { box-shadow: -8px 0 0 var(--hl), 8px 0 0 var(--hl); }
  .asis-hilo[aria-current="true"] { box-shadow: -8px 0 0 var(--neg-area), 8px 0 0 var(--neg-area), -12px 0 0 var(--neg-area-edge); }
}
@media (max-width: 860px) {
  .asis-barra { flex-wrap: wrap; gap: 8px; min-height: 0; padding: 8px 0 10px; }
  .asis-barra h2 { order: 3; flex-basis: 100%; font-size: 16px; }
  .asis-barra .k-btn, .asis-barra .k-bt { min-height: 44px; }
  .asis-barra .k-mas > .k-bt { margin-left: auto; }
  .asis-bienv { padding-top: 24px; }
  .asis-bienv h3 { font-size: 32px; }
  .asis-sugs { grid-template-columns: minmax(0, 1fr); }
  .asis-hilo-conv { padding-top: 16px; }
  .asis-redactar { padding: 10px 0 12px; }
  .asis-redactar .k-redactor textarea { min-height: 52px; padding: 12px 12px 4px; font-size: 16px; }
  .asis-redactar .k-redactor .herr { gap: 16px; padding: 0 12px 4px; }
  .asis-redactar .k-redactor > .k-btn { margin: 0 8px 8px 0; }
  .asis-redactar .k-aviso-ia { margin-top: 6px; font-size: 12px; }
}
`;

export default function AgentPage() {
  const params = useParams();
  const router = useRouter();
  // Pregunta sugerida desde la lista de agentes (?pregunta=…): se deja escrita
  // en el redactor; el usuario decide si la envía tal cual o la ajusta.
  const busqueda = useSearchParams();
  const { data: session } = useSession();
  const agentId = params.agentId as string;

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(() => busqueda.get("pregunta") ?? "");
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
  // Id del chat recién creado por el envío en curso (ver el efecto de carga).
  const skipReloadForChatId = useRef<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  // Conversación que se va a eliminar (el modal pide confirmación antes de borrar).
  const [porEliminar, setPorEliminar] = useState<Chat | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = isValidAgentId(agentId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, []);

  // Si la pregunta llega escrita desde la lista de agentes, el cuadro se ajusta a ella.
  useEffect(() => { autoResize(); }, [autoResize, hasAccess]);

  // La capa de conversaciones (móvil) se cierra con Escape, como el índice.
  useEffect(() => {
    if (!listaMovil) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") setListaMovil(false); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [listaMovil]);

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

  // Alto exacto de la ventana: menos el dock móvil (--topbar-h, lo mide el
  // armazón) y el banner de demo (--demo-banner-h, lo mide el banner).
  const ALTO =
    "flex flex-col h-[calc(100dvh-var(--topbar-h,0px)-var(--demo-banner-h,0px))] lg:h-[calc(100dvh-var(--demo-banner-h,0px))]";

  if (!isValid) {
    return (
      <>
        <Header title="Asistente IA" />
        <Pagina>
          <Pieza>
            <ErrorCarga
              titulo="Agente no encontrado."
              texto="La dirección no corresponde a ninguno de los agentes de SOPH.IA."
              acciones={
                <Boton variante="secundario" flecha="vuelve" onClick={() => router.push("/dashboard/asistente")}>
                  Volver
                </Boton>
              }
            />
          </Pieza>
        </Pagina>
      </>
    );
  }

  const agent = AGENTS[agentId as AgentId];
  /** Identidad del agente en el kit: sigilo, oficio y género gramatical. */
  const idKit = agentId as AgenteId;
  const ficha = AGENTES[idKit];
  const includedByDefault = isIncludedAgent(agentId as AgentId);

  // Checking add-on access for a non-included agent — show a brief loader so we
  // don't flash the upgrade screen at a user who actually has the add-on.
  if (hasAccess === null && !includedByDefault) {
    return (
      <div className={ALTO}>
        <Header
          title={agent.name}
          breadcrumbs={[
            { label: "Asistente IA", href: "/dashboard/asistente" },
            { label: agent.name },
          ]}
        />
        <Pagina>
          <Pieza>
            <Esqueleto variante="bloque" etiquetaAccesible={`Comprobando el acceso a ${agent.name}…`} />
          </Pieza>
        </Pagina>
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <>
        <Header
          title={agent.name}
          breadcrumbs={[
            { label: "Asistente IA", href: "/dashboard/asistente" },
            { label: agent.name },
          ]}
        />
        <Pagina>
          <Pieza>
            <CabeceraPieza nn="04" titulo={`${agent.name} está en camino`} subtitulo={agent.description} />
            <div style={{ maxWidth: 640 }}>
              <FichaAgente agente={idKit} activo={false} nivel={2} />
              <p style={{ margin: "18px 0 20px", fontSize: 15, lineHeight: 1.45, color: "var(--ink-2)", maxWidth: "60ch" }}>
                Estamos afinando este agente. Mientras tanto, Themis y Chronos están disponibles para ayudarte.
              </p>
              <Boton variante="secundario" flecha="vuelve" onClick={() => router.push("/dashboard/asistente")}>
                Volver a agentes
              </Boton>
            </div>
          </Pieza>
        </Pagina>
      </>
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
        setUploadStatus(`Subiendo ${i + 1} de ${attachments.length}…`);
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
                      title: meta.title || "Nueva conversación",
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
            { id: data.chatId, title: data.title || "Nueva conversación", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), _count: { messages: 2 } },
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
        { id: `err-${Date.now()}`, role: "assistant", content: "Error de conexión. Intenta de nuevo.", createdAt: new Date().toISOString() },
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
    setListaMovil(false);
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

  const filteredChats = sidebarSearch.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : chats;

  const chatGroups = groupChatsByDate(filteredChats);

  const activeChat = chats.find((c) => c.id === activeChatId);

  /** Autor de los mensajes del usuario: su nombre de la sesión. */
  const nombreUsuario = session?.user?.name?.trim() || "Tú";
  const estadoAgente = ficha.femenino ? "activa" : "activo";

  /** Lista ↔ chat: columna fija en escritorio, capa en móvil (mismo criterio de siempre). */
  const alternarLista = () => {
    if (window.innerWidth < 1024) setListaMovil((v) => !v);
    else setShowSidebar((v) => !v);
  };

  // Acciones de la conversación abierta: exportar (si ya tiene mensajes) y
  // eliminar, que pide confirmación (SPEC §5.6: nada de papeleras sueltas).
  const accionesConversacion: ItemMenu[] = [];
  if (activeChatId && messages.length > 0) {
    accionesConversacion.push(
      { etiqueta: "Exportar TXT", alElegir: () => void exportChat("txt"), deshabilitado: exporting },
      { etiqueta: "Exportar PDF", alElegir: () => void exportChat("pdf"), deshabilitado: exporting },
    );
  }
  if (activeChat) {
    accionesConversacion.push({
      etiqueta: "Eliminar conversación…",
      nota: "pide confirmación",
      peligro: true,
      alElegir: () => setPorEliminar(activeChat),
    });
  }

  /**
   * Fichas de archivo de un mensaje. `generados` separa los dos casos: los que
   * subió el usuario (antes del texto) y los que produjo el agente (después de
   * la respuesta, y descargables).
   */
  const fichas = (msg: ChatMessage, generados: boolean) => {
    const lista = (msg.attachments || []).filter((a) => !!a.generado === generados);
    if (lista.length === 0) return null;
    return (
      <ul className="asis-fichas" aria-label={generados ? "Archivos generados" : "Archivos adjuntos"}>
        {lista.map((att, i) => {
          const tam = formatoTamano(att.size);
          const contenido = (
            <>
              <TipoArchivo>{tipoDeArchivo(att.name)}</TipoArchivo>
              <span className="n">{att.name}</span>
              {tam && <span className="p">{tam}</span>}
            </>
          );
          return (
            <li key={i}>
              {att.generado ? (
                <a href={att.url} download={att.name} title={`Descargar ${att.name}`} className="asis-ficha">
                  {contenido}
                  <span className="d">Descargar</span>
                </a>
              ) : (
                <span className="asis-ficha">{contenido}</span>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className={ALTO}>
      <style href="asistente-chat" precedence="default">
        {CSS_CHAT}
      </style>
      <Header
        title={agent.name}
        breadcrumbs={[
          { label: "Asistente IA", href: "/dashboard/asistente" },
          { label: agent.name },
        ]}
      />

      <div className="asis-cuerpo" data-carril={showSidebar ? "si" : "no"}>
        {/* ─────────────  CARRIL: agente + conversaciones + memoria  ───────────── */}
        {(showSidebar || listaMovil) && (
          <>
            {listaMovil && <div className="asis-velo" aria-hidden="true" onClick={() => setListaMovil(false)} />}

            <aside
              id="asis-carril"
              className="asis-carril"
              data-movil={listaMovil || undefined}
              aria-label={`Conversaciones con ${agent.name}`}
            >
              <div className="asis-agente">
                <Sigilo agente={idKit} ancho={48} />
                <div>
                  <span className="nom">{agent.name}</span>
                  <span className="of">
                    {ficha.oficio} · {estadoAgente}
                  </span>
                </div>
                <Boton
                  variante="secundario"
                  tam={40}
                  className="asis-cerrar"
                  onClick={() => setListaMovil(false)}
                  aria-label="Cerrar conversaciones"
                >
                  Cerrar
                </Boton>
              </div>

              <Boton variante="secundario" flecha="crea" ancho onClick={startNewChat}>
                Nueva conversación
              </Boton>

              <Buscador
                etiquetaAccesible="Buscar conversaciones"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
              />

              <div className="asis-hilos">
                {loadingChats ? (
                  <Esqueleto variante="tabla" filas={3} etiquetaAccesible="Cargando conversaciones…" />
                ) : filteredChats.length === 0 ? (
                  sidebarSearch ? (
                    <>
                      <p className="asis-hilos-vacio" role="status">
                        No encontramos «{sidebarSearch}» en tus conversaciones con {agent.name}.
                      </p>
                      <Boton variante="fantasma" tam={40} onClick={() => setSidebarSearch("")}>
                        Limpiar búsqueda
                      </Boton>
                    </>
                  ) : (
                    <p className="asis-hilos-vacio">
                      No tienes conversaciones con {agent.name}. Empieza una nueva.
                    </p>
                  )
                ) : (
                  chatGroups.map((group) => (
                    <div key={group.label}>
                      <p className="asis-hilos-t">{group.label}</p>
                      <ul>
                        {group.items.map((chat) => {
                          const isActive = activeChatId === chat.id;
                          const n = chat._count.messages;
                          return (
                            <li key={chat.id}>
                              <button
                                type="button"
                                className="asis-hilo"
                                aria-current={isActive ? "true" : undefined}
                                onClick={() => {
                                  setActiveChatId(chat.id);
                                  setListaMovil(false);
                                }}
                              >
                                {chat.title}
                                <small>
                                  {fechaHilo(chat.updatedAt)} · {n} {n === 1 ? "mensaje" : "mensajes"}
                                </small>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </div>

              <div className="asis-memoria">
                <button
                  type="button"
                  aria-expanded={showMemory}
                  aria-controls="asis-memoria-panel"
                  onClick={() => setShowMemory(!showMemory)}
                >
                  Memoria de {agent.name}
                  <Chevron dir="der" />
                </button>
                {showMemory && (
                  <div id="asis-memoria-panel">
                    <AreaTexto
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                      rows={4}
                      placeholder="Escribe notas que el agente recordará entre sesiones…"
                      maxLength={10000}
                      aria-label={`Memoria de ${agent.name}`}
                    />
                    <Boton
                      variante="secundario"
                      tam={40}
                      ancho
                      onClick={saveMemory}
                      cargando={savingMemory}
                      textoCargando="Guardando…"
                    >
                      Guardar memoria
                    </Boton>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}

        {/* ─────────────  CONVERSACIÓN  ───────────── */}
        <section className="asis-conv" aria-labelledby="asis-conv-t">
          <div className="asis-barra">
            {/* Mismo botón y mismo criterio que antes (ancho < 1024 → capa); uno por
                tamaño para que aria-expanded diga el estado que de verdad se ve. */}
            <button
              type="button"
              className="k-btn k-sec k-40 asis-solo-escritorio"
              aria-expanded={showSidebar}
              aria-controls="asis-carril"
              onClick={alternarLista}
            >
              Conversaciones
            </button>
            <button
              type="button"
              className="k-btn k-sec k-40 asis-solo-movil"
              aria-expanded={listaMovil}
              aria-controls="asis-carril"
              onClick={alternarLista}
            >
              Conversaciones
              <Chevron dir="abajo" />
            </button>
            <h2 id="asis-conv-t" title={activeChat ? activeChat.title : undefined}>
              {activeChat ? activeChat.title : `Nueva conversación con ${agent.name}`}
            </h2>
            {accionesConversacion.length > 0 && (
              <MenuMas
                etiqueta={exporting ? "Exportando…" : "Más"}
                etiquetaAccesible={exporting ? "Exportando la conversación…" : "Más acciones de la conversación"}
                items={accionesConversacion}
              />
            )}
          </div>

          {exportError && (
            <div className="asis-aviso">
              <Aviso enLinea tipo="error" titulo={exportError} alCerrar={() => setExportError("")} />
            </div>
          )}

          <div className="asis-mensajes">
            {!activeChatId && messages.length === 0 ? (
              /* Pantalla de inicio. Antes era solo el nombre del agente y una
                 descripción: el usuario se quedaba ante un cursor sin saber qué
                 pedir. Arranca con preguntas concretas de su oficio, que de paso
                 enseñan lo que el agente sabe hacer. */
              <div className="asis-bienv">
                <Sigilo agente={idKit} ancho={60} />
                <h3>Pregúntale a {agent.name}</h3>
                <p>{agent.description}</p>
                <p className="asis-rot">Prueba con</p>
                <div className="asis-sugs" role="group" aria-label="Preguntas sugeridas">
                  {(SUGERENCIAS[agentId as AgentId] || []).map((sug) => (
                    <button
                      key={sug.titulo}
                      type="button"
                      className="asis-sug"
                      onClick={() => enviarSugerencia(sug.prompt)}
                    >
                      <b>{sug.titulo}</b>
                      <span>{sug.prompt}</span>
                    </button>
                  ))}
                </div>
                <p className="asis-nota">
                  También puedes adjuntar documentos o grabar una nota de voz, y pedirle que te entregue el
                  resultado en Excel, Word o PDF.
                </p>
              </div>
            ) : loadingMessages ? (
              <div className="asis-hilo-conv">
                <Esqueleto variante="bloque" etiquetaAccesible="Cargando la conversación…" />
              </div>
            ) : (
              <div className="asis-hilo-conv">
                {messages.map((msg) => {
                  /* Agente complemento bloqueado: tarjeta de planes en vez de respuesta. */
                  if (msg.content === "__AGENT_LOCKED__") {
                    return (
                      <RespuestaAgente key={msg.id} agente={idKit} hora={fechaMensaje(msg.createdAt)}>
                        <div className="asis-bloq">
                          <h3>{agent.name} es un agente complemento</h3>
                          <p>
                            Actívalo por USD&nbsp;5 al mes y desbloquea{" "}
                            {agent.title?.toLowerCase() ?? "sus capacidades"}.
                          </p>
                          <div className="k-btns">
                            <Boton flecha="avanza" onClick={() => router.push("/dashboard/suscripcion")}>
                              Ver planes y complementos
                            </Boton>
                            <Boton
                              variante="secundario"
                              onClick={() =>
                                window.open(
                                  process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_URL || "https://wa.me/573001112233",
                                  "_blank"
                                )
                              }
                            >
                              Hablar con soporte
                            </Boton>
                          </div>
                        </div>
                      </RespuestaAgente>
                    );
                  }

                  /* El mensaje del usuario va en su recuadro a la derecha; los
                     archivos que SUBIÓ van antes del texto: acompañan a la pregunta. */
                  if (msg.role === "user") {
                    return (
                      <MensajeUsuario key={msg.id} autor={nombreUsuario} hora={fechaMensaje(msg.createdAt)}>
                        <>
                          {fichas(msg, false)}
                          {msg.content && <p className="asis-texto-u">{msg.content}</p>}
                        </>
                      </MensajeUsuario>
                    );
                  }

                  /* Errores del envío (red, límite del plan…): aviso en línea con
                     el texto que devuelve la API; si es un límite, «Ver planes». */
                  if (msg.id.startsWith("err-")) {
                    const limite = /l[ií]mite/i.test(msg.content);
                    return (
                      <Aviso
                        key={msg.id}
                        enLinea
                        tipo="error"
                        titulo={msg.content}
                        accion={limite ? { etiqueta: "Ver planes", href: "/dashboard/suscripcion" } : undefined}
                      />
                    );
                  }

                  /* La respuesta del agente NO va en burbuja: es una sección de
                     documento (patrón de ChatGPT, Claude y Gemini). Los archivos
                     que GENERÓ van después de la respuesta —«aquí tienes tu
                     archivo»—, que es donde el usuario los busca. */
                  return (
                    <RespuestaAgente
                      key={msg.id}
                      agente={idKit}
                      hora={fechaMensaje(msg.createdAt)}
                      acciones={
                        msg.content ? (
                          <Boton
                            variante="secundario"
                            tam={40}
                            title="Copiar respuesta"
                            onClick={() => copiarMensaje(msg.id, msg.content)}
                          >
                            {copiadoId === msg.id ? "Copiado" : "Copiar"}
                          </Boton>
                        ) : undefined
                      }
                    >
                      {msg.content ? <RespuestaMarkdown>{msg.content}</RespuestaMarkdown> : null}
                      {fichas(msg, true)}
                    </RespuestaAgente>
                  );
                })}

                {/* Escribiendo… */}
                {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
                  <div className="k-msg-a asis-escribe">
                    <div className="av" aria-hidden="true">
                      <Sigilo agente={idKit} ancho={22} />
                    </div>
                    <div className="cuerpo">
                      <Escribiendo agente={idKit} />
                      {/* Construir y subir un archivo tarda varios segundos: sin
                          decirlo, parece que se colgó. */}
                      {herramientaEnCurso && <p className="asis-herr">{herramientaEnCurso}</p>}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {attachError && (
            <div className="asis-adjerr">
              <p className="k-err" role="alert">
                {attachError}
              </p>
            </div>
          )}

          {/* Adjuntos por enviar */}
          {attachments.length > 0 && (
            <ul className="asis-pend" aria-label="Archivos por enviar">
              {attachments.map((att, i) => (
                <li key={i} className="asis-ficha">
                  {att.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no optimizable
                    <img src={att.preview} alt="" />
                  ) : (
                    <TipoArchivo>{tipoDeArchivo(att.file.name)}</TipoArchivo>
                  )}
                  <span className="n">{att.file.name}</span>
                  {formatoTamano(att.file.size) && <span className="p">{formatoTamano(att.file.size)}</span>}
                  <BotonIcono
                    etiquetaAccesible={`Quitar ${att.file.name}`}
                    tam={40}
                    sinBorde
                    onClick={() => removeAttachment(i)}
                  >
                    <Cruz />
                  </BotonIcono>
                </li>
              ))}
            </ul>
          )}

          {/* ── Redactor (receta del kit: .k-redactor) ── */}
          <div className="asis-redactar">
            {uploadStatus && (
              <p className="asis-subiendo" role="status">
                {uploadStatus}
              </p>
            )}
            <div className="k-redactor">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(); }}
                onKeyDown={handleKeyDown}
                placeholder={`Escríbele a ${agent.name}… o pídele un Excel, un Word o un PDF`}
                aria-label={`Mensaje para ${agent.name}`}
                rows={1}
                disabled={isLoading}
                maxLength={4000}
              />
              <div className="herr">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.m4a,.webm"
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} title="Adjuntar archivo">
                  <Flecha tipo="crea" />
                  Adjuntar
                </button>
                <AudioRecorder onRecorded={handleAudioRecorded} disabled={isLoading} />
                {/* El contador solo aparece cuando de verdad importa. Verlo en
                    «0/4000» desde el primer momento hacía parecer el cuadro un
                    formulario con límite en vez de una conversación. */}
                {input.length > 3400 && (
                  <span className="asis-conteo" data-alto={input.length > 3800 || undefined}>
                    {input.length}/4000
                  </span>
                )}
              </div>
              <Boton
                onClick={() => void sendMessage()}
                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                cargando={isLoading}
                textoCargando="Enviando…"
                flecha="avanza"
              >
                Enviar
              </Boton>
            </div>
            <p className="k-aviso-ia">{agent.name} puede equivocarse: verifica lo importante con la norma citada.</p>
          </div>
          {/* Copiar: el botón cambia a «Copiado»; esto lo anuncia a los lectores. */}
          <span className="k-sr" role="status">
            {copiadoId ? "Respuesta copiada." : ""}
          </span>
        </section>
      </div>

      <Modal
        abierto={porEliminar !== null}
        alCerrar={() => setPorEliminar(null)}
        titulo={`¿Eliminar la conversación «${porEliminar?.title ?? ""}»?`}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorEliminar(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              lleno
              onClick={() => {
                if (porEliminar) void deleteChat(porEliminar.id);
                setPorEliminar(null);
              }}
            >
              Eliminar conversación
            </Boton>
          </>
        }
      >
        <p>Se borran todos sus mensajes y no se puede deshacer.</p>
      </Modal>
    </div>
  );
}
