"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { AGENTS, AGENT_IDS } from "@/lib/agents";
import { ArrowRight, MessageCircle, Activity } from "lucide-react";

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
      .then(setUsage)
      .catch(console.error);
  }, []);

  const dailyPercent = usage
    ? Math.min((usage.daily / usage.limits.agentMessagesPerDay) * 100, 100)
    : 0;
  const weeklyPercent = usage
    ? Math.min((usage.weekly / usage.limits.agentMessagesPerWeek) * 100, 100)
    : 0;

  const getBarColor = (pct: number) => {
    if (pct >= 90) return "from-red-500 to-rose-400";
    if (pct >= 70) return "from-amber-500 to-orange-400";
    return "from-violet-500 to-purple-400";
  };

  return (
    <div>
      <Header title="Asistente IA" subtitle="Tus agentes inteligentes de Propiedad Horizontal" />
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">

        {/* Usage bar */}
        {usage && (
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-md shadow-violet-500/20">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Uso de Agentes IA</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Mensajes enviados a los agentes</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Agentes Especializados</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Cada agente esta entrenado para un area especifica de la gestion de Propiedad Horizontal.</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENT_IDS.map((id) => {
              const agent = AGENTS[id];
              return (
                <Link key={id} href={`/dashboard/asistente/${id}`}>
                  <div className="group bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 hover:border-violet-300 dark:hover:border-violet-500/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 h-full cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-11 h-11 rounded-xl ${agent.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                        <agent.icon className={`h-5 w-5 ${agent.color}`} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-all duration-200" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{agent.title}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{agent.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
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
            <p>- Los agentes pueden recibir imagenes, audios y documentos como parte de la conversacion.</p>
            <p>- La memoria del agente guarda notas importantes que persisten entre sesiones.</p>
            <p>- Proximo: Los agentes tendran acceso a los documentos de tus propiedades (reglamento, manual de convivencia) para dar respuestas mas precisas.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
