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
  Sparkles,
  ArrowRight,
  Loader2,
  CreditCard,
  Settings2,
  FileText,
  FileCheck2,
  Presentation,
  LayoutGrid,
  BarChart,
  Search,
  Bell,
  ChevronRight,
  Lock,
  AlertCircle,
  Calendar,
  Eye,
  Download,
  ArrowUpRight,
  MessageSquare,
} from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Per-agent display data (monogram, accent color, gradient)
const AGENT_META: Record<
  string,
  { monogram: string; accentColor: string; gradientFrom: string; gradientTo: string }
> = {
  themis:   { monogram: "T", accentColor: "#a78bff", gradientFrom: "#7c5cff", gradientTo: "#a78bff" },
  chronos:  { monogram: "C", accentColor: "#5fb4ff", gradientFrom: "#3b82f6", gradientTo: "#5fb4ff" },
  metra:    { monogram: "M", accentColor: "#4cd6a0", gradientFrom: "#10b981", gradientTo: "#4cd6a0" },
  nomethes: { monogram: "N", accentColor: "#ffb958", gradientFrom: "#f59e0b", gradientTo: "#ffb958" },
  hermes:   { monogram: "H", accentColor: "#ff6fa8", gradientFrom: "#ec4899", gradientTo: "#ff6fa8" },
  logistes: { monogram: "L", accentColor: "#8a92ff", gradientFrom: "#6366f1", gradientTo: "#8a92ff" },
};

// Placeholder recent docs
const RECENT_DOCS = [
  {
    type: "PDF",
    title: "Informe de gestión · febrero 2026",
    property: "Conjunto Mirador",
    date: "17 feb",
    meta: "24 págs",
  },
  {
    type: "DOCX",
    title: "Acta Consejo · ordinaria",
    property: "Edificio Altavista",
    date: "12 feb",
    meta: "8 págs",
  },
  {
    type: "PPTX",
    title: "Asamblea ordinaria 2026",
    property: "Conjunto Reservas",
    date: "02 feb",
    meta: "18 slides",
  },
  {
    type: "PDF",
    title: "Informe de gestión · enero 2026",
    property: "Conjunto Lumière",
    date: "14 ene",
    meta: "21 págs",
  },
];

