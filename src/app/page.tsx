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
  Wallet,
  PieChart,
  Users,
  MessageSquare,
  CalendarClock,
  BadgeCheck,
  Gavel,
  CreditCard,
  MessageCircle,
  QrCode,
  Clock,
} from "lucide-react";
import { COMING_SOON, type ComingSoonKey } from "@/lib/feature-flags";
import { tinte } from "@/lib/tinte";

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

const AGENTS = [
  {
    name: "Themis",
    color: "var(--accent-text)",
    icon: Scale,
    included: true,
    role: "Asesora legal",
    desc: "Ley 675, actas, asambleas, quórum.",
  },
  {
    name: "Chronos",
    color: "var(--info-text)",
    icon: Clock4,
    included: true,
    role: "Plazos",
    desc: "Vencimientos, asambleas, SG-SST.",
  },
  {
    name: "Metra",
    color: "var(--ok-text)",
    icon: BarChart3,
    included: false,
    role: "Analista financiera",
    desc: "Presupuesto, cartera, proyección.",
  },
  {
    name: "Nomethes",
    color: "var(--warn-text)",
    icon: Lightbulb,
    included: false,
    role: "Consultor decisiones",
    desc: "Pros/contras, escenarios, votaciones.",
  },
  {
    name: "Hermes",
    color: "var(--pink)",
    icon: Send,
    included: false,
    role: "Redactor comunicaciones",
    desc: "Circulares, convocatorias, anuncios.",
  },
  {
    name: "Logistes",
    color: "var(--logistes)",
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

/**
 * Un bullet de plan. `soon` lo ata a COMING_SOON (src/lib/feature-flags.ts):
 * mientras esa función esté pausada, el bullet se muestra atenuado y con la
 * marca "pronto", en vez de venderse como incluido. Sin esto se cobraba Pro y
 * Business por seis módulos que en el panel dicen "Próximamente".
 */
type PlanFeature = string | { text: string; soon: ComingSoonKey };

const PRO_FEATURES: PlanFeature[] = [
  "Hasta 3 propiedades",
  "15 generaciones al mes · PDF, DOCX y PPTX",
  "Themis + Chronos incluidos",
  "Calendario de cumplimiento automático",
  { text: "Comunicados con IA · 500 correos/mes", soon: "comunicados" },
  { text: "Certificados y paz y salvos con QR", soon: "certificados" },
  { text: "Convocatorias y control de términos", soon: "asambleas" },
];

const BUSINESS_FEATURES: PlanFeature[] = [
  "Hasta 10 propiedades",
  "40 generaciones al mes · PDF, DOCX y PPTX",
  "Todo lo de Pro · 3.000 correos/mes",
  { text: "Cartera: cuotas, pagos y estados de cuenta", soon: "cartera" },
  { text: "Cobro con IA, mora e intereses de ley", soon: "cartera" },
  { text: "Presupuesto, fondo del 1% y export contable", soon: "presupuesto" },
  { text: "Portal del residente + PQRS + pago en línea", soon: "pqrs" },
];

const ELITE_FEATURES: PlanFeature[] = [
  "Propiedades ilimitadas",
  "100 generaciones al mes · PDF, DOCX y PPTX",
  "Todo lo de Business · 15.000 correos/mes",
  "Portafolio consolidado de tus copropiedades",
  "Generación en lote de todos los informes",
  "Soporte prioritario · WhatsApp directo",
];

/** Renderiza un bullet de plan, atenuándolo si su función está pausada. */
function PlanFeatureRow({ feature, color }: { feature: PlanFeature; color: string }) {
  const text = typeof feature === "string" ? feature : feature.text;
  const pending = typeof feature !== "string" && COMING_SOON[feature.soon];
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {pending ? (
        <Clock size={15} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
      ) : (
        <Check size={15} style={{ color, flexShrink: 0 }} />
      )}
      <span style={{ color: pending ? "var(--ink-3)" : "var(--ink-2)" }}>
        {text}
        {pending && (
          <span
            className="sophia-mono ml-1.5"
            style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent-text)" }}
          >
            pronto
          </span>
        )}
      </span>
    </li>
  );
}

