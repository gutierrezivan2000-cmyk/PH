"use client";

import { useState } from "react";

// Public self-service page: a resident who lost their portal link gets it back
// by email. No account, no password — the link IS the credential.
export default function RecuperarPortalPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo procesar la solicitud." });
        return;
      }
      setMsg({ ok: true, text: data.message });
      setEmail("");
    } catch {
      setMsg({ ok: false, text: "Error de red. Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f4f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%" }}>
        <div style={{ background: "#fff", borderRadius: 18, padding: "36px 32px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: 21, fontWeight: 800, color: "#1f2937", margin: "0 0 8px" }}>
            Recupera el enlace de tu portal
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 22px" }}>
            Escribe el correo que registraste en tu copropiedad y te reenviamos el enlace privado de
            tu unidad, donde ves tu estado de cuenta, los comunicados y los documentos.
            <strong> No necesitas usuario ni contraseña.</strong>
          </p>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
              required
              maxLength={120}
              style={{
                width: "100%",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "13px 15px",
                fontSize: 15,
                outline: "none",
                fontFamily: "inherit",
                color: "#1f2937",
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                background: "#7c3aed",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "13px 20px",
                fontSize: 15,
                fontWeight: 700,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Enviando…" : "Enviarme mi enlace"}
            </button>
          </form>

          {msg && (
            <div
              style={{
                marginTop: 16,
                borderRadius: 12,
                padding: "12px 15px",
                fontSize: 13.5,
                lineHeight: 1.55,
                background: msg.ok ? "#f0fdf4" : "#fef2f2",
                color: msg.ok ? "#15803d" : "#b91c1c",
                border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`,
              }}
            >
              {msg.text}
            </div>
          )}

          <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, margin: "20px 0 0" }}>
            ¿No recibes el correo? Puede que la administración no lo tenga registrado. Comunícate
            directamente con la administración de tu copropiedad para que te compartan el enlace.
          </p>
        </div>

        <p style={{ fontSize: 11, color: "#c4c4c8", textAlign: "center", margin: "16px 0 0", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Con tecnología SOPH.IA
        </p>
      </div>
    </div>
  );
}
