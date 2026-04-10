"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <Header title="Historial" />
      <div className="p-8 max-w-3xl space-y-5">
        <p className="text-sm text-muted-foreground">
          Todos los documentos que has generado
        </p>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {!loading && generations.length === 0 && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <p className="font-semibold mb-1">No hay generaciones aun</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Tus documentos generados apareceran aqui
              </p>
              <Link href="/dashboard/generar" className="mt-6">
                <Button className="gap-2">
                  <FileText className="h-4 w-4" />
                  Generar documentos
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {generations.map((gen) => (
            <Link key={gen.id} href={`/dashboard/generar/${gen.id}`}>
              <Card className="group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{gen.property.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {MONTHS[gen.month - 1]} {gen.year} — {TYPE_LABELS[gen.type] ?? gen.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {gen.status === "completed" && (
                      <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
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
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
