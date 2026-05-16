"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
  Scale,
  Download,
  Eye,
  History,
} from "lucide-react";

interface Generation {
  id: string;
  type: string;
  status: string;
  month: number;
  year: number;
  property: { name: string };
  tokensUsed: number;
  costUsd: number;
  createdAt: string;
}

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const TYPE_LABELS: Record<string, string> = {
  full: "Completo",
  informe: "Informe",
  acta: "Acta",
  presentacion: "Presentacion",
};

// Doc type visual config: tag color (text), bg, border, Geist Mono label
const DOC_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  full:         { label: "PDF",  color: "#ff6f6f", bg: "rgba(255,111,111,0.10)", border: "rgba(255,111,111,0.30)" },
  informe:      { label: "DOCX", color: "#5fb4ff", bg: "rgba(95,180,255,0.10)",  border: "rgba(95,180,255,0.30)"  },
  acta:         { label: "DOCX", color: "#5fb4ff", bg: "rgba(95,180,255,0.10)",  border: "rgba(95,180,255,0.30)"  },
  presentacion: { label: "PPTX", color: "#ffb958", bg: "rgba(255,185,88,0.10)",  border: "rgba(255,185,88,0.30)"  },
};

// Status visual config
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  completed:  { label: "Listo",      color: "#4cd6a0", bg: "rgba(76,214,160,0.08)",  border: "rgba(76,214,160,0.25)"  },
  processing: { label: "Procesando", color: "#ffb958", bg: "rgba(255,185,88,0.08)",  border: "rgba(255,185,88,0.25)"  },
  failed:     { label: "Error",      color: "#ff6f6f", bg: "rgba(255,111,111,0.08)", border: "rgba(255,111,111,0.25)" },
};

