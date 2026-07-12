"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { AGENTS, AGENT_IDS, INCLUDED_AGENT_IDS } from "@/lib/agents";
import {
  FilePlus2,
  Scale,
  Building2,
  History,
  ArrowRight,
  Loader2,
  FileText,
  FileCheck2,
  Presentation,
  AlertCircle,
  ArrowUpRight,
  MessageSquare,
  ChevronRight,
} from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Per-agent display data
const AGENT_META: Record<
  string,
  { monogram: string; accentColor: string }
> = {
  themis:   { monogram: "T", accentColor: "#a78bff" },
  chronos:  { monogram: "C", accentColor: "#5fb4ff" },
  metra:    { monogram: "M", accentColor: "#4cd6a0" },
  nomethes: { monogram: "N", accentColor: "#ffb958" },
  hermes:   { monogram: "H", accentColor: "#ff6fa8" },
  logistes: { monogram: "L", accentColor: "#8a92ff" },
};

interface RecentDoc {
  id: string;
  type: string;
  status: string;
  month: number;
  year: number;
  property?: { name: string } | null;
  createdAt: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  full: "Generación completa",
  informe: "Informe de gestión",
  acta: "Acta de Consejo",
  presentacion: "Presentación asamblea",
};

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Maps a generation type to a document badge.
function DocTypeBadge({ type }: { type: string }) {
  const base = "inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase border";
  const monoStyle = { fontFamily: "'Geist Mono', monospace", letterSpacing: "0.16em", fontSize: 10 };
  // acta → DOCX, presentacion → PPTX, informe/full → PDF
  if (type === "presentacion") {
    return <span style={monoStyle} className={`${base} bg-amber-500/15 text-amber-400 border-amber-500/20`}>PPTX</span>;
  }
  if (type === "acta") {
    return <span style={monoStyle} className={`${base} bg-blue-500/15 text-blue-400 border-blue-500/20`}>DOCX</span>;
  }
  return <span style={monoStyle} className={`${base} bg-rose-500/15 text-rose-400 border-rose-500/20`}>PDF</span>;
}

// Mono label helper
const monoLabel = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

