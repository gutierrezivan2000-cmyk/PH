"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2, ArrowRight, Sparkles } from "lucide-react";
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
      <Header title="Historial" subtitle="Todos los documentos que has generado" />
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-5">

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-[3px] border-violet-200 dark:border-violet-800 border-t-violet-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && generations.length === 0 && (
          <div className="bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-3xl p-12 text-center shadow-lg dark:shadow-black/20">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-violet-500/25">
              <Clock className="h-8 w-8 text-white" />
            </div>
            <p className="font-bold text-lg text-gray-900 dark:text-white mb-1">No hay generaciones aun</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
              Tus documentos generados apareceran aqui
            </p>
            <Link href="/dashboard/generar" className="inline-block mt-6">
              <Button className="gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-500/20">
                <Sparkles className="h-4 w-4" />
                Generar documentos
              </Button>
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {generations.map((gen, index) => (
            <Link key={gen.id} href={`/dashboard/generar/${gen.id}`}>
              <div
                className="group bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-2xl hover:shadow-xl hover:shadow-violet-100/20 dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-4 p-5">
                  <div className="w-11 h-11 bg-gradient-to-br from-violet-100/80 to-purple-100/80 dark:from-violet-500/20 dark:to-purple-500/20 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{gen.property.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {MONTHS[gen.month - 1]} {gen.year} — {TYPE_LABELS[gen.type] ?? gen.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        gen.status === "completed"
                          ? "default"
                          : gen.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                      className="gap-1 rounded-lg"
                    >
                      {gen.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                      {gen.status === "failed" && <AlertCircle className="h-3 w-3" />}
                      {gen.status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
                      {gen.status === "completed"
                        ? "Listo"
                        : gen.status === "processing"
                        ? "Procesando"
                        : gen.status === "failed"
                        ? "Error"
                        : gen.status}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-all duration-200" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
