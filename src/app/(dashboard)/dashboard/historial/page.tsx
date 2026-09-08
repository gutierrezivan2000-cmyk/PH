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
  outputFiles?: Record<string, string> | null;
}

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const TYPE_LABELS: Record<string, string> = {
  custom: "Generación",
  full: "Completo",
  informe: "Informe",
  acta: "Acta",
  presentacion: "Presentacion",
};

// Doc type visual config: tag color (text), bg, border, Geist Mono label
const DOC_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  custom:       { label: "DOC",  color: "var(--accent-text)", bg: "rgb(var(--accent-rgb) / 0.1)",  border: "rgb(var(--accent-rgb) / 0.3)"  },
  full:         { label: "PDF",  color: "var(--danger-text)", bg: "rgb(var(--danger-rgb) / 0.1)", border: "rgb(var(--danger-rgb) / 0.3)" },
  informe:      { label: "DOCX", color: "var(--info-text)", bg: "rgb(var(--info-rgb) / 0.1)",  border: "rgb(var(--info-rgb) / 0.3)"  },
  acta:         { label: "DOCX", color: "var(--info-text)", bg: "rgb(var(--info-rgb) / 0.1)",  border: "rgb(var(--info-rgb) / 0.3)"  },
  presentacion: { label: "PPTX", color: "var(--warn-text)", bg: "rgb(var(--warn-rgb) / 0.1)",  border: "rgb(var(--warn-rgb) / 0.3)"  },
};