function docTypeBadge(type: string) {
  if (type === "PDF")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
        PDF
      </span>
    );
  if (type === "DOCX")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
        DOCX
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
      PPTX
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(!IS_DEMO);
  const [userName, setUserName] = useState<string>("");

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
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const firstName = userName || "Administrador";

  const quickActions = [
    {
      href: "/dashboard/generar",
      icon: FilePlus2,
      title: "Generar documentos",
      desc: "Informe, acta y presentación",
      iconBg: "#7c5cff",
      tint: "rgba(124,92,255,0.08)",
      tintDark: "rgba(124,92,255,0.12)",
    },
    {
      href: "/dashboard/asistente/themis",
      icon: Scale,
      title: "Hablar con Themis",
      desc: "Asesora legal especializada",
      iconBg: "#a78bff",
      tint: "rgba(167,139,255,0.08)",
      tintDark: "rgba(167,139,255,0.12)",
    },
    {
      href: "/dashboard/propiedades",
      icon: Building2,
      title: "Nueva propiedad",
      desc: "Agregar copropiedad",
      iconBg: "#4cd6a0",
      tint: "rgba(76,214,160,0.08)",
      tintDark: "rgba(76,214,160,0.12)",
    },
    {
      href: "/dashboard/historial",
      icon: History,
      title: "Ver historial",
      desc: "Documentos generados",
      iconBg: "#5fb4ff",
      tint: "rgba(95,180,255,0.08)",
      tintDark: "rgba(95,180,255,0.12)",
    },
  ];

  return (
    <div>
      <Header title="Dashboard" />

      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-8 max-w-7xl mx-auto">

        {/* ── Hero Generate Card ───────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl border"
          style={{
            background: "linear-gradient(135deg, rgba(124,92,255,0.13) 0%, rgba(124,92,255,0.04) 100%)",
            borderColor: "rgba(124,92,255,0.35)",
          }}
        >
          {/* subtle radial glow */}
          <div
            className="pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full blur-3xl"
            style={{ background: "rgba(124,92,255,0.18)" }}
          />

          <div className="relative flex flex-col lg:flex-row lg:items-center gap-8 p-6 sm:p-8">
            {/* Left content */}
            <div className="flex-1 min-w-0">
              {/* Chips row */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(124,92,255,0.15)",
                    color: "#a78bff",
                    border: "1px solid rgba(124,92,255,0.3)",
                  }}
                >
                  <Sparkles className="h-3 w-3" />
                  todo listo para mar 2026
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(251,146,60,0.12)",
                    color: "#fb923c",
                    border: "1px solid rgba(251,146,60,0.25)",
                  }}
                >
                  <AlertCircle className="h-3 w-3" />
                  2 vencimientos esta semana
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2 leading-tight tracking-tight">
                ¿Generamos los documentos?
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Promedio del último mes: <span className="text-gray-700 dark:text-gray-200 font-medium">3 minutos</span> · <span className="text-gray-700 dark:text-gray-200 font-medium">3 documentos</span> por copropiedad.
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard/generar">
                  <button
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 shadow-lg"
                    style={{ background: "#7c5cff", boxShadow: "0 4px 16px rgba(124,92,255,0.4)" }}
                  >
                    <FilePlus2 className="h-4 w-4" />
                    Generar ahora
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
                <Link href="/dashboard/historial">
                  <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-white/10">
                    <History className="h-4 w-4" />
                    Ver historial
                  </button>
                </Link>
              </div>
            </div>

            {/* Right: mini doc stack (hidden on mobile) */}
            <div className="hidden lg:flex items-center justify-center flex-shrink-0 w-48 h-36 relative">
              {/* Card 3 — background */}
              <div
                className="absolute right-4 top-4 w-28 h-36 rounded-xl border flex items-end pb-3 justify-center"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderColor: "rgba(255,255,255,0.07)",
                  transform: "rotate(8deg)",
                }}
              >
                <Presentation className="h-6 w-6 text-amber-400/60" />
              </div>
              {/* Card 2 — mid */}
              <div
                className="absolute right-8 top-2 w-28 h-36 rounded-xl border flex items-end pb-3 justify-center"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "rgba(255,255,255,0.09)",
                  transform: "rotate(3deg)",
                }}
              >
                <FileCheck2 className="h-6 w-6 text-blue-400/60" />
              </div>
              {/* Card 1 — front */}
              <div
                className="absolute right-12 top-0 w-28 h-36 rounded-xl border shadow-xl flex items-end pb-3 justify-center"
                style={{
                  background: "rgba(124,92,255,0.15)",
                  borderColor: "rgba(124,92,255,0.35)",
                  transform: "rotate(-2deg)",
                }}
              >
                <FileText className="h-6 w-6 text-violet-400" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Actions Grid ───────────────────────────────────────── */}
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">Accesos rápidos</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div
                  className="group relative rounded-2xl border p-5 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/30 bg-white dark:bg-[#15151a]"
                  style={{ borderColor: "rgba(255,255,255,0.07)" }}
                >
                  {/* Tint overlay on hover */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: action.tintDark }}
                  />

                  {/* Top row: icon + arrow */}
                  <div className="relative flex items-start justify-between">
                    <div
                      className="w-[38px] h-[38px] rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: action.tint }}
                    >
                      <action.icon
                        className="h-5 w-5"
                        style={{ color: action.iconBg }}
                      />
                    </div>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 text-gray-300 dark:text-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>

                  {/* Labels */}
                  <div className="relative">
                    <p className="text-[14px] font-bold text-gray-900 dark:text-white leading-snug">
                      {action.title}
                    </p>
                    <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {action.desc}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Agents Showcase ──────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Tus agentes</h2>
              <p className="text-xs text-gray-400 mt-0.5">Especialistas IA para Propiedad Horizontal</p>
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

              return (
                <div key={id} className="relative group">
                  {included ? (
                    <Link href={`/dashboard/asistente/${id}`}>
                      <div
                        className="relative overflow-hidden rounded-2xl border p-4 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-white dark:bg-[#15151a]"
                        style={{
                          borderColor: "rgba(255,255,255,0.07)",
                        }}
                      >
                        {/* Hover border glow via box-shadow */}
                        <div
                          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          style={{
                            boxShadow: `inset 0 0 0 1px ${meta.accentColor}50`,
                          }}
                        />

                        {/* Top row: monogram + status chip */}
                        <div className="flex items-start justify-between">
                          {/* Monogram circle */}
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${meta.gradientFrom}, ${meta.gradientTo})`,
                            }}
                          >
                            {meta.monogram}
                          </div>
                          {/* Active pulse chip */}
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                            </span>
                            <span className="text-[9px] font-semibold text-emerald-500">activo</span>
                          </div>
                        </div>

                        {/* Agent name */}
                        <div>
                          <p className="text-[15px] font-bold text-gray-900 dark:text-white leading-none">
                            {agent.name}
                          </p>
                          <p
                            className="text-[10px] font-mono uppercase mt-1 leading-none"
                            style={{ color: "rgba(255,255,255,0.3)" }}
                          >
                            {agent.title}
                          </p>
                        </div>

                        {/* Last used row */}
                        <div className="flex items-center gap-1.5 mt-auto">
                          <MessageSquare className="h-3 w-3 text-gray-400 flex-shrink-0" />
                          <span className="text-[10px] text-gray-400">Última: hace 2h</span>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div
                      className="relative overflow-hidden rounded-2xl border p-4 flex flex-col gap-3 cursor-default"
                      style={{
                        borderColor: "rgba(255,255,255,0.07)",
                        background: "#15151a",
                        opacity: 0.75,
                      }}
                    >
                      {/* Top row: monogram + lock chip */}
                      <div className="flex items-start justify-between">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white/50 flex-shrink-0"
                          style={{
                            background: "rgba(255,255,255,0.06)",
                          }}
                        >
                          {meta.monogram}
                        </div>
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10">
                          <Lock className="h-2.5 w-2.5 text-gray-500" />
                          <span className="text-[9px] font-semibold text-gray-500">bloq.</span>
                        </div>
                      </div>

                      {/* Agent name */}
                      <div>
                        <p className="text-[15px] font-bold text-gray-500 leading-none">
                          {agent.name}
                        </p>
                        <p className="text-[10px] font-mono uppercase mt-1 leading-none text-gray-600">
                          {agent.title}
                        </p>
                      </div>

                      {/* Activate CTA */}
                      <div className="mt-auto">
                        <button
                          className="w-full text-[10px] font-semibold py-1.5 rounded-lg border transition-colors"
                          style={{
                            borderColor: "rgba(124,92,255,0.3)",
                            color: "#a78bff",
                            background: "rgba(124,92,255,0.08)",
                          }}
                          onClick={() => {}}
                        >
                          Activar · $5/mes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent Docs ──────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Documentos recientes</h2>
            <Link
              href="/dashboard/historial"
              className="text-xs font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: "#a78bff" }}
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div
            className="rounded-2xl border overflow-hidden bg-white dark:bg-[#15151a]"
            style={{ borderColor: "rgba(255,255,255,0.07)" }}
          >
            <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {RECENT_DOCS.map((doc, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group"
                >
                  {/* Badge */}
                  <div className="flex-shrink-0">{docTypeBadge(doc.type)}</div>

                  {/* Title + property */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {doc.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {doc.property} · {doc.date} · {doc.meta}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                      <Eye className="h-3 w-3" />
                      Ver
                    </button>
                    <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                      <Download className="h-3 w-3" />
                      Descargar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
