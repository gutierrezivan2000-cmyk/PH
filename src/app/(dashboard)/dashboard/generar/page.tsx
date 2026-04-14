"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s — server has 60s max

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
          setError("El servidor tardo mas de 60 segundos. Intenta generar solo un tipo (Informe o Acta) en vez de Completo.");
        } else {
          setError(`Error del servidor (${res.status}). Intenta de nuevo.`);
        }
        return;
      }

      if (!res.ok) {
        // Show timing data if available for debugging
        const timingInfo = data.timing ? ` [Timing: ${JSON.stringify(data.timing)}]` : "";
        setError((data.error || "Error al generar documentos") + timingInfo);
        return;
      }

      // Cache the completed generation data so the results page can use it
      // even if the serverless in-memory store is gone on the next request
      if (data.status === "completed") {
        try {
          sessionStorage.setItem(`gen-${data.id}`, JSON.stringify(data));
        } catch {
          // sessionStorage unavailable — results page will poll API
        }
      }

      router.push(`/dashboard/generar/${data.id}`);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("La generacion tardo mas de 90 segundos. Intenta con menos archivos o un tipo individual (solo Informe o solo Acta).");
      } else {
        setError("Error de conexion. Verifica tu internet e intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Generar Documentos" />
      <div className="p-8 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Property selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Propiedad</CardTitle>
              <CardDescription>Selecciona la propiedad para generar documentos</CardDescription>
            </CardHeader>
            <CardContent>
              {properties.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-amber-800">
                    No tienes propiedades registradas.{" "}
                    <a href="/dashboard/propiedades" className="text-primary font-medium underline">Agrega una primero</a>.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Seleccionar propiedad...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.address ? `— ${p.address}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>

          {/* Period */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Periodo</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="flex-1 h-10 rounded-xl border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="w-28 rounded-xl"
              />
            </CardContent>
          </Card>

          {/* Generation type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tipo de generacion</CardTitle>
            </CardHeader>
            <CardContent>
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
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all duration-200 ${
                      type === opt.value
                        ? "bg-primary/5 text-primary border-primary/30 shadow-sm"
                        : "bg-white text-muted-foreground border-border/50 hover:bg-secondary hover:border-border"
                    }`}
                  >
                    {opt.label}
                    {opt.sub && <span className="block text-xs mt-0.5 opacity-70">{opt.sub}</span>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* File upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Archivos de soporte</CardTitle>
              <CardDescription>
                Sube textos, fotos, audios, PDFs, Excel o Word
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border/60 rounded-2xl p-10 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all duration-200">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  Arrastra archivos o haz clic para seleccionar
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  PDF, Word, Excel, imagenes, audio (max 25MB, max 20 archivos)
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
                <div className="space-y-2">
                  {files.map((file, i) => (
                    <div key={`${file.name}-${i}`} className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate">{file.name}</span>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {(file.size / 1024 / 1024).toFixed(1)}MB
                        </Badge>
                      </div>
                      <button type="button" onClick={() => removeFile(i)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                        <X className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional text */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informacion adicional</CardTitle>
              <CardDescription>
                Notas o informacion extra que quieras incluir (opcional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={additionalText}
                onChange={(e) => setAdditionalText(e.target.value)}
                rows={5}
                placeholder="Escribe aqui notas, actividades realizadas, novedades del mes..."
                className="w-full rounded-xl border border-input bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </CardContent>
          </Card>

          <Button type="submit" size="lg" className="w-full h-14 text-base rounded-2xl gap-2" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Generando documentos...
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