const monoLabel: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const monoMini: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "11px",
  letterSpacing: "0.06em",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function HistorialPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetch("/api/generations")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setGenerations(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = generations.filter((g) => {
    const typeOk = typeFilter === "all" || g.type === typeFilter;
    const statusOk = statusFilter === "all" || g.status === statusFilter;
    return typeOk && statusOk;
  });

  const selectStyle: React.CSSProperties = {
    background: "#15151a",
    border: "1px solid rgba(255,255,255,0.07)",
    color: "#f6f5f7",
    borderRadius: "10px",
    height: "38px",
    padding: "0 12px",
    fontSize: "13px",
    appearance: "none",
    cursor: "pointer",
    outline: "none",
  };

  return (
    <div>
      <Header title="Historial" subtitle="Todos los documentos que has generado" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-5">

        {/* Filter row */}
        <div
          className="rounded-2xl p-4 flex flex-wrap items-center gap-4"
          style={{
            background: "#15151a",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <span style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}>Filtros</span>

          <div className="flex flex-wrap gap-3 flex-1">
            {/* Type filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ ...selectStyle, paddingRight: "32px" }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid #7c5cff";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <option value="all" style={{ background: "#15151a" }}>Todos los tipos</option>
                <option value="full" style={{ background: "#15151a" }}>Completo</option>
                <option value="informe" style={{ background: "#15151a" }}>Informe</option>
                <option value="acta" style={{ background: "#15151a" }}>Acta</option>
                <option value="presentacion" style={{ background: "#15151a" }}>Presentacion</option>
              </select>
              <ArrowRight
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-3.5 w-3.5"
                style={{ color: "rgba(246,245,247,0.42)" }}
              />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ ...selectStyle, paddingRight: "32px" }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid #7c5cff";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <option value="all" style={{ background: "#15151a" }}>Todos los estados</option>
                <option value="completed" style={{ background: "#15151a" }}>Listo</option>
                <option value="processing" style={{ background: "#15151a" }}>Procesando</option>
                <option value="failed" style={{ background: "#15151a" }}>Error</option>
              </select>
              <ArrowRight
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-3.5 w-3.5"
                style={{ color: "rgba(246,245,247,0.42)" }}
              />
            </div>
          </div>

          {filtered.length > 0 && (
            <span style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}>
              {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-10 h-10 rounded-full animate-spin"
              style={{
                border: "3px solid rgba(124,92,255,0.15)",
                borderTopColor: "#7c5cff",
              }}
            />
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div
            className="rounded-2xl flex flex-col items-center py-16 text-center px-6"
            style={{
              background: "#15151a",
              border: "1.5px dashed rgba(255,255,255,0.10)",
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: "rgba(124,92,255,0.10)",
                border: "1px solid rgba(124,92,255,0.20)",
              }}
            >
              <History className="h-8 w-8" style={{ color: "#9a7fff" }} />
            </div>
            <span
              className="block mb-2"
              style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}
            >
              Sin resultados
            </span>
            <p className="font-medium mb-1" style={{ color: "#f6f5f7", fontSize: "15px" }}>
              {generations.length === 0
                ? "Aun no has generado documentos"
                : "No hay resultados con esos filtros"}
            </p>
            <p className="text-sm max-w-xs" style={{ color: "rgba(246,245,247,0.66)" }}>
              {generations.length === 0
                ? "Tus documentos generados apareceran aqui"
                : "Prueba cambiando los filtros de tipo o estado"}
            </p>
            {generations.length === 0 && (
              <Link href="/dashboard/generar">
                <button
                  className="mt-6 flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: "#7c5cff",
                    color: "#ffffff",
                    boxShadow: "0 2px 12px rgba(124,92,255,0.35)",
                    border: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#9a7fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#7c5cff"; }}
                >
                  <Sparkles className="h-4 w-4" />
                  Generar documentos
                </button>
              </Link>
            )}
          </div>
        )}

        {/* Generation rows */}
        {!loading && filtered.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "#15151a",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {filtered.map((gen, index) => {
              const docCfg = DOC_TYPE_CONFIG[gen.type] ?? DOC_TYPE_CONFIG.full;
              const statusCfg = STATUS_CONFIG[gen.status] ?? {
                label: gen.status,
                color: "rgba(246,245,247,0.66)",
                bg: "rgba(255,255,255,0.04)",
                border: "rgba(255,255,255,0.12)",
              };
              const isLast = index === filtered.length - 1;

              return (
                <Link key={gen.id} href={`/dashboard/generar/${gen.id}`}>
                  <div
                    className="group flex items-center gap-3 sm:gap-4 px-4 py-4 sm:px-5 sm:py-4 transition-all cursor-pointer"
                    style={{
                      borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(124,92,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {/* Doc-type tag */}
                    <div
                      className="flex-shrink-0 px-2 py-1 rounded-md"
                      style={{
                        ...monoLabel,
                        color: docCfg.color,
                        background: docCfg.bg,
                        border: `1px solid ${docCfg.border}`,
                        minWidth: "46px",
                        textAlign: "center",
                        padding: "5px 8px",
                      }}
                    >
                      {docCfg.label}
                    </div>

                    {/* Title + subtitle */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-medium truncate"
                        style={{ color: "#f6f5f7", fontSize: "14px", fontWeight: 500 }}
                      >
                        {TYPE_LABELS[gen.type] ?? gen.type} — {gen.property.name}
                      </p>
                      <p
                        className="mt-0.5 truncate"
                        style={{
                          ...monoMini,
                          color: "rgba(246,245,247,0.42)",
                        }}
                      >
                        {gen.property.name} · {MONTHS[gen.month - 1]} {gen.year}
                      </p>
                    </div>

                    {/* Right side: Themis chip + status + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Themis chip */}
                      <div
                        className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md"
                        style={{
                          background: "rgba(244,199,128,0.08)",
                          border: "1px solid rgba(244,199,128,0.25)",
                        }}
                      >
                        <Scale className="h-3 w-3" style={{ color: "#f4c780" }} />
                        <span style={{ ...monoLabel, color: "#f4c780" }}>Themis</span>
                      </div>

                      {/* Status badge */}
                      <div
                        className="flex items-center gap-1 px-2 py-1 rounded-md"
                        style={{
                          ...monoLabel,
                          color: statusCfg.color,
                          background: statusCfg.bg,
                          border: `1px solid ${statusCfg.border}`,
                          padding: "5px 8px",
                        }}
                      >
                        {gen.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                        {gen.status === "failed" && <AlertCircle className="h-3 w-3" />}
                        {gen.status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {statusCfg.label}
                      </div>

                      {/* Ghost action buttons — visible on hover */}
                      {gen.status === "completed" && (
                        <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                            style={{
                              color: "rgba(246,245,247,0.66)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "transparent",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                              e.currentTarget.style.color = "#f6f5f7";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "rgba(246,245,247,0.66)";
                            }}
                          >
                            <Eye className="h-3 w-3" />
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                            style={{
                              color: "rgba(246,245,247,0.66)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "transparent",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                              e.currentTarget.style.color = "#f6f5f7";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "rgba(246,245,247,0.66)";
                            }}
                          >
                            <Download className="h-3 w-3" />
                            Descargar
                          </button>
                        </div>
                      )}

                      <ArrowRight
                        className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5"
                        style={{ color: "#9a7fff" }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
