"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Presentation, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

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
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!generation) {
    return (
      <div>
        <Header title="Resultado" />
        <div className="p-6">
          <p className="text-muted-foreground">Generacion no encontrada.</p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    pending: { label: "Pendiente", color: "secondary" as const, icon: Loader2 },
    processing: { label: "Procesando", color: "default" as const, icon: Loader2 },
    completed: { label: "Completado", color: "default" as const, icon: CheckCircle2 },
    failed: { label: "Error", color: "destructive" as const, icon: AlertCircle },
  };

  const status = statusConfig[generation.status as keyof typeof statusConfig] ?? statusConfig.pending;

  return (
    <div>
      <Header title={`${generation.property.name} - ${MONTHS[generation.month - 1]} ${generation.year}`} />
      <div className="p-6 max-w-3xl space-y-6">
        {/* Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Estado de la Generacion</CardTitle>
              <Badge variant={status.color} className="gap-1">
                <status.icon className={`h-3 w-3 ${generation.status === "processing" ? "animate-spin" : ""}`} />
                {status.label}
              </Badge>
            </div>
          </CardHeader>
          {generation.errorMessage && (
            <CardContent>
              <p className="text-sm text-destructive">{generation.errorMessage}</p>
            </CardContent>
          )}
        </Card>

        {/* Downloads */}
        {generation.status === "completed" && generation.outputFiles && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documentos Generados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {generation.outputFiles.informeHtml && (
                <a
                  href={generation.outputFiles.informeHtml}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <div>
                      <p className="font-medium">Informe de Gestion</p>
                      <p className="text-sm text-muted-foreground">Documento HTML (imprimir como PDF)</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-primary" />
                </a>
              )}
              {generation.outputFiles.actaHtml && (
                <a
                  href={generation.outputFiles.actaHtml}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium">Acta Legal</p>
                      <p className="text-sm text-muted-foreground">Documento HTML (imprimir como PDF)</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-green-600" />
                </a>
              )}
              {generation.outputFiles.presentacionPptx && (
                <a
                  href={generation.outputFiles.presentacionPptx}
                  download
                  className="flex items-center justify-between p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Presentation className="h-6 w-6 text-purple-600" />
                    <div>
                      <p className="font-medium">Presentacion PPTX</p>
                      <p className="text-sm text-muted-foreground">PowerPoint listo para presentar</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-purple-600" />
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {generation.status === "completed" && (
          <Card>
            <CardContent className="flex gap-6 p-6">
              <div>
                <p className="text-sm text-muted-foreground">Tokens utilizados</p>
                <p className="text-lg font-semibold">{generation.tokensUsed.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Costo estimado</p>
                <p className="text-lg font-semibold">${generation.costUsd.toFixed(4)}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
