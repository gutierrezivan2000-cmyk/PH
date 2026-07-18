"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, AlertCircle, Mail, KeyRound } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      const role = (session?.user as { role?: string })?.role;
      if (role === "admin") {
        router.replace("/admin");
      } else {
        setError("Tu cuenta no tiene acceso al panel de administración.");
      }
    }
  }, [status, session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Credenciales inválidas o cuenta sin permisos de admin.");
      } else if (res?.ok) {
        // Reload to pick up the updated session role.
        window.location.href = "/admin";
      }
    } catch {
      setError("No se pudo iniciar sesión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0a0a0a" }}
    >
      {/* Background orb */}
      <div
        className="fixed top-1/4 left-1/4 w-[400px] h-[400px] rounded-full pointer-events-none hifi-orb-drift"
        style={{
          background: "rgba(124,92,255,0.15)",
          filter: "blur(80px)",
        }}
      />
      <div
        className="fixed bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full pointer-events-none hifi-orb-drift"
        style={{
          background: "rgba(124,92,255,0.10)",
          filter: "blur(60px)",
          animationDelay: "4s",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white mb-4"
            style={{
              background: "linear-gradient(135deg, #7c5cff, #5a3cf0)",
              boxShadow: "0 0 40px rgba(124,92,255,0.40)",
            }}
          >
            S
          </div>
          <p
            className="text-[11px] uppercase text-muted-foreground/70 mb-1"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2em" }}
          >
            SOPH.IA · Admin Console
          </p>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            Acceso restringido
          </h1>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-7"
          style={{
            background:
              "radial-gradient(120% 100% at 0% 0%, rgba(124,92,255,0.10), transparent 70%), #15151a",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2 mb-5">
            <Lock className="h-4 w-4" style={{ color: "#9a7fff" }} />
            <span
              className="text-[10px] uppercase text-muted-foreground/70"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
            >
              Solo administradores autorizados
            </span>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-4 text-[12.5px]"
              style={{
                background: "rgba(255,111,111,0.10)",
                border: "1px solid rgba(255,111,111,0.30)",
                color: "#ff8585",
              }}
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {/* Google — same accounts as the main app; ADMIN_EMAILS promotes on login */}
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/admin" })}
            className="w-full inline-flex items-center justify-center gap-3 rounded-full border text-[13px] font-medium py-3 transition-all hover:bg-secondary"
            style={{ borderColor: "rgba(255,255,255,0.14)", color: "#f6f5f7" }}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continuar con Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span
              className="text-[10px] uppercase text-muted-foreground/50"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
            >
              o con email
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                className="text-[10px] uppercase block mb-1.5"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.16em",
                  color: "rgba(255,255,255,0.50)",
                }}
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border bg-secondary text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#7c5cff] focus:ring-[3px] focus:ring-[rgba(124,92,255,0.15)] transition-all"
                  style={{ borderColor: "rgba(255,255,255,0.10)" }}
                  placeholder="admin@sophia.app"
                />
              </div>
            </div>

            <div>
              <label
                className="text-[10px] uppercase block mb-1.5"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.16em",
                  color: "rgba(255,255,255,0.50)",
                }}
              >
                Contraseña
              </label>
              <div className="relative">
                <KeyRound
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border bg-secondary text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#7c5cff] focus:ring-[3px] focus:ring-[rgba(124,92,255,0.15)] transition-all"
                  style={{ borderColor: "rgba(255,255,255,0.10)" }}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full text-white text-[13px] font-medium py-3 transition-all disabled:opacity-50"
              style={{
                background: "#7c5cff",
                boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)",
              }}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </form>

          <p
            className="text-[10px] uppercase text-muted-foreground/50 text-center mt-6"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
          >
            Las sesiones se auditan y registran
          </p>
        </div>
      </div>
    </div>
  );
}
