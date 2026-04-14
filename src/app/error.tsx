"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Algo salio mal
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Ocurrio un error inesperado. Por favor intenta de nuevo o regresa al inicio.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Intentar de nuevo
          </Button>
          <Link href="/">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <Home className="h-4 w-4" />
              Ir al inicio
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
