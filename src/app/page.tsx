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
  Sparkles,
  FileCheck2,
  Layers,
  FileOutput,
  Paperclip,
  Download,
  Upload,
  ShieldCheck,
  MapPin,
  Minus,
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
  "Actas de Asamblea",
  "Informes de Gestión",
  "Presentaciones PPTX",
  "Convocatorias",
  "PQRS",
  "Circulares",
  "SG-SST",
  "Presupuestos",
];

const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_URL || "https://wa.me/573001112233";

const SUGGESTED_QA = [
  {
    q: "¿Qué quórum necesito para asamblea ordinaria?",
    a: "Para deliberar en asamblea ordinaria necesitas un número plural de propietarios que represente más de la mitad de los coeficientes de copropiedad (Art. 45, Ley 675 de 2001). Si no se alcanza, la reunión de segunda convocatoria puede sesionar con cualquier número plural de propietarios.",
    cite: "Ley 675 · Art. 45",
  },
  {
    q: "¿El revisor fiscal debe firmar el acta?",
    a: "El acta la firman el presidente y el secretario de la reunión; la firma del revisor fiscal no es requisito de validez. Recuerda que el revisor fiscal es obligatorio en edificios de uso comercial o mixto y opcional en los residenciales (Arts. 56 y 57, Ley 675 de 2001).",
    cite: "Ley 675 · Arts. 56-57",
  },
  {
    q: "¿Cómo impugno una decisión de asamblea?",
    a: "El administrador, el revisor fiscal o cualquier propietario puede impugnar ante el juez las decisiones contrarias a la ley o al reglamento, dentro de los 2 meses siguientes a la fecha de la comunicación o publicación del acta (Art. 49, Ley 675 de 2001).",
    cite: "Ley 675 · Art. 49",
  },
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
  "Hasta 3 propiedades",
  "Themis + Chronos incluidos",
  "15 generaciones al mes (máx. 3/día)",
  "Exporta PDF · DOCX · PPTX",
  "Historial completo de documentos",
  "Soporte por chat",
];

