"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  Lightbulb,
  FileBarChart,
  Presentation,
  Scale,
  ChevronRight,
  Info,
} from "lucide-react";

const MAX_FILE_SIZE = 500 * 1024 * 1024;

interface Property {
  id: string;
  name: string;
  address?: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function GenerarPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [includeInforme, setIncludeInforme] = useState(true);
  const [includeActa, setIncludeActa] = useState(false);
  const [includePptx, setIncludePptx] = useState(false);
  const [additionalText, setAdditionalText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProperties(data);
      })
      .catch(console.error);
  }, []);

  const handlePptxChange = useCallback((checked: boolean) => {
    setIncludePptx(checked);
    if (checked) setIncludeInforme(true);
  }, []);

  const handleInformeChange = useCallback((checked: boolean) => {
    setIncludeInforme(checked);
    if (!checked) setIncludePptx(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const oversized = newFiles.find((f) => f.size > MAX_FILE_SIZE);
      if (oversized) {
        setError(`"${oversized.name}" supera el limite de 500 MB.`);
        return;
      }
      setError("");
      setFiles((prev) => [...prev, ...newFiles].slice(0, 20));
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const nothingSelected = !includeInforme && !includeActa && !includePptx;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUploadStatus("");

    if (!selectedProperty) {
      setError("Selecciona una propiedad");
      return;
    }

    if (nothingSelected) {
      setError("Selecciona al menos un tipo de documento a generar");
      return;
    }

    const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    if (!isDemo && files.length === 0 && !additionalText.trim()) {
      setError("Debes subir al menos un archivo o escribir informacion");
      return;
    }

    setLoading(true);

    try {
      const blobFiles: { url: string; name: string; type: string; size: number }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStatus(`Subiendo archivo ${i + 1} de ${files.length}: ${file.name}`);
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const result = await upload(`uploads/${Date.now()}-${safeName}`, file, {
          access: "private",
          handleUploadUrl: "/api/upload/token",
          contentType: file.type || "application/octet-stream",
          multipart: file.size > 10 * 1024 * 1024,
        });
        blobFiles.push({
          url: result.url,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
        });
      }

      setUploadStatus("Iniciando generacion...");

      const res = await fetch("/api/generate/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedProperty,
          month,
          year,
          type: "custom",
          includeInforme,
          includeActa,
          includePptx,
          additionalText: additionalText.trim() || undefined,
          blobFiles,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError(`Error del servidor (${res.status}). Intenta de nuevo.`);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Error al generar documentos");
        return;
      }

      if (data.status === "completed") {
        try {
          sessionStorage.setItem(`gen-${data.id}`, JSON.stringify(data));
        } catch {
          // sessionStorage unavailable
        }
      }

      router.push(`/dashboard/generar/${data.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/No autorizado/i.test(msg)) {
        setError("Sesion expirada. Recarga la pagina e inicia sesion de nuevo.");
      } else if (/aborted/i.test(msg)) {
        setError("La subida fue cancelada. Intenta de nuevo.");
      } else {
        setError(`Error al subir archivos: ${msg}`);
      }
    } finally {
      setLoading(false);
      setUploadStatus("");
    }
  };

  return (
    <div>
      <Header title="Generar Documentos" subtitle="Crea informes, actas y presentaciones con IA" />
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50/80 dark:bg-red-500/10 backdrop-blur border border-red-200/50 dark:border-red-500/20 text-red-700 dark:text-red-300 px-4 py-3 rounded-2xl flex items-center gap-2 text-sm shadow-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1 — Property */}
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-lg shadow-violet-100/10 dark:shadow-black/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md shadow-violet-500/20">1</div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Selecciona tu propiedad</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Escoge el conjunto o edificio para el cual vas a generar documentos</p>
              </div>
            </div>
            {properties.length === 0 ? (
              <div className="bg-amber-50/80 dark:bg-amber-500/10 backdrop-blur border border-amber-200/50 dark:border-amber-500/20 rounded-2xl p-4 text-center">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  No tienes propiedades registradas.{" "}
                  <a href="/dashboard/propiedades" className="text-violet-600 dark:text-violet-300 font-semibold underline">Agrega una primero</a>.
                </p>
              </div>
            ) : (
              <select
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                className="w-full h-11 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-300 transition-all duration-300 appearance-none cursor-pointer"
              >
                <option value="">Seleccionar propiedad...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.address ? `— ${p.address}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Step 2 — Period */}
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-lg shadow-violet-100/10 dark:shadow-black/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md shadow-violet-500/20">2</div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Periodo del documento</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Mes y ano que cubriran los documentos generados</p>
              </div>
            </div>
            <div className="flex gap-4">
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="flex-1 h-11 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all duration-300 appearance-none cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                min={2020}
                max={2030}
                className="w-28 rounded-2xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
              />
            </div>
          </div>

          {/* Step 3 — Document types */}
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-lg shadow-violet-100/10 dark:shadow-black/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md shadow-violet-500/20">3</div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Que documentos necesitas?</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Selecciona los que quieras generar. Puedes elegir uno o varios</p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              <label className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${includeInforme ? "bg-violet-500/10 border-violet-300/50 dark:border-violet-500/20 shadow-sm" : "bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
                <input type="checkbox" checked={includeInforme} onChange={(e) => handleInformeChange(e.target.checked)} className="h-4 w-4 rounded accent-violet-600" />
                <FileBarChart className={`h-5 w-5 flex-shrink-0 ${includeInforme ? "text-violet-600 dark:text-violet-300" : "text-gray-400 dark:text-gray-500"}`} />
                <div className="flex-1">
                  <span className={`text-sm font-medium ${includeInforme ? "text-violet-700 dark:text-violet-300" : "text-gray-600 dark:text-gray-300"}`}>Informe de Gestion</span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500">Resumen ejecutivo de la gestion mensual de la copropiedad</span>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${includeActa ? "bg-emerald-500/10 border-emerald-300/50 dark:border-emerald-500/20 shadow-sm" : "bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
                <input type="checkbox" checked={includeActa} onChange={(e) => setIncludeActa(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
                <Scale className={`h-5 w-5 flex-shrink-0 ${includeActa ? "text-emerald-600 dark:text-emerald-300" : "text-gray-400 dark:text-gray-500"}`} />
                <div className="flex-1">
                  <span className={`text-sm font-medium ${includeActa ? "text-emerald-700 dark:text-emerald-300" : "text-gray-600 dark:text-gray-300"}`}>Acta Legal</span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500">Acta de reunion del Consejo de Administracion con formato legal</span>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${includePptx ? "bg-purple-500/10 border-purple-300/50 dark:border-purple-500/20 shadow-sm" : "bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
                <input type="checkbox" checked={includePptx} onChange={(e) => handlePptxChange(e.target.checked)} className="h-4 w-4 rounded accent-purple-600" />
                <Presentation className={`h-5 w-5 flex-shrink-0 ${includePptx ? "text-purple-600 dark:text-purple-300" : "text-gray-400 dark:text-gray-500"}`} />
                <div className="flex-1">
                  <span className={`text-sm font-medium ${includePptx ? "text-purple-700 dark:text-purple-300" : "text-gray-600 dark:text-gray-300"}`}>Presentacion PPTX</span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500">Diapositivas PowerPoint basadas en el informe de gestion</span>
                  {!includeInforme && (
                    <span className="block text-xs text-amber-500 dark:text-amber-300 mt-0.5 flex items-center gap-1">
                      <Info className="h-3 w-3" /> Al seleccionar PPTX se incluira el informe automaticamente
                    </span>
                  )}
                </div>
              </label>
            </div>

            {nothingSelected && (
              <div className="mt-3 bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200/50 dark:border-amber-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-300 flex-shrink-0" />
                <span className="text-xs text-amber-700 dark:text-amber-300">Selecciona al menos un tipo de documento para continuar</span>
              </div>
            )}
          </div>

          {/* Step 4 — Files + Recommendations */}
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-lg shadow-violet-100/10 dark:shadow-black/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md shadow-violet-500/20">4</div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Sube tus archivos de soporte</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">La IA analizara todo lo que subas para generar documentos fieles a tu informacion</p>
              </div>
            </div>

            {/* Recommendations panel */}
            <div className="mt-4 mb-5 bg-gradient-to-br from-violet-50/80 to-purple-50/60 dark:from-violet-500/10 dark:to-purple-500/10 border border-violet-200/40 dark:border-violet-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-violet-500 dark:text-violet-400" />
                <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">Que deberia subir para obtener buenos resultados?</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">No es obligatorio subir todo, pero entre mas informacion le des a la IA, mejores seran los documentos. Aqui algunas recomendaciones:</p>

              {includeInforme && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileBarChart className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" />
                    <span className="text-xs font-semibold text-violet-600 dark:text-violet-300">Para el Informe de Gestion:</span>
                  </div>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ml-5">
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-violet-400 mt-0.5 flex-shrink-0" />Estados financieros del mes (Excel o PDF)</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-violet-400 mt-0.5 flex-shrink-0" />Reporte de cartera y recaudos</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-violet-400 mt-0.5 flex-shrink-0" />Registros de mantenimientos realizados</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-violet-400 mt-0.5 flex-shrink-0" />Fotos de obras, mejoras o danos</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-violet-400 mt-0.5 flex-shrink-0" />Novedades de seguridad, personal o proveedores</li>
                  </ul>
                </div>
              )}

              {includeActa && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Scale className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">Para el Acta Legal:</span>
                  </div>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ml-5">
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />Grabacion de audio de la reunion (MP3, M4A, WAV)</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />Orden del dia o agenda de la reunion</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />Lista de asistentes</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />Actas anteriores como referencia de formato</li>
                  </ul>
                </div>
              )}

              {!includeInforme && !includeActa && includePptx && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Presentation className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-300">Para la Presentacion:</span>
                  </div>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ml-5">
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 text-purple-400 mt-0.5 flex-shrink-0" />Los mismos insumos del informe de gestion</li>
                  </ul>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-violet-200/30 dark:border-violet-500/20">
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">Tambien puedes subir: PDFs, documentos Word, archivos de texto, hojas de calculo, imagenes y audios de hasta 500 MB.</p>
              </div>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl p-10 cursor-pointer hover:border-violet-300 dark:hover:border-violet-500/30 hover:bg-violet-50/30 dark:hover:bg-violet-500/10 transition-all duration-300">
              <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-500 rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-violet-500/20">
                <Upload className="h-7 w-7 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Arrastra archivos o haz clic para seleccionar
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                PDF, Word, Excel, imagenes, audio — hasta 20 archivos
              </span>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.m4a,.webm"
              />
            </label>

            {files.length > 0 && (
              <div className="space-y-2 mt-4">
                {files.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center justify-between bg-gray-50 dark:bg-white/5 rounded-xl px-4 py-2.5 border border-gray-200 dark:border-white/10">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-4 w-4 text-violet-500 flex-shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                      <Badge variant="secondary" className="text-xs flex-shrink-0 bg-white/50 dark:bg-white/10">
                        {(file.size / 1024 / 1024).toFixed(1)}MB
                      </Badge>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="p-1.5 hover:bg-red-100/80 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                      <X className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 5 — Additional text */}
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-lg shadow-violet-100/10 dark:shadow-black/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md shadow-violet-500/20">5</div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Informacion adicional</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Si quieres, puedes agregar notas o datos que la IA deba tener en cuenta</p>
              </div>
            </div>
            <textarea
              value={additionalText}
              onChange={(e) => setAdditionalText(e.target.value)}
              rows={5}
              placeholder="Ejemplo: Este mes se realizo el cambio de bombas del cuarto de maquinas. Hubo un corte de agua del 3 al 5 de marzo por obras de la empresa de acueducto..."
              className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 resize-none transition-all duration-300"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full h-14 text-base rounded-2xl gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-xl shadow-violet-500/25 transition-all duration-300 hover:shadow-violet-500/40"
            disabled={loading || nothingSelected}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {uploadStatus || "Enviando..."}
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generar Documentos
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
