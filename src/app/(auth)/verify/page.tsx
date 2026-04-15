"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, ShieldCheck, Mail, ArrowRight, RotateCcw } from "lucide-react";

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") || "";
  const password = searchParams.get("p") || "";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError("");

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (newCode.every((d) => d !== "") && newCode.join("").length === 6) {
      handleVerify(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
      handleVerify(pasted);
    }
  };

  const handleVerify = async (codeStr: string) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: codeStr }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al verificar");
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        setLoading(false);
        return;
      }

      setSuccess(true);

      // Auto sign-in if we have the password
      if (password) {
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (result?.ok) {
          window.location.href = "/dashboard";
          return;
        }
      }

      // Redirect to login after a short delay
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");

    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al reenviar");
      } else {
        setCooldown(60);
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 animate-gradient"
        style={{
          background: "linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95, #1e1b4b, #0f172a, #1e3a5f, #312e81)",
          backgroundSize: "400% 400%",
        }}
      />
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[120px] animate-orb" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/20 blur-[140px] animate-orb-delayed" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-3xl border border-white/15 bg-white/[0.06] p-8 sm:p-10 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {success ? (
            /* ── Success State ── */
            <div className="text-center space-y-4 animate-fade-in">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Cuenta verificada</h2>
              <p className="text-white/50 text-sm">Redirigiendo al dashboard...</p>
              <Loader2 className="h-5 w-5 animate-spin text-violet-400 mx-auto" />
            </div>
          ) : (
            /* ── Verification Form ── */
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-7 w-7 text-violet-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Verifica tu correo</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  Enviamos un codigo de 6 digitos a<br />
                  <span className="text-violet-300 font-medium">{email}</span>
                </p>
              </div>

              {error && (
                <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center">
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              {/* Code inputs */}
              <div className="flex gap-2.5 justify-center mb-6" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    disabled={loading}
                    className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-white/20 bg-white/[0.08] text-white focus:outline-none focus:border-violet-400/60 focus:bg-white/[0.12] transition-all duration-200 disabled:opacity-50"
                  />
                ))}
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  <span className="text-sm text-white/50">Verificando...</span>
                </div>
              )}

              {/* Resend */}
              <div className="text-center">
                <p className="text-white/40 text-xs mb-2">No recibiste el codigo?</p>
                <button
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200 disabled:text-white/20 transition-colors"
                >
                  {resending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar codigo"}
                </button>
              </div>

              <div className="h-px w-full bg-white/10 my-6" />

              <button
                onClick={() => router.push("/login")}
                className="w-full flex items-center justify-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                Volver al inicio de sesion
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
