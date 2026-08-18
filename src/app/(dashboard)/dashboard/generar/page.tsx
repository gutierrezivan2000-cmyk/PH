"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Header } from "@/components/dashboard/Header";
import { DOC_KIND_LABELS, type DocKind } from "@/lib/generation/doc-kind";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  Sparkles,
  Lightbulb,
  FileBarChart,
  Presentation,
  Scale,
  ChevronRight,
  Info,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

// Topes por defecto hasta que /api/usage responda con los del plan. El 500 MB
// que se anunciaba antes era imposible: el token de subida corta en 25 MB, así
// que el archivo ni llegaba a Blob y el usuario veía un fallo de subida sin
// explicación tras esperar toda la carga.
const DEFAULT_FILE_LIMITS = { maxFiles: 20, maxFileSizeMb: 25 };

interface Property {
  id: string;
  name: string;
  address?: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Stepper step data
const STEPS = [
  { num: 1, label: "Propiedad" },
  { num: 2, label: "Periodo" },
  { num: 3, label: "Documentos" },
  { num: 4, label: "Archivos" },
  { num: 5, label: "Notas" },
];

// Geist Mono label style
const monoLabel: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const monoLabelSm: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "11px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

export default function GenerarPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  // Informe y acta son documentos distintos, con insumos distintos: la
  // selección es excluyente y cada uno tiene su propia bandeja de archivos,
  // para que la grabación de una reunión no acabe alimentando un informe.
  const [docKind, setDocKind] = useState<DocKind>("informe");
  const [includePptx, setIncludePptx] = useState(false);
  const [additionalText, setAdditionalText] = useState("");
  const [filesByKind, setFilesByKind] = useState<Record<DocKind, File[]>>({
    informe: [],
    acta: [],
  });
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileLimits, setFileLimits] = useState(DEFAULT_FILE_LIMITS);
  const maxBytes = fileLimits.maxFileSizeMb * 1024 * 1024;

  useEffect(() => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProperties(data);
      })
      .catch(console.error);

    fetch("/api/usage")
      .then((res) => res.json())
      .then((data) => {
        const l = data?.fileLimits;
        if (l && Number.isFinite(l.maxFiles) && Number.isFinite(l.maxFileSizeMb)) {
          setFileLimits({ maxFiles: l.maxFiles, maxFileSizeMb: l.maxFileSizeMb });
        }
      })
      .catch(() => {});
  }, []);

  // Elegir acta descarta la presentación: un acta no tiene diapositivas.
  const selectDocKind = useCallback((kind: DocKind) => {
    setDocKind(kind);
    if (kind === "acta") setIncludePptx(false);
  }, []);

  // Los archivos entran SIEMPRE en la bandeja del documento seleccionado.
  const addFiles = useCallback(
    (incoming: File[]) => {
      setFilesByKind((prev) => {
        const merged = [...prev[docKind], ...incoming];
        // Recortar en silencio hacía desaparecer archivos sin que el usuario
        // se enterara; ahora se dice cuántos quedaron fuera.
        if (merged.length > fileLimits.maxFiles) {
          const sobran = merged.length - fileLimits.maxFiles;
          setError(
            `Tu plan permite hasta ${fileLimits.maxFiles} archivos por generación: ` +
              (sobran === 1 ? "no se agregó el último." : `no se agregaron los últimos ${sobran}.`)
          );
        }
        return { ...prev, [docKind]: merged.slice(0, fileLimits.maxFiles) };
      });
    },
    [docKind, fileLimits.maxFiles]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const newFiles = Array.from(e.target.files);
      const oversized = newFiles.find((f) => f.size > maxBytes);
      if (oversized) {
        setError(`"${oversized.name}" supera el limite de ${fileLimits.maxFileSizeMb} MB de tu plan.`);
        return;
      }
      setError("");
      addFiles(newFiles);
    },
    [addFiles, maxBytes, fileLimits.maxFileSizeMb]
  );

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const oversized = droppedFiles.find((f) => f.size > maxBytes);
    if (oversized) {
      setError(`"${oversized.name}" supera el limite de ${fileLimits.maxFileSizeMb} MB de tu plan.`);
      return;
    }
    setError("");
    addFiles(droppedFiles);
  }, [addFiles]);

  const removeFile = useCallback(
    (index: number) => {
      setFilesByKind((prev) => ({
        ...prev,
        [docKind]: prev[docKind].filter((_, i) => i !== index),
      }));
    },
    [docKind]
  );

  // La bandeja activa es la del documento seleccionado.
  const files = filesByKind[docKind];
  const otherKind: DocKind = docKind === "informe" ? "acta" : "informe";
  const otherCount = filesByKind[otherKind].length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUploadStatus("");

    if (!selectedProperty) {
      setError("Selecciona una propiedad");
      return;
    }

    const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    if (!isDemo && files.length === 0 && !additionalText.trim()) {
      setError("Debes subir al menos un archivo o escribir informacion");
      return;
    }

    // Validar ANTES de subir. Antes se subía todo a Blob y solo después
    // /api/generate/full rechazaba por plan: los archivos quedaban huérfanos
    // en el store (facturados) y el usuario había esperado la subida entera
    // para recibir un 400.
    if (files.length > fileLimits.maxFiles) {
      setError(`Tu plan permite hasta ${fileLimits.maxFiles} archivos por generación. Quita ${files.length - fileLimits.maxFiles}.`);
      return;
    }
    const tooBig = files.find((f) => f.size > maxBytes);
    if (tooBig) {
      setError(`"${tooBig.name}" pesa ${(tooBig.size / 1024 / 1024).toFixed(1)} MB y tu plan permite hasta ${fileLimits.maxFileSizeMb} MB por archivo.`);
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
          docKind,
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

  // Card shared style
  const cardStyle: React.CSSProperties = {
    background: "var(--hifi-surface-1)",
    border: "1px solid var(--hifi-hairline)",
  };

  return (
    <div>
      <Header title="Generar Documentos" subtitle="Crea informes, actas y presentaciones con IA" />

      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">

        {/* Horizontal stepper */}
        <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
          {STEPS.map((step, idx) => (
            <div key={step.num} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: idx < 4 ? "rgba(124,92,255,0.10)" : "rgba(255,255,255,0.04)",
                    border: idx === 0 ? "1.5px solid #7c5cff" : idx < 4 ? "1.5px solid rgba(76,214,160,0.50)" : "1.5px solid rgba(255,255,255,0.12)",
                    color: idx === 0 ? "#9a7fff" : idx < 4 ? "#4cd6a0" : "rgba(246,245,247,0.42)",
                  }}
                >
                  <span style={{ ...monoLabel, fontSize: "11px" }}>{step.num}</span>
                </div>
                <span
                  style={{
                    ...monoLabel,
                    color: idx === 0 ? "#9a7fff" : idx < 4 ? "#4cd6a0" : "rgba(246,245,247,0.42)",
                  }}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className="h-px w-8 sm:w-12 mx-1 flex-shrink-0 mt-[-18px]"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm"
              style={{
                background: "rgba(255,111,111,0.08)",
                border: "1px solid rgba(255,111,111,0.25)",
                color: "#ff6f6f",
              }}
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1 — Property */}
          <div className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <span
                style={{
                  ...monoLabelSm,
                  color: "#7c5cff",
                  background: "rgba(124,92,255,0.10)",
                  border: "1px solid rgba(124,92,255,0.40)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                01
              </span>
              <span style={{ ...monoLabelSm, color: "rgba(246,245,247,0.66)" }}>
                Propiedad
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "#f6f5f7", fontSize: "16px", fontWeight: 500 }}
            >
              Selecciona tu propiedad
            </h3>
            {properties.length === 0 ? (
              <div
                className="rounded-xl p-4 text-center"
                style={{
                  background: "rgba(255,185,88,0.07)",
                  border: "1px solid rgba(255,185,88,0.25)",
                }}
              >
                <p className="text-sm" style={{ color: "#ffb958" }}>
                  No tienes propiedades registradas.{" "}
                  <a
                    href="/dashboard/propiedades"
                    style={{ color: "#9a7fff", fontWeight: 600, textDecoration: "underline" }}
                  >
                    Agrega una primero
                  </a>
                  .
                </p>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="w-full h-11 rounded-xl px-4 text-sm appearance-none cursor-pointer transition-all outline-none"
                  style={{
                    background: "#1d1d24",
                    border: selectedProperty
                      ? "1px solid rgba(124,92,255,0.40)"
                      : "1px solid rgba(255,255,255,0.07)",
                    color: selectedProperty ? "#f6f5f7" : "rgba(246,245,247,0.42)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid #7c5cff";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = selectedProperty
                      ? "1px solid rgba(124,92,255,0.40)"
                      : "1px solid rgba(255,255,255,0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <option value="" style={{ background: "#1d1d24", color: "rgba(246,245,247,0.42)" }}>
                    Seleccionar propiedad...
                  </option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id} style={{ background: "#1d1d24", color: "#f6f5f7" }}>
                      {p.name} {p.address ? `— ${p.address}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronRight
                  className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-4 w-4"
                  style={{ color: "rgba(246,245,247,0.42)" }}
                />
              </div>
            )}
          </div>

          {/* Step 2 — Period */}
          <div className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <span
                style={{
                  ...monoLabelSm,
                  color: "#7c5cff",
                  background: "rgba(124,92,255,0.10)",
                  border: "1px solid rgba(124,92,255,0.40)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                02
              </span>
              <span style={{ ...monoLabelSm, color: "rgba(246,245,247,0.66)" }}>
                Periodo
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "#f6f5f7", fontSize: "16px", fontWeight: 500 }}
            >
              Periodo del documento
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  className="w-full h-11 rounded-xl px-4 text-sm appearance-none cursor-pointer transition-all outline-none"
                  style={{
                    background: "#1d1d24",
                    border: "1px solid var(--hifi-hairline)",
                    color: "#f6f5f7",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid #7c5cff";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1} style={{ background: "#1d1d24" }}>{m}</option>
                  ))}
                </select>
                <ChevronRight
                  className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-4 w-4"
                  style={{ color: "rgba(246,245,247,0.42)" }}
                />
              </div>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                min={2020}
                max={2030}
                className="w-full sm:w-28 h-11 rounded-xl px-4 text-sm outline-none transition-all"
                style={{
                  background: "#1d1d24",
                  border: "1px solid var(--hifi-hairline)",
                  color: "#f6f5f7",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid #7c5cff";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          </div>

          {/* Step 3 — Document types */}
          <div className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <span
                style={{
                  ...monoLabelSm,
                  color: "#7c5cff",
                  background: "rgba(124,92,255,0.10)",
                  border: "1px solid rgba(124,92,255,0.40)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                03
              </span>
              <span style={{ ...monoLabelSm, color: "rgba(246,245,247,0.66)" }}>
                Documentos
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "#f6f5f7", fontSize: "16px", fontWeight: 500 }}
            >
              Que documentos necesitas?
            </h3>

            <div className="grid sm:grid-cols-2 gap-3">
              {([
                {
                  kind: "informe" as const,
                  Icon: FileBarChart,
                  accent: "#9a7fff",
                  tint: "rgba(124,92,255,0.10)",
                  edge: "rgba(124,92,255,0.40)",
                  desc: "Resumen ejecutivo de la gestión mensual de la copropiedad.",
                },
                {
                  kind: "acta" as const,
                  Icon: Scale,
                  accent: "#4cd6a0",
                  tint: "rgba(76,214,160,0.08)",
                  edge: "rgba(76,214,160,0.35)",
                  desc: "Acta de reunión del Consejo de Administración con formato legal.",
                },
              ]).map(({ kind, Icon, accent, tint, edge, desc }) => {
                const on = docKind === kind;
                const count = filesByKind[kind].length;
                return (
                  <label
                    key={kind}
                    className="ui-card-interactive flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: on ? tint : "#1d1d24",
                      border: `1px solid ${on ? edge : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="docKind"
                      checked={on}
                      onChange={() => selectDocKind(kind)}
                      className="h-4 w-4 mt-0.5 flex-shrink-0"
                      style={{ accentColor: accent }}
                    />
                    <Icon
                      className="h-5 w-5 flex-shrink-0 mt-0.5"
                      style={{ color: on ? accent : "rgba(246,245,247,0.42)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm font-medium block"
                        style={{ color: on ? accent : "#f6f5f7" }}
                      >
                        {DOC_KIND_LABELS[kind]}
                      </span>
                      <span className="text-xs block mt-0.5" style={{ color: "rgba(246,245,247,0.42)" }}>
                        {desc}
                      </span>
                      {count > 0 && (
                        <span className="text-[11px] block mt-1.5" style={{ color: accent }}>
                          {count} {count === 1 ? "archivo" : "archivos"} en su bandeja
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* La presentación no es un tercer documento: son las diapositivas
                del informe, así que solo acompaña al informe. */}
            <label
              className={`flex items-center gap-3 p-4 rounded-xl mt-3 transition-all ${
                docKind === "informe" ? "cursor-pointer" : "cursor-not-allowed opacity-45"
              }`}
              style={{
                background: includePptx ? "rgba(255,185,88,0.07)" : "#1d1d24",
                border: includePptx
                  ? "1px solid rgba(255,185,88,0.30)"
                  : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <input
                type="checkbox"
                checked={includePptx}
                disabled={docKind !== "informe"}
                onChange={(e) => setIncludePptx(e.target.checked)}
                className="h-4 w-4 rounded"
                style={{ accentColor: "#ffb958" }}
              />
              <Presentation
                className="h-5 w-5 flex-shrink-0"
                style={{ color: includePptx ? "#ffb958" : "rgba(246,245,247,0.42)" }}
              />
              <div className="flex-1">
                <span
                  className="text-sm font-medium block"
                  style={{ color: includePptx ? "#ffb958" : "#f6f5f7" }}
                >
                  Añadir presentación PPTX
                </span>
                <span className="text-xs block mt-0.5" style={{ color: "rgba(246,245,247,0.42)" }}>
                  {docKind === "informe"
                    ? "Diapositivas construidas a partir del mismo informe. Opcional."
                    : "Solo disponible con el informe de gestión — un acta no tiene diapositivas."}
                </span>
              </div>
            </label>
          </div>

          {/* Step 4 — Files */}
          <div className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <span
                style={{
                  ...monoLabelSm,
                  color: "#7c5cff",
                  background: "rgba(124,92,255,0.10)",
                  border: "1px solid rgba(124,92,255,0.40)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                04
              </span>
              <span style={{ ...monoLabelSm, color: "rgba(246,245,247,0.66)" }}>
                Archivos
              </span>
            </div>
            <h3
              className="font-medium mb-1"
              style={{ color: "#f6f5f7", fontSize: "16px", fontWeight: 500 }}
            >
              Archivos para el {DOC_KIND_LABELS[docKind].toLowerCase()}
            </h3>
            {/* Cada documento tiene su propia bandeja: los archivos del otro no
                se mezclan ni se pierden al cambiar de tipo. */}
            <p className="text-xs mb-4" style={{ color: "rgba(246,245,247,0.42)" }}>
              Bandeja independiente
              {otherCount > 0
                ? ` — el ${DOC_KIND_LABELS[otherKind].toLowerCase()} conserva sus ${otherCount} ${otherCount === 1 ? "archivo" : "archivos"} aparte.`
                : ": lo que subas aquí solo alimenta este documento."}
            </p>

            {/* Recommendations panel */}
            <div
              className="mb-5 rounded-xl p-4"
              style={{
                background: "rgba(124,92,255,0.06)",
                border: "1px solid rgba(124,92,255,0.18)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4" style={{ color: "#9a7fff" }} />
                <span className="text-sm font-medium" style={{ color: "#9a7fff" }}>
                  Que deberia subir para obtener buenos resultados?
                </span>
              </div>
              <p className="text-xs mb-3" style={{ color: "rgba(246,245,247,0.66)" }}>
                No es obligatorio subir todo, pero entre mas informacion le des a la IA, mejores seran los documentos.
              </p>

              {/* Solo se muestran las recomendaciones del documento elegido:
                  mezclarlas era justo lo que hacía que se mezclaran los insumos. */}
              {docKind === "informe" ? (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileBarChart className="h-3.5 w-3.5" style={{ color: "#9a7fff" }} />
                    <span className="text-xs font-semibold" style={{ color: "#9a7fff" }}>
                      Para el informe de gestión:
                    </span>
                  </div>
                  <ul className="space-y-1 ml-5">
                    {[
                      "Estados financieros del mes (Excel o PDF)",
                      "Reporte de cartera y recaudos",
                      "Registros de mantenimientos realizados",
                      "Fotos de obras, mejoras o daños",
                      "Novedades de seguridad, personal o proveedores",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-1.5">
                        <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: "#9a7fff" }} />
                        <span className="text-xs" style={{ color: "rgba(246,245,247,0.66)" }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Scale className="h-3.5 w-3.5" style={{ color: "#4cd6a0" }} />
                    <span className="text-xs font-semibold" style={{ color: "#4cd6a0" }}>
                      Para el acta de reunión:
                    </span>
                  </div>
                  <ul className="space-y-1 ml-5">
                    {[
                      "Grabación de audio de la reunión (MP3, M4A, WAV)",
                      "Orden del día o agenda de la reunión",
                      "Lista de asistentes",
                      "Actas anteriores como referencia de formato",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-1.5">
                        <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: "#4cd6a0" }} />
                        <span className="text-xs" style={{ color: "rgba(246,245,247,0.66)" }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                className="mt-2 pt-2"
                style={{ borderTop: "1px solid rgba(124,92,255,0.15)" }}
              >
                <p className="text-xs italic" style={{ color: "rgba(246,245,247,0.42)" }}>
                  {`Tambien puedes subir: PDFs, documentos Word, archivos de texto, hojas de calculo, imagenes y audios de hasta ${fileLimits.maxFileSizeMb} MB.`}
                </p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className="relative"
            >
              <label
                className="flex flex-col items-center justify-center rounded-xl p-8 sm:p-12 cursor-pointer transition-all"
                style={{
                  border: dragOver
                    ? "1.5px dashed #7c5cff"
                    : "1.5px dashed rgba(255,255,255,0.12)",
                  background: dragOver ? "rgba(124,92,255,0.08)" : "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{
                    background: dragOver ? "rgba(124,92,255,0.20)" : "rgba(124,92,255,0.10)",
                    border: "1px solid rgba(124,92,255,0.30)",
                  }}
                >
                  <Upload className="h-7 w-7" style={{ color: "#9a7fff" }} />
                </div>
                <span className="text-sm font-medium" style={{ color: "#f6f5f7" }}>
                  Arrastra archivos o haz clic para seleccionar
                </span>
                <span className="text-xs mt-1" style={{ color: "rgba(246,245,247,0.42)" }}>
                  {`PDF, Word, Excel, imagenes, audio — hasta ${fileLimits.maxFiles} archivos de ${fileLimits.maxFileSizeMb} MB`}
                </span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.m4a,.webm"
                />
              </label>
            </div>

            {/* File pills */}
            {files.length > 0 && (
              <div className="space-y-2 mt-4">
                {files.map((file, i) => (
                  <div
                    key={`${file.name}-${i}`}
                    className="flex items-center justify-between rounded-xl px-4 py-2.5"
                    style={{
                      background: "#1d1d24",
                      border: "1px solid var(--hifi-hairline)",
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#9a7fff" }} />
                      <span
                        className="text-sm truncate"
                        style={{
                          fontFamily: "'Geist Mono', monospace",
                          fontSize: "12px",
                          color: "#f6f5f7",
                        }}
                      >
                        {file.name}
                      </span>
                      <span
                        className="flex-shrink-0 px-2 py-0.5 rounded"
                        style={{
                          ...monoLabel,
                          background: "rgba(255,255,255,0.06)",
                          color: "rgba(246,245,247,0.66)",
                          border: "1px solid var(--hifi-hairline)",
                        }}
                      >
                        {(file.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="p-1.5 rounded-lg transition-colors ml-2 flex-shrink-0"
                      style={{ color: "rgba(246,245,247,0.42)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,111,111,0.10)";
                        e.currentTarget.style.color = "#ff6f6f";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "rgba(246,245,247,0.42)";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 5 — Additional text */}
          <div className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <span
                style={{
                  ...monoLabelSm,
                  color: "#7c5cff",
                  background: "rgba(124,92,255,0.10)",
                  border: "1px solid rgba(124,92,255,0.40)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                05
              </span>
              <span style={{ ...monoLabelSm, color: "rgba(246,245,247,0.66)" }}>
                Notas
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "#f6f5f7", fontSize: "16px", fontWeight: 500 }}
            >
              Informacion adicional
            </h3>
            <textarea
              value={additionalText}
              onChange={(e) => setAdditionalText(e.target.value)}
              rows={5}
              placeholder="Ejemplo: Este mes se realizo el cambio de bombas del cuarto de maquinas. Hubo un corte de agua del 3 al 5 de marzo por obras de la empresa de acueducto..."
              className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all"
              style={{
                background: "#1d1d24",
                border: "1px solid var(--hifi-hairline)",
                color: "#f6f5f7",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid #7c5cff";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-xl flex items-center justify-center gap-2.5 text-base font-medium transition-all"
            style={{
              background: loading ? "rgba(124,92,255,0.40)" : "#7c5cff",
              color: "#ffffff",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 24px rgba(124,92,255,0.35)",
              border: "none",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "#9a7fff";
                e.currentTarget.style.boxShadow = "0 6px 32px rgba(124,92,255,0.50)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "#7c5cff";
                e.currentTarget.style.boxShadow = "0 4px 24px rgba(124,92,255,0.35)";
              }
            }}
          >
            {loading ? (
              <>
                <span
                  className="w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{ background: "#fff", opacity: 0.9 }}
                />
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "13px", letterSpacing: "0.08em" }}>
                  {uploadStatus || "Enviando..."}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                <span>Generar Documentos</span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
