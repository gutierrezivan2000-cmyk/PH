import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import DemoTabs from "./DemoTabs";

export const metadata: Metadata = {
  title: "Documentos de ejemplo — SOPH.IA",
  description:
    "Mira exactamente lo que SOPH.IA genera para administradores de propiedad horizontal: actas de consejo e informes de gestión profesionales, con citas verificadas contra la Ley 675 de 2001. Sin registro.",
};

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

export default function DemoPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--surface-0)", color: "var(--ink)" }}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: "rgb(var(--surface-rgb) / 0.72)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderColor: "rgb(var(--veil-rgb) / 0.07)",
        }}
      >
        <div className="mx-auto max-w-5xl px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-lo))",
                boxShadow: "0 0 24px rgb(var(--accent-rgb) / 0.35)",
              }}
            >
              S
            </div>
            <span className="text-[15px] font-medium tracking-[-0.025em]">
              SOPH.<span style={{ color: "var(--accent-text)" }}>IA</span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] transition-colors hover:text-white"
            style={{ color: "var(--ink-2)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full mx-auto max-w-5xl px-5 pt-16 pb-24">
        {/* Hero */}
        <div className="text-center mb-12">
          <p style={{ ...MONO, color: "var(--accent-text)" }}>Demo · Sin registro</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-medium tracking-[-0.025em]">
            Esto es lo que recibes cada mes.
          </h1>
          <p
            className="mt-4 text-[14.5px] leading-relaxed max-w-xl mx-auto"
            style={{ color: "var(--ink-2)" }}
          >
            Generado por SOPH.IA con datos de ejemplo de un conjunto
            residencial ficticio de 155 unidades.
          </p>
        </div>

        {/* Tabs + documents (client) */}
        <DemoTabs />

        {/* Final CTA */}
        <div
          className="mx-auto max-w-2xl mt-16 rounded-2xl border p-8 sm:p-10 text-center"
          style={{
            background:
              "radial-gradient(120% 100% at 50% 0%, rgb(var(--accent-rgb) / 0.14), transparent 70%), var(--surface-2)",
            borderColor: "rgb(var(--accent-rgb) / 0.3)",
          }}
        >
          <div
            className="mx-auto h-10 w-10 rounded-lg flex items-center justify-center mb-4"
            style={{
              background: "rgb(var(--accent-rgb) / 0.15)",
              border: "1px solid rgb(var(--accent-rgb) / 0.3)",
            }}
          >
            <Sparkles className="h-4.5 w-4.5" style={{ color: "var(--accent-text)" }} />
          </div>
          <h2 className="text-2xl font-medium tracking-[-0.025em]">
            ¿Quieres esto con TUS datos?
          </h2>
          <p
            className="mt-2.5 text-[13.5px] leading-relaxed max-w-md mx-auto"
            style={{ color: "var(--ink-2)" }}
          >
            Conecta tu copropiedad y recibe actas e informes con la misma
            calidad, listos para revisar y enviar.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login?mode=register"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-medium text-white transition-all hover:opacity-90"
              style={{
                background: "var(--accent)",
                boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)",
              }}
            >
              Probar 7 días gratis
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-[13px] font-medium transition-colors hover:text-white"
              style={{
                borderColor: "rgb(var(--veil-rgb) / 0.14)",
                color: "var(--ink-2)",
              }}
            >
              Volver al inicio
            </Link>
          </div>
          <p className="mt-5" style={{ ...MONO, fontSize: 10, color: "var(--ink-3)" }}>
            Sin tarjeta para empezar · Cancela cuando quieras
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="border-t py-8"
        style={{ borderColor: "rgb(var(--veil-rgb) / 0.07)" }}
      >
        <p
          className="text-center"
          style={{ ...MONO, fontSize: 10, color: "var(--ink-3)" }}
        >
          SOPH.IA © 2026 · Propiedad Horizontal · Colombia
        </p>
      </footer>
    </div>
  );
}
