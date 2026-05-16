"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { AGENTS, AGENT_IDS, INCLUDED_AGENT_IDS } from "@/lib/agents";
import { Lock, ArrowRight, MessageSquare, Zap } from "lucide-react";

const AGENT_COLORS: Record<string, string> = {
  themis: "#a78bff",
  chronos: "#5fb4ff",
  metra: "#4cd6a0",
  nomethes: "#ffb958",
  hermes: "#ff6fa8",
  logistes: "#8a92ff",
};

const AGENT_MONOGRAMS: Record<string, string> = {
  themis: "T",
  chronos: "C",
  metra: "M",
  nomethes: "N",
  hermes: "H",
  logistes: "L",
};

interface AgentUsage {
  daily: number;
  weekly: number;
  limits: { agentMessagesPerDay: number; agentMessagesPerWeek: number };
}

export default function AsistentePage() {
  const [usage, setUsage] = useState<AgentUsage | null>(null);

  useEffect(() => {
    fetch("/api/agents/usage")
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.daily === "number" && data.limits) {
          setUsage({ daily: data.daily, weekly: data.weekly, limits: data.limits });
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div>
      <Header title="Asistente IA" subtitle="Tus agentes inteligentes de Propiedad Horizontal" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto space-y-6">

        {/* Usage row */}
        {usage && (
          <div
            className="rounded-2xl p-4 border flex items-center gap-4"
            style={{
              background: "var(--hifi-surface-1, #15151a)",
              borderColor: "var(--hifi-hairline-strong, rgba(255,255,255,0.14))",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--hifi-accent-soft)", color: "var(--hifi-accent-hi)" }}
            >
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-xs font-medium mb-1"
                style={{ fontFamily: "var(--hifi-mono)", letterSpacing: "0.1em", color: "var(--hifi-ink-faint)" }}
              >
                USO DE MENSAJES
              </div>
              <div className="flex items-center gap-4 text-sm" style={{ color: "var(--hifi-ink-dim)" }}>
                <span>
                  Hoy:{" "}
                  <strong style={{ color: "var(--hifi-ink)" }}>
                    {usage.daily}
                  </strong>
                  <span style={{ color: "var(--hifi-ink-faint)" }}> / {usage.limits.agentMessagesPerDay}</span>
                </span>
                <span
                  style={{ width: 1, height: 14, background: "var(--hifi-hairline-strong)", display: "inline-block" }}
                />
                <span>
                  Semana:{" "}
                  <strong style={{ color: "var(--hifi-ink)" }}>
                    {usage.weekly}
                  </strong>
                  <span style={{ color: "var(--hifi-ink-faint)" }}> / {usage.limits.agentMessagesPerWeek}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Agents grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENT_IDS.map((id) => {
            const agent = AGENTS[id];
            const included = INCLUDED_AGENT_IDS.includes(id);
            const color = AGENT_COLORS[id] || "#7c5cff";
            const monogram = AGENT_MONOGRAMS[id] || id[0].toUpperCase();

            if (included) {
              return (
                <Link key={id} href={`/dashboard/asistente/${id}`}>
                  <div
                    className="hifi-agent-tile group relative rounded-2xl p-5 border cursor-pointer overflow-hidden h-full"
                    style={{
                      background: `radial-gradient(120% 100% at 100% 0%, color-mix(in oklab, ${color} 18%, transparent) 0%, transparent 70%), var(--hifi-surface-1, #15151a)`,
                      borderColor: "var(--hifi-hairline, rgba(255,255,255,0.07))",
                      minHeight: 180,
                    }}
                  >
                    {/* Included badge */}
                    <div className="flex items-center justify-between mb-4">
                      {/* Agent monogram */}
                      <div
                        className="flex items-center justify-center rounded-xl flex-shrink-0"
                        style={{
                          width: 44,
                          height: 44,
                          background: `radial-gradient(120% 100% at 30% 20%, color-mix(in oklab, ${color} 70%, transparent) 0%, transparent 60%), var(--hifi-surface-2, #1d1d24)`,
                          border: `1px solid color-mix(in oklab, ${color} 50%, rgba(255,255,255,0.07))`,
                          color,
                          fontFamily: "var(--hifi-mono)",
                          fontWeight: 600,
                          fontSize: 16,
                        }}
                      >
                        {monogram}
                      </div>
                      <span
                        className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full"
                        style={{
                          fontFamily: "var(--hifi-mono)",
                          letterSpacing: "0.06em",
                          background: "rgba(76,214,160,0.12)",
                          border: "1px solid rgba(76,214,160,0.25)",
                          color: "var(--hifi-ok)",
                        }}
                      >
                        <span
                          className="hifi-pulse-ok"
                          style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }}
                        />
                        incluido
                      </span>
                    </div>

                    <div
                      className="text-base font-semibold mb-0.5 tracking-tight"
                      style={{ color: "var(--hifi-ink, #f6f5f7)" }}
                    >
                      {agent.name}
                    </div>
                    <div
                      className="text-[10px] mb-3"
                      style={{
                        fontFamily: "var(--hifi-mono)",
                        letterSpacing: "0.1em",
                        color: "var(--hifi-ink-faint)",
                        textTransform: "uppercase",
                      }}
                    >
                      {agent.title}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--hifi-ink-dim)" }}>
                      {agent.description}
                    </p>

                    {/* Arrow on hover */}
                    <div
                      className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0 -translate-x-1"
                      style={{ color: "var(--hifi-accent-hi)" }}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              );
            }

            return (
              <div
                key={id}
                className="relative rounded-2xl p-5 border overflow-hidden h-full select-none"
                style={{
                  background: `radial-gradient(120% 100% at 100% 0%, color-mix(in oklab, ${color} 10%, transparent) 0%, transparent 70%), var(--hifi-surface-1, #15151a)`,
                  borderColor: "var(--hifi-hairline, rgba(255,255,255,0.07))",
                  minHeight: 180,
                  opacity: 0.75,
                }}
              >
                {/* Lock overlay */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 rounded-2xl"
                  style={{ background: "rgba(10,10,10,0.45)", backdropFilter: "blur(2px)" }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: "var(--hifi-surface-2)", border: "1px solid var(--hifi-hairline-strong)" }}
                  >
                    <Lock className="h-4 w-4" style={{ color: "var(--hifi-ink-faint)" }} />
                  </div>
                  <span
                    className="text-[10px] font-semibold"
                    style={{ fontFamily: "var(--hifi-mono)", letterSpacing: "0.1em", color: "var(--hifi-ink-dim)" }}
                  >
                    COMPLEMENTO
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: "var(--hifi-accent-hi)", fontFamily: "var(--hifi-mono)" }}
                  >
                    + $5 USD / mes
                  </span>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div
                    className="flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{
                      width: 44,
                      height: 44,
                      background: `radial-gradient(120% 100% at 30% 20%, color-mix(in oklab, ${color} 70%, transparent) 0%, transparent 60%), var(--hifi-surface-2, #1d1d24)`,
                      border: `1px solid color-mix(in oklab, ${color} 50%, rgba(255,255,255,0.07))`,
                      color,
                      fontFamily: "var(--hifi-mono)",
                      fontWeight: 600,
                      fontSize: 16,
                    }}
                  >
                    {monogram}
                  </div>
                </div>
                <div className="text-base font-semibold mb-0.5 tracking-tight" style={{ color: "var(--hifi-ink)" }}>
                  {agent.name}
                </div>
                <div
                  className="text-[10px] mb-3"
                  style={{ fontFamily: "var(--hifi-mono)", letterSpacing: "0.1em", color: "var(--hifi-ink-faint)", textTransform: "uppercase" }}
                >
                  {agent.title}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--hifi-ink-dim)" }}>
                  {agent.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Info section */}
        <div
          className="rounded-2xl p-5 border"
          style={{
            background: "var(--hifi-surface-1, #15151a)",
            borderColor: "var(--hifi-hairline, rgba(255,255,255,0.07))",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4" style={{ color: "var(--hifi-accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--hifi-ink)" }}>
              ¿Cómo funcionan los agentes?
            </span>
          </div>
          <div className="space-y-2 text-xs leading-relaxed" style={{ color: "var(--hifi-ink-dim)" }}>
            <p>— Cada agente tiene su propia especialidad y recuerda el contexto de tus conversaciones anteriores.</p>
            <p>— Puedes crear múltiples chats con cada agente para organizar tus consultas por tema.</p>
            <p>— Los agentes pueden recibir imágenes y documentos como parte de la conversación.</p>
            <p>— La memoria del agente guarda notas importantes que persisten entre sesiones.</p>
            <p>— Tu plan incluye <strong style={{ color: "var(--hifi-themis)" }}>Themis</strong> y <strong style={{ color: "var(--hifi-chronos)" }}>Chronos</strong>. Los demás agentes son complementos adicionales por $5 USD/mes cada uno.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
