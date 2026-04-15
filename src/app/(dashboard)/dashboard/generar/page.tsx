"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";

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
  const [type, setType] = useState("full");
  const [additionalText, setAdditionalText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProperties(data);
      })
      .catch(console.error);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles].slice(0, 20));
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedProperty) {
      setError("Selecciona una propiedad");
      return;
    }

    const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    if (!isDemo && files.length === 0 && !additionalText.trim()) {
      setError("Debes subir al menos un archivo o escribir informacion");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("propertyId", selectedProperty);
      formData.append("month", month.toString());
      formData.append("year", year.toString());
      formData.append("type", type);
      if (additionalText.trim()) {
        formData.append("additionalText", additionalText);
      }
      files.forEach((file) => formData.append("files", file));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const res = await fetch("/api/generate/full", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data;
      try {
        data = await res.json();
      } catch {
        if (res.status === 504) {
          setError("El servidor tardo demasiado. Intenta generar solo un tipo (Informe o Acta).");
        } else {
          setError(`Error del servidor (${res.status}). Intenta de nuevo.`);
        }
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
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("La generacion tardo mas de 90 segundos. Intenta con menos archivos.");
      } else {
        setError("Error de conexion. Verifica tu internet e intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Generar Documentos" subtitle="Crea informes, actas y presentaciones con IA" />
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50/80 backdrop-blur border border-red-200/50 text-red-700 px-4 py-3 rounded-2xl flex items-center gap-2 text-sm shadow-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Property */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10">
            <h3 className="font-bold text-gray-900 mb-1">Propiedad</h3>
            <p className="text-xs text-gray-500 mb-4">Selecciona la propiedad para generar documentos</p>
            {properties.length === 0 ? (
              <div className="bg-amber-50/80 backdrop-blur border border-amber-200/50 rounded-2xl p-4 text-center">
                <p className="text-sm text-amber-800">
                  No tienes propiedades registradas.{" "}
                  <a href="/dashboard/propiedades" className="text-violet-600 font-semibold underline">Agrega una primero</a>.
                </p>
              </div>
            ) : (
              <select
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                className="w-full h-11 rounded-2xl border border-white/40 bg-white/50 backdrop-blur px-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-300 transition-all duration-300 appearance-none cursor-pointer"
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

          {/* Period */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10">
            <h3 className="font-bold text-gray-900 mb-4">Periodo</h3>
            <div className="flex gap-4">
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="flex-1 h-11 rounded-2xl border border-white/40 bg-white/50 backdrop-blur px-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all duration-300 appearance-none cursor-pointer"
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
                className="w-28 rounded-2xl border-white/40 bg-white/50 backdrop-blur"
              />
            </div>
          </div>

          {/* Type */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10">
            <h3 className="font-bold text-gray-900 mb-4">Tipo de generacion</h3>
            <div className="flex gap-3">
              {[
                { value: "full", label: "Completo", sub: "Informe + Acta + PPTX" },
                { value: "informe", label: "Solo Informe", sub: "" },
                { value: "acta", label: "Solo Acta", sub: "" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex-1 px-4 py-3.5 rounded-2xl text-sm font-medium border transition-all duration-300 ${
                    type === opt.value
                      ? "bg-violet-500/10 text-violet-700 border-violet-300/50 shadow-md shadow-violet-200/30 backdrop-blur-sm"
                      : "bg-white/30 text-gray-500 border-white/30 hover:bg-white/50 hover:border-white/50 backdrop-blur-sm"
                  }`}
                >
                  {opt.label}
                  {opt.sub && <span className="block text-xs mt-0.5 opacity-70">{opt.sub}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Files */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10">
            <h3 className="font-bold text-gray-900 mb-1">Archivos de soporte</h3>
            <p className="text-xs text-gray-500 mb-4">Sube textos, fotos, audios, PDFs, Excel o Word</p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/40 rounded-2xl p-10 cursor-pointer hover:border-violet-300/50 hover:bg-violet-50/30 transition-all duration-300 backdrop-blur-sm">
              <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-500 rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-violet-500/20">
                <Upload className="h-7 w-7 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700">
                Arrastra archivos o haz clic
              </span>
              <span className="text-xs text-gray-400 mt-1">
                PDF, Word, Excel, imagenes, audio (max 25MB)
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
                  <div key={`${file.name}-${i}`} className="flex items-center justify-between bg-white/40 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/30">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-4 w-4 text-violet-500 flex-shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                      <Badge variant="secondary" className="text-xs flex-shrink-0 bg-white/50">
                        {(file.size / 1024 / 1024).toFixed(1)}MB
                      </Badge>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="p-1.5 hover:bg-red-100/80 rounded-lg transition-colors">
                      <X className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional text */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10">
            <h3 className="font-bold text-gray-900 mb-1">Informacion adicional</h3>
            <p className="text-xs text-gray-500 mb-4">Notas o informacion extra (opcional)</p>
            <textarea
              value={additionalText}
              onChange={(e) => setAdditionalText(e.target.value)}
              rows={5}
              placeholder="Escribe notas, actividades realizadas, novedades del mes..."
              className="w-full rounded-2xl border border-white/40 bg-white/50 backdrop-blur px-4 py-3 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 resize-none transition-all duration-300"
            />
          </div>

          <Button type="submit" size="lg" className="w-full h-14 text-base rounded-2xl gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-xl shadow-violet-500/25 transition-all duration-300 hover:shadow-violet-500/40" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Enviando...
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