const ELITE_FEATURES = [
  "Propiedades ilimitadas",
  "Themis + Chronos incluidos",
  "50 generaciones al mes (máx. 10/día)",
  "Exporta PDF · DOCX · PPTX",
  "Generar en lote (hasta 4 a la vez)",
  "Soporte prioritario",
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

type ChatMessage = {
  role: "user" | "themis" | "typing";
  text?: string;
  file?: string;
  cite?: string;
};

function ChatDemo() {
  const [visibleCount, setVisibleCount] = useState(2);
  const [interacted, setInteracted] = useState(false);
  const [extraMessages, setExtraMessages] = useState<ChatMessage[]>([]);
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    if (interacted) return;
    if (visibleCount >= CHAT_SEQUENCE.length) {
      const restart = setTimeout(() => setVisibleCount(2), 5000);
      return () => clearTimeout(restart);
    }
    const current = CHAT_SEQUENCE[visibleCount];
    const delay = current.role === "typing" ? current.delay ?? 800 : 1200;
    const t = setTimeout(() => setVisibleCount((c) => c + 1), delay);
    return () => clearTimeout(t);
  }, [visibleCount, interacted]);

  const handleSuggestion = (item: (typeof SUGGESTED_QA)[number]) => {
    if (answering) return;
    // Freeze the auto-play loop and show the full scripted sequence
    setInteracted(true);
    setVisibleCount(CHAT_SEQUENCE.length);
    setAnswering(true);
    setExtraMessages((m) => [
      ...m,
      { role: "user", text: item.q },
      { role: "typing" },
    ]);
    setTimeout(() => {
      setExtraMessages((m) => [
        ...m.filter((x) => x.role !== "typing"),
        { role: "themis", text: item.a, cite: item.cite },
      ]);
      setAnswering(false);
    }, 800);
  };

  const messages: ChatMessage[] = [
    ...CHAT_SEQUENCE.slice(0, visibleCount),
    ...extraMessages,
  ];

  // Keep the latest message in view as the conversation grows
  useEffect(() => {
    const el = document.getElementById("sophia-chat-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleCount, extraMessages]);

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
      <div
        id="sophia-chat-scroll"
        className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto"
        style={{ maxHeight: 420, scrollBehavior: "smooth" }}
      >
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

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {SUGGESTED_QA.map((item) => (
          <button
            key={item.q}
            onClick={() => handleSuggestion(item)}
            disabled={answering}
            className="text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer text-left"
            style={{
              background: "#1d1d24",
              border: "1px solid #7c5cff35",
              color: "#c4b5fd",
              opacity: answering ? 0.5 : 1,
            }}
          >
            {item.q}
          </button>
        ))}
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

function SavingsCalculator() {
  const [props, setProps] = useState(3);

  const hours = props * 4; // 4 h/mes por copropiedad redactando documentos
  const minutesWithSophia = props * 3; // ~3 min por generación
  const savings = hours * 35000; // valor hora $35.000 COP

  return (
    <section
      className="py-24 px-6"
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10 flex flex-col gap-3">
          <p
            className="text-xs font-medium tracking-widest uppercase sophia-mono"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Calculadora
          </p>
          <h2
            style={{
              fontSize: "clamp(28px, 3vw, 44px)",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              color: "rgba(255,255,255,0.95)",
            }}
          >
            ¿Cuánto te ahorra{" "}
            <em style={{ fontStyle: "italic", color: "#a78bff" }}>SOPH.IA</em>?
          </h2>
        </div>

        <div
          className="rounded-3xl p-8 sm:p-12 flex flex-col gap-10"
          style={{
            background: "linear-gradient(145deg, #1a1530, #15151a)",
            border: "1px solid #7c5cff45",
            boxShadow: "0 0 48px #7c5cff22, 0 0 0 1px #7c5cff22",
          }}
        >
          {/* Input */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="sophia-props-slider"
                className="text-sm"
                style={{ color: "rgba(255,255,255,0.65)" }}
              >
                ¿Cuántas copropiedades administras?
              </label>
              <span
                className="sophia-mono font-bold px-4 py-1.5 rounded-lg text-lg"
                style={{
                  background: "#7c5cff22",
                  border: "1px solid #7c5cff45",
                  color: "#a78bff",
                }}
              >
                {props}
              </span>
            </div>
            <input
              id="sophia-props-slider"
              type="range"
              min={1}
              max={30}
              value={props}
              onChange={(e) => setProps(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: "#7c5cff" }}
            />
            <div
              className="flex justify-between text-xs sophia-mono"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              <span>1</span>
              <span>30</span>
            </div>
          </div>

          {/* Results */}
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="flex flex-col gap-1.5">
              <p
                className="text-xs sophia-mono uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Horas recuperadas al mes
              </p>
              <p
                className="sophia-mono font-bold"
                style={{
                  fontSize: "clamp(32px, 4vw, 48px)",
                  color: "#7c5cff",
                  lineHeight: 1.1,
                }}
              >
                {hours} h{" "}
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.5em" }}>
                  → ~{minutesWithSophia} min
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p
                className="text-xs sophia-mono uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Equivalente
              </p>
              <p
                className="sophia-mono font-bold"
                style={{
                  fontSize: "clamp(32px, 4vw, 48px)",
                  color: "#7c5cff",
                  lineHeight: 1.1,
                }}
              >
                ${savings.toLocaleString("es-CO")}{" "}
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.5em" }}>
                  COP/mes
                </span>
              </p>
            </div>
          </div>

          <p
            className="text-xs sophia-mono"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Estimación: 4 h/mes por copropiedad en informes, actas y
            presentaciones · valor hora $35.000 COP.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function LandingPage() {
  const [agentHover, setAgentHover] = useState<number | null>(null);

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
        @keyframes sophiaWhatsPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.35), 0 0 0 0 rgba(37,211,102,0.35); }
          50% { box-shadow: 0 4px 20px rgba(0,0,0,0.35), 0 0 0 12px rgba(37,211,102,0); }
        }

        .sophia-navlink {
          color: rgba(255,255,255,0.6);
          transition: color 0.2s;
        }
        .sophia-navlink:hover { color: #fff; }

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
          <div className="hidden md:flex items-center gap-7">
            <Link href="#agentes" className="sophia-navlink text-sm">
              Agentes
            </Link>
            <Link href="#planes" className="sophia-navlink text-sm">
              Planes
            </Link>
            <Link href="#como-funciona" className="sophia-navlink text-sm">
              Cómo funciona
            </Link>
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
              href="/login?mode=register"
              className="flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "#7c5cff", color: "#fff" }}
            >
              Probar 7 días gratis
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
                  href="/login?mode=register"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "#7c5cff", color: "#fff" }}
                >
                  Probar 7 días gratis
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  <FileOutput size={14} />
                  Ver documentos de ejemplo
                </Link>
              </div>
              <p
                className="text-xs sophia-mono"
                style={{ color: "rgba(255,255,255,0.35)", marginTop: -12 }}
              >
                7 días gratis con límites del plan Pro · sin tarjeta · luego
                eliges plan
              </p>

              {/* Honest value row */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {[
                  { Icon: ShieldCheck, text: "Conforme Ley 675 de 2001" },
                  { Icon: Lock, text: "Datos alojados con cifrado" },
                  { Icon: MapPin, text: "Hecho en Colombia · CO" },
                ].map(({ Icon, text }) => (
                  <span
                    key={text}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sophia-mono"
                    style={{
                      background: "#15151a",
                      border: "1px solid rgba(255,255,255,0.09)",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    <Icon size={11} style={{ color: "#a78bff" }} />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT — Floating doc cards */}
            <div className="relative flex flex-col items-center">
              <div
                className="docs-fan relative"
                style={{ height: 340, width: 320 }}
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
          id="agentes"
          className="py-24 px-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", scrollMarginTop: 80 }}
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
                            background: "rgba(124,92,255,0.10)",
                            border: "1px solid rgba(124,92,255,0.30)",
                            color: "#9a7fff",
                          }}
                        >
                          Próximamente
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
                { num: "3", label: "documentos por generación" },
                { num: "675", label: "ley citada artículo por artículo" },
                { num: "~3min", label: "por generación" },
                { num: "2", label: "agentes IA disponibles hoy" },
                { num: "4", label: "agentes más en camino" },
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
                <FileCheck2 size={13} style={{ color: "#7c5cff" }} />
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
                  SOPH.IA
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. CÓMO FUNCIONA EN 3 PASOS ── */}
        <section
          id="como-funciona"
          className="py-24 px-6"
          style={{ scrollMarginTop: 80 }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="mb-12 flex flex-col gap-3">
              <p
                className="text-xs font-medium tracking-widest uppercase sophia-mono"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Cómo funciona
              </p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "rgba(255,255,255,0.95)",
                }}
              >
                Cómo funciona en{" "}
                <em style={{ fontStyle: "italic", color: "#a78bff" }}>
                  3 pasos
                </em>
                .
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  num: "01",
                  Icon: Upload,
                  title: "Sube tus archivos del mes",
                  desc: "Excel de cartera, PDF de extractos, fotos de mantenimiento. Arrastra y listo.",
                },
                {
                  num: "02",
                  Icon: Sparkles,
                  title: "La IA redacta informe, acta y presentación",
                  desc: "Los agentes cruzan tus datos con tu reglamento y la Ley 675, artículo por artículo.",
                },
                {
                  num: "03",
                  Icon: Download,
                  title: "Revisas, ajustas y descargas",
                  desc: "Editas lo que quieras y exportas en PDF, DOCX o PPTX, listos para firmar.",
                },
              ].map(({ num, Icon, title, desc }) => (
                <div
                  key={num}
                  className="relative overflow-hidden rounded-2xl p-7 flex flex-col gap-4"
                  style={{
                    background: "#15151a",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="sophia-mono font-bold"
                      style={{ fontSize: 40, color: "#7c5cff", lineHeight: 1 }}
                    >
                      {num}
                    </span>
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        background: "#7c5cff20",
                        border: "1px solid #7c5cff40",
                      }}
                    >
                      <Icon size={18} style={{ color: "#a78bff" }} />
                    </div>
                  </div>
                  <div>
                    <p
                      className="font-semibold mb-1.5"
                      style={{ fontSize: 17, color: "rgba(255,255,255,0.9)" }}
                    >
                      {title}
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7b. SAVINGS CALCULATOR ── */}
        <SavingsCalculator />

        {/* ── 8. PRICING ── */}
        <section
          id="planes"
          className="py-24 px-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)", scrollMarginTop: 80 }}
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
              <p
                className="text-sm sophia-mono"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                7 días gratis con límites del plan Pro · sin tarjeta · luego
                eliges plan
              </p>
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
                  <p
                    className="text-xs sophia-mono mb-2"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    ≈ $80.000 COP/mes
                  </p>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs sophia-mono"
                    style={{
                      background: "#7c5cff18",
                      border: "1px solid #7c5cff35",
                      color: "#a78bff",
                    }}
                  >
                    7 días gratis · sin tarjeta
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
                  href="/login?mode=register"
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
                  <p
                    className="text-xs sophia-mono"
                    style={{ color: "rgba(196,181,253,0.45)" }}
                  >
                    ≈ $800.000 COP/mes
                  </p>
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
                  href="/login?mode=register"
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
                    className="text-xs sophia-mono uppercase tracking-wider mb-1"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Más agentes · Próximamente
                  </p>
                  <p
                    className="text-sm leading-relaxed mt-3"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    Estos agentes especializados se lanzarán como complementos
                    de tu plan. Themis y Chronos ya están incluidos hoy.
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
                        className="text-[10px] font-semibold sophia-mono uppercase"
                        style={{ color: "#a78bff", letterSpacing: "0.08em" }}
                      >
                        Próximamente
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p
              className="text-center text-xs sophia-mono mt-8"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Cobro procesado en COP por ePayco a la tasa del día.
            </p>
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
                  href="/login?mode=register"
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
                  ["Agentes", "#agentes"],
                  ["Precios", "#planes"],
                  ["Demo", "/demo"],
                ],
              },
              {
                title: "Legal",
                links: [
                  ["Términos de uso", "/legal/terminos"],
                  ["Privacidad", "/legal/privacidad"],
                  ["Habeas Data", "/legal/habeas-data"],
                ],
              },
              {
                title: "Contacto",
                links: [
                  ["WhatsApp", WHATSAPP_URL],
                  ["Email", "mailto:soporte@sophiagrouph.com"],
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
                      {href.startsWith("http") || href.startsWith("mailto:") ? (
                        <a
                          href={href}
                          target={href.startsWith("http") ? "_blank" : undefined}
                          rel={
                            href.startsWith("http")
                              ? "noopener noreferrer"
                              : undefined
                          }
                          className="text-sm transition-colors"
                          style={{ color: "rgba(255,255,255,0.45)" }}
                        >
                          {label}
                        </a>
                      ) : (
                        <Link
                          href={href}
                          className="text-sm transition-colors"
                          style={{ color: "rgba(255,255,255,0.45)" }}
                        >
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </footer>

        {/* ── FLOATING WHATSAPP BUTTON ── */}
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Soporte por WhatsApp"
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full transition-transform hover:scale-105"
          style={{
            width: 56,
            height: 56,
            background: "#25D366",
            animation: "sophiaWhatsPulse 2.5s ease-in-out infinite",
          }}
        >
          <svg viewBox="0 0 24 24" width={28} height={28} fill="#fff">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </a>
      </div>
    </>
  );
}
