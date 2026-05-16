"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Scale,
  Clock4,
  BarChart3,
  Lightbulb,
  Send,
  Calculator,
  Check,
  Lock,
  ArrowRight,
  Play,
  Sparkles,
  FileCheck2,
  Layers,
  FileOutput,
  Paperclip,
  Download,
  FileText,
  ShieldCheck,
  MapPin,
  Building2,
  Minus,
  Star,
  AlertCircle,
} from "lucide-react";

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

const AGENTS = [
  {
    name: "Themis",
    color: "#a78bff",
    icon: Scale,
    included: true,
    role: "Asesora legal",
    desc: "Ley 675, actas, asambleas, quórum.",
  },
  {
    name: "Chronos",
    color: "#5fb4ff",
    icon: Clock4,
    included: true,
    role: "Plazos",
    desc: "Vencimientos, asambleas, SG-SST.",
  },
  {
    name: "Metra",
    color: "#4cd6a0",
    icon: BarChart3,
    included: false,
    role: "Analista financiera",
    desc: "Presupuesto, cartera, proyección.",
  },
  {
    name: "Nomethes",
    color: "#ffb958",
    icon: Lightbulb,
    included: false,
    role: "Consultor decisiones",
    desc: "Pros/contras, escenarios, votaciones.",
  },
  {
    name: "Hermes",
    color: "#ff6fa8",
    icon: Send,
    included: false,
    role: "Redactor comunicaciones",
    desc: "Circulares, convocatorias, anuncios.",
  },
  {
    name: "Logistes",
    color: "#8a92ff",
    icon: Calculator,
    included: false,
    role: "Coordinador operativo",
    desc: "Mantenimiento, SG-SST, proveedores.",
  },
];

const MARQUEE_NAMES = [
  "Mirador",
  "Altavista",
  "Reservas",
  "Lumière",
  "Portales",
  "Cantábrico",
  "Bambú",
  "Cedros",
];

const CHAT_SEQUENCE = [
  {
    role: "user" as const,
    text: "Necesito el acta de la asamblea ordinaria del 22 de marzo. Quórum 67%, asistieron 104 de 155 unidades.",
    delay: 0,
  },
  { role: "typing" as const, delay: 900 },
  {
    role: "themis" as const,
    text: "Listo. Generé el borrador con los 8 puntos del orden del día.",
    file: "acta-mirador-marzo.docx",
    delay: 0,
  },
  {
    role: "themis" as const,
    text: "Validé el quórum según Art. 39 de la Ley 675...",
    cite: "Ley 675 · Art. 39",
    delay: 0,
  },
  {
    role: "user" as const,
    text: "¿Y la firma del revisor fiscal?",
    delay: 0,
  },
  { role: "typing" as const, delay: 600 },
  {
    role: "themis" as const,
    text: "No es obligatoria para actas del Consejo (Art. 56)...",
    delay: 0,
  },
];

const PRO_FEATURES = [
  "1 copropiedad",
  "Themis + Chronos incluidos",
  "Actas, informes y PPTX ilimitados",
  "Exporta PDF · DOCX · PPTX",
  "Historial completo de documentos",
];

const ELITE_FEATURES = [
  "Hasta 4 copropiedades",
  "Themis + Chronos incluidos",
  "Actas, informes y PPTX ilimitados",
  "Exporta PDF · DOCX · PPTX",
  "Generar en lote (hasta 4 a la vez)",
];

