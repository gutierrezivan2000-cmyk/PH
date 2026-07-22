"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import {
  MessageSquare,
  Loader2,
  Send,
  CheckCircle2,
  ChevronDown,
  Building2,
  Home,
  User,
  ArrowUpRight,
} from "lucide-react";

interface PqrsMessage {
  id: string;
  fromAdmin: boolean;
  content: string;
  createdAt: string;
}
interface Pqrs {
  id: string;
  code: string;
  type: string;
  subject: string;
  status: string;
  unitLabel: string | null;
  residentName: string | null;
  residentContact: string | null;
  createdAt: string;
  messages: PqrsMessage[];
  property?: { name: string };
}

const TYPE_LABELS: Record<string, string> = {
  peticion: "Petición",
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  radicado: { label: "Radicado", color: "#5fb4ff", bg: "rgba(95,180,255,0.10)", border: "rgba(95,180,255,0.30)" },
  en_proceso: { label: "En proceso", color: "#ffb958", bg: "rgba(255,185,88,0.10)", border: "rgba(255,185,88,0.30)" },
  resuelto: { label: "Resuelto", color: "#4cd6a0", bg: "rgba(76,214,160,0.10)", border: "rgba(76,214,160,0.30)" },
  cerrado: { label: "Cerrado", color: "rgba(246,245,247,0.50)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" },
};

const monoLabel: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};
const monoMini: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "11px",
  letterSpacing: "0.06em",
};
const card: React.CSSProperties = { background: "#15151a", border: "1px solid rgba(255,255,255,0.07)" };

