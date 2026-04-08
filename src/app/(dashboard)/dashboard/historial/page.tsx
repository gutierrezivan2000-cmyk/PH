"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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
}

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const TYPE_LABELS: Record<string, string> = {
  full: "Completo",
  informe: "Informe",
  acta: "Acta",
  presentacion: "Presentacion",
};

export default function HistorialPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/generations")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setGenerations(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Header title="Historial de Generaciones" />
      <div className="p-6 max-w-3xl space-y-4">
        <p className="text-muted-foreground">
          Todos los documentos que has generado
        </p>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && generations.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">No hay generaciones aun</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tus documentos generados apareceran aqui
              </p>
              <Link href="/dashboard/generar" className="mt-4 text-primary text-sm underline">
                Generar documentos
              </Link>
            </CardContent>
          </Card>
        )}

        {generations.map((gen) => (
          <Link key={gen.id} href={`/dashboard/generar/${gen.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{gen.property.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {MONTHS[gen.month - 1]} {gen.year} — {TYPE_LABELS[gen.type] ?? gen.type}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {gen.status === "completed" && (
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {gen.tokensUsed.toLocaleString()} tokens
                    </span>
                  )}
                  <Badge
                    variant={
                      gen.status === "completed"
                        ? "default"
                        : gen.status === "failed"
                        ? "destructive"
                        : "secondary"
                    }
                    className="gap-1"
                  >
                    {gen.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                    {gen.status === "failed" && <AlertCircle className="h-3 w-3" />}
                    {gen.status === "processing" && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {gen.status === "completed"
                      ? "Listo"
                      : gen.status === "processing"
                      ? "Procesando"
                      : gen.status === "failed"
                      ? "Error"
                      : gen.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