const ADDON_AGENTS = [
  { name: "Metra", role: "Analista financiera", color: "#4cd6a0" },
  { name: "Nomethes", role: "Consultor decisiones", color: "#ffb958" },
  { name: "Hermes", role: "Redactor comunicaciones", color: "#ff6fa8" },
  { name: "Logistes", role: "Coordinador operativo", color: "#8a92ff" },
];

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function ChatDemo() {
  const [visibleCount, setVisibleCount] = useState(2);

  useEffect(() => {
    if (visibleCount >= CHAT_SEQUENCE.length) {
      const restart = setTimeout(() => setVisibleCount(2), 5000);
      return () => clearTimeout(restart);
    }
    const current = CHAT_SEQUENCE[visibleCount];
    const delay = current.role === "typing" ? current.delay ?? 800 : 1200;
    const t = setTimeout(() => setVisibleCount((c) => c + 1), delay);
    return () => clearTimeout(t);
  }, [visibleCount]);

  const messages = CHAT_SEQUENCE.slice(0, visibleCount);

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: "#15151a",
        border: "1px solid rgba(255,255,255,0.07)",
        minHeight: 420,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: "linear-gradient(90deg,#7c5cff22,#a78bff11)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: "#7c5cff", color: "#fff" }}
        >
          T
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#e8e4ff" }}>
            Themis
          </p>
          <p
            className="text-xs"
            style={{ color: "#7c5cff", fontFamily: "monospace" }}
          >
            Asesora legal · en línea
          </p>
        </div>
        <div
          className="ml-auto w-2 h-2 rounded-full"
          style={{
            background: "#4cd6a0",
            boxShadow: "0 0 6px #4cd6a0",
          }}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
        {messages.map((msg, i) => {
          if (msg.role === "typing") {
            return (
              <div key={i} className="flex items-end gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "#7c5cff33", color: "#a78bff" }}
                >
                  T
                </div>
                <div
                  className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-bl-none"
                  style={{ background: "#1d1d24" }}
                >
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: "#7c5cff",
                        display: "inline-block",
                        animation: `sophiaTypingBounce 1.2s ${dot * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          }

          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div
                  className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-none text-sm"
                  style={{ background: "#25252e", color: "#e8e4ff" }}
                >
                  {msg.text}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex items-start gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1"
                style={{ background: "#7c5cff33", color: "#a78bff" }}
              >
                T
              </div>
              <div className="flex flex-col gap-2 max-w-[80%]">
                <div
                  className="px-4 py-2.5 rounded-2xl rounded-tl-none text-sm"
                  style={{
                    background: "#1d1d24",
                    color: "rgba(255,255,255,0.82)",
                  }}
                >
                  {msg.text}
                  {msg.file && (
                    <div
                      className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg"
                      style={{ background: "#7c5cff1a", border: "1px solid #7c5cff44" }}
                    >
                      <Paperclip
                        size={13}
                        style={{ color: "#a78bff" }}
                      />
                      <span
                        className="text-xs font-mono"
                        style={{ color: "#a78bff" }}
                      >
                        {msg.file}
                      </span>
                      <Download
                        size={12}
                        style={{ color: "#a78bff", marginLeft: "auto" }}
                      />
                    </div>
                  )}
                  {msg.cite && (
                    <div
                      className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-mono"
                      style={{
                        background: "#7c5cff22",
                        border: "1px solid #7c5cff55",
                        color: "#c4b5fd",
                      }}
                    >
                      <ShieldCheck size={11} />
                      {msg.cite}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compose bar */}
      <div
        className="flex items-center gap-2 px-3 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="flex-1 rounded-xl px-4 py-2 text-xs"
          style={{
            background: "#25252e",
            color: "rgba(255,255,255,0.3)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          Escribe a Themis...
        </div>
        <button
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "#7c5cff" }}
        >
          <Send size={14} color="#fff" />
        </button>
      </div>
    </div>
  );
}

function DocCard({
  title,
  type,
  lines,
  rotate,
  zIndex,
  semaforo,
}: {
  title: string;
  type: string;
  lines: number;
  rotate: string;
  zIndex: number;
  semaforo?: boolean;
}) {
  return (
    <div
      className="absolute rounded-xl p-4 w-72"
      style={{
        background: "#1d1d24",
        border: "1px solid rgba(255,255,255,0.09)",
        transform: rotate,
        zIndex,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold" style={{ color: "#e8e4ff" }}>
          {title}
        </p>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded"
          style={{
            background: "#7c5cff22",
            color: "#a78bff",
            border: "1px solid #7c5cff33",
          }}
        >
          {type}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 mb-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-2 rounded-full"
            style={{
              background: "rgba(255,255,255,0.08)",
              width: `${65 + ((i * 37) % 35)}%`,
            }}
          />
        ))}
      </div>
      {semaforo && (
        <div className="flex gap-2 mt-2">
          {(
            [
              ["#4cd6a0", "Cumplido"],
              ["#ffb958", "Parcial"],
              ["#ff6fa8", "Pendiente"],
            ] as [string, string][]
          ).map(([color, label]) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              <span
                className="text-[9px] font-mono"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function LandingPage() {
  const [agentHover, setAgentHover] = useState<number | null>(null);
  const [docsHovered, setDocsHovered] = useState(false);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500&display=swap');

        @keyframes sophiaOrbDrift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(30px,-20px) scale(1.05); }
        }
        @keyframes sophiaMarquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes sophiaTypingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes sophiaPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,92,255,0.20); }
          50% { box-shadow: 0 0 0 10px transparent; }
        }
        @keyframes sophiaDotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .sophia-page {
          font-family: 'Geist', system-ui, sans-serif;
          background: #0a0a0a;
          color: rgba(255,255,255,0.87);
          overflow-x: hidden;
        }
        .sophia-mono {
          font-family: 'Geist Mono', monospace;
        }
        .sophia-hairline {
          border-color: rgba(255,255,255,0.07);
        }
        .sophia-surface-1 { background: #15151a; }
        .sophia-surface-2 { background: #1d1d24; }
        .sophia-surface-3 { background: #25252e; }

        .docs-fan:hover .doc-card-0 {
          transform: rotate(-6deg) translateY(-8px) !important;
        }
        .docs-fan:hover .doc-card-1 {
          transform: rotate(0deg) translateY(-12px) translateX(12px) !important;
        }
        .docs-fan:hover .doc-card-2 {
          transform: rotate(5deg) translateY(-4px) translateX(20px) !important;
        }
      `,
        }}
      />

      <div className="sophia-page min-h-screen">

        {/* ── 1. STICKY NAVBAR ── */}
        <nav
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16"
          style={{
            background: "rgba(10,10,10,0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-base"
              style={{
                background: "linear-gradient(135deg,#7c5cff,#a78bff)",
                color: "#fff",
                boxShadow: "0 2px 12px #7c5cff44",
              }}
            >
              S
            </div>
            <span className="font-semibold text-base tracking-tight">
              SOPH
              <span style={{ color: "rgba(255,255,255,0.3)" }}>.</span>
              <span style={{ color: "#7c5cff" }}>IA</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden sm:flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                color: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              Ingresar
            </Link>
            <Link
              href="/login"
              className="flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "#7c5cff", color: "#fff" }}
            >
              Probar 7 días
            </Link>
          </div>
        </nav>

        {/* ── 2. HERO ── */}
        <section className="relative pt-28 pb-24 px-6" style={{ minHeight: "100vh" }}>
          {/* Background orbs */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 80,
              left: "20%",
              width: 560,
              height: 560,
              borderRadius: "50%",
              background: "radial-gradient(circle, #7c5cff22, transparent 70%)",
              animation: "sophiaOrbDrift 14s ease-in-out infinite",
              filter: "blur(60px)",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: 100,
              right: "15%",
              width: 420,
              height: 420,
              borderRadius: "50%",
              background: "radial-gradient(circle, #a78bff15, transparent 70%)",
              animation: "sophiaOrbDrift 18s 3s ease-in-out infinite reverse",
              filter: "blur(80px)",
            }}
          />

          <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            {/* LEFT */}
            <div className="flex flex-col gap-7">
              {/* Chip badges */}
              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sophia-mono"
                  style={{
                    background: "#ffb95820",
                    border: "1px solid #ffb95840",
                    color: "#ffb958",
                  }}
                >
                  <Scale size={11} />
                  conforme · Ley 675 de 2001
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sophia-mono"
                  style={{
                    background: "#4cd6a020",
                    border: "1px solid #4cd6a040",
                    color: "#4cd6a0",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "#4cd6a0",
                      animation: "sophiaDotPulse 2s infinite",
                      display: "inline-block",
                    }}
                  />
                  hecho en Colombia
                </span>
              </div>

              {/* Heading */}
              <h1
                className="leading-tight"
                style={{
                  fontSize: "clamp(44px, 5.5vw, 72px)",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  color: "rgba(255,255,255,0.95)",
                }}
              >
                Tu próxima{" "}
                <em
                  style={{
                    fontStyle: "italic",
                    color: "#a78bff",
                    fontWeight: 500,
                  }}
                >
                  acta legal
                </em>{" "}
                en lo que dura un café.
              </h1>

              {/* Body */}
              <p
                className="text-base leading-relaxed"
                style={{ color: "rgba(255,255,255,0.5)", maxWidth: 480 }}
              >
                SOPH.IA combina seis agentes IA especializados en propiedad
                horizontal con tu reglamento y tus datos del mes — y entrega
                informe, acta y PPTX listos para firmar.
              </p>

              {/* Buttons */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "#7c5cff", color: "#fff" }}
                >
                  Probar 7 días gratis
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  <Play size={14} />
                  Ver demo 2 min
                </Link>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex -space-x-2">
                  {["CM", "JR", "LP", "AM"].map((init, i) => (
                    <div
                      key={init}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: `hsl(${i * 55 + 250},60%,55%)`,
                        border: "2px solid #0a0a0a",
                        zIndex: 4 - i,
                        color: "#fff",
                      }}
                    >
                      {init}
                    </div>
                  ))}
                </div>
                <p
                  className="text-sm sophia-mono"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  180+ administradores · ★ 4.9 · 2.400 actas/mes
                </p>
              </div>
            </div>

            {/* RIGHT — Floating doc cards */}
            <div className="relative flex flex-col items-center">
              <div
                className="docs-fan relative"
                style={{ height: 340, width: 320 }}
                onMouseEnter={() => setDocsHovered(true)}
                onMouseLeave={() => setDocsHovered(false)}
              >
                <div className="doc-card-0">
                  <DocCard
                    title="Informe de gestión"
                    type="PDF · INFORME"
                    lines={6}
                    rotate="rotate(-3deg)"
                    zIndex={1}
                    semaforo
                  />
                </div>
                <div
                  className="doc-card-1 absolute top-10 left-6"
                  style={{ zIndex: 2 }}
                >
                  <DocCard
                    title="Acta Consejo de Administración"
                    type="DOCX · ACTA"
                    lines={7}
                    rotate="rotate(2deg)"
                    zIndex={2}
                  />
                </div>
                <div
                  className="doc-card-2 absolute top-20 left-12"
                  style={{ zIndex: 3 }}
                >
                  <DocCard
                    title="Presentación asamblea"
                    type="PPTX · ASAMBLEA"
                    lines={4}
                    rotate="rotate(5deg)"
                    zIndex={3}
                  />
                </div>
              </div>

              {/* Callout pill */}
              <div
                className="mt-8 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
                style={{
                  background: "#15151a",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.65)",
                }}
              >
                <Sparkles size={15} style={{ color: "#a78bff" }} />
                3 documentos generados desde un solo prompt
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. CHAT DEMO BAND ── */}
        <section
          className="py-24 px-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
            {/* LEFT — Features */}
            <div className="flex flex-col gap-8">
              <h2
                className="leading-tight"
                style={{
                  fontSize: "clamp(32px, 3.5vw, 52px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "rgba(255,255,255,0.95)",
                }}
              >
                Hablas.{" "}
                <em style={{ fontStyle: "italic", color: "#a78bff" }}>
                  Ella redacta.
                </em>{" "}
                Tú firmas.
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.5)", maxWidth: 440 }}
              >
                Themis entiende lenguaje natural. Cuéntale qué necesitas y ella
                produce el documento correcto, referenciado legalmente, listo
                para tu Consejo.
              </p>
              <div className="flex flex-col gap-6">
                {[
                  {
                    Icon: FileCheck2,
                    title: "Validación legal en línea",
                    desc: "Cada cláusula referenciada al artículo de la Ley 675.",
                    color: "#a78bff",
                  },
                  {
                    Icon: Layers,
                    title: "Memoria por copropiedad",
                    desc: "Themis recuerda el reglamento y los acuerdos previos del Consejo.",
                    color: "#5fb4ff",
                  },
                  {
                    Icon: FileOutput,
                    title: "Exporta donde necesites",
                    desc: "PDF · DOCX · PPTX · listos para tu Consejo.",
                    color: "#4cd6a0",
                  },
                ].map(({ Icon, title, desc, color }) => (
                  <div key={title} className="flex gap-4 items-start">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}20`, border: `1px solid ${color}40` }}
                    >
                      <Icon size={18} style={{ color }} />
                    </div>
                    <div>
                      <p
                        className="text-sm font-semibold mb-0.5"
                        style={{ color: "rgba(255,255,255,0.87)" }}
                      >
                        {title}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: "rgba(255,255,255,0.45)" }}
                      >
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — Chat widget */}
            <ChatDemo />
          </div>
        </section>

        {/* ── 4. AGENTS GRID ── */}
        <section
          className="py-24 px-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="mb-12 flex flex-col gap-3">
              <p
                className="text-xs font-medium tracking-widest uppercase sophia-mono"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Los agentes
              </p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "rgba(255,255,255,0.95)",
                }}
              >
                Seis especialistas, un solo chat.
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {AGENTS.map((agent, i) => {
                const Icon = agent.icon;
                const isHovered = agentHover === i;
                return (
                  <div
                    key={agent.name}
                    className="relative overflow-hidden rounded-2xl p-6 flex flex-col gap-3 cursor-default"
                    style={{
                      background: isHovered
                        ? `radial-gradient(circle at 30% 30%, ${agent.color}18, #15151a 70%)`
                        : `radial-gradient(circle at 30% 30%, ${agent.color}0d, #15151a 70%)`,
                      border: isHovered
                        ? `1px solid ${agent.color}55`
                        : "1px solid rgba(255,255,255,0.07)",
                      boxShadow: isHovered
                        ? `0 8px 32px ${agent.color}25`
                        : "none",
                      transform: isHovered ? "translateY(-3px)" : "none",
                      transition:
                        "transform 0.25s, border-color 0.25s, box-shadow 0.25s, background 0.25s",
                    }}
                    onMouseEnter={() => setAgentHover(i)}
                    onMouseLeave={() => setAgentHover(null)}
                  >
                    {/* Oversized background icon */}
                    <Icon
                      size={64}
                      style={{
                        position: "absolute",
                        bottom: 12,
                        right: 12,
                        color: agent.color,
                        opacity: 0.15,
                        pointerEvents: "none",
                      }}
                    />

                    <div className="flex items-start justify-between">
                      {/* Monogram */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{
                          background: `${agent.color}25`,
                          border: `1px solid ${agent.color}50`,
                          color: agent.color,
                        }}
                      >
                        {agent.name[0]}
                      </div>
                      {/* Chip */}
                      {agent.included ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium sophia-mono"
                          style={{
                            background: "#4cd6a015",
                            border: "1px solid #4cd6a030",
                            color: "#4cd6a0",
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: "#4cd6a0", display: "inline-block" }}
                          />
                          incluido
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium sophia-mono"
                          style={{
                            background: "#25252e",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.45)",
                          }}
                        >
                          <Lock size={10} />
                          +$5/mes
                        </span>
                      )}
                    </div>

                    <div>
                      <p
                        className="font-semibold"
                        style={{ fontSize: 22, color: "rgba(255,255,255,0.9)" }}
                      >
                        {agent.name}
                      </p>
                      <p
                        className="text-xs sophia-mono mt-0.5"
                        style={{ color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.07em" }}
                      >
                        {agent.role}
                      </p>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "rgba(255,255,255,0.5)", zIndex: 1 }}
                    >
                      {agent.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── 5. STATS BAND ── */}
        <section
          className="py-20 px-6"
          style={{
            background: "#0e0e12",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="max-w-7xl mx-auto">
            <h2
              className="text-center mb-12"
              style={{
                fontSize: "clamp(28px, 3vw, 44px)",
                fontWeight: 500,
                letterSpacing: "-0.025em",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              De{" "}
              <span
                style={{
                  textDecoration: "line-through",
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                ocho horas
              </span>{" "}
              a tres minutos.
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
              {[
                { num: "180+", label: "administradores en Colombia" },
                { num: "2.400", label: "actas generadas / mes" },
                { num: "96%", label: "cumplimiento Ley 675" },
                { num: "14h", label: "recuperadas / mes" },
                { num: "3min", label: "tiempo medio de generación" },
              ].map(({ num, label }) => (
                <div key={label} className="flex flex-col gap-1">
                  <p
                    className="sophia-mono font-bold"
                    style={{ fontSize: 56, color: "#fff", lineHeight: 1 }}
                  >
                    <span style={{ color: "#7c5cff" }}>·</span>
                    {num}
                  </p>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. LOGO MARQUEE ── */}
        <section
          className="py-10 overflow-hidden relative"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Fade masks */}
          <div
            className="absolute inset-y-0 left-0 z-10 w-24 pointer-events-none"
            style={{
              background: "linear-gradient(to right, #0a0a0a, transparent)",
            }}
          />
          <div
            className="absolute inset-y-0 right-0 z-10 w-24 pointer-events-none"
            style={{
              background: "linear-gradient(to left, #0a0a0a, transparent)",
            }}
          />
          <div
            className="flex gap-4 whitespace-nowrap"
            style={{
              animation: "sophiaMarquee 28s linear infinite",
              width: "max-content",
            }}
          >
            {[...MARQUEE_NAMES, ...MARQUEE_NAMES].map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full flex-shrink-0"
                style={{
                  background: "#15151a",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <Building2 size={13} style={{ color: "#7c5cff" }} />
                <span
                  className="text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.65)" }}
                >
                  {name}
                </span>
                <span
                  className="text-xs sophia-mono"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  PH · CO
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. TESTIMONIAL ── */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div
              className="relative rounded-3xl p-10 sm:p-14 overflow-hidden"
              style={{
                background: "#15151a",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {/* Oversized quote mark */}
              <p
                className="absolute"
                style={{
                  top: -20,
                  left: 32,
                  fontSize: 160,
                  lineHeight: 1,
                  color: "#7c5cff",
                  opacity: 0.35,
                  fontFamily: "Georgia, serif",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                &ldquo;
              </p>

              <blockquote className="relative flex flex-col gap-7">
                <p
                  className="leading-relaxed pt-10"
                  style={{
                    fontSize: "clamp(18px, 2.2vw, 26px)",
                    color: "rgba(255,255,255,0.87)",
                    fontWeight: 400,
                  }}
                >
                  Pasé de cerrar el informe de gestión el sábado a tener todo
                  listo el viernes a las 11 de la mañana.{" "}
                  <em
                    style={{
                      fontStyle: "italic",
                      color: "#a78bff",
                    }}
                  >
                    Mi Consejo cree que duermo menos.
                  </em>
                </p>

                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: "#7c5cff", color: "#fff" }}
                  >
                    AM
                  </div>
                  <div>
                    <p
                      className="font-semibold text-sm"
                      style={{ color: "rgba(255,255,255,0.87)" }}
                    >
                      Ana Marín
                    </p>
                    <p
                      className="text-xs sophia-mono"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                      Administradora · 12 copropiedades · Bogotá
                    </p>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((s) => (
                      <Star
                        key={s}
                        size={16}
                        fill="#7c5cff"
                        style={{ color: "#7c5cff" }}
                      />
                    ))}
                  </div>
                </div>
              </blockquote>
            </div>
          </div>
        </section>

        {/* ── 8. PRICING ── */}
        <section
          className="py-24 px-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 flex flex-col gap-3">
              <p
                className="text-xs font-medium tracking-widest uppercase sophia-mono"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Planes
              </p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "rgba(255,255,255,0.95)",
                }}
              >
                Simple. Transparente. Sin sorpresas.
              </h2>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
              {/* Col 1 — Pro */}
              <div
                className="rounded-2xl p-7 flex flex-col gap-6"
                style={{
                  background: "#15151a",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <div>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider mb-3"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Plan profesional
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      style={{
                        fontSize: 54,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.9)",
                        lineHeight: 1,
                      }}
                    >
                      $20
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                      /mes USD
                    </span>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs sophia-mono"
                    style={{
                      background: "#7c5cff18",
                      border: "1px solid #7c5cff35",
                      color: "#a78bff",
                    }}
                  >
                    Trial 7 días
                  </span>
                </div>
                <ul className="flex flex-col gap-3">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <Check
                        size={15}
                        style={{ color: "#7c5cff", flexShrink: 0 }}
                      />
                      <span style={{ color: "rgba(255,255,255,0.65)" }}>{f}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2.5 text-sm">
                    <Minus
                      size={15}
                      style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.25)" }}>
                      Generar en lote
                    </span>
                  </li>
                </ul>
                <Link
                  href="/login"
                  className="block text-center py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  Empezar gratis
                </Link>
              </div>

              {/* Col 2 — Elite (highlighted) */}
              <div
                className="relative rounded-2xl p-7 flex flex-col gap-6"
                style={{
                  background: "linear-gradient(145deg, #1a1530, #15151a)",
                  border: "1px solid #7c5cff55",
                  boxShadow: "0 0 48px #7c5cff22, 0 0 0 1px #7c5cff22",
                }}
              >
                {/* Ribbon */}
                <div
                  className="absolute top-4 right-4 text-xs font-medium px-2.5 py-1 rounded-lg sophia-mono text-right"
                  style={{
                    background: "#7c5cff25",
                    border: "1px solid #7c5cff45",
                    color: "#a78bff",
                    maxWidth: 140,
                  }}
                >
                  recomendado para 4+ propiedades
                </div>
                <div>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider mb-3"
                    style={{ color: "#a78bff" }}
                  >
                    Plan elite
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      style={{
                        fontSize: 54,
                        fontWeight: 700,
                        color: "#c4b5fd",
                        lineHeight: 1,
                      }}
                    >
                      $200
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "rgba(196,181,253,0.5)" }}
                    >
                      /mes USD
                    </span>
                  </div>
                </div>
                <ul className="flex flex-col gap-3">
                  {ELITE_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <Check
                        size={15}
                        style={{ color: "#a78bff", flexShrink: 0 }}
                      />
                      <span style={{ color: "rgba(255,255,255,0.7)" }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className="block text-center py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "#7c5cff", color: "#fff" }}
                >
                  Subir a Elite
                </Link>
              </div>

              {/* Col 3 — Add-ons */}
              <div
                className="rounded-2xl p-7 flex flex-col gap-6 relative overflow-hidden"
                style={{
                  background: "#15151a",
                  border: "1px solid rgba(255,255,255,0.09)",
                  backgroundImage:
                    "repeating-linear-gradient(45deg, transparent, transparent 14px, rgba(255,255,255,0.015) 14px, rgba(255,255,255,0.015) 15px)",
                }}
              >
                <div>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider mb-3"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Add-ons · $5/mes c/u
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    Agrega agentes especializados a cualquier plan cuando los
                    necesites.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {ADDON_AGENTS.map((a) => (
                    <div
                      key={a.name}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{
                        background: "#1d1d24",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          background: `${a.color}20`,
                          border: `1px solid ${a.color}40`,
                          color: a.color,
                        }}
                      >
                        {a.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "rgba(255,255,255,0.8)" }}
                        >
                          {a.name}
                        </p>
                        <p
                          className="text-xs sophia-mono"
                          style={{ color: "rgba(255,255,255,0.3)" }}
                        >
                          {a.role}
                        </p>
                      </div>
                      <span
                        className="text-xs font-semibold sophia-mono"
                        style={{ color: "#a78bff" }}
                      >
                        +$5
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs sophia-mono"
                  style={{
                    background: "#7c5cff15",
                    border: "1px solid #7c5cff35",
                    color: "#a78bff",
                  }}
                >
                  <Sparkles size={12} />
                  Paquete 4 agentes · USD 15/mes · −25%
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 9. CTA CARD ── */}
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <div
              className="rounded-3xl p-10 sm:p-14 grid lg:grid-cols-2 gap-10 items-center"
              style={{
                background: "#15151a",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <div className="flex flex-col gap-5">
                <h2
                  className="leading-tight"
                  style={{
                    fontSize: "clamp(26px, 3vw, 40px)",
                    fontWeight: 500,
                    letterSpacing: "-0.025em",
                    color: "rgba(255,255,255,0.95)",
                  }}
                >
                  Tu próxima acta · lista en tres minutos.
                </h2>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.45)", maxWidth: 380 }}
                >
                  Únete a los administradores que ya entregan informes listos el
                  viernes, no el sábado.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { Icon: ShieldCheck, text: "Conforme Ley 675" },
                    { Icon: MapPin, text: "Hecho en Colombia" },
                    { Icon: AlertCircle, text: "Sin tarjeta inicial" },
                  ].map(({ Icon, text }) => (
                    <span
                      key={text}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sophia-mono"
                      style={{
                        background: "#25252e",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      <Icon size={11} />
                      {text}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center lg:justify-end">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold transition-all"
                  style={{
                    background: "#7c5cff",
                    color: "#fff",
                    animation: "sophiaPulse 2.5s infinite",
                  }}
                >
                  Probar 7 días gratis
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── 10. FOOTER ── */}
        <footer
          className="py-14 px-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-5 gap-10">
            {/* Brand */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-base"
                  style={{
                    background: "linear-gradient(135deg,#7c5cff,#a78bff)",
                    color: "#fff",
                  }}
                >
                  S
                </div>
                <span className="font-semibold text-base tracking-tight">
                  SOPH
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>.</span>
                  <span style={{ color: "#7c5cff" }}>IA</span>
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.35)", maxWidth: 260 }}
              >
                Inteligencia artificial para administradores de propiedad
                horizontal en Colombia.
              </p>
              <p
                className="text-xs sophia-mono"
                style={{ color: "rgba(255,255,255,0.2)" }}
              >
                © 2026 SOPH.IA · Todos los derechos reservados.
              </p>
            </div>

            {/* Links */}
            {[
              {
                title: "Producto",
                links: [
                  ["Themis", "/login"],
                  ["Agentes", "#agents"],
                  ["Precios", "#pricing"],
                  ["Demo", "/login"],
                ],
              },
              {
                title: "Legal",
                links: [
                  ["Términos de uso", "/login"],
                  ["Privacidad", "/login"],
                  ["Habeas Data", "/login"],
                ],
              },
              {
                title: "Contacto",
                links: [
                  ["WhatsApp", "/login"],
                  ["Email", "/login"],
                  ["LinkedIn", "/login"],
                ],
              },
            ].map((col) => (
              <div key={col.title} className="flex flex-col gap-4">
                <p
                  className="text-xs font-semibold uppercase tracking-wider sophia-mono"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {col.title}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="text-sm transition-colors"
                        style={{ color: "rgba(255,255,255,0.45)" }}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
