"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import {
  Send,
  Loader2,
  Users,
  Plus,
  Trash2,
  ChevronDown,
  Sparkles,
  Mail,
  CheckCircle2,
  Building2,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  label: string;
  residentName: string | null;
  email: string | null;
}

interface Announcement {
  id: string;
  subject: string;
  content: string;
  recipientCount: number;
  sentAt: string | null;
  createdAt: string;
  property?: { name: string };
}

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

const card: React.CSSProperties = {
  background: "#15151a",
  border: "1px solid rgba(255,255,255,0.07)",
};

const inputStyle: React.CSSProperties = {
  background: "#0f0f13",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f6f5f7",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
};

export default function ComunicadosPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState<string>("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number }>({ used: 0, limit: 500 });
  const [loading, setLoading] = useState(true);

  // Recipients editor
  const [showRecipients, setShowRecipients] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  // Compose
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const emailCount = units.filter((u) => u.email).length;

  const loadUnits = useCallback(async (pid: string) => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/properties/${pid}/units`);
      const data = await res.json();
      setUnits(Array.isArray(data) ? data : []);
    } catch {
      setUnits([]);
    }
  }, []);

  const loadAnnouncements = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/announcements${pid ? `?propertyId=${pid}` : ""}`);
      const data = await res.json();
      if (res.ok) {
        setAnnouncements(data.announcements || []);
        if (data.quota) setQuota(data.quota);
      }
    } catch {
      // keep
    }
  }, []);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setProperties(data.map((p: Property) => ({ id: p.id, name: p.name })));
          setPropertyId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (propertyId) {
      loadUnits(propertyId);
      loadAnnouncements(propertyId);
      setConfirming(false);
      setSendMsg(null);
    }
  }, [propertyId, loadUnits, loadAnnouncements]);

  async function addRecipients() {
    if (!bulkText.trim() || !propertyId) return;
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const res = await fetch(`/api/properties/${propertyId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: bulkText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkMsg(data.error || "No se pudo importar.");
      } else {
        setBulkMsg(
          `${data.created} agregadas${data.skipped ? ` · ${data.skipped} omitidas (duplicadas)` : ""}`
        );
        setBulkText("");
        await loadUnits(propertyId);
      }
    } catch {
      setBulkMsg("Error de red.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function removeUnit(id: string) {
    await fetch(`/api/properties/${propertyId}/units?id=${id}`, { method: "DELETE" });
    await loadUnits(propertyId);
  }

  async function draftWithAI() {
    if (!brief.trim()) return;
    setDrafting(true);
    setSendMsg(null);
    try {
      const propertyName = properties.find((p) => p.id === propertyId)?.name;
      const res = await fetch("/api/announcements/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyName, brief }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendMsg({ ok: false, text: data.error || "No se pudo generar el borrador." });
      } else {
        setSubject(data.subject || "");
        setContent(data.content || "");
      }
    } catch {
      setSendMsg({ ok: false, text: "Error de red al generar el borrador." });
    } finally {
      setDrafting(false);
    }
  }

  async function sendAnnouncement() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, subject, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendMsg({ ok: false, text: data.error || "No se pudo enviar." });
      } else {
        setSendMsg({
          ok: true,
          text: `Comunicado enviado a ${data.sent} ${data.sent === 1 ? "destinatario" : "destinatarios"}.`,
        });
        setSubject("");
        setContent("");
        setBrief("");
        await loadAnnouncements(propertyId);
      }
    } catch {
      setSendMsg({ ok: false, text: "Error de red al enviar." });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  const quotaPct = quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0;

  return (
    <div>
      <Header
        title="Comunicados"
        subtitle="Circulares oficiales para tus copropiedades, redactadas con IA"
      />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {!loading && properties.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={card}>
            <Mail className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
            <p className="text-[14px]" style={{ color: "rgba(246,245,247,0.70)" }}>
              Crea una propiedad primero para enviar comunicados.
            </p>
          </div>
        )}

        {!loading && properties.length > 0 && (
          <>
            {/* Property selector + quota */}
            <div className="rounded-2xl p-4 space-y-3" style={card}>
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}>Propiedad</span>
                {properties.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPropertyId(p.id)}
                    className="px-3 py-1.5 rounded-full text-[12px] transition-all cursor-pointer"
                    style={{
                      border: `1px solid ${propertyId === p.id ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                      background: propertyId === p.id ? "rgba(124,92,255,0.15)" : "transparent",
                      color: propertyId === p.id ? "#a78bff" : "rgba(246,245,247,0.55)",
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${quotaPct}%`,
                      background: quotaPct > 90 ? "#ff6f6f" : quotaPct > 70 ? "#ffb958" : "#7c5cff",
                    }}
                  />
                </div>
                <span style={{ ...monoMini, color: "rgba(246,245,247,0.45)" }}>
                  {quota.used.toLocaleString("es-CO")} / {quota.limit.toLocaleString("es-CO")} emails este mes
                </span>
              </div>
            </div>

            {/* Recipients */}
            <div className="rounded-2xl" style={card}>
              <button
                onClick={() => setShowRecipients((v) => !v)}
                className="w-full flex items-center gap-3 p-4 cursor-pointer"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(76,214,160,0.10)" }}
                >
                  <Users className="h-4 w-4" style={{ color: "#4cd6a0" }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>
                    Destinatarios
                  </p>
                  <p className="text-[11.5px]" style={{ color: "rgba(246,245,247,0.45)" }}>
                    {units.length === 0
                      ? "Sin unidades registradas — agrégalas para poder enviar"
                      : `${units.length} unidades · ${emailCount} con correo`}
                  </p>
                </div>
                <ChevronDown
                  className="h-4 w-4 transition-transform"
                  style={{
                    color: "rgba(246,245,247,0.35)",
                    transform: showRecipients ? "rotate(180deg)" : "none",
                  }}
                />
              </button>

              {showRecipients && (
                <div className="px-4 pb-4 space-y-3">
                  {units.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {units.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-[11px]"
                          style={{
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            color: "rgba(246,245,247,0.70)",
                          }}
                        >
                          {u.label}
                          {u.email && (
                            <span style={{ color: "rgba(246,245,247,0.38)" }}>· {u.email}</span>
                          )}
                          <button
                            onClick={() => removeUnit(u.id)}
                            className="p-0.5 rounded-full cursor-pointer hover:bg-white/[0.08]"
                            style={{ color: "rgba(246,245,247,0.35)" }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Agregar unidades (una por línea)
                    </label>
                    <textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      rows={4}
                      placeholder={"Apto 101, María Pérez, maria@correo.com\nApto 102, juan@correo.com\ncarlos@correo.com"}
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={addRecipients}
                      disabled={bulkBusy || !bulkText.trim()}
                      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 transition-all disabled:opacity-40 cursor-pointer"
                      style={{ background: "rgba(76,214,160,0.14)", color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.30)" }}
                    >
                      {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Agregar
                    </button>
                    {bulkMsg && (
                      <span className="text-[12px]" style={{ color: "rgba(246,245,247,0.55)" }}>
                        {bulkMsg}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Compose */}
            <div className="rounded-2xl p-5 space-y-4" style={card}>
              <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>
                Nuevo comunicado
              </p>

              {/* AI drafting row */}
              <div
                className="rounded-xl p-3.5 space-y-2.5"
                style={{ background: "rgba(124,92,255,0.06)", border: "1px solid rgba(124,92,255,0.22)" }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: "#a78bff" }} />
                  <span style={{ ...monoLabel, color: "#a78bff" }}>Redactar con IA</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="Ej: corte de agua el martes 25 de 8am a 2pm por mantenimiento del tanque"
                    style={{ ...inputStyle, flex: 1 }}
                    maxLength={1500}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !drafting) draftWithAI();
                    }}
                  />
                  <button
                    onClick={draftWithAI}
                    disabled={drafting || !brief.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full text-[12.5px] font-medium px-4 py-2.5 transition-all disabled:opacity-40 cursor-pointer flex-shrink-0"
                    style={{ background: "#7c5cff", color: "#fff" }}
                  >
                    {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {drafting ? "Redactando…" : "Redactar"}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                  Asunto
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Asunto del comunicado"
                  style={inputStyle}
                  maxLength={150}
                />
              </div>

              <div>
                <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                  Contenido
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={9}
                  placeholder="Escribe el comunicado o usa el redactor IA de arriba…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                  maxLength={10000}
                />
              </div>

              {sendMsg && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12.5px]"
                  style={
                    sendMsg.ok
                      ? { background: "rgba(76,214,160,0.10)", border: "1px solid rgba(76,214,160,0.30)", color: "#4cd6a0" }
                      : { background: "rgba(255,111,111,0.10)", border: "1px solid rgba(255,111,111,0.30)", color: "#ff8585" }
                  }
                >
                  {sendMsg.ok && <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-px" />}
                  <span>{sendMsg.text}</span>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={sendAnnouncement}
                  disabled={sending || !subject.trim() || !content.trim() || emailCount === 0}
                  className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-40 cursor-pointer"
                  style={{
                    background: confirming ? "#e5484d" : "#7c5cff",
                    boxShadow: confirming ? "none" : "0 8px 24px -8px rgba(124,92,255,0.50)",
                  }}
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sending
                    ? "Enviando…"
                    : confirming
                      ? `Confirmar envío a ${emailCount} ${emailCount === 1 ? "correo" : "correos"}`
                      : `Enviar a ${emailCount} ${emailCount === 1 ? "destinatario" : "destinatarios"}`}
                </button>
                {confirming && !sending && (
                  <button
                    onClick={() => setConfirming(false)}
                    className="text-[12px] cursor-pointer"
                    style={{ color: "rgba(246,245,247,0.45)" }}
                  >
                    Cancelar
                  </button>
                )}
                {emailCount === 0 && (
                  <span className="text-[12px]" style={{ color: "rgba(246,245,247,0.40)" }}>
                    Agrega destinatarios con correo para habilitar el envío.
                  </span>
                )}
              </div>
            </div>

            {/* History */}
            {announcements.length > 0 && (
              <div>
                <p style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="mb-2.5">
                  Enviados
                </p>
                <div className="space-y-2.5">
                  {announcements.map((a) => (
                    <div key={a.id} className="rounded-xl p-4" style={card}>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-[13.5px] font-medium flex-1 min-w-0" style={{ color: "#f6f5f7" }}>
                          {a.subject}
                        </p>
                        <span
                          className="inline-flex items-center gap-1 text-[10.5px] flex-shrink-0"
                          style={{ ...monoMini, color: "rgba(246,245,247,0.40)" }}
                        >
                          <Users className="h-3 w-3" />
                          {a.recipientCount}
                        </span>
                      </div>
                      <p
                        className="text-[12px] leading-relaxed mb-1.5"
                        style={{
                          color: "rgba(246,245,247,0.50)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {a.content}
                      </p>
                      <div className="flex items-center gap-2">
                        {a.property?.name && (
                          <span className="inline-flex items-center gap-1" style={{ ...monoMini, color: "rgba(246,245,247,0.35)" }}>
                            <Building2 className="h-3 w-3" />
                            {a.property.name}
                          </span>
                        )}
                        <span style={{ ...monoMini, color: "rgba(246,245,247,0.35)" }}>
                          {new Date(a.sentAt || a.createdAt).toLocaleDateString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
