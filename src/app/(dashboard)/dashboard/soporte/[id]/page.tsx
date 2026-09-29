"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { abrirSoporte, useSoporteDisponible } from "@/components/dashboard/soporte";
import {
  Aviso,
  Boton,
  CabeceraPieza,
  ErrorCarga,
  Esqueleto,
  Estado,
  MensajeUsuario,
  Pagina,
  Panel,
  Pieza,
  Redactor,
  Resumen,
  TipoArchivo,
  pesoLegible,
  tipoDeArchivo,
  type TipoEstado,
} from "@/components/kit";

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

/*
 * Estado = forma + palabra (SPEC §f.8), el mismo mapa que la tabla de tickets de
 * Configuración 15.4. Significado real, de las rutas de la API: «open» espera al
 * equipo (ticket nuevo o el usuario respondió: api/tickets/[id]/messages lo
 * reabre), «pending» = el equipo respondió y espera al usuario
 * (api/admin/tickets/[id]/messages), «resolved» y «closed» ya no admiten respuestas.
 */
const STATUS_TIPO: Record<string, TipoEstado> = {
  open: "pendiente",
  pending: "falta",
  resolved: "ok",
  closed: "sin",
};

const STATUS_AYUDA: Record<string, string> = {
  open: "Lo recibimos y espera respuesta del equipo.",
  pending: "El equipo respondió: te toca contestar.",
  resolved: "Solucionado. Ya no admite respuestas.",
  closed: "Cerrado. Ya no admite respuestas.",
};

// Valores que admite POST /api/tickets (validCategories / validPriorities).
const NOMBRE_CATEGORIA: Record<string, string> = {
  general: "General",
  billing: "Facturación",
  technical: "Técnico",
  feature: "Función",
  bug: "Error",
};
const NOMBRE_PRIORIDAD: Record<string, string> = { low: "Baja", normal: "Normal", high: "Alta" };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NB = " ";

/** «25 sep 2026» (formato de Colombia, espacios duros). */
function fechaCorta(date: string) {
  const d = new Date(date);
  return `${d.getDate()}${NB}${MESES[d.getMonth()]}${NB}${d.getFullYear()}`;
}

/** «10:42 a. m.» — a mano: el espacio fino de toLocaleTimeString no está en la fuente. */
function hora(date: string) {
  const d = new Date(date);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m}${NB}${h < 12 ? "a." : "p."}${NB}m.`;
}

function formatDate(date: string) {
  return `${fechaCorta(date)} · ${hora(date)}`;
}

/** «Hoy», «Ayer», «Hace 3 días» (días naturales). */
function haceDias(date: string) {
  const d = new Date(date);
  const hoy = new Date();
  const a = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const dias = Math.round((a - b) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias}${NB}días`;
}

/* Estilos locales: el kit trae el mensaje del usuario, la respuesta de un
   agente de IA (sigilo en --ai) y el redactor; la respuesta de una PERSONA del
   equipo no existe en el kit (ver pendientes). Aquí: mismo esqueleto que la
   respuesta del agente (sección de documento con avatar cuadrado de 56 px),
   pero en tinta, sin sigilo ni violeta, con la «S» del equipo. */
const CSS_TICKET = `
.tk-hilo { display: flex; flex-direction: column; }
.tk-hilo > .k-msg-u:first-child { margin-top: 4px; }
.tk-equipo > .av { font: 900 24px/1 var(--f-sans); color: var(--ink); background: var(--surface-0); }
.tk-equipo .k-msg-meta .rol { color: var(--ink-3); }
.tk-texto { margin: 0; font-size: 17px; line-height: 1.5; max-width: 68ch; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
.k-msg-u > .tk-texto { line-height: 1.4; }
.tk-adjuntos { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.tk-adjuntos li { min-width: 0; max-width: 100%; }
/* El nombre del archivo se parte, no se trunca (SPEC §f.11): la ficha crece en alto. */
.tk-adjuntos a { max-width: 100%; padding-top: 8px; padding-bottom: 8px; white-space: normal; line-height: 1.3; text-align: left; }
.tk-adjuntos a .k-tipo, .tk-adjuntos a .p { flex: none; white-space: nowrap; }
.tk-adjuntos a .n { min-width: 0; overflow-wrap: anywhere; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.tk-adjuntos a .p { font-weight: 400; color: var(--ink-3); }
.tk-adjuntos a:hover { background: var(--hl); }
.tk-respuesta { margin-top: 8px; }
.tk-respuesta .herr kbd { font: 400 12px/1 var(--f-mono); padding: 3px 5px 2px; border: 1.5px solid var(--line-strong); color: var(--ink-2); }
.tk-respuesta .k-err { margin: 10px 0 0; }
.tk-nota { margin: 8px 0 0; font-size: 13px; color: var(--ink-3); }
.tk-sub { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.tk-sub .k-estado { font-size: 15px; }
.tk-aside .k-panel + .k-panel { margin-top: 40px; }
.tk-aside .tk-ayuda { margin: 12px 0 0; font-size: 14px; line-height: 1.4; color: var(--ink-3); }
.tk-aside .k-btns { margin-top: 12px; }
@media (min-width: 861px) {
  /* Pegado al pie mientras se lee el hilo: fondo opaco arriba (16 px) y abajo
     (padding), para que el texto que pasa por detrás no asome. */
  .tk-respuesta { position: sticky; bottom: 0; z-index: 1; padding-bottom: 16px; background: var(--surface-0); box-shadow: 0 -16px 0 var(--surface-0); }
}
/* El atajo Ctrl + Enter no existe en pantallas táctiles sin teclado. */
@media (pointer: coarse) { .tk-respuesta .herr .tk-atajo { display: none; } }
@media (max-width: 860px) {
  .tk-aside { margin-top: 40px; }
  .tk-respuesta .k-redactor > .k-btn { grid-column: 1 / -1; margin: 0 12px 12px; justify-content: space-between; }
}
`;

