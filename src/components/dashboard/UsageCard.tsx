"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, TrendingUp, Calendar, Gauge } from "lucide-react";

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
      <Card className="border-gray-200/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5 text-gray-900">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center">
              <Activity className="h-4 w-4 text-violet-600" />
            </div>
            Uso del Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-28 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthlyPercent = Math.min((usage.monthlyGenerations / usage.limits.generationsPerMonth) * 100, 100);
  const dailyPercent = Math.min((usage.dailyGenerations / usage.limits.generationsPerDay) * 100, 100);

  const getBarGradient = (percent: number) => {
    if (percent >= 90) return "from-red-500 to-rose-400";
    if (percent >= 70) return "from-amber-500 to-orange-400";
    return "from-violet-500 to-purple-400";
  };

  const getBarBg = (percent: number) => {
    if (percent >= 90) return "bg-red-50";
    if (percent >= 70) return "bg-amber-50";
    return "bg-violet-50";
  };

  return (
    <Card className="border-gray-200/60 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2.5 text-gray-900">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center">
              <Activity className="h-4 w-4 text-violet-600" />
            </div>
            Uso del Mes
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Gauge className="h-3.5 w-3.5" />
            <span>{Math.round(monthlyPercent)}% utilizado</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Monthly usage */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Generaciones mensuales</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {usage.monthlyGenerations}
              <span className="text-gray-400 font-normal"> / {usage.limits.generationsPerMonth}</span>
            </span>
          </div>
          <div className={`w-full h-3 ${getBarBg(monthlyPercent)} rounded-full overflow-hidden`}>
            <div
              className={`h-full rounded-full bg-gradient-to-r ${getBarGradient(monthlyPercent)} transition-all duration-700 ease-out shadow-sm`}
              style={{ width: `${monthlyPercent}%` }}
            />
          </div>
        </div>

        {/* Daily usage */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Generaciones hoy</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {usage.dailyGenerations}
              <span className="text-gray-400 font-normal"> / {usage.limits.generationsPerDay}</span>
            </span>
          </div>
          <div className={`w-full h-3 ${getBarBg(dailyPercent)} rounded-full overflow-hidden`}>
            <div
              className={`h-full rounded-full bg-gradient-to-r ${getBarGradient(dailyPercent)} transition-all duration-700 ease-out shadow-sm`}
              style={{ width: `${dailyPercent}%` }}
            />
          </div>
        </div>

        {/* Token info */}
        {usage.monthlyTokens > 0 && (
          <div className="pt-4 border-t border-gray-100/80 flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Tokens utilizados este mes</span>
            <span className="text-xs font-bold text-gray-500 tabular-nums bg-gray-50 px-2.5 py-1 rounded-lg">
              {usage.monthlyTokens.toLocaleString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
