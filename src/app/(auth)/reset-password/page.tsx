"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#7c5cff" }} />
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
    background: "#1d1d24",
    border: "1px solid rgba(255,255,255,0.07)",
    color: "#f6f5f7",
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0a0a0a" }}
    >
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
            <ShieldCheck className="h-5 w-5 text-white" />
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
            Nueva contraseña
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
            Crea tu nueva contraseña
          </h1>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: "#15151a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {invalidLink ? (
            <div className="text-center space-y-4 py-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgba(255,111,111,0.12)" }}
              >
                <AlertCircle className="h-6 w-6" style={{ color: "#ff6f6f" }} />
              </div>
              <p style={{ fontSize: 14, color: "#f6f5f7", fontWeight: 500 }}>Enlace inválido</p>
              <p style={{ fontSize: 13, color: "rgba(246,245,247,0.55)" }}>
                El enlace está incompleto o expiró.{" "}
                <Link href="/forgot-password" style={{ color: "#9a7fff" }}>
                  Solicita uno nuevo
                </Link>
                .
              </p>
            </div>
          ) : done ? (
            <div className="text-center space-y-4 py-2">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgba(76,214,160,0.12)" }}
              >
                <CheckCircle2 className="h-6 w-6" style={{ color: "#4cd6a0" }} />
              </div>
              <p style={{ fontSize: 14, color: "#f6f5f7", fontWeight: 500 }}>
                Contraseña actualizada
              </p>
              <p style={{ fontSize: 13, color: "rgba(246,245,247,0.55)" }}>
                Redirigiendo al inicio de sesión…
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
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
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "rgba(246,245,247,0.3)" }}
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
                  style={{ color: "rgba(246,245,247,0.3)" }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "rgba(246,245,247,0.3)" }}
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
                  background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                  boxShadow: "0 4px 20px rgba(124,92,255,0.30)",
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
