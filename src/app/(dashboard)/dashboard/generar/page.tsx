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

      const res = await fetch("/api/generate/full", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al generar documentos");
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
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Generar Documentos" />
      <div className="p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Property selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Propiedad</CardTitle>
              <CardDescription>Selecciona la propiedad para la que deseas generar documentos</CardDescription>
            </CardHeader>
            <CardContent>
              {properties.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tienes propiedades registradas.{" "}
                  <a href="/dashboard/propiedades" className="text-primary underline">Agrega una primero</a>.
                </p>
              ) : (
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Seleccionar propiedad...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.address ? `- ${p.address}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>

          {/* Period */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Periodo</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
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
                className="w-28"
              />
            </CardContent>
          </Card>

          {/* Generation type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tipo de generacion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {[
                  { value: "full", label: "Completo (Informe + Acta + PPTX)" },
                  { value: "informe", label: "Solo Informe" },
                  { value: "acta", label: "Solo Acta" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      type === opt.value
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-foreground border-input hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* File upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Archivos de soporte</CardTitle>
              <CardDescription>
                Sube textos, fotos, audios, PDFs, Excel o Word con la informacion de tu gestion
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-input rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  Arrastra archivos aqui o haz clic para seleccionar
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  PDF, Word, Excel, imagenes, audio (max 25MB c/u, max 20 archivos)
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
                    <div key={`${file.name}-${i}`} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{file.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {(file.size / 1024 / 1024).toFixed(1)}MB
                        </Badge>
                      </div>
                      <button type="button" onClick={() => removeFile(i)}>
                        <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional text */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informacion adicional (opcional)</CardTitle>
              <CardDescription>
                Escribe cualquier informacion adicional que quieras incluir
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={additionalText}
                onChange={(e) => setAdditionalText(e.target.value)}
                rows={6}
                placeholder="Escribe aqui notas, actividades realizadas, novedades del mes..."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </CardContent>
          </Card>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generando documentos...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generar Documentos
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
