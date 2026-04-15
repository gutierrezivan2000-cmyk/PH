"use client";

import { useEffect, useState } from "react";
import { Activity, TrendingUp, Calendar, Sparkles } from "lucide-react";

interface UsageData {
  monthlyGenerations: number;
  dailyGenerations: number;
  monthlyTokens: number;
  monthlyCost: number;
  limits: {
    generationsPerDay: number;
    generationsPerMonth: number;
  };
}

export function UsageCard() {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((res) => res.json())
      .then(setUsage)
      .catch(console.error);
  }, []);

  if (!usage) {
    return (
      <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <h3 className="font-bold text-gray-900">Uso del Plan</h3>
        </div>
        <div className="h-28 flex items-center justify-center">
          <div className="w-8 h-8 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const monthlyPercent = Math.min((usage.monthlyGenerations / usage.limits.generationsPerMonth) * 100, 100);
  const dailyPercent = Math.min((usage.dailyGenerations / usage.limits.generationsPerDay) * 100, 100);
  const monthlyRemaining = usage.limits.generationsPerMonth - usage.monthlyGenerations;

  const getBarColors = (percent: number) => {
    if (percent >= 90) return { bar: "from-red-500 to-rose-400", bg: "bg-red-100/50", glow: "shadow-red-500/20" };
    if (percent >= 70) return { bar: "from-amber-500 to-orange-400", bg: "bg-amber-100/50", glow: "shadow-amber-500/20" };
    return { bar: "from-violet-500 to-purple-400", bg: "bg-violet-100/50", glow: "shadow-violet-500/20" };
  };

  const monthly = getBarColors(monthlyPercent);
  const daily = getBarColors(dailyPercent);

  return (
    <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10 hover:shadow-xl hover:shadow-violet-100/15 transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Uso del Plan</h3>
            <p className="text-xs text-gray-400">
              {monthlyRemaining > 0
                ? `${monthlyRemaining} generaciones restantes`
                : "Limite alcanzado"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50/80 backdrop-blur rounded-xl">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          <span className="text-xs font-bold text-violet-600 tabular-nums">{Math.round(monthlyPercent)}%</span>
        </div>
      </div>

      <div className="space-y-5">
        {/* Monthly */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Mensuales</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {usage.monthlyGenerations}
              <span className="text-gray-400 font-normal"> / {usage.limits.generationsPerMonth}</span>
            </span>
          </div>
          <div className={`w-full h-2.5 ${monthly.bg} rounded-full overflow-hidden backdrop-blur-sm`}>
            <div
              className={`h-full rounded-full bg-gradient-to-r ${monthly.bar} transition-all duration-1000 ease-out shadow-sm ${monthly.glow}`}
              style={{ width: `${monthlyPercent}%` }}
            />
          </div>
        </div>

        {/* Daily */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Hoy</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {usage.dailyGenerations}
              <span className="text-gray-400 font-normal"> / {usage.limits.generationsPerDay}</span>
            </span>
          </div>
          <div className={`w-full h-2.5 ${daily.bg} rounded-full overflow-hidden backdrop-blur-sm`}>
            <div
              className={`h-full rounded-full bg-gradient-to-r ${daily.bar} transition-all duration-1000 ease-out shadow-sm ${daily.glow}`}
              style={{ width: `${dailyPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
