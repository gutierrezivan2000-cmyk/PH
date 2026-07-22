"use client";

import { useCallback, useEffect, useState } from "react";

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
  createdAt: string;
  messages: PqrsMessage[];
}

const TYPE_LABELS: Record<string, string> = {
  peticion: "Petición",
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
};

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  radicado: { label: "Radicado", bg: "#eff6ff", color: "#2563eb" },
  en_proceso: { label: "En proceso", bg: "#fffbeb", color: "#b45309" },
  resuelto: { label: "Resuelto", bg: "#f0fdf4", color: "#15803d" },
  cerrado: { label: "Cerrado", bg: "#f3f4f6", color: "#6b7280" },
};

function fecha(d: string) {
  return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function PortalPqrs({ token, accent }: { token: string; accent: string }) {
  const [list, setList] = useState<Pqrs[]>([]);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("peticion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/pqrs?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (Array.isArray(data.pqrs)) setList(data.pqrs);
    } catch {
      /* keep */
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setResult({ ok: false, text: "Completa el asunto y el mensaje." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/portal/pqrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, type, subject, message, residentName: name, residentContact: contact }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: data.error || "No se pudo enviar." });
        return;
      }
      setResult({ ok: true, text: `Solicitud radicada. Tu número de seguimiento es ${data.code}.` });
      setSubject("");
      setMessage("");
      setOpen(false);
      await load();
    } catch {
      setResult({ ok: false, text: "Error de red. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", display: "block", marginBottom: 4 };
  const input: React.CSSProperties = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", background: "#fff", color: "#1f2937" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", margin: 0 }}>
          Peticiones, quejas y reclamos
        </p>
        <button
          onClick={() => { setOpen((v) => !v); setResult(null); }}
          style={{ background: open ? "#f3f4f6" : accent, color: open ? "#374151" : "#fff", border: "none", borderRadius: 999, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {open ? "Cancelar" : "Nueva solicitud"}
        </button>
      </div>

      {result && (
        <div style={{ borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12, background: result.ok ? "#f0fdf4" : "#fef2f2", color: result.ok ? "#15803d" : "#b91c1c", border: `1px solid ${result.ok ? "#bbf7d0" : "#fecaca"}` }}>
          {result.text}
        </div>
      )}

      {open && (
        <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #ececef", borderRadius: 14, padding: 16, marginBottom: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label style={label}>Tipo</label>
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...input, cursor: "pointer" }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "2 1 200px" }}>
              <label style={label}>Asunto</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumen breve" style={input} maxLength={160} />
            </div>
          </div>
          <div>
            <label style={label}>Mensaje</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Cuéntanos con detalle…" style={{ ...input, resize: "vertical" }} maxLength={4000} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label style={label}>Tu nombre (opcional)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={input} maxLength={100} />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={label}>Correo o teléfono (opcional)</label>
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Para responderte" style={input} maxLength={120} />
            </div>
          </div>
          <button type="submit" disabled={busy} style={{ background: accent, color: "#fff", border: "none", borderRadius: 999, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1, alignSelf: "flex-start" }}>
            {busy ? "Enviando…" : "Radicar solicitud"}
          </button>
        </form>
      )}

      {list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((p) => {
            const st = STATUS[p.status] || STATUS.radicado;
            const isOpen = expanded === p.id;
            return (
              <div key={p.id} style={{ background: "#fff", border: "1px solid #ececef", borderRadius: 12, overflow: "hidden" }}>
                <button onClick={() => setExpanded(isOpen ? null : p.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#1f2937" }}>{p.subject}</p>
                    <p style={{ fontSize: 11.5, color: "#9ca3af", margin: "2px 0 0" }}>
                      {TYPE_LABELS[p.type] || p.type} · {p.code} · {fecha(p.createdAt)}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.messages.map((m) => (
                      <div key={m.id} style={{ background: m.fromAdmin ? "#eef2ff" : "#f9fafb", borderRadius: 10, padding: "10px 12px" }}>
                        <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: m.fromAdmin ? "#4f46e5" : "#6b7280", margin: "0 0 4px" }}>
                          {m.fromAdmin ? "Administración" : "Tú"} · {fecha(m.createdAt)}
                        </p>
                        <p style={{ fontSize: 13.5, color: "#374151", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