export default function DashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(!IS_DEMO);
  const [userName, setUserName] = useState<string>("");
  const [clock, setClock] = useState<{ dateLabel: string; greeting: string } | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);

  useEffect(() => {
    fetch("/api/generations")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecentDocs(data.slice(0, 4));
      })
      .catch(() => {});
  }, []);

  // Compute date + greeting on the client only, to avoid SSR/client hydration
  // mismatch from server vs browser time.
  useEffect(() => {
    const now = new Date();
    const dias = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
    const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
    const dateLabel = `${dias[now.getDay()]} · ${now.getDate()} ${meses[now.getMonth()]} ${now.getFullYear()}`;
    const hour = now.getHours();
    const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
    setClock({ dateLabel, greeting });
  }, []);

  useEffect(() => {
    if (IS_DEMO) return;
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) throw new Error("Profile fetch failed");
        return r.json();
      })
      .then((data) => {
        if (data.onboarded === false && !data.error) {
          router.replace("/dashboard/onboarding");
        } else {
          if (data.name) setUserName(data.name.split(" ")[0]);
          setChecking(false);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#7c5cff" }} />
      </div>
    );
  }

  const firstName = userName || "Administrador";
  const dateLabel = clock?.dateLabel ?? "";
  const greeting = clock?.greeting ?? "Hola";

  const quickActions = [
    {
      href: "/dashboard/generar",
      icon: FilePlus2,
      title: "Generar documentos",
      desc: "Wizard de 4 pasos · ~3 min",
      accentColor: "#7c5cff",
      isPrimary: true,
    },
    {
      href: "/dashboard/asistente/themis",
      icon: Scale,
      title: "Hablar con Themis",
      desc: "Revisar acta o reglamento",
      accentColor: "#a78bff",
      isPrimary: false,
    },
    {
      href: "/dashboard/propiedades",
      icon: Building2,
      title: "Nueva propiedad",
      desc: "Subir reglamento y manual",
      accentColor: "#4cd6a0",
      isPrimary: false,
    },
    {
      href: "/dashboard/historial",
      icon: History,
      title: "Ver historial",
      desc: "38 documentos · 2026",
      accentColor: "#5fb4ff",
      isPrimary: false,
    },
  ];

  return (
    <div>
      <Header title="Dashboard" />

      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-8 max-w-7xl mx-auto">

        {/* ── Top Greeting Strip ─────────────────────────────────────── */}
        <div className="flex flex-col gap-1 pb-2">
          <p style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="dark:block hidden">
            {dateLabel}
          </p>
          <p style={{ ...monoLabel, color: "rgba(10,10,10,0.42)" }} className="dark:hidden block">
            {dateLabel}
          </p>
          <h1 className="text-3xl sm:text-4xl font-medium tracking-[-0.025em] text-foreground">
            {greeting},{" "}
            <span style={{ color: "#7c5cff", fontStyle: "italic" }}>{firstName}.</span>
          </h1>
        </div>

        {/* ── Hero "Generar" Card ─────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background: "radial-gradient(ellipse at 30% 50%, rgba(124,92,255,0.14) 0%, transparent 70%), #15151a",
            border: "1px solid rgba(124,92,255,0.40)",
            padding: "32px",
          }}
        >
          {/* Radial glow */}
          <div
            className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "rgba(124,92,255,0.15)" }}
          />

          <div className="relative flex flex-col lg:flex-row lg:items-center gap-8">
            {/* Left content */}
            <div className="flex-1 min-w-0">
              {/* Chips row */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(76,214,160,0.12)",
                    color: "#4cd6a0",
                    border: "1px solid rgba(76,214,160,0.25)",
                  }}
                >
                  <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#4cd6a0" }} />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#4cd6a0" }} />
                  </span>
                  todo listo para marzo
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(255,185,88,0.12)",
                    color: "#ffb958",
                    border: "1px solid rgba(255,185,88,0.25)",
                  }}
                >
                  <AlertCircle className="h-3 w-3" />
                  2 vencimientos esta semana
                </span>
              </div>

              <h2
                className="text-[30px] font-medium leading-tight mb-3"
                style={{ letterSpacing: "-0.025em", color: "#f6f5f7" }}
              >
                ¿Generamos los documentos de marzo?
              </h2>
              <p className="text-sm mb-7" style={{ color: "rgba(246,245,247,0.66)" }}>
                Promedio del último mes:{" "}
                <strong style={{ color: "#f6f5f7", fontWeight: 600 }}>3 minutos</strong>
                {" · "}3 documentos por copropiedad.
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard/generar">
                  <button
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0"
                    style={{
                      background: "#7c5cff",
                      boxShadow: "0 4px 20px rgba(124,92,255,0.45)",
                    }}
                  >
                    <FilePlus2 className="h-4 w-4" />
                    Generar ahora
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
                <Link href="/dashboard/historial">
                  <button
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5"
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(246,245,247,0.80)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <History className="h-4 w-4" />
                    Ver historial
                  </button>
                </Link>
              </div>
            </div>

            {/* Right: mini doc stack (hidden on mobile) */}
            <div className="hidden lg:flex items-center justify-center flex-shrink-0 w-52 h-40 relative">
              {/* Card 3 — back */}
              <div
                className="absolute right-2 top-6 w-28 h-36 rounded-xl flex items-end pb-4 justify-center"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  transform: "rotate(9deg)",
                }}
              >
                <Presentation className="h-6 w-6" style={{ color: "rgba(255,185,88,0.55)" }} />
              </div>
              {/* Card 2 — mid */}
              <div
                className="absolute right-8 top-3 w-28 h-36 rounded-xl flex items-end pb-4 justify-center"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  transform: "rotate(3deg)",
                }}
              >
                <FileCheck2 className="h-6 w-6" style={{ color: "rgba(95,180,255,0.55)" }} />
              </div>
              {/* Card 1 — front */}
              <div
                className="absolute right-14 top-0 w-28 h-36 rounded-xl flex items-end pb-4 justify-center"
                style={{
                  background: "rgba(124,92,255,0.18)",
                  border: "1px solid rgba(124,92,255,0.40)",
                  transform: "rotate(-2deg)",
                  boxShadow: "0 8px 32px rgba(124,92,255,0.25)",
                }}
              >
                <FileText className="h-6 w-6" style={{ color: "#a78bff" }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Actions Grid ──────────────────────────────────────── */}
        <div>
          <p style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="mb-4 dark:block hidden">
            Accesos rápidos
          </p>
          <p style={{ ...monoLabel, color: "rgba(10,10,10,0.42)" }} className="mb-4 dark:hidden block">
            Accesos rápidos
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div
                  className="group relative overflow-hidden rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{
                    background: action.isPrimary
                      ? `radial-gradient(ellipse at 80% 20%, ${action.accentColor}18 0%, transparent 60%), var(--card)`
                      : "var(--card)",
                    border: action.isPrimary
                      ? `1px solid rgba(124,92,255,0.40)`
                      : "1px solid var(--border)",
                  }}
                >
                  {/* Top row: icon + arrow */}
                  <div className="flex items-start justify-between">
                    <div
                      className="w-[38px] h-[38px] rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${action.accentColor}18` }}
                    >
                      <action.icon className="h-5 w-5" style={{ color: action.accentColor }} />
                    </div>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: action.accentColor }}
                    />
                  </div>

                  {/* Labels */}
                  <div>
                    <p className="text-[14px] font-bold text-foreground leading-snug">
                      {action.title}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {action.desc}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Agents Grid ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="dark:block hidden mb-1">
                Tus agentes
              </p>
              <p style={{ ...monoLabel, color: "rgba(10,10,10,0.42)" }} className="dark:hidden block mb-1">
                Tus agentes
              </p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Especialistas IA para Propiedad Horizontal
              </p>
            </div>
            <Link
              href="/dashboard/asistente"
              className="text-xs font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: "#a78bff" }}
            >
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {AGENT_IDS.map((id) => {
              const agent = AGENTS[id];
              const meta = AGENT_META[id];
              const included = INCLUDED_AGENT_IDS.includes(id);

              if (included) {
                return (
                  <Link key={id} href={`/dashboard/asistente/${id}`}>
                    <div
                      className="group relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                      style={{
                        background: `radial-gradient(ellipse at 50% 0%, ${meta.accentColor}1f 0%, transparent 65%), var(--card)`,
                        border: "1px solid var(--border)",
                      }}
                    >
                      {/* Hover border glow */}
                      <div
                        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        style={{ boxShadow: `inset 0 0 0 1px ${meta.accentColor}60` }}
                      />

                      {/* Top row */}
                      <div className="flex items-start justify-between">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
                          style={{ background: meta.accentColor, color: "#fff" }}
                        >
                          {meta.monogram}
                        </div>
                        {/* Active chip */}
                        <div
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(76,214,160,0.10)", border: "1px solid rgba(76,214,160,0.20)" }}
                        >
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#4cd6a0" }} />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#4cd6a0" }} />
                          </span>
                          <span className="text-[9px] font-semibold" style={{ color: "#4cd6a0" }}>activo</span>
                        </div>
                      </div>

                      {/* Name + role */}
                      <div>
                        <p className="text-[15px] font-bold text-foreground leading-none">{agent.name}</p>
                        <p
                          className="mt-1 leading-none"
                          style={{ ...monoLabel, fontSize: 9, color: "var(--muted-foreground)" }}
                        >
                          {agent.title}
                        </p>
                      </div>

                      {/* Last used */}
                      <div className="flex items-center gap-1.5 mt-auto">
                        <MessageSquare className="h-3 w-3 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                        <span style={{ ...monoLabel, fontSize: 9, color: "var(--muted-foreground)" }}>
                          Última: hace 2h
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              }

              // Coming-soon agent (visible, not accessible)
              return (
                <div
                  key={id}
                  className="relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3 select-none"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    opacity: 0.72,
                  }}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(246,245,247,0.30)" }}
                    >
                      {meta.monogram}
                    </div>
                  </div>

                  {/* Name + role */}
                  <div>
                    <p className="text-[15px] font-bold leading-none" style={{ color: "rgba(246,245,247,0.40)" }}>
                      {agent.name}
                    </p>
                    <p
                      className="mt-1 leading-none"
                      style={{ ...monoLabel, fontSize: 9, color: "rgba(246,245,247,0.25)" }}
                    >
                      {agent.title}
                    </p>
                  </div>

                  {/* Coming soon */}
                  <div className="mt-auto">
                    <div
                      className="w-full py-1.5 rounded-lg text-center"
                      style={{
                        fontSize: 10,
                        fontFamily: "'Geist Mono', monospace",
                        letterSpacing: "0.08em",
                        fontWeight: 600,
                        border: "1px solid rgba(124,92,255,0.30)",
                        color: "#9a7fff",
                        background: "rgba(124,92,255,0.10)",
                      }}
                    >
                      Próximamente
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent Docs ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p
              style={{ ...monoLabel, color: "var(--muted-foreground)" }}
              className="text-[10px]"
            >
              Documentos recientes
            </p>
            <Link
              href="/dashboard/historial"
              className="text-xs font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: "#a78bff" }}
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            {recentDocs.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Aún no has generado documentos.
                </p>
                <Link
                  href="/dashboard/generar"
                  className="inline-flex items-center gap-1 mt-3 text-xs font-semibold hover:opacity-80 transition-opacity"
                  style={{ color: "#a78bff" }}
                >
                  Generar el primero <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {recentDocs.map((doc) => {
                  const d = new Date(doc.createdAt);
                  const dateLabel = `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
                  return (
                    <Link
                      key={doc.id}
                      href={`/dashboard/generar/${doc.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors group hover:bg-secondary"
                    >
                      <div className="flex-shrink-0">
                        <DocTypeBadge type={doc.type} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {DOC_TYPE_LABELS[doc.type] ?? doc.type} · {MESES_CORTOS[doc.month - 1]} {doc.year}
                        </p>
                        <p
                          className="text-xs mt-0.5 truncate"
                          style={{ ...monoLabel, fontSize: 9, color: "var(--muted-foreground)" }}
                        >
                          {doc.property?.name ?? "Propiedad eliminada"} · {dateLabel}
                        </p>
                      </div>

                      {doc.status === "completed" && (
                        <div
                          className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: "rgba(76,214,160,0.10)",
                            border: "1px solid rgba(76,214,160,0.25)",
                          }}
                        >
                          <span style={{ ...monoLabel, fontSize: 9, color: "#4cd6a0" }}>Listo</span>
                        </div>
                      )}

                      <ArrowRight
                        className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5"
                        style={{ color: "#9a7fff" }}
                      />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