function fecha(d: string) {
  return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FILTERS = [
  { key: "", label: "Todas" },
  { key: "radicado", label: "Radicado" },
  { key: "en_proceso", label: "En proceso" },
  { key: "resuelto", label: "Resuelto" },
  { key: "cerrado", label: "Cerrado" },
];

export default function PqrsInboxPage() {
  const [list, setList] = useState<Pqrs[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pqrs${status ? `?status=${status}` : ""}`);
      const data = await res.json();
      if (res.status === 403 && data.code === "plan_upgrade") {
        setUpgrade(true);
        return;
      }
      if (res.ok) {
        setUpgrade(false);
        setList(data.pqrs || []);
        setCounts(data.counts || {});
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  async function act(id: string, opts: { reply?: string; status?: string; notify?: boolean }) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pqrs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo actualizar." });
        return;
      }
      setMsg({ ok: true, text: data.notified ? "Respuesta enviada y notificada por correo." : "Actualizado." });
      setReply("");
      await load(filter);
    } finally {
      setBusy(false);
    }
  }

  const pending = (counts.radicado || 0) + (counts.en_proceso || 0);

  return (
    <div>
      <Header title="PQRS" subtitle="Peticiones, quejas y reclamos de los residentes" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-5">
        {loading && list.length === 0 && !upgrade && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {upgrade && (
          <div className="rounded-2xl p-8 text-center" style={{ ...card, borderColor: "rgba(124,92,255,0.30)" }}>
            <MessageSquare className="h-9 w-9 mx-auto mb-3" style={{ color: "#a78bff" }} />
            <p className="text-[16px] font-semibold mb-2" style={{ color: "#f6f5f7" }}>
              Las PQRS de residentes son parte de los planes Business y Élite
            </p>
            <p className="text-[13px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: "rgba(246,245,247,0.55)" }}>
              Los residentes radican peticiones, quejas y reclamos desde su portal (sin cuenta) y tú
              respondes desde aquí.
            </p>
            <Link href="/dashboard/suscripcion" className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-6 py-3" style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}>
              Ver planes <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {!upgrade && (
          <>
            {/* Filters */}
            <div className="rounded-2xl p-4 flex flex-wrap items-center gap-2" style={card}>
              <div className="flex flex-wrap gap-2 flex-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className="px-3 py-1.5 rounded-full text-[12px] transition-all cursor-pointer"
                    style={{
                      border: `1px solid ${filter === f.key ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                      background: filter === f.key ? "rgba(124,92,255,0.15)" : "transparent",
                      color: filter === f.key ? "#a78bff" : "rgba(246,245,247,0.55)",
                    }}
                  >
                    {f.label}
                    {f.key && counts[f.key] ? ` (${counts[f.key]})` : ""}
                  </button>
                ))}
              </div>
              {pending > 0 && (
                <span style={{ ...monoMini, color: "#ffb958" }}>{pending} pendientes</span>
              )}
            </div>

            {msg && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12.5px]" style={msg.ok ? { background: "rgba(76,214,160,0.10)", border: "1px solid rgba(76,214,160,0.30)", color: "#4cd6a0" } : { background: "rgba(255,111,111,0.10)", border: "1px solid rgba(255,111,111,0.30)", color: "#ff8585" }}>
                {msg.ok && <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-px" />}
                <span>{msg.text}</span>
              </div>
            )}

            {!loading && list.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={card}>
                <MessageSquare className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
                <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                  {filter ? "Sin solicitudes en este estado" : "Aún no hay solicitudes de residentes"}
                </p>
                <p className="text-[12.5px]" style={{ color: "rgba(246,245,247,0.40)" }}>
                  Aparecerán aquí cuando un residente radique una PQRS desde su portal.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {list.map((p) => {
                  const st = STATUS_META[p.status] || STATUS_META.radicado;
                  const isOpen = expanded === p.id;
                  return (
                    <div key={p.id} className="rounded-2xl overflow-hidden" style={card}>
                      <button onClick={() => { setExpanded(isOpen ? null : p.id); setReply(""); setMsg(null); }} className="w-full flex items-center gap-3 p-4 cursor-pointer text-left">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[9.5px]" style={{ ...monoLabel, fontSize: 9, background: "rgba(255,255,255,0.05)", color: "rgba(246,245,247,0.55)", border: "1px solid rgba(255,255,255,0.10)" }}>
                              {TYPE_LABELS[p.type] || p.type}
                            </span>
                            <p className="text-[13.5px] font-medium truncate" style={{ color: "#f6f5f7" }}>{p.subject}</p>
                          </div>
                          <p style={{ ...monoMini, color: "rgba(246,245,247,0.38)" }} className="mt-1 flex flex-wrap items-center gap-x-2">
                            <span>{p.code}</span>
                            {p.property?.name && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{p.property.name}</span>}
                            {p.unitLabel && <span className="inline-flex items-center gap-1"><Home className="h-3 w-3" />{p.unitLabel}</span>}
                            <span>{fecha(p.createdAt)}</span>
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-medium flex-shrink-0" style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                        <ChevronDown className="h-4 w-4 transition-transform flex-shrink-0" style={{ color: "rgba(246,245,247,0.35)", transform: isOpen ? "rotate(180deg)" : "none" }} />
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 space-y-3">
                          {(p.residentName || p.residentContact) && (
                            <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: "rgba(246,245,247,0.45)" }}>
                              <User className="h-3 w-3" />
                              {[p.residentName, p.residentContact].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          <div className="space-y-2">
                            {p.messages.map((m) => (
                              <div key={m.id} className="rounded-xl p-3" style={{ background: m.fromAdmin ? "rgba(124,92,255,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${m.fromAdmin ? "rgba(124,92,255,0.20)" : "rgba(255,255,255,0.07)"}` }}>
                                <p style={{ ...monoLabel, fontSize: 9, color: m.fromAdmin ? "#a78bff" : "rgba(246,245,247,0.45)" }} className="mb-1">
                                  {m.fromAdmin ? "Administración" : (p.residentName || "Residente")} · {fecha(m.createdAt)}
                                </p>
                                <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: "rgba(246,245,247,0.85)" }}>{m.content}</p>
                              </div>
                            ))}
                          </div>

                          {p.status !== "cerrado" && (
                            <div className="space-y-2">
                              <textarea
                                value={expanded === p.id ? reply : ""}
                                onChange={(e) => setReply(e.target.value)}
                                rows={3}
                                placeholder="Escribe tu respuesta…"
                                className="w-full rounded-lg text-[13px] px-3 py-2.5"
                                style={{ background: "#0f0f13", border: "1px solid rgba(255,255,255,0.10)", color: "#f6f5f7", outline: "none", resize: "vertical", fontFamily: "inherit" }}
                                maxLength={4000}
                              />
                              <div className="flex flex-wrap items-center gap-3">
                                <button
                                  onClick={() => act(p.id, { reply, notify })}
                                  disabled={busy || !reply.trim()}
                                  className="inline-flex items-center gap-2 rounded-full text-white text-[12.5px] font-medium px-4 py-2 transition-all disabled:opacity-40 cursor-pointer"
                                  style={{ background: "#7c5cff" }}
                                >
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                  Responder
                                </button>
                                {p.residentContact && /[^@\s]+@[^@\s]+\.[^@\s]+/.test(p.residentContact) && (
                                  <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: "rgba(246,245,247,0.55)" }}>
                                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                                    Notificar por correo
                                  </label>
                                )}
                                <span className="flex-1" />
                                {["en_proceso", "resuelto", "cerrado"].filter((s) => s !== p.status).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => act(p.id, { status: s })}
                                    disabled={busy}
                                    className="text-[11.5px] px-3 py-1.5 rounded-full cursor-pointer transition-colors hover:bg-white/[0.06]"
                                    style={{ color: STATUS_META[s].color, border: `1px solid ${STATUS_META[s].border}` }}
                                  >
                                    {STATUS_META[s].label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {p.status === "cerrado" && (
                            <button onClick={() => act(p.id, { status: "en_proceso" })} disabled={busy} className="text-[11.5px] px-3 py-1.5 rounded-full cursor-pointer" style={{ color: "#ffb958", border: "1px solid rgba(255,185,88,0.30)" }}>
                              Reabrir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
