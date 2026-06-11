"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Loader2, CheckCircle2, KeyRound } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No pudimos procesar la solicitud. Intenta de nuevo.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0a0a0a" }}
    >
      <div
        className="hifi-orb-drift pointer-events-none fixed"
        style={{
          width: 420,
          height: 420,
          top: "10%",
          left: "15%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,92,255,0.14) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{
              width: 48,
              height: 48,
              background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
              boxShadow: "0 0 32px rgba(124,92,255,0.35)",
            }}
          >
            <KeyRound className="h-5 w-5 text-white" />
          </div>
          <p
            style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(246,245,247,0.42)",
            }}
          >
            Recuperar acceso
          </p>
          <h1
            className="mt-2 text-center"
            style={{
              fontFamily: "'Geist', system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 26,
              letterSpacing: "-0.025em",
              color: "#f6f5f7",
            }}
          >
            ¿Olvidaste tu contraseña?
          </h1>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: "#15151a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {sent ? (
            <div className="text-center space-y-4 py-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgba(76,214,160,0.12)" }}
              >
                <CheckCircle2 className="h-6 w-6" style={{ color: "#4cd6a0" }} />
              </div>
              <p style={{ fontSize: 14, color: "#f6f5f7", fontWeight: 500 }}>
                Revisa tu correo
              </p>
              <p style={{ fontSize: 13, color: "rgba(246,245,247,0.55)", lineHeight: 1.6 }}>
                Si existe una cuenta con <span style={{ color: "#9a7fff" }}>{email}</span>,
                enviamos un enlace para crear una nueva contraseña. El enlace expira en 30 minutos.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p style={{ fontSize: 13, color: "rgba(246,245,247,0.55)", lineHeight: 1.6 }}>
                Escribe el correo de tu cuenta y te enviaremos un enlace para restablecerla.
              </p>

              {error && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(255,111,111,0.10)",
                    border: "1px solid rgba(255,111,111,0.25)",
                  }}
                >
                  <p style={{ fontSize: 13, color: "#ff6f6f" }}>{error}</p>
                </div>
              )}

              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "rgba(246,245,247,0.3)" }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none"
                  style={{
                    background: "#1d1d24",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "#f6f5f7",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(124,92,255,0.50)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.12)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                  boxShadow: "0 4px 20px rgba(124,92,255,0.30)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar enlace"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-80"
            style={{ fontSize: 13, color: "rgba(246,245,247,0.42)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