export default function SoporteTicketPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = params.id;
  const bottomRef = useRef<HTMLDivElement>(null);
  const soporteDisponible = useSoporteDisponible();

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
  const mensajes = (ticket?.messages || []).filter((m) => !m.internal);
  const autor = session?.user?.name || session?.user?.email || "Tú";
  const volver = (
    <Boton variante="secundario" flecha="vuelve" href="/dashboard/configuracion#cfg-soporte">
      Volver a tus tickets
    </Boton>
  );

  return (
    <div>
      <style href="tk-ticket-local" precedence="default">
        {CSS_TICKET}
      </style>
      <Header
        title="Soporte"
        breadcrumbs={[
          { label: "Configuración", href: "/dashboard/configuracion" },
          { label: "Ticket" },
        ]}
      />

      <Pagina>
        <Pieza>
          {loading ? (
            <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando el ticket…" />
          ) : error ? (
            <>
              {/* Sin «Volver a tus tickets» arriba: el error ya lleva su «Volver». */}
              <CabeceraPieza nn="15" titulo="Ticket de soporte" />
              <ErrorCarga
                titulo="No pudimos abrir este ticket."
                texto={error}
                acciones={
                  <Boton variante="secundario" onClick={() => router.push("/dashboard/configuracion")}>
                    Volver
                  </Boton>
                }
              />
            </>
          ) : ticket ? (
            <>
              {/* 15 = Configuración: los tickets viven en su sección 15.4 Soporte. */}
              <CabeceraPieza
                nn="15"
                titulo={ticket.subject}
                subtitulo={
                  <span className="tk-sub">
                    <Estado tipo={STATUS_TIPO[ticket.status] ?? "sin"}>
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </Estado>
                    <span>
                      {NOMBRE_CATEGORIA[ticket.category] ?? ticket.category} · Ticket{" "}
                      <span className="k-mono">#{ticket.id.slice(-8)}</span> · abierto el{" "}
                      {fechaCorta(ticket.createdAt)}
                    </span>
                  </span>
                }
                acciones={volver}
              />

              <div className="k-r12">
                <div style={{ gridColumn: "1 / 9", minWidth: 0 }}>
                  <Panel
                    nivel={2}
                    id="tk-conversacion"
                    titulo="Conversación"
                    nota={mensajes.length === 1 ? "1 mensaje" : `${mensajes.length} mensajes`}
                  >
                    <p className="k-apoyo" style={{ margin: "-4px 0 18px" }}>
                      Aquí te responde una persona del equipo de SOPH.IA, no un agente de IA.
                    </p>

                    <div className="tk-hilo">
                      {mensajes.length === 0 && (
                        <p className="k-apoyo" style={{ margin: "0 0 24px" }}>
                          Este ticket aún no tiene mensajes.
                        </p>
                      )}
                      {mensajes.map((msg) => {
                        const attachments = msg.attachments ?? [];
                        const adjuntos =
                          attachments.length > 0 ? (
                            <ul className="tk-adjuntos" aria-label="Archivos adjuntos">
                              {attachments.map((att, i) => (
                                <li key={i}>
                                  <a
                                    className="k-bt"
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <TipoArchivo>{tipoDeArchivo(att.name)}</TipoArchivo>
                                    <span className="n">{att.name}</span>
                                    {att.size > 0 && <span className="p">{pesoLegible(att.size)}</span>}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null;

                        return msg.fromAdmin ? (
                          <article
                            key={msg.id}
                            className="k-msg-a tk-equipo"
                            aria-label="Respuesta del equipo de soporte"
                          >
                            <div className="av" aria-hidden="true">
                              S
                            </div>
                            <div className="cuerpo">
                              <div className="k-msg-meta">
                                <b>Equipo SOPH.IA</b>
                                <span className="rol">Soporte</span>
                                <span>{formatDate(msg.createdAt)}</span>
                              </div>
                              <p className="tk-texto">{msg.content}</p>
                              {adjuntos}
                            </div>
                          </article>
                        ) : (
                          <MensajeUsuario key={msg.id} autor={autor} hora={formatDate(msg.createdAt)}>
                            <p className="tk-texto">{msg.content}</p>
                            {adjuntos}
                          </MensajeUsuario>
                        );
                      })}
                      <div ref={bottomRef} />
                    </div>

                    {isClosed ? (
                      <Aviso
                        enLinea
                        rol={null}
                        tipo={ticket.status === "resolved" ? "ok" : "info"}
                        titulo={`Este ticket está ${ticket.status === "resolved" ? "resuelto" : "cerrado"}.`}
                        texto="No puedes añadir más respuestas."
                      />
                    ) : (
                      <div
                        className="tk-respuesta"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                      >
                        <Redactor
                          etiqueta="Tu respuesta al equipo de soporte"
                          placeholder="Escribe tu respuesta…"
                          valor={reply}
                          alCambiar={setReply}
                          alEnviar={handleSend}
                          enviando={sending}
                          deshabilitado={sending}
                          enviarConEnter={false}
                          filas={3}
                          herramientas={
                            <span className="tk-atajo">
                              <kbd>Ctrl</kbd> + <kbd>Enter</kbd> para enviar
                            </span>
                          }
                        />
                        {replyError && (
                          <p className="k-err" role="alert">
                            {replyError}
                          </p>
                        )}
                        <p className="tk-nota">
                          Al responder, el ticket vuelve a quedar Abierto para que el equipo lo vea.
                        </p>
                      </div>
                    )}
                  </Panel>
                </div>

                <aside className="tk-aside" style={{ gridColumn: "9 / 13", minWidth: 0 }}>
                  <Panel nivel={2} id="tk-datos" titulo="Datos del ticket">
                    <Resumen
                      etiquetaAccesible="Datos del ticket"
                      filas={[
                        {
                          etiqueta: "Estado",
                          valor: (
                            <Estado tipo={STATUS_TIPO[ticket.status] ?? "sin"}>
                              {STATUS_LABELS[ticket.status] ?? ticket.status}
                            </Estado>
                          ),
                        },
                        { etiqueta: "Categoría", valor: NOMBRE_CATEGORIA[ticket.category] ?? ticket.category },
                        { etiqueta: "Prioridad", valor: NOMBRE_PRIORIDAD[ticket.priority] ?? ticket.priority },
                        {
                          etiqueta: "Número",
                          valor: <span className="k-mono">#{ticket.id.slice(-8)}</span>,
                        },
                        {
                          etiqueta: "Creado",
                          valor: (
                            <>
                              {haceDias(ticket.createdAt)}
                              <span className="k-meta" style={{ display: "block", fontWeight: 400 }}>
                                {formatDate(ticket.createdAt)}
                              </span>
                            </>
                          ),
                        },
                        {
                          etiqueta: "Última actividad",
                          valor: (
                            <>
                              {haceDias(ticket.updatedAt)}
                              <span className="k-meta" style={{ display: "block", fontWeight: 400 }}>
                                {formatDate(ticket.updatedAt)}
                              </span>
                            </>
                          ),
                        },
                      ]}
                    />
                    {STATUS_AYUDA[ticket.status] && <p className="tk-ayuda">{STATUS_AYUDA[ticket.status]}</p>}
                  </Panel>

                  {soporteDisponible && (
                    <Panel nivel={2} id="tk-canales" titulo="¿Necesitas ayuda ya?">
                      <p className="k-apoyo" style={{ margin: 0 }}>
                        Para una duda rápida sobre el uso de la plataforma, usa el chat de soporte.
                      </p>
                      <div className="k-btns">
                        <Boton variante="secundario" tam={40} onClick={abrirSoporte} aria-controls="soporte-sophia">
                          Chat de soporte
                        </Boton>
                      </div>
                    </Panel>
                  )}
                </aside>
              </div>
            </>
          ) : null}
        </Pieza>
      </Pagina>
    </div>
  );
}
