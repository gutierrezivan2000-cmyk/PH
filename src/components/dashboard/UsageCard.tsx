"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity } from "lucide-react";

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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Uso del Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const monthlyPercent = (usage.monthlyGenerations / usage.limits.generationsPerMonth) * 100;
  const dailyPercent = (usage.dailyGenerations / usage.limits.generationsPerDay) * 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Uso del Mes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Generaciones mensuales</span>
            <span className="font-semibold tabular-nums">
              {usage.monthlyGenerations}/{usage.limits.generationsPerMonth}
            </span>
          </div>
          <Progress value={monthlyPercent} />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Generaciones hoy</span>
            <span className="font-semibold tabular-nums">
              {usage.dailyGenerations}/{usage.limits.generationsPerDay}
            </span>
          </div>
          <Progress value={dailyPercent} />
        </div>
      </CardContent>
    </Card>
  );
}
