"use client";

import { useState } from "react";

interface QA {
  q: string;
  a: string | null; // null while loading
}

const SUGGESTIONS = [
  "¿Puedo tener mascotas?",
  "¿Cuál es el horario del salón social?",
  "¿Qué dice sobre ruido y horarios?",
  "¿Cómo se reservan las zonas comunes?",
];

export function PortalAssistant({ token, accent }: { token: string; accent: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<QA[]>([]);
  const [error, setError] = useState("");

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setError("");
    setBusy(true);
    setQ("");
    setHistory((h) => [{ q: text, a: null }, ...h]);
    try {
      const res = await fetch("/api/portal/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, question: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo responder.");
        setHistory((h) => h.slice(1)); // drop the pending entry
        return;
      }
      setHistory((h) => h.map((item, i) => (i === 0 ? { ...item, a: data.answer } : item)));
    } catch {
      setError("Error de red. Intenta de nuevo.");
      setHistory((h) => h.slice(1));
    } finally {
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    flex: 1,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    background: "#fff",
    color: "#1f2937",
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #ececef", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "16px 18px", background: `${accent}0d`, borderBottom: "1px solid #ececef" }}>
        <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#1f2937", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: 7, background: accent, color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✦</span>
          Pregúntale al reglamento
        </p>
        <p style={{ fontSize: 12.5, color: "#6b7280", margin: "4px 0 0" }}>
          Resuelve dudas al instante con base en el reglamento de tu copropiedad.
        </p>
      </div>

      <div style={{ padding: 16 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); ask(q); }}
          style={{ display: "flex", gap: 8, marginBottom: history.length || error ? 12 : 0 }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej: ¿puedo tener dos perros?"
            style={input}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={busy || !q.trim()}
            style={{ background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy || !q.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
          >
            {busy ? "…" : "Preguntar"}
          </button>
        </form>

        {history.length === 0 && !error && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && <p style={{ fontSize: 13, color: "#b91c1c", margin: "4px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {history.map((item, i) => (
            <div key={i}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: "#1f2937", margin: "0 0 6px" }}>{item.q}</p>
              {item.a === null ? (
                <p style={{ fontSize: 13.5, color: "#9ca3af", margin: 0 }}>Consultando el reglamento…</p>
              ) : (
                <p style={{ fontSize: 13.5, color: "#374151", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6, background: "#f9fafb", borderRadius: 10, padding: "12px 14px" }}>{item.a}</p>
              )}
            </div>
          ))}
        </div>

        <p style={{ fontSize: 10.5, color: "#c4c4c8", margin: "14px 0 0" }}>
          Respuestas generadas por IA con base en los documentos de tu copropiedad. Ante cualquier duda, confirma con la administración.
        </p>
      </div>
    </div>
  );
}
