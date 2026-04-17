"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText, Presentation, Download, AlertCircle, CheckCircle2,
  Sparkles, ArrowLeft, Loader2, Mic, MessageSquarePlus, ClipboardList,
  CircleCheck, CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ActaRequirement {
  item: string;
  status: "completo" | "pendiente";
  detail: string;
}

interface Generation {
  id: string;
  type: string;
  status: string;
  progress?: number;
  month: number;
  year: number;
  tokensUsed: number;
  costUsd: number;
  errorMessage?: string;
  outputFiles?: {
    informeHtml?: string;
    actaHtml?: string;
    informeMarkdown?: string;
    actaMarkdown?: string;
    presentacionPptx?: string;
    transcripcion?: string;
    actaRequirements?: string;
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

const PROGRESS_STEPS = [
  { min: 0, label: "Preparando archivos..." },
  { min: 10, label: "Analizando contenido..." },
  { min: 25, label: "Generando documentos con IA..." },
  { min: 60, label: "Creando documentos..." },
  { min: 70, label: "Generando presentacion..." },
  { min: 90, label: "Finalizando..." },
];

function getProgressLabel(progress: number): string {
  let label = PROGRESS_STEPS[0].label;
  for (const step of PROGRESS_STEPS) {
    if (progress >= step.min) label = step.label;
  }
  return label;
}

function parseActaRequirements(raw?: string): ActaRequirement[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function JobResultPage() {
  const params = useParams();
  const router = useRouter();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [pptxError, setPptxError] = useState("");
  const pptxTriggered = useRef(false);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(`gen-${params.jobId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setGeneration(parsed);
        if (parsed.status === "completed") setDisplayProgress(100);
        setLoading(false);
        return;
      }
    } catch {
      // fall through
    }

    let cancelled = false;
    const fetchJob = async () => {
      const res = await fetch(`/api/jobs/${params.jobId}`);
      if (res.ok && !cancelled) {
        const data = await res.json();
        setGeneration(data);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      }
      if (!cancelled) setLoading(false);
    };

    fetchJob();
    const interval = setInterval(fetchJob, 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [params.jobId]);

  useEffect(() => {
    const target = generation?.status === "completed" ? 100 : (generation?.progress ?? 0);
    if (target > displayProgress) {
      const timer = setTimeout(() => {
        setDisplayProgress((prev) => Math.min(prev + 1, target));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [generation?.progress, generation?.status, displayProgress]);

  const triggerPptx = useCallback(async (genId: string) => {
    if (pptxTriggered.current) return;
    pptxTriggered.current = true;
    setPptxLoading(true);
    setPptxError("");

    try {
      const res = await fetch("/api/generate/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId: genId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPptxError(data.error || "Error al generar presentacion");
        return;
      }

      const refreshRes = await fetch(`/api/jobs/${genId}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setGeneration(refreshData);
      }
    } catch {
      setPptxError("Error de conexion al generar presentacion");
    } finally {
      setPptxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      generation?.status === "completed" &&
      generation.outputFiles?.informeMarkdown &&
      !generation.outputFiles?.presentacionPptx &&
      generation.outputFiles?.informeHtml
    ) {
      triggerPptx(generation.id);
    }
  }, [generation?.status, generation?.outputFiles, generation?.id, triggerPptx]);

