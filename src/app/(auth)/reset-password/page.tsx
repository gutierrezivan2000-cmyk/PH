"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--surface-0)" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--accent-text)" }} />
        </div>
      }
    >
      <ResetContent />
    </Suspense>
  );
}

function ResetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const invalidLink = !token || !email;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No pudimos restablecer la contraseña.");
      } else {
        setDone(true);
        setTimeout(() => router.push("/login"), 2500);
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-3)",
    border: "1px solid rgb(var(--veil-rgb) / 0.07)",
    color: "var(--ink)",
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{
              width: 48,
              height: 48,
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-lo) 100%)",
              boxShadow: "0 0 32px rgb(var(--accent-rgb) / 0.35)",
            }}
          >
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <p
            style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Nueva contraseña
          </p>
          <h1
            className="mt-2 text-center"
            style={{
              fontFamily: "'Geist', system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 26,
              letterSpacing: "-0.025em",
              color: "var(--ink)",
            }}
          >
            Crea tu nueva contraseña
          </h1>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: "var(--surface-2)", border: "1px solid rgb(var(--veil-rgb) / 0.07)" }}
        >
          {invalidLink ? (
            <div className="text-center space-y-4 py-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgb(var(--danger-rgb) / 0.12)" }}
              >
                <AlertCircle className="h-6 w-6" style={{ color: "var(--danger-text)" }} />
              </div>
              <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>Enlace inválido</p>
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                El enlace está incompleto o expiró.{" "}
                <Link href="/forgot-password" style={{ color: "var(--accent-text)" }}>
                  Solicita uno nuevo
                </Link>
                .
              </p>
            </div>
          ) : done ? (
            <div className="text-center space-y-4 py-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgb(var(--ok-rgb) / 0.12)" }}
              >
                <CheckCircle2 className="h-6 w-6" style={{ color: "var(--ok-text)" }} />
              </div>
              <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>
                Contraseña actualizada
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Redirigiendo al inicio de sesión…
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: "rgb(var(--danger-rgb) / 0.1)",
                    border: "1px solid rgb(var(--danger-rgb) / 0.25)",
                  }}
                >
                  <p style={{ fontSize: 13, color: "var(--danger-text)" }}>{error}</p>
                </div>
              )}

              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "var(--ink-4)" }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nueva contraseña (mín. 6 caracteres)"
                  required
                  minLength={6}
                  autoFocus
                  className="w-full pl-10 pr-11 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--ink-4)" }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "var(--ink-4)" }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirma la contraseña"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-lo) 100%)",
                  boxShadow: "0 4px 20px rgb(var(--accent-rgb) / 0.3)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
