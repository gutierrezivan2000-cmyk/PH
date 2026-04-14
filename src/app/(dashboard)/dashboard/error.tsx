"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto w-full">
      <Card className="border-red-200/50">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Error al cargar la pagina
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-6">
            Ocurrio un error al cargar esta seccion. Esto puede deberse a un problema temporal. Intenta de nuevo.
          </p>
          <div className="flex gap-3">
            <Button onClick={reset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reintentar
            </Button>
            <Link href="/dashboard">
              <Button variant="outline" className="gap-2">
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
