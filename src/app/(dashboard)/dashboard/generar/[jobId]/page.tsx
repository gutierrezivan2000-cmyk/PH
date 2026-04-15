"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Presentation, Download, Loader2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";

interface Generation {
  id: string;
  type: string;
  status: string;
  month: number;
  year: number;
  tokensUsed: number;
  costUsd: number;
  errorMessage?: string;
  outputFiles?: {
    informeHtml?: string;
    actaHtml?: string;
    presentacionPptx?: string;
  };
  property: {
    name: string;
  };
  createdAt: string;
  completedAt?: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function JobResultPage() {
  const params = useParams();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check sessionStorage first (demo mode caches completed generations here)
    try {
      const cached = sessionStorage.getItem(`gen-${params.jobId}`);
      if (cached) {
        setGeneration(JSON.parse(cached));
        setLoading(false);
        return;
      }
    } catch {
      // sessionStorage unavailable — fall through to API
    }

    let cancelled = false;
    const fetchJob = async () => {
      const res = await fetch(`/api/jobs/${params.jobId}`);
      if (res.ok && !cancelled) {
        const data = await res.json();
        setGeneration(data);
        // Stop polling once completed or failed
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      }
      if (!cancelled) setLoading(false);
    };

    fetchJob();
    const interval = setInterval(fetchJob, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [params.jobId]);

  if (loading) {
    return (
      <div>
        <Header title="Resultado" />
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm">Cargando resultado...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!generation) {
    return (
      <div>
        <Header title="Resultado" />
        <div className="p-8">
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="font-semibold">Generacion no encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">Es posible que haya expirado o no exista.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const statusConfig = {
    pending: { label: "Pendiente", variant: "secondary" as const, icon: Loader2, spin: true },
    processing: { label: "Procesando", variant: "default" as const, icon: Sparkles, spin: true },
    completed: { label: "Completado", variant: "default" as const, icon: CheckCircle2, spin: false },
    failed: { label: "Error", variant: "destructive" as const, icon: AlertCircle, spin: false },
  };

  const status = statusConfig[generation.status as keyof typeof statusConfig] ?? statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div>
      <Header title={`${generation.property.name} — ${MONTHS[generation.month - 1]} ${generation.year}`} />
      <div className="p-8 max-w-3xl space-y-6">
        {/* Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Estado de la Generacion</CardTitle>
              <Badge variant={status.variant} className="gap-1.5 px-3 py-1">
                <StatusIcon className={`h-3.5 w-3.5 ${status.spin ? "animate-spin" : ""}`} />
                {status.label}
              </Badge>
            </div>
          </CardHeader>
          {generation.errorMessage && (
            <CardContent>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-700">{generation.errorMessage}</p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Processing indicator */}
        {(generation.status === "processing" || generation.status === "pending") && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
              <p className="font-semibold text-lg">Generando documentos con IA...</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                SOPH.IA esta analizando tus archivos y generando informe, acta y presentacion.
                Esto puede tomar entre 1 y 3 minutos. Esta pagina se actualiza automaticamente.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Downloads */}
        {generation.status === "completed" && generation.outputFiles && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Documentos Generados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {generation.outputFiles.informeHtml && (
                <a
                  href={generation.outputFiles.informeHtml}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between p-5 bg-blue-50/80 rounded-2xl hover:bg-blue-100/80 transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Informe de Gestion</p>
                      <p className="text-xs text-muted-foreground">HTML — abrir e imprimir como PDF</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-blue-600 group-hover:translate-y-0.5 transition-transform" />
                </a>
              )}
              {generation.outputFiles.actaHtml && (
                <a
                  href={generation.outputFiles.actaHtml}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between p-5 bg-emerald-50/80 rounded-2xl hover:bg-emerald-100/80 transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FileText className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Acta Legal</p>
                      <p className="text-xs text-muted-foreground">HTML — abrir e imprimir como PDF</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-emerald-600 group-hover:translate-y-0.5 transition-transform" />
                </a>
              )}
              {generation.outputFiles.presentacionPptx && (
                <a
                  href={generation.outputFiles.presentacionPptx}
                  download
                  className="group flex items-center justify-between p-5 bg-purple-50/80 rounded-2xl hover:bg-purple-100/80 transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Presentation className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Presentacion PPTX</p>
                      <p className="text-xs text-muted-foreground">PowerPoint listo para presentar</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-purple-600 group-hover:translate-y-0.5 transition-transform" />
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {generation.status === "completed" && (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Tokens</p>
                <p className="text-2xl font-bold tabular-nums">{generation.tokensUsed.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Costo</p>
                <p className="text-2xl font-bold tabular-nums">${generation.costUsd.toFixed(4)}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
