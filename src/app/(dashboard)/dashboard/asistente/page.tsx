"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { AGENTS, AGENT_IDS, INCLUDED_AGENT_IDS } from "@/lib/agents";
import { ArrowRight, MessageCircle, Activity, Lock } from "lucide-react";

interface AgentUsage {
  daily: number;
  weekly: number;
  limits: {
    agentMessagesPerDay: number;
    agentMessagesPerWeek: number;
  };
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

  const dailyLimit = usage?.limits?.agentMessagesPerDay || 1;
  const weeklyLimit = usage?.limits?.agentMessagesPerWeek || 1;
  const dailyPercent = usage
    ? Math.min(((usage.daily || 0) / dailyLimit) * 100, 100)
    : 0;
  const weeklyPercent = usage
    ? Math.min(((usage.weekly || 0) / weeklyLimit) * 100, 100)
    : 0;

  const getBarColor = (pct: number) => {
    if (pct >= 90) return "from-red-500 to-rose-400";
    if (pct >= 70) return "from-amber-500 to-orange-400";
    return "from-violet-500 to-purple-400";
  };

  return (
    <div>
      <Header title="Asistente IA" subtitle="Tus agentes inteligentes de Propiedad Horizontal" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto space-y-8">

        {/* Usage bar */}
        {usage && (
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 shadow-sm max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-md shadow-violet-500/20">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Mensajes a Agentes</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Consumo de mensajes</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Hoy</span>
                  <span className="text-xs font-bold tabular-nums text-gray-900 dark:text-white">
                    {usage.daily}<span className="text-gray-400 dark:text-gray-500 font-normal"> / {usage.limits.agentMessagesPerDay}</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${getBarColor(dailyPercent)} transition-all duration-700`}
                    style={{ width: `${dailyPercent}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Esta semana</span>
                  <span className="text-xs font-bold tabular-nums text-gray-900 dark:text-white">
                    {usage.weekly}<span className="text-gray-400 dark:text-gray-500 font-normal"> / {usage.limits.agentMessagesPerWeek}</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${getBarColor(weeklyPercent)} transition-all duration-700`}
                    style={{ width: `${weeklyPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agents grid */}
        <div>
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Agentes Especializados</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Cada agente esta entrenado para un area especifica de la gestion de Propiedad Horizontal.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENT_IDS.map((id) => {
              const agent = AGENTS[id];
              const included = INCLUDED_AGENT_IDS.includes(id);
              if (included) {
                return (
                  <Link key={id} href={`/dashboard/asistente/${id}`}>
                    <div className="group bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 hover:border-violet-300 dark:hover:border-violet-500/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 h-full cursor-pointer">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-11 h-11 rounded-xl ${agent.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                          <agent.icon className={`h-5 w-5 ${agent.color}`} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                            Incluido
                          </span>
                          <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-all duration-200" />
                        </div>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{agent.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{agent.description}</p>
                    </div>
                  </Link>
                );
              }
              return (
                <div key={id} className="relative bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 h-full opacity-60 cursor-not-allowed select-none">
                  <div className="absolute inset-0 rounded-2xl bg-white/40 dark:bg-black/20 flex flex-col items-center justify-center z-10 gap-2">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                      <Lock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    </div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Complemento</span>
                    <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400">+$5 USD / mes</span>
                  </div>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-11 h-11 rounded-xl ${agent.bg} flex items-center justify-center`}>
                      <agent.icon className={`h-5 w-5 ${agent.color}`} />
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{agent.title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{agent.description}</p>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            Los agentes bloqueados son complementos adicionales al plan base. Contacta a soporte para activarlos.
          </p>
        </div>

        {/* Info section */}
        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Como funcionan los agentes?</span>
          </div>
          <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            <p>- Cada agente tiene su propia especialidad y recuerda el contexto de tus conversaciones anteriores.</p>
            <p>- Puedes crear multiples chats con cada agente para organizar tus consultas por tema.</p>
            <p>- Los agentes pueden recibir imagenes y documentos como parte de la conversacion.</p>
            <p>- La memoria del agente guarda notas importantes que persisten entre sesiones.</p>
            <p>- Los agentes tienen acceso a los documentos de tus propiedades (reglamento, manual de convivencia) para dar respuestas mas precisas.</p>
            <p>- Tu plan incluye Themis y Chronos. Los demas agentes son complementos adicionales por $5 USD/mes cada uno.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
