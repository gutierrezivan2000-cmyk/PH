"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Zap, ArrowRight, Mail, Lock, User, Eye, EyeOff, Loader2 } from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
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

  const [mode, setMode] = useState<"login" | "register">("login");
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
        // Register first
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
      }

      // Sign in — registration already handled by /api/auth/register above
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 animate-gradient"
        style={{
          background:
            "linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95, #1e1b4b, #0f172a, #1e3a5f, #312e81)",
          backgroundSize: "400% 400%",
        }}
      />

      {/* Floating orbs */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px] animate-orb" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/20 blur-[140px] animate-orb-delayed" />
      <div className="absolute top-[30%] right-[10%] w-[300px] h-[300px] rounded-full bg-blue-500/15 blur-[100px] animate-orb-slow" />

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-grid opacity-20" />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-md px-4 animate-fade-in">
        {/* Glass card */}
        <div className="rounded-3xl border border-white/15 bg-white/[0.06] p-8 sm:p-10 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {/* Logo */}
          <div className="text-center mb-8 animate-slide-up">
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight select-none">
              <span className="text-white">SOPH</span>
              <span className="text-white/60">.</span>
              <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text" style={{ WebkitTextFillColor: "transparent" }}>
                IA
              </span>
            </h1>
            <p className="mt-3 text-sm text-white/50 max-w-xs mx-auto leading-relaxed">
              Plataforma de IA para Propiedad Horizontal
            </p>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mb-6" />

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center backdrop-blur-sm">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* Demo */}
          {IS_DEMO && (
            <>
              <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center backdrop-blur-sm">
                <p className="text-sm font-medium text-amber-200 flex items-center justify-center gap-2">
                  <Zap className="h-4 w-4" />
                  Modo Demo
                </p>
              </div>
              <button
                onClick={() => signIn("demo", { callbackUrl })}
                className="group mb-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/80 to-orange-500/80 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-amber-500/20 backdrop-blur-sm transition-all duration-300 hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Zap className="h-5 w-5" />
                Entrar al Demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-white/30 uppercase tracking-wider">o</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          {/* Email/Password Form */}
          {!IS_DEMO && (
            <>
              {/* Mode tabs */}
              <div className="flex rounded-2xl bg-white/[0.06] border border-white/10 p-1 mb-6">
                <button
                  onClick={() => { setMode("login"); setError(""); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    mode === "login"
                      ? "bg-white/15 text-white shadow-sm backdrop-blur-sm"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  Iniciar Sesion
                </button>
                <button
                  onClick={() => { setMode("register"); setError(""); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    mode === "register"
                      ? "bg-white/15 text-white shadow-sm backdrop-blur-sm"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  Crear Cuenta
                </button>
              </div>

              <form onSubmit={handleCredentials} className="space-y-3 mb-5">
                {mode === "register" && (
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre completo"
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-white/15 bg-white/[0.06] text-white placeholder-white/30 text-sm focus:outline-none focus:border-violet-400/50 focus:bg-white/[0.1] transition-all duration-300 backdrop-blur-sm"
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    required
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-white/15 bg-white/[0.06] text-white placeholder-white/30 text-sm focus:outline-none focus:border-violet-400/50 focus:bg-white/[0.1] transition-all duration-300 backdrop-blur-sm"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "Minimo 6 caracteres" : "Contraseña"}
                    required
                    minLength={6}
                    className="w-full pl-11 pr-12 py-3.5 rounded-2xl border border-white/15 bg-white/[0.06] text-white placeholder-white/30 text-sm focus:outline-none focus:border-violet-400/50 focus:bg-white/[0.1] transition-all duration-300 backdrop-blur-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Iniciar Sesion" : "Crear Cuenta"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-white/30 uppercase tracking-wider">o continua con</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          {/* Google sign-in */}
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.14] hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google
          </button>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-white/30 leading-relaxed">
            Al continuar, aceptas nuestros{" "}
            <span className="text-white/45 underline underline-offset-2 decoration-white/20 cursor-pointer hover:text-white/60 transition-colors">
              Terminos de Servicio
            </span>
          </p>
        </div>

        {/* Brand mark */}
        <p className="mt-6 text-center text-xs text-white/15 tracking-widest uppercase select-none">
          Liquid Glass &middot; SOPH.IA
        </p>
      </div>
    </div>
  );
}