const ADDON_AGENTS = [
  { name: "Metra", role: "Analista financiera", color: "var(--ok-text)" },
  { name: "Nomethes", role: "Consultor decisiones", color: "var(--warn-text)" },
  { name: "Hermes", role: "Redactor comunicaciones", color: "var(--pink)" },
  { name: "Logistes", role: "Coordinador operativo", color: "var(--logistes)" },
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
        background: "var(--surface-2)",
        border: "1px solid rgb(var(--veil-rgb) / 0.07)",
        minHeight: 420,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: "linear-gradient(90deg,rgb(var(--accent-rgb) / 0.133),rgb(var(--accent-rgb) / 0.067))",
          borderBottom: "1px solid rgb(var(--veil-rgb) / 0.07)",
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          T
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--accent-pale)" }}>
            Themis
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--accent-text)", fontFamily: "monospace" }}
          >
            Asesora legal · en línea
          </p>
        </div>
        <div
          className="ml-auto w-2 h-2 rounded-full"
          style={{
            background: "var(--ok)",
            boxShadow: "0 0 6px var(--ok)",
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
                  style={{ background: "rgb(var(--accent-rgb) / 0.2)", color: "var(--accent-text)" }}
                >
                  T
                </div>
                <div
                  className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-bl-none"
                  style={{ background: "var(--surface-3)" }}
                >
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: "var(--accent)",
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
                  style={{ background: "var(--surface-4)", color: "var(--accent-pale)" }}
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
                style={{ background: "rgb(var(--accent-rgb) / 0.2)", color: "var(--accent-text)" }}
              >
                T
              </div>
              <div className="flex flex-col gap-2 max-w-[80%]">
                <div
                  className="px-4 py-2.5 rounded-2xl rounded-tl-none text-sm"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--ink)",
                  }}
                >
                  {msg.text}
                  {msg.file && (
                    <div
                      className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg"
                      style={{ background: "rgb(var(--accent-rgb) / 0.102)", border: "1px solid rgb(var(--accent-rgb) / 0.267)" }}
                    >
                      <Paperclip
                        size={13}
                        style={{ color: "var(--accent-text)" }}
                      />
                      <span
                        className="text-xs font-mono"
                        style={{ color: "var(--accent-text)" }}
                      >
                        {msg.file}
                      </span>
                      <Download
                        size={12}
                        style={{ color: "var(--accent-text)", marginLeft: "auto" }}
                      />
                    </div>
                  )}
                  {msg.cite && (
                    <div
                      className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-mono"
                      style={{
                        background: "rgb(var(--accent-rgb) / 0.133)",
                        border: "1px solid rgb(var(--accent-rgb) / 0.333)",
                        color: "var(--accent-pale)",
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
              background: "var(--surface-3)",
              border: "1px solid rgb(var(--accent-rgb) / 0.208)",
              color: "var(--accent-pale)",
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
        style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)" }}
      >
        <div
          className="flex-1 rounded-xl px-4 py-2 text-xs"
          style={{
            background: "var(--surface-4)",
            color: "var(--ink-4)",
            border: "1px solid rgb(var(--veil-rgb) / 0.07)",
          }}
        >
          Escribe a Themis...
        </div>
        <button
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent)" }}
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
        background: "var(--surface-3)",
        border: "1px solid rgb(var(--veil-rgb) / 0.09)",
        transform: rotate,
        zIndex,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold" style={{ color: "var(--accent-pale)" }}>
          {title}
        </p>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded"
          style={{
            background: "rgb(var(--accent-rgb) / 0.133)",
            color: "var(--accent-text)",
            border: "1px solid rgb(var(--accent-rgb) / 0.2)",
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
              background: "rgb(var(--veil-rgb) / 0.08)",
              width: `${65 + ((i * 37) % 35)}%`,
            }}
          />
        ))}
      </div>
      {semaforo && (
        <div className="flex gap-2 mt-2">
          {(
            [
              ["var(--ok)", "Cumplido"],
              ["var(--warn)", "Parcial"],
              ["var(--pink)", "Pendiente"],
            ] as [string, string][]
          ).map(([color, label]) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              <span
                className="text-[9px] font-mono"
                style={{ color: "var(--ink-3)" }}
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
      style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)" }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10 flex flex-col gap-3">
          <p
            className="text-xs font-medium tracking-widest uppercase sophia-mono"
            style={{ color: "var(--ink-4)" }}
          >
            Calculadora
          </p>
          <h2
            style={{
              fontSize: "clamp(28px, 3vw, 44px)",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              color: "var(--ink)",
            }}
          >
            ¿Cuánto te ahorra{" "}
            <em style={{ fontStyle: "italic", color: "var(--accent-text)" }}>SOPH.IA</em>?
          </h2>
        </div>

        <div
          className="rounded-3xl p-8 sm:p-12 flex flex-col gap-10"
          style={{
            background: "linear-gradient(145deg, #1a1530, var(--surface-2))",
            border: "1px solid rgb(var(--accent-rgb) / 0.271)",
            boxShadow: "0 0 48px rgb(var(--accent-rgb) / 0.133), 0 0 0 1px rgb(var(--accent-rgb) / 0.133)",
          }}
        >
          {/* Input */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="sophia-props-slider"
                className="text-sm"
                style={{ color: "var(--ink-2)" }}
              >
                ¿Cuántas copropiedades administras?
              </label>
              <span
                className="sophia-mono font-bold px-4 py-1.5 rounded-lg text-lg"
                style={{
                  background: "rgb(var(--accent-rgb) / 0.133)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.271)",
                  color: "var(--accent-text)",
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
              style={{ accentColor: "var(--accent)" }}
            />
            <div
              className="flex justify-between text-xs sophia-mono"
              style={{ color: "var(--ink-4)" }}
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
                style={{ color: "var(--ink-4)" }}
              >
                Horas recuperadas al mes
              </p>
              <p
                className="sophia-mono font-bold"
                style={{
                  fontSize: "clamp(32px, 4vw, 48px)",
                  color: "var(--accent-text)",
                  lineHeight: 1.1,
                }}
              >
                {hours} h{" "}
                <span style={{ color: "var(--ink-4)", fontSize: "0.5em" }}>
                  → ~{minutesWithSophia} min
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p
                className="text-xs sophia-mono uppercase tracking-wider"
                style={{ color: "var(--ink-4)" }}
              >
                Equivalente
              </p>
              <p
                className="sophia-mono font-bold"
                style={{
                  fontSize: "clamp(32px, 4vw, 48px)",
                  color: "var(--accent-text)",
                  lineHeight: 1.1,
                }}
              >
                ${savings.toLocaleString("es-CO")}{" "}
                <span style={{ color: "var(--ink-4)", fontSize: "0.5em" }}>
                  COP/mes
                </span>
              </p>
            </div>
          </div>

          <p
            className="text-xs sophia-mono"
            style={{ color: "var(--ink-4)" }}
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
          0%, 100% { box-shadow: 0 0 0 0 rgb(var(--accent-rgb) / 0.2); }
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
          color: var(--ink-2);
          transition: color 0.2s;
        }
        .sophia-navlink:hover { color: var(--ink); }

        .sophia-page {
          font-family: 'Geist', system-ui, sans-serif;
          background: var(--surface-0);
          color: var(--ink);
          overflow-x: hidden;
        }
        .sophia-mono {
          font-family: 'Geist Mono', monospace;
        }
        .sophia-hairline {
          border-color: rgb(var(--veil-rgb) / 0.07);
        }
        .sophia-surface-1 { background: var(--surface-2); }
        .sophia-surface-2 { background: var(--surface-3); }
        .sophia-surface-3 { background: var(--surface-4); }

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
            background: "rgb(var(--surface-rgb) / 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid rgb(var(--veil-rgb) / 0.07)",
          }}
        >
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-base"
              style={{
                background: "linear-gradient(135deg,var(--accent),var(--accent-hi))",
                color: "#fff",
                boxShadow: "0 2px 12px rgb(var(--accent-rgb) / 0.267)",
              }}
            >
              S
            </div>
            <span className="font-semibold text-base tracking-tight">
              SOPH
              <span style={{ color: "var(--ink-4)" }}>.</span>
              <span style={{ color: "var(--accent-text)" }}>IA</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-7">
            <Link href="#plataforma" className="sophia-navlink text-sm">
              Plataforma
            </Link>
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
                color: "var(--ink-2)",
                border: "1px solid rgb(var(--veil-rgb) / 0.12)",
              }}
            >
              Ingresar
            </Link>
            <Link
              href="/login?mode=register"
              className="flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Entrar gratis
            </Link>
          </div>
        </nav>

        {/* ── 2. HERO ── */}
        <section className="relative pt-24 pb-20 px-6" style={{ minHeight: "92vh" }}>
          {/* Background orbs */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 80,
              left: "20%",
              width: 560,
              height: 560,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgb(var(--accent-rgb) / 0.3), rgb(var(--accent-rgb) / 0.06) 45%, transparent 72%)",
              animation: "sophiaOrbDrift 14s ease-in-out infinite",
              filter: "blur(90px)",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              top: 180,
              right: "8%",
              width: 620,
              height: 620,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(167,139,255,0.22), rgba(90,60,240,0.08) 50%, transparent 74%)",
              animation: "sophiaOrbDrift 18s 3s ease-in-out infinite reverse",
              filter: "blur(100px)",
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
                    background: "rgb(var(--warn-rgb) / 0.125)",
                    border: "1px solid rgb(var(--warn-rgb) / 0.251)",
                    color: "var(--warn-text)",
                  }}
                >
                  <Scale size={11} />
                  conforme · Ley 675 de 2001
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sophia-mono"
                  style={{
                    background: "rgb(var(--ok-rgb) / 0.125)",
                    border: "1px solid rgb(var(--ok-rgb) / 0.251)",
                    color: "var(--ok-text)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "var(--ok)",
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
                  fontSize: "clamp(38px, 4.6vw, 62px)",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  color: "var(--ink)",
                }}
              >
                Administra tu copropiedad{" "}
                <em
                  style={{
                    fontStyle: "italic",
                    color: "var(--accent-text)",
                    fontWeight: 500,
                  }}
                >
                  completa
                </em>
                , no solo sus papeles.
              </h1>

              {/* Body */}
              <p
                className="text-base leading-relaxed"
                style={{ color: "var(--ink-3)", maxWidth: 480 }}
              >
                {/* Encabeza con lo que HOY funciona. Cartera, presupuesto,
                    asambleas y comunicados siguen en el mapa de la sección
                    Plataforma, marcados como próximos — prometerlos aquí como
                    disponibles era vender lo que el panel aún no entrega. */}
                Informe de gestión, acta y presentación listos para firmar, la
                bitácora de zonas comunes y pólizas al día, y un portal para tus
                residentes — con seis agentes IA que conocen la Ley 675.
              </p>

              {/* Buttons */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login?mode=register"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Entrar gratis
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: "transparent",
                    border: "1px solid rgb(var(--veil-rgb) / 0.15)",
                    color: "var(--ink-2)",
                  }}
                >
                  <FileOutput size={14} />
                  Ver documentos de ejemplo
                </Link>
              </div>
              <p
                className="text-xs sophia-mono"
                style={{ color: "var(--ink-4)", marginTop: -12 }}
              >
                Gratis durante la fase de pruebas · sin tarjeta
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
                      background: "var(--surface-2)",
                      border: "1px solid rgb(var(--veil-rgb) / 0.09)",
                      color: "var(--ink-3)",
                    }}
                  >
                    <Icon size={11} style={{ color: "var(--accent-text)" }} />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT — Floating doc cards */}
            <div className="relative flex flex-col items-center">
              <div
                className="docs-fan relative"
                style={{ height: 400, width: 320 }}
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
                  className="doc-card-1 absolute top-16 left-4"
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
                  className="doc-card-2 absolute top-32 left-8"
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
                  background: "var(--surface-2)",
                  border: "1px solid rgb(var(--veil-rgb) / 0.09)",
                  color: "var(--ink-2)",
                }}
              >
                <Sparkles size={15} style={{ color: "var(--accent-text)" }} />
                3 documentos generados desde un solo prompt
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. CHAT DEMO BAND ── */}
        <section
          className="py-24 px-6"
          style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)" }}
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
                  color: "var(--ink)",
                }}
              >
                Hablas.{" "}
                <em style={{ fontStyle: "italic", color: "var(--accent-text)" }}>
                  Ella redacta.
                </em>{" "}
                Tú firmas.
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--ink-3)", maxWidth: 440 }}
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
                    color: "var(--accent-text)",
                  },
                  {
                    Icon: Layers,
                    title: "Memoria por copropiedad",
                    desc: "Themis recuerda el reglamento y los acuerdos previos del Consejo.",
                    color: "var(--info-text)",
                  },
                  {
                    Icon: FileOutput,
                    title: "Exporta donde necesites",
                    desc: "PDF · DOCX · PPTX · listos para tu Consejo.",
                    color: "var(--ok-text)",
                  },
                ].map(({ Icon, title, desc, color }) => (
                  <div key={title} className="flex gap-4 items-start">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${tinte(color, 0.13)}`, border: `1px solid ${tinte(color, 0.25)}` }}
                    >
                      <Icon size={18} style={{ color }} />
                    </div>
                    <div>
                      <p
                        className="text-sm font-semibold mb-0.5"
                        style={{ color: "var(--ink)" }}
                      >
                        {title}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: "var(--ink-3)" }}
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
          style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)", scrollMarginTop: 80 }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="mb-12 flex flex-col gap-3">
              <p
                className="text-xs font-medium tracking-widest uppercase sophia-mono"
                style={{ color: "var(--ink-4)" }}
              >
                Los agentes
              </p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "var(--ink)",
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
                        ? `radial-gradient(circle at 30% 30%, ${tinte(agent.color, 0.09)}, var(--surface-2) 70%)`
                        : `radial-gradient(circle at 30% 30%, ${tinte(agent.color, 0.05)}, var(--surface-2) 70%)`,
                      border: isHovered
                        ? `1px solid ${tinte(agent.color, 0.33)}`
                        : "1px solid rgb(var(--veil-rgb) / 0.07)",
                      boxShadow: isHovered
                        ? `0 8px 32px ${tinte(agent.color, 0.15)}`
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
                          background: `${tinte(agent.color, 0.15)}`,
                          border: `1px solid ${tinte(agent.color, 0.31)}`,
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
                            background: "rgb(var(--ok-rgb) / 0.082)",
                            border: "1px solid rgb(var(--ok-rgb) / 0.188)",
                            color: "var(--ok-text)",
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: "var(--ok)", display: "inline-block" }}
                          />
                          incluido
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium sophia-mono"
                          style={{
                            background: "rgb(var(--accent-rgb) / 0.1)",
                            border: "1px solid rgb(var(--accent-rgb) / 0.3)",
                            color: "var(--accent-text)",
                          }}
                        >
                          Próximamente
                        </span>
                      )}
                    </div>

                    <div>
                      <p
                        className="font-semibold"
                        style={{ fontSize: 22, color: "var(--ink)" }}
                      >
                        {agent.name}
                      </p>
                      <p
                        className="text-xs sophia-mono mt-0.5"
                        style={{ color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}
                      >
                        {agent.role}
                      </p>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--ink-3)", zIndex: 1 }}
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
            background: "var(--surface-1)",
            borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)",
            borderBottom: "1px solid rgb(var(--veil-rgb) / 0.07)",
          }}
        >
          <div className="max-w-7xl mx-auto">
            <h2
              className="text-center mb-12"
              style={{
                fontSize: "clamp(28px, 3vw, 44px)",
                fontWeight: 500,
                letterSpacing: "-0.025em",
                color: "var(--ink)",
              }}
            >
              De{" "}
              <span
                style={{
                  textDecoration: "line-through",
                  color: "var(--ink-4)",
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
                    style={{ fontSize: 56, color: "var(--ink)", lineHeight: 1 }}
                  >
                    <span style={{ color: "var(--accent-text)" }}>·</span>
                    {num}
                  </p>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider"
                    style={{ color: "var(--ink-4)" }}
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
            borderBottom: "1px solid rgb(var(--veil-rgb) / 0.07)",
          }}
        >
          {/* Fade masks */}
          <div
            className="absolute inset-y-0 left-0 z-10 w-24 pointer-events-none"
            style={{
              background: "linear-gradient(to right, var(--surface-0), transparent)",
            }}
          />
          <div
            className="absolute inset-y-0 right-0 z-10 w-24 pointer-events-none"
            style={{
              background: "linear-gradient(to left, var(--surface-0), transparent)",
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
                  background: "var(--surface-2)",
                  border: "1px solid rgb(var(--veil-rgb) / 0.07)",
                }}
              >
                <FileCheck2 size={13} style={{ color: "var(--accent-text)" }} />
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--ink-2)" }}
                >
                  {name}
                </span>
                <span
                  className="text-xs sophia-mono"
                  style={{ color: "var(--ink-4)" }}
                >
                  SOPH.IA
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 6b. PLATAFORMA COMPLETA ── */}
        <section id="plataforma" className="py-24 px-6" style={{ scrollMarginTop: 80 }}>
          <div className="max-w-7xl mx-auto">
            <div className="mb-12 flex flex-col gap-3">
              <p
                className="text-xs font-medium tracking-widest uppercase sophia-mono"
                style={{ color: "var(--ink-4)" }}
              >
                La plataforma
              </p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "var(--ink)",
                }}
              >
                Todo lo que un administrador hace,{" "}
                <em style={{ fontStyle: "italic", color: "var(--accent-text)" }}>en un solo lugar</em>.
              </h2>
              <p
                className="text-base leading-relaxed"
                style={{ color: "var(--ink-3)", maxWidth: 640 }}
              >
                No es solo generar documentos. SOPH.IA cubre el ciclo completo: cobrar, rendir
                cuentas, convocar, comunicar y responderle a los residentes.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  Icon: Wallet,
                  color: "var(--ok-text)",
                  title: "Cartera y recaudo",
                  soon: "cartera" as const,
                  desc: "Causa las cuotas del mes con un clic, registra pagos que se aplican solos al cobro más antiguo, y entrega estados de cuenta con tu logo.",
                  tag: "Business",
                },
                {
                  Icon: MessageSquare,
                  color: "var(--danger-text)",
                  title: "Cobro de cartera con IA",
                  soon: "cartera" as const,
                  desc: "Cartera por edades, intereses de mora dentro del tope legal, y cartas de cobro —de recordatorio a prejurídico— redactadas con la deuda real.",
                  tag: "Business",
                },
                {
                  Icon: PieChart,
                  color: "var(--warn-text)",
                  title: "Presupuesto y ejecución",
                  soon: "presupuesto" as const,
                  desc: "Presupuesto anual por rubros, ejecutado vs presupuestado, fondo de imprevistos del 1% vigilado, y exporte a Excel para tu contador.",
                  tag: "Business",
                },
                {
                  Icon: Users,
                  color: "var(--info-text)",
                  title: "Portal del residente",
                  desc: "Cada unidad recibe un enlace privado para ver su estado de cuenta, comunicados y documentos. Sin usuarios ni contraseñas que administrar.",
                  tag: "Business",
                },
                {
                  Icon: CreditCard,
                  color: "var(--accent-text)",
                  title: "Pago en línea",
                  desc: "Tus residentes pagan la administración desde el portal y el pago se concilia solo en tu cartera. El dinero llega directo a tu cuenta.",
                  tag: "Business",
                },
                {
                  Icon: MessageCircle,
                  color: "#25D366",
                  title: "WhatsApp integrado",
                  desc: "El residente te escribe desde su portal y el mensaje llega identificado con su unidad. Recordatorios de pago y enlaces, listos para enviar.",
                },
                {
                  Icon: CalendarClock,
                  color: "var(--teal)",
                  title: "Calendario de cumplimiento",
                  desc: "Asamblea ordinaria, póliza de zonas comunes, ascensores, piscina, SG-SST y fondo de imprevistos: se generan solos según tu edificio.",
                },
                {
                  Icon: Gavel,
                  color: "var(--logistes)",
                  title: "Asambleas",
                  soon: "asambleas" as const,
                  desc: "Convocatoria formal que valida los 15 días de ley, y control automático de términos: acta en 20 días hábiles e impugnación a 2 meses.",
                },
                {
                  Icon: BadgeCheck,
                  color: "var(--ok-text)",
                  title: "Certificados con QR",
                  soon: "certificados" as const,
                  desc: "Paz y salvos y constancias de residencia con código QR: cualquiera verifica en línea si son auténticos, están vencidos o revocados.",
                },
                {
                  Icon: Send,
                  color: "var(--pink)",
                  title: "Comunicados",
                  soon: "comunicados" as const,
                  desc: "Describe la circular en una línea y la IA la redacta. Se envía con tu marca a cada residente, sin que vean los correos de los demás.",
                },
                {
                  Icon: QrCode,
                  color: "var(--warn-text)",
                  title: "PQRS y asistente del reglamento",
                  soon: "pqrs" as const,
                  desc: "Los residentes radican peticiones con número de seguimiento, y una IA les responde dudas leyendo el reglamento de tu copropiedad.",
                  tag: "Business",
                },
                {
                  Icon: Layers,
                  color: "var(--accent-text)",
                  title: "Portafolio y lote",
                  desc: "¿Administras decenas de copropiedades? Vista consolidada y generación de todos los informes del mes en una sola acción.",
                  tag: "Élite",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="ui-card ui-card-interactive ui-sheen p-6 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex items-center justify-center rounded-xl flex-shrink-0"
                      style={{
                        width: 40,
                        height: 40,
                        background: `${tinte(f.color, 0.09)}`,
                        border: `1px solid ${tinte(f.color, 0.21)}`,
                      }}
                    >
                      <f.Icon className="h-5 w-5" style={{ color: f.color }} />
                    </div>
                    {/* La insignia se deriva de COMING_SOON: si una función se
                        reactiva en feature-flags.ts, la venta se actualiza sola.
                        Sin esto la landing seguía ofreciendo como disponibles
                        seis módulos que en el panel dicen "Próximamente". */}
                    {"soon" in f && f.soon && COMING_SOON[f.soon] ? (
                      <span
                        className="sophia-mono px-2 py-1 rounded-full whitespace-nowrap"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          background: "rgb(var(--accent-rgb) / 0.12)",
                          border: "1px solid rgb(var(--accent-rgb) / 0.3)",
                          color: "var(--accent-text)",
                        }}
                      >
                        Próximamente
                      </span>
                    ) : (
                      f.tag && (
                        <span
                          className="sophia-mono px-2 py-1 rounded-full"
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            background: "rgb(var(--veil-rgb) / 0.05)",
                            border: "1px solid rgb(var(--veil-rgb) / 0.1)",
                            color: "var(--ink-3)",
                          }}
                        >
                          {f.tag}
                        </span>
                      )
                    )}
                  </div>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                      color: "var(--ink)",
                    }}
                  >
                    {f.title}
                  </h3>
                  <p
                    className="text-[13.5px] leading-relaxed"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Import IA highlight */}
            <div
              className="ui-card ui-sheen mt-4 p-6 flex flex-col md:flex-row md:items-center gap-5"
              style={{ borderColor: "rgb(var(--accent-rgb) / 0.28)" }}
            >
              <div
                className="flex items-center justify-center rounded-2xl flex-shrink-0"
                style={{
                  width: 52,
                  height: 52,
                  background: "rgb(var(--accent-rgb) / 0.12)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.3)",
                }}
              >
                <Upload className="h-6 w-6" style={{ color: "var(--accent-text)" }} />
              </div>
              <div className="flex-1">
                <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>
                  Empezar no te toma una tarde: toma un archivo
                </h3>
                <p
                  className="text-[13.5px] leading-relaxed mt-1"
                  style={{ color: "var(--ink-3)" }}
                >
                  Sube el Excel, PDF o Word donde ya tienes tus unidades — aunque esté
                  desordenado. La IA identifica apartamento, propietario, correo, teléfono,
                  coeficiente y cuota, y te muestra la lista para que la revises antes de crearla.
                </p>
              </div>
            </div>
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
                style={{ color: "var(--ink-4)" }}
              >
                Cómo funciona
              </p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "var(--ink)",
                }}
              >
                Cómo funciona en{" "}
                <em style={{ fontStyle: "italic", color: "var(--accent-text)" }}>
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
                    background: "var(--surface-2)",
                    border: "1px solid rgb(var(--veil-rgb) / 0.07)",
                  }}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="sophia-mono font-bold"
                      style={{ fontSize: 40, color: "var(--accent-text)", lineHeight: 1 }}
                    >
                      {num}
                    </span>
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        background: "rgb(var(--accent-rgb) / 0.125)",
                        border: "1px solid rgb(var(--accent-rgb) / 0.251)",
                      }}
                    >
                      <Icon size={18} style={{ color: "var(--accent-text)" }} />
                    </div>
                  </div>
                  <div>
                    <p
                      className="font-semibold mb-1.5"
                      style={{ fontSize: 17, color: "var(--ink)" }}
                    >
                      {title}
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--ink-3)" }}
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
          style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)", scrollMarginTop: 80 }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 flex flex-col gap-3">
              <p
                className="text-xs font-medium tracking-widest uppercase sophia-mono"
                style={{ color: "var(--ink-4)" }}
              >
                Planes
              </p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  color: "var(--ink)",
                }}
              >
                Simple. Transparente. Sin sorpresas.
              </h2>
              <p
                className="text-sm sophia-mono"
                style={{ color: "var(--ink-3)" }}
              >
                Gratis durante la fase de pruebas · sin tarjeta
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
              {/* Col 1 — Pro */}
              <div
                className="rounded-2xl p-7 flex flex-col gap-6"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid rgb(var(--veil-rgb) / 0.09)",
                }}
              >
                <div>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider mb-3"
                    style={{ color: "var(--ink-4)" }}
                  >
                    Plan Pro
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      style={{
                        fontSize: 44,
                        fontWeight: 700,
                        color: "var(--ink)",
                        lineHeight: 1,
                      }}
                    >
                      $99.900
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "var(--ink-3)" }}
                    >
                      COP/mes
                    </span>
                  </div>
                  <p
                    className="text-xs sophia-mono mb-2"
                    style={{ color: "var(--ink-4)" }}
                  >
                    ≈ USD 24
                  </p>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs sophia-mono"
                    style={{
                      background: "rgb(var(--accent-rgb) / 0.094)",
                      border: "1px solid rgb(var(--accent-rgb) / 0.208)",
                      color: "var(--accent-text)",
                    }}
                  >
                    Gratis en fase de pruebas · sin tarjeta
                  </span>
                </div>
                <ul className="flex flex-col gap-3">
                  {PRO_FEATURES.map((f) => (
                    <PlanFeatureRow key={typeof f === "string" ? f : f.text} feature={f} color="var(--accent-text)" />
                  ))}
                  <li className="flex items-center gap-2.5 text-sm">
                    <Minus
                      size={15}
                      style={{ color: "var(--ink-4)", flexShrink: 0 }}
                    />
                    <span style={{ color: "var(--ink-4)" }}>
                      Generar en lote
                    </span>
                  </li>
                </ul>
                <Link
                  href="/login?mode=register"
                  className="block text-center py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    border: "1px solid rgb(var(--veil-rgb) / 0.15)",
                    color: "var(--ink-2)",
                  }}
                >
                  Empezar gratis
                </Link>
              </div>

              {/* Col 2 — Elite (highlighted) */}
              <div
                className="relative rounded-2xl p-7 flex flex-col gap-6"
                style={{
                  background: "linear-gradient(145deg, #1a1530, var(--surface-2))",
                  border: "1px solid rgb(var(--accent-rgb) / 0.333)",
                  boxShadow: "0 0 48px rgb(var(--accent-rgb) / 0.133), 0 0 0 1px rgb(var(--accent-rgb) / 0.133)",
                }}
              >
                {/* Ribbon */}
                <div
                  className="absolute top-4 right-4 text-xs font-medium px-2.5 py-1 rounded-lg sophia-mono text-right"
                  style={{
                    background: "rgb(var(--accent-rgb) / 0.145)",
                    border: "1px solid rgb(var(--accent-rgb) / 0.271)",
                    color: "var(--accent-text)",
                    maxWidth: 140,
                  }}
                >
                  recomendado · 4 a 10 propiedades
                </div>
                <div>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider mb-3"
                    style={{ color: "var(--accent-text)" }}
                  >
                    Plan Business
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      style={{
                        fontSize: 44,
                        fontWeight: 700,
                        color: "var(--accent-pale)",
                        lineHeight: 1,
                      }}
                    >
                      $299.900
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "rgba(196,181,253,0.5)" }}
                    >
                      COP/mes
                    </span>
                  </div>
                  <p
                    className="text-xs sophia-mono"
                    style={{ color: "rgba(196,181,253,0.45)" }}
                  >
                    ≈ USD 73
                  </p>
                </div>
                <ul className="flex flex-col gap-3">
                  {BUSINESS_FEATURES.map((f) => (
                    <PlanFeatureRow key={typeof f === "string" ? f : f.text} feature={f} color="var(--accent-text)" />
                  ))}
                </ul>
                <Link
                  href="/login?mode=register"
                  className="block text-center py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Subir a Business
                </Link>
              </div>

              {/* Col 3 — Elite */}
              <div
                className="rounded-2xl p-7 flex flex-col gap-6"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid rgb(var(--veil-rgb) / 0.09)",
                }}
              >
                <div>
                  <p
                    className="text-xs sophia-mono uppercase tracking-wider mb-3"
                    style={{ color: "var(--ink-4)" }}
                  >
                    Plan Elite
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      style={{
                        fontSize: 44,
                        fontWeight: 700,
                        color: "var(--ink)",
                        lineHeight: 1,
                      }}
                    >
                      $749.900
                    </span>
                    <span className="text-sm" style={{ color: "var(--ink-3)" }}>
                      COP/mes
                    </span>
                  </div>
                  <p
                    className="text-xs sophia-mono mb-2"
                    style={{ color: "var(--ink-4)" }}
                  >
                    ≈ USD 183
                  </p>
                </div>
                <ul className="flex flex-col gap-3">
                  {ELITE_FEATURES.map((f) => (
                    <PlanFeatureRow key={typeof f === "string" ? f : f.text} feature={f} color="var(--accent-text)" />
                  ))}
                </ul>
                <Link
                  href="/login?mode=register"
                  className="block text-center py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    border: "1px solid rgb(var(--veil-rgb) / 0.15)",
                    color: "var(--ink-2)",
                  }}
                >
                  Subir a Elite
                </Link>
              </div>
            </div>

            {/* Coming-soon agents strip */}
            <div
              className="mt-6 rounded-2xl p-6"
              style={{
                background: "var(--surface-2)",
                border: "1px solid rgb(var(--veil-rgb) / 0.09)",
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 14px, rgb(var(--veil-rgb) / 0.015) 14px, rgb(var(--veil-rgb) / 0.015) 15px)",
              }}
            >
              <p
                className="text-xs sophia-mono uppercase tracking-wider mb-1"
                style={{ color: "var(--ink-4)" }}
              >
                Más agentes · Próximamente
              </p>
              <p
                className="text-sm leading-relaxed mb-5"
                style={{ color: "var(--ink-3)" }}
              >
                Estos agentes especializados se lanzarán como complementos de tu
                plan. Themis y Chronos ya están incluidos en todos los planes.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ADDON_AGENTS.map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid rgb(var(--veil-rgb) / 0.07)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: `${tinte(a.color, 0.13)}`,
                        border: `1px solid ${tinte(a.color, 0.25)}`,
                        color: a.color,
                      }}
                    >
                      {a.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                        {a.name}
                      </p>
                      <p
                        className="text-[10px] font-semibold sophia-mono uppercase"
                        style={{ color: "var(--accent-text)", letterSpacing: "0.08em" }}
                      >
                        Próximamente
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p
              className="text-center text-xs sophia-mono mt-8"
              style={{ color: "var(--ink-4)" }}
            >
              Cobro en COP procesado por ePayco. Ahora mismo el acceso es gratuito mientras dura la fase de pruebas.
            </p>
          </div>
        </section>

        {/* ── 9. CTA CARD ── */}
        <section className="py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <div
              className="rounded-3xl p-10 sm:p-14 grid lg:grid-cols-2 gap-10 items-center"
              style={{
                background: "var(--surface-2)",
                border: "1px solid rgb(var(--veil-rgb) / 0.09)",
              }}
            >
              <div className="flex flex-col gap-5">
                <h2
                  className="leading-tight"
                  style={{
                    fontSize: "clamp(26px, 3vw, 40px)",
                    fontWeight: 500,
                    letterSpacing: "-0.025em",
                    color: "var(--ink)",
                  }}
                >
                  Tu próxima acta · lista en tres minutos.
                </h2>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--ink-3)", maxWidth: 380 }}
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
                        background: "var(--surface-4)",
                        border: "1px solid rgb(var(--veil-rgb) / 0.08)",
                        color: "var(--ink-3)",
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
                    background: "var(--accent)",
                    color: "#fff",
                    animation: "sophiaPulse 2.5s infinite",
                  }}
                >
                  Entrar gratis
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── 10. FOOTER ── */}
        <footer
          className="py-14 px-6"
          style={{ borderTop: "1px solid rgb(var(--veil-rgb) / 0.07)" }}
        >
          <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-5 gap-10">
            {/* Brand */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-base"
                  style={{
                    background: "linear-gradient(135deg,var(--accent),var(--accent-hi))",
                    color: "#fff",
                  }}
                >
                  S
                </div>
                <span className="font-semibold text-base tracking-tight">
                  SOPH
                  <span style={{ color: "var(--ink-4)" }}>.</span>
                  <span style={{ color: "var(--accent-text)" }}>IA</span>
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--ink-4)", maxWidth: 260 }}
              >
                Inteligencia artificial para administradores de propiedad
                horizontal en Colombia.
              </p>
              <p
                className="text-xs sophia-mono"
                style={{ color: "var(--ink-4)" }}
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
                  style={{ color: "var(--ink-4)" }}
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
                          style={{ color: "var(--ink-3)" }}
                        >
                          {label}
                        </a>
                      ) : (
                        <Link
                          href={href}
                          className="text-sm transition-colors"
                          style={{ color: "var(--ink-3)" }}
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