  if (loading) {
    return (
      <div>
        <Header title="Resultado" />
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="w-14 h-14 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!generation) {
    return (
      <div>
        <Header title="Resultado" />
        <div className="p-8 max-w-2xl mx-auto">
          <div className="bg-white/60 backdrop-blur-xl border border-white/30 rounded-3xl p-12 text-center shadow-lg">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="font-semibold text-lg">Generacion no encontrada</p>
            <p className="text-sm text-gray-500 mt-2">Es posible que haya expirado o no exista.</p>
            <Link href="/dashboard/historial">
              <Button variant="outline" className="mt-6 gap-2 rounded-xl">
                <ArrowLeft className="h-4 w-4" /> Ir al historial
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = generation.status === "processing" || generation.status === "pending";
  const isCompleted = generation.status === "completed";
  const isFailed = generation.status === "failed";
  const actaRequirements = parseActaRequirements(generation.outputFiles?.actaRequirements);

  return (
    <div>
      <Header title={`${generation.property.name} — ${MONTHS[generation.month - 1]} ${generation.year}`} />
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">

        {/* ── Processing ── */}
        {isProcessing && (
          <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-3xl p-8 lg:p-10 text-white shadow-2xl shadow-violet-500/30">
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-orb" />
              <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-purple-300/10 rounded-full blur-2xl animate-orb-delayed" />
            </div>
            <div className="relative space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Generando documentos...</h3>
                  <p className="text-violet-200 text-sm">{getProgressLabel(displayProgress)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-white/15 rounded-full overflow-hidden backdrop-blur-sm">
                  <div
                    className="h-full bg-gradient-to-r from-white/90 to-violet-200 rounded-full transition-all duration-300 ease-out relative"
                    style={{ width: `${displayProgress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" />
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-violet-200">{displayProgress}%</span>
                  <span className="text-violet-200/70">Se actualiza automaticamente</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Failed ── */}
        {isFailed && (
          <div className="bg-red-50/80 backdrop-blur-xl border border-red-200/50 rounded-3xl p-8 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-red-800 text-lg">Error en la generacion</h3>
                <p className="text-sm text-red-600 mt-1">{generation.errorMessage || "Ocurrio un error inesperado."}</p>
                <Link href="/dashboard/generar">
                  <Button className="mt-4 gap-2 rounded-xl" size="sm">
                    <Sparkles className="h-4 w-4" /> Intentar de nuevo
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Success Banner ── */}
        {isCompleted && (
          <div className="bg-emerald-50/80 backdrop-blur-xl border border-emerald-200/50 rounded-3xl p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-emerald-800">Documentos listos</h3>
                <p className="text-sm text-emerald-600">Tus documentos han sido generados exitosamente.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Downloads ── */}
        {isCompleted && generation.outputFiles && (
          <Card className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-gray-900">Documentos Generados</h3>

              {generation.outputFiles.informeHtml && (
                <a
                  href={generation.outputFiles.informeHtml}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between p-5 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 backdrop-blur rounded-2xl border border-blue-100/50 hover:border-blue-200 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100/80 backdrop-blur rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Informe de Gestion</p>
                      <p className="text-xs text-gray-500">Abrir e imprimir como PDF</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-blue-500 group-hover:translate-y-0.5 transition-transform" />
                </a>
              )}

              {generation.outputFiles.actaHtml && (
                <a
                  href={generation.outputFiles.actaHtml}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between p-5 bg-gradient-to-r from-emerald-50/80 to-teal-50/50 backdrop-blur rounded-2xl border border-emerald-100/50 hover:border-emerald-200 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100/80 backdrop-blur rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <FileText className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Acta Legal</p>
                      <p className="text-xs text-gray-500">Abrir e imprimir como PDF</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-emerald-500 group-hover:translate-y-0.5 transition-transform" />
                </a>
              )}

              {generation.outputFiles.presentacionPptx ? (
                <a
                  href={generation.outputFiles.presentacionPptx}
                  download
                  className="group flex items-center justify-between p-5 bg-gradient-to-r from-purple-50/80 to-violet-50/50 backdrop-blur rounded-2xl border border-purple-100/50 hover:border-purple-200 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100/80 backdrop-blur rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Presentation className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Presentacion PPTX</p>
                      <p className="text-xs text-gray-500">PowerPoint listo para presentar</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-purple-500 group-hover:translate-y-0.5 transition-transform" />
                </a>
              ) : generation.outputFiles.informeMarkdown ? (
                <div className="p-5 bg-gradient-to-r from-purple-50/80 to-violet-50/50 backdrop-blur rounded-2xl border border-purple-100/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100/80 backdrop-blur rounded-xl flex items-center justify-center">
                      {pptxLoading ? (
                        <Loader2 className="h-6 w-6 text-purple-600 animate-spin" />
                      ) : (
                        <Presentation className="h-6 w-6 text-purple-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-900">Presentacion PPTX</p>
                      {pptxLoading ? (
                        <p className="text-xs text-purple-600">Generando presentacion...</p>
                      ) : pptxError ? (
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-red-500">{pptxError}</p>
                          <button
                            onClick={() => { pptxTriggered.current = false; triggerPptx(generation.id); }}
                            className="text-xs text-purple-600 font-medium underline hover:text-purple-800"
                          >
                            Reintentar
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Preparando...</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {generation.outputFiles.transcripcion && (
                <a
                  href={generation.outputFiles.transcripcion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between p-5 bg-gradient-to-r from-amber-50/80 to-orange-50/50 backdrop-blur rounded-2xl border border-amber-100/50 hover:border-amber-200 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100/80 backdrop-blur rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Mic className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Transcripcion de Insumos</p>
                      <p className="text-xs text-gray-500">Verifica la transcripcion de audios y analisis de fotos</p>
                    </div>
                  </div>
                  <Download className="h-5 w-5 text-amber-500 group-hover:translate-y-0.5 transition-transform" />
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Acta Requirements Checklist ── */}
        {isCompleted && generation.outputFiles?.actaHtml && actaRequirements.length > 0 && (
          <ActaRequirementsChecklist requirements={actaRequirements} />
        )}

        {/* ── Correction Panel ── */}
        {isCompleted && (generation.outputFiles?.informeHtml || generation.outputFiles?.actaHtml) && (
          <CorrectionPanel
            generationId={generation.id}
            hasInforme={!!generation.outputFiles?.informeHtml}
            hasActa={!!generation.outputFiles?.actaHtml}
            onRefreshed={(data) => { pptxTriggered.current = false; setGeneration(data); }}
          />
        )}

        {/* ── Back ── */}
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => router.push("/dashboard/historial")}>
            <ArrowLeft className="h-4 w-4" /> Historial
          </Button>
          {(isCompleted || isFailed) && (
            <Link href="/dashboard/generar">
              <Button className="gap-2 rounded-xl">
                <Sparkles className="h-4 w-4" /> Nueva generacion
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ActaRequirementsChecklist({ requirements }: { requirements: ActaRequirement[] }) {
  const completed = requirements.filter((r) => r.status === "completo").length;
  const total = requirements.length;
  const allComplete = completed === total;

  return (
    <Card className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${allComplete ? "bg-emerald-100/80" : "bg-amber-100/80"}`}>
            <ClipboardList className={`h-5 w-5 ${allComplete ? "text-emerald-600" : "text-amber-600"}`} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">Requisitos del Acta Legal</h3>
            <p className="text-xs text-gray-500">Verificacion segun la Ley 675 de 2001</p>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${allComplete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {completed}/{total}
          </div>
        </div>

        {!allComplete && (
          <div className="bg-amber-50/80 border border-amber-200/40 rounded-xl px-4 py-2.5">
            <p className="text-xs text-amber-700">
              Hay {total - completed} requisito{total - completed > 1 ? "s" : ""} pendiente{total - completed > 1 ? "s" : ""}. Puedes completarlos usando el panel de correcciones de abajo, indicando la informacion faltante.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {requirements.map((req, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                req.status === "completo"
                  ? "bg-emerald-50/50 border-emerald-100/50"
                  : "bg-amber-50/50 border-amber-100/50"
              }`}
            >
              {req.status === "completo" ? (
                <CircleCheck className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              ) : (
                <CircleAlert className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-medium ${req.status === "completo" ? "text-emerald-800" : "text-amber-800"}`}>
                  {req.item}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{req.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CorrectionPanel({ generationId, hasInforme, hasActa, onRefreshed }: { generationId: string; hasInforme: boolean; hasActa: boolean; onRefreshed: (data: Generation) => void }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleCorrect = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/generate/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, instruction: instruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al corregir");
        return;
      }

      const docs = (data.documentsUpdated as string[]) || [];
      const docNames = docs.map((d: string) => d === "informe" ? "Informe" : "Acta").join(" y ");
      setSuccess(`${docNames} corregido${docs.length > 1 ? "s" : ""} exitosamente.${hasInforme ? " La presentacion PPTX se actualizara automaticamente." : ""}`);
      setInstruction("");

      const refreshRes = await fetch(`/api/jobs/${generationId}`);
      if (refreshRes.ok) onRefreshed(await refreshRes.json());
    } catch {
      setError("Error de conexion.");
    } finally {
      setLoading(false);
    }
  };

  const docLabel = hasInforme && hasActa ? "todos los documentos" : hasInforme ? "el informe" : "el acta";

  return (
    <Card className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100/80 rounded-xl flex items-center justify-center">
            <MessageSquarePlus className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Corregir documentos</h3>
            <p className="text-xs text-gray-500">
              La correccion se aplicara automaticamente a {docLabel}
              {hasInforme ? " y la presentacion PPTX se regenerara" : ""}
            </p>
          </div>
        </div>

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          placeholder="Ej: Agrega que se realizo mantenimiento del ascensor el 15 de marzo. El costo fue de $2.500.000. Asistieron 15 propietarios con un quorum del 62%..."
          className="w-full rounded-2xl border border-white/40 bg-white/50 backdrop-blur px-4 py-3 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 resize-none"
        />

        {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
        {success && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{success}</p>}

        <Button
          onClick={handleCorrect}
          disabled={loading || !instruction.trim()}
          className="w-full gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Corrigiendo {docLabel}...</> : <><MessageSquarePlus className="h-4 w-4" /> Aplicar correccion</>}
        </Button>
      </CardContent>
    </Card>
  );
}
