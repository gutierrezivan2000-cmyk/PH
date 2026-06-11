"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, ArrowRight, Mail, Lock, User, Eye, EyeOff, Loader2 } from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#7c5cff" }} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const errorParam = searchParams.get("error");

  // Landing CTAs link to /login?mode=register so "Empezar gratis" opens the
  // signup form directly instead of the login form.
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" ? "register" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    errorParam === "CredentialsSignin" ? "Credenciales invalidas" : ""
  );

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al crear cuenta");
          setLoading(false);
          return;
        }
        // Keep the password OUT of the URL (history/logs). The verify page
        // reads it from sessionStorage to auto-login after verification.
        try {
          sessionStorage.setItem("sophia-pending-pw", password);
        } catch {
          // sessionStorage unavailable → verify page falls back to /login
        }
        const params = new URLSearchParams({ email });
        if (data.emailSent === false) params.set("sent", "0");
        window.location.href = `/verify?${params.toString()}`;
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error === "CredentialsSignin" ? "Credenciales invalidas" : result.error);
        setLoading(false);
      } else {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "#0a0a0a" }}>

      {/* ── LEFT VISUAL BAND ── */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden
                   h-28 lg:h-auto lg:flex-1
                   dark:flex"
        style={{ background: "#0f0f14" }}
      >
        {/* Orb decorations */}
        <div
          className="hifi-orb-drift pointer-events-none absolute"
          style={{
            width: 480,
            height: 480,
            top: "-15%",
            left: "-10%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,92,255,0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="hifi-orb-drift pointer-events-none absolute"
          style={{
            width: 360,
            height: 360,
            bottom: "-10%",
            right: "-5%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(154,127,255,0.12) 0%, transparent 70%)",
            filter: "blur(56px)",
            animationDelay: "-7s",
          }}
        />

        {/* Content — hidden on mobile (collapsed to strip), shown on lg+ */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-10 text-center lg:flex-col">
          {/* Logo glyph */}
          <div
            className="flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{
              width: 48,
              height: 48,
              background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
              boxShadow: "0 0 32px rgba(124,92,255,0.35)",
            }}
          >
            <span
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 22,
                color: "#fff",
                letterSpacing: "-0.03em",
              }}
            >
              S
            </span>
          </div>

          {/* Brand + tagline — only visible on lg+ */}
          <div className="hidden lg:flex flex-col items-center gap-3">
            <span
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontWeight: 500,
                fontSize: 28,
                letterSpacing: "-0.025em",
                color: "#f6f5f7",
              }}
            >
              SOPH
              <span style={{ color: "rgba(246,245,247,0.4)" }}>.</span>
              <span style={{ color: "#7c5cff" }}>IA</span>
            </span>

            <p
              style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(246,245,247,0.42)",
                maxWidth: 220,
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              Documentos profesionales en minutos
            </p>

            {/* Divider */}
            <div style={{ width: 40, height: 1, background: "rgba(255,255,255,0.10)", marginTop: 8 }} />

            {/* Feature pills */}
            <div className="flex flex-col gap-2 mt-2">
              {[
                "Ley 675 · contexto activo",
                "Actas y acuerdos con IA",
                "6 agentes especializados",
              ].map((feat) => (
                <div
                  key={feat}
                  className="flex items-center gap-2 px-4 py-2 rounded-full"
                  style={{
                    background: "rgba(124,92,255,0.10)",
                    border: "1px solid rgba(124,92,255,0.25)",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#7c5cff",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(246,245,247,0.66)",
                    }}
                  >
                    {feat}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div
        className="flex flex-1 flex-col items-center justify-center px-4 py-10 lg:max-w-[480px] lg:px-12"
        style={{ background: "#0a0a0a" }}
      >
        <div className="w-full max-w-sm">

          {/* Eyebrow */}
          <p
            className="mb-6"
            style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(246,245,247,0.42)",
            }}
          >
            Ingreso
          </p>

          {/* Heading */}
          <h1
            className="mb-2"
            style={{
              fontFamily: "'Geist', system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "-0.025em",
              color: "#f6f5f7",
            }}
          >
            {mode === "login" ? "Bienvenido de vuelta" : "Crear cuenta"}
          </h1>
          <p
            className="mb-8"
            style={{
              fontSize: 14,
              color: "rgba(246,245,247,0.66)",
              lineHeight: 1.6,
            }}
          >
            {mode === "login"
              ? "Inicia sesion para continuar a tu panel"
              : "Registrate para comenzar con SOPH.IA"}
          </p>

          {/* Card */}
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{
              background: "#15151a",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >

            {/* Error */}
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

            {/* Demo */}
            {IS_DEMO && (
              <>
                <div
                  className="rounded-xl px-4 py-3 text-center"
                  style={{
                    background: "rgba(255,185,88,0.10)",
                    border: "1px solid rgba(255,185,88,0.25)",
                  }}
                >
                  <p
                    className="flex items-center justify-center gap-2"
                    style={{ fontSize: 13, color: "#ffb958", fontWeight: 500 }}
                  >
                    <Zap className="h-4 w-4" />
                    Modo Demo
                  </p>
                </div>
                <button
                  onClick={() => signIn("demo", { callbackUrl })}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, #ffb958, #ff8c42)",
                    boxShadow: "0 4px 20px rgba(255,185,88,0.25)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0a0a0a",
                  }}
                >
                  <Zap className="h-4 w-4" />
                  Entrar al Demo
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <div className="flex items-center gap-3">
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                  <span
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 10,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "rgba(246,245,247,0.28)",
                    }}
                  >
                    O
                  </span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                </div>
              </>
            )}

            {/* Google Button */}
            <button
              onClick={() => signIn("google", { callbackUrl })}
              className="group flex w-full items-center justify-center gap-3 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] cursor-pointer"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.14)",
                fontSize: 14,
                fontWeight: 500,
                color: "#f6f5f7",
              }}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continuar con Google
            </button>

            {/* Divider */}
            {!IS_DEMO && (
              <div className="flex items-center gap-3">
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                <span
                  style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "rgba(246,245,247,0.28)",
                  }}
                >
                  O
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>
            )}

            {/* Email / Password form */}
            {!IS_DEMO && (
              <form onSubmit={handleCredentials} className="space-y-3">
                {mode === "register" && (
                  <div className="relative">
                    <User
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                      style={{ color: "rgba(246,245,247,0.3)" }}
                    />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre completo"
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none"
                      style={{
                        background: "#1d1d24",
                        border: "1px solid rgba(255,255,255,0.07)",
                        color: "#f6f5f7",
                        fontFamily: "'Geist', system-ui, sans-serif",
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
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none"
                    style={{
                      background: "#1d1d24",
                      border: "1px solid rgba(255,255,255,0.07)",
                      color: "#f6f5f7",
                      fontFamily: "'Geist', system-ui, sans-serif",
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

                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                    style={{ color: "rgba(246,245,247,0.3)" }}
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "Minimo 6 caracteres" : "Contrasena"}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-11 py-3 rounded-xl text-sm transition-all duration-200 focus:outline-none"
                    style={{
                      background: "#1d1d24",
                      border: "1px solid rgba(255,255,255,0.07)",
                      color: "#f6f5f7",
                      fontFamily: "'Geist', system-ui, sans-serif",
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
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: "rgba(246,245,247,0.3)" }}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Forgot password link */}
                {mode === "login" && (
                  <div className="flex justify-end">
                    <Link
                      href="/forgot-password"
                      className="transition-colors hover:opacity-80"
                      style={{ fontSize: 12, color: "#7c5cff" }}
                    >
                      &iquest;Olvidaste tu contrasena?
                    </Link>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                    boxShadow: "0 4px 20px rgba(124,92,255,0.30)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fff",
                    fontFamily: "'Geist', system-ui, sans-serif",
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Iniciar sesion" : "Crear cuenta"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Switch mode */}
          {!IS_DEMO && (
            <p
              className="mt-5 text-center"
              style={{ fontSize: 13, color: "rgba(246,245,247,0.42)" }}
            >
              {mode === "login" ? (
                <>
                  &iquest;No tienes cuenta?{" "}
                  <button
                    onClick={() => { setMode("register"); setError(""); }}
                    className="transition-colors"
                    style={{ color: "#7c5cff", fontWeight: 500 }}
                  >
                    Crear cuenta
                  </button>
                </>
              ) : (
                <>
                  &iquest;Ya tienes cuenta?{" "}
                  <button
                    onClick={() => { setMode("login"); setError(""); }}
                    className="transition-colors"
                    style={{ color: "#7c5cff", fontWeight: 500 }}
                  >
                    Iniciar sesion
                  </button>
                </>
              )}
            </p>
          )}

          {/* Legal footer */}
          <p
            className="mt-6 text-center leading-relaxed"
            style={{ fontSize: 11, color: "rgba(246,245,247,0.28)" }}
          >
            Al continuar, aceptas nuestros{" "}
            <Link
              href="/legal/terminos"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color: "rgba(246,245,247,0.45)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Terminos de Servicio
            </Link>{" "}
            y la{" "}
            <Link
              href="/legal/privacidad"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color: "rgba(246,245,247,0.45)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Politica de Privacidad
            </Link>
          </p>
        </div>

        {/* Footer brand */}
        <p
          className="mt-10"
          style={{
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            fontSize: 9,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            color: "rgba(246,245,247,0.15)",
            userSelect: "none",
          }}
        >
          SOPH.IA &middot; Propiedad Horizontal
        </p>
      </div>
    </div>
  );
}