// Status visual config
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  completed:  { label: "Listo",      color: "var(--ok-text)", bg: "rgb(var(--ok-rgb) / 0.08)",  border: "rgb(var(--ok-rgb) / 0.25)"  },
  processing: { label: "Procesando", color: "var(--warn-text)", bg: "rgb(var(--warn-rgb) / 0.08)",  border: "rgb(var(--warn-rgb) / 0.25)"  },
  failed:     { label: "Error",      color: "var(--danger-text)", bg: "rgb(var(--danger-rgb) / 0.08)", border: "rgb(var(--danger-rgb) / 0.25)" },
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
    // Generations are stored as type "custom" and can contain several docs, so
    // filter by which documents the generation actually produced, not by type.
    const out = g.outputFiles ?? {};
    let typeOk = true;
    if (typeFilter === "informe") typeOk = !!out.informeHtml;
    else if (typeFilter === "acta") typeOk = !!out.actaHtml;
    else if (typeFilter === "presentacion") typeOk = !!out.presentacionPptx;
    const statusOk = statusFilter === "all" || g.status === statusFilter;
    return typeOk && statusOk;
  });

  const selectStyle: React.CSSProperties = {
    background: "var(--hifi-surface-1)",
    border: "1px solid var(--hifi-hairline)",
    color: "var(--ink)",
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
            background: "var(--hifi-surface-1)",
            border: "1px solid var(--hifi-hairline)",
          }}
        >
          <span style={{ ...monoLabel, color: "var(--ink-3)" }}>Filtros</span>

          <div className="flex flex-wrap gap-3 flex-1">
            {/* Type filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ ...selectStyle, paddingRight: "32px" }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid var(--accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgb(var(--accent-rgb) / 0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid rgb(var(--veil-rgb) / 0.07)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <option value="all" style={{ background: "var(--hifi-surface-1)" }}>Todos los documentos</option>
                <option value="informe" style={{ background: "var(--hifi-surface-1)" }}>Con informe</option>
                <option value="acta" style={{ background: "var(--hifi-surface-1)" }}>Con acta</option>
                <option value="presentacion" style={{ background: "var(--hifi-surface-1)" }}>Con presentación</option>
              </select>
              <ArrowRight
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-3.5 w-3.5"
                style={{ color: "var(--ink-3)" }}
              />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ ...selectStyle, paddingRight: "32px" }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid var(--accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgb(var(--accent-rgb) / 0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid rgb(var(--veil-rgb) / 0.07)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <option value="all" style={{ background: "var(--hifi-surface-1)" }}>Todos los estados</option>
                <option value="completed" style={{ background: "var(--hifi-surface-1)" }}>Listo</option>
                <option value="processing" style={{ background: "var(--hifi-surface-1)" }}>Procesando</option>
                <option value="failed" style={{ background: "var(--hifi-surface-1)" }}>Error</option>
              </select>
              <ArrowRight
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-3.5 w-3.5"
                style={{ color: "var(--ink-3)" }}
              />
            </div>
          </div>

          {filtered.length > 0 && (
            <span style={{ ...monoLabel, color: "var(--ink-3)" }}>
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
                border: "3px solid rgb(var(--accent-rgb) / 0.15)",
                borderTopColor: "var(--accent)",
              }}
            />
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div
            className="rounded-2xl flex flex-col items-center py-16 text-center px-6"
            style={{
              background: "var(--hifi-surface-1)",
              border: "1.5px dashed rgb(var(--veil-rgb) / 0.1)",
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: "rgb(var(--accent-rgb) / 0.1)",
                border: "1px solid rgb(var(--accent-rgb) / 0.2)",
              }}
            >
              <History className="h-8 w-8" style={{ color: "var(--accent-text)" }} />
            </div>
            <span
              className="block mb-2"
              style={{ ...monoLabel, color: "var(--ink-3)" }}
            >
              Sin resultados
            </span>
            <p className="font-medium mb-1" style={{ color: "var(--ink)", fontSize: "15px" }}>
              {generations.length === 0
                ? "Aun no has generado documentos"
                : "No hay resultados con esos filtros"}
            </p>
            <p className="text-sm max-w-xs" style={{ color: "var(--ink-2)" }}>
              {generations.length === 0
                ? "Tus documentos generados apareceran aqui"
                : "Prueba cambiando los filtros de tipo o estado"}
            </p>
            {generations.length === 0 && (
              <Link href="/dashboard/generar">
                <button
                  className="mt-6 flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: "var(--accent)",
                    color: "#ffffff",
                    boxShadow: "0 2px 12px rgb(var(--accent-rgb) / 0.35)",
                    border: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hi)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
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
              background: "var(--hifi-surface-1)",
              border: "1px solid var(--hifi-hairline)",
            }}
          >
            {filtered.map((gen, index) => {
              const docCfg = DOC_TYPE_CONFIG[gen.type] ?? DOC_TYPE_CONFIG.custom;
              const statusCfg = STATUS_CONFIG[gen.status] ?? {
                label: gen.status,
                color: "var(--ink-2)",
                bg: "rgb(var(--veil-rgb) / 0.04)",
                border: "rgb(var(--veil-rgb) / 0.12)",
              };
              const isLast = index === filtered.length - 1;

              return (
                <Link key={gen.id} href={`/dashboard/generar/${gen.id}`}>
                  <div
                    className="group flex items-center gap-3 sm:gap-4 px-4 py-4 sm:px-5 sm:py-4 transition-all cursor-pointer"
                    style={{
                      borderBottom: isLast ? "none" : "1px solid rgb(var(--veil-rgb) / 0.05)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgb(var(--accent-rgb) / 0.05)";
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
                        style={{ color: "var(--ink)", fontSize: "14px", fontWeight: 500 }}
                      >
                        {TYPE_LABELS[gen.type] ?? gen.type} — {gen.property?.name ?? "Propiedad eliminada"}
                      </p>
                      <p
                        className="mt-0.5 truncate"
                        style={{
                          ...monoMini,
                          color: "var(--ink-3)",
                        }}
                      >
                        {gen.property?.name ?? "—"} · {MONTHS[gen.month - 1]} {gen.year}
                      </p>
                    </div>

                    {/* Right side: Themis chip + status + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Themis chip */}
                      <div
                        className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md"
                        style={{
                          background: "rgb(var(--legal-rgb) / 0.08)",
                          border: "1px solid rgb(var(--legal-rgb) / 0.25)",
                        }}
                      >
                        <Scale className="h-3 w-3" style={{ color: "var(--legal)" }} />
                        <span style={{ ...monoLabel, color: "var(--legal)" }}>Themis</span>
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
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                            style={{
                              color: "var(--ink-2)",
                              border: "1px solid rgb(var(--veil-rgb) / 0.1)",
                              background: "transparent",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgb(var(--veil-rgb) / 0.06)";
                              e.currentTarget.style.color = "var(--ink)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--ink-2)";
                            }}
                          >
                            <Eye className="h-3 w-3" />
                            Ver
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                            style={{
                              color: "var(--ink-2)",
                              border: "1px solid rgb(var(--veil-rgb) / 0.1)",
                              background: "transparent",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgb(var(--veil-rgb) / 0.06)";
                              e.currentTarget.style.color = "var(--ink)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--ink-2)";
                            }}
                          >
                            <Download className="h-3 w-3" />
                            Descargar
                          </button>
                        </div>
                      )}

                      <ArrowRight
                        className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5"
                        style={{ color: "var(--accent-text)" }}
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
