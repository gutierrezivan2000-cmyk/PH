"use client";

import { signIn } from "next-auth/react";
import { Zap, ArrowRight } from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* ── Animated gradient background ── */}
      <div
        className="absolute inset-0 animate-gradient"
        style={{
          background:
            "linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95, #1e1b4b, #0f172a, #1e3a5f, #312e81)",
          backgroundSize: "400% 400%",
        }}
      />

      {/* ── Floating orbs for depth ── */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px] animate-pulse-slow" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/20 blur-[140px] animate-pulse-slow" />
      <div className="absolute top-[30%] right-[10%] w-[300px] h-[300px] rounded-full bg-blue-500/15 blur-[100px] animate-float" />
      <div className="absolute bottom-[20%] left-[15%] w-[250px] h-[250px] rounded-full bg-violet-400/15 blur-[90px] animate-float" />
      <div className="absolute top-[10%] left-[50%] w-[200px] h-[200px] rounded-full bg-fuchsia-500/10 blur-[80px] animate-pulse-slow" />

      {/* ── Subtle grid overlay ── */}
      <div className="absolute inset-0 bg-grid opacity-20" />

      {/* ── Main content ── */}
      <div className="relative z-10 w-full max-w-md px-4 animate-fade-in">
        {/* Glass card */}
        <div className="rounded-3xl border border-white/20 bg-white/[0.07] p-10 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {/* Logo */}
          <div className="text-center mb-8 animate-slide-up">
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight select-none">
              <span className="text-white">SOPH</span>
              <span className="text-white/60">.</span>
              <span
                className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text"
                style={{ WebkitTextFillColor: "transparent" }}
              >
                IA
              </span>
            </h1>
            <p className="mt-4 text-sm sm:text-base text-white/60 max-w-xs mx-auto leading-relaxed">
              Plataforma de IA para Administradores de Propiedad Horizontal
            </p>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mb-8" />

          {/* Demo banner */}
          {IS_DEMO && (
            <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center backdrop-blur-sm animate-slide-up">
              <p className="text-sm font-medium text-amber-200 flex items-center justify-center gap-2">
                <Zap className="h-4 w-4" />
                Modo Demo — no se requieren credenciales
              </p>
            </div>
          )}

          {/* Demo login button */}
          {IS_DEMO && (
            <button
              onClick={() => signIn("demo", { callbackUrl: "/dashboard" })}
              className="group mb-3 flex w-full items-center justify-center gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/80 to-orange-500/80 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-amber-500/20 backdrop-blur-sm transition-all duration-300 hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Zap className="h-5 w-5" />
              Entrar al Demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}

          {/* Google sign-in button */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.18] hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            {/* Google icon */}
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continuar con Google
          </button>

          {/* Demo data note */}
          {IS_DEMO && (
            <p className="mt-4 text-xs text-center text-white/40">
              Datos simulados. Los documentos generados son reales y descargables.
            </p>
          )}

          {/* Footer text */}
          <p className="mt-8 text-center text-xs text-white/35 leading-relaxed">
            Al continuar, aceptas nuestros{" "}
            <span className="text-white/50 underline underline-offset-2 decoration-white/20 cursor-pointer hover:text-white/70 transition-colors">
              Terminos de Servicio
            </span>
          </p>
        </div>

        {/* Subtle brand mark below card */}
        <p className="mt-6 text-center text-xs text-white/20 tracking-widest uppercase select-none">
          Liquid Glass &middot; SOPH.IA
        </p>
      </div>
    </div>
  );
}
