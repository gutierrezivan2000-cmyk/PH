"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
        <CardHeader>
          <CardTitle className="text-lg">Uso del Mes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </CardContent>
      </Card>
    );
  }

  const monthlyPercent = (usage.monthlyGenerations / usage.limits.generationsPerMonth) * 100;
  const dailyPercent = (usage.dailyGenerations / usage.limits.generationsPerDay) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Uso del Mes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Generaciones mensuales</span>
            <span className="font-medium">
              {usage.monthlyGenerations}/{usage.limits.generationsPerMonth}
            </span>
          </div>
          <Progress value={monthlyPercent} />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Generaciones hoy</span>
            <span className="font-medium">
              {usage.dailyGenerations}/{usage.limits.generationsPerDay}
            </span>
          </div>
          <Progress value={dailyPercent} />
        </div>
      </CardContent>
    </Card>
  );
}
