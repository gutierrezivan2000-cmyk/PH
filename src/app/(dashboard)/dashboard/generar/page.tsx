"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  limiteMbPara,
  mensajeDeTamano,
  tipoDeArchivo,
  ACCEPT_ARCHIVOS,
  MAX_AUDIO_MB,
  MAX_DOC_MB,
} from "@/lib/upload-limits";
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
const DEFAULT_FILE_LIMITS = { maxFiles: 20, maxFileSizeMb: MAX_DOC_MB };


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
      const oversized = newFiles.find((f) => f.size > limiteMbPara(f.name) * 1024 * 1024);
      if (oversized) {
        setError(mensajeDeTamano(oversized));
        return;
      }
      setError("");
      addFiles(newFiles);
    },
    [addFiles]
  );

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const oversized = droppedFiles.find((f) => f.size > limiteMbPara(f.name) * 1024 * 1024);
    if (oversized) {
      setError(mensajeDeTamano(oversized));
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
    const tooBig = files.find((f) => f.size > limiteMbPara(f.name) * 1024 * 1024);
    if (tooBig) {
      setError(mensajeDeTamano(tooBig));
      return;
    }

    setLoading(true);

    try {
      const blobFiles: { url: string; name: string; type: string; size: number }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const mb = (file.size / 1024 / 1024).toFixed(0);
        setUploadStatus(`Subiendo ${i + 1} de ${files.length}: ${file.name} (${mb} MB)`);
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const result = await upload(`uploads/${Date.now()}-${safeName}`, file, {
          access: "private",
          handleUploadUrl: "/api/upload/token",
          contentType: tipoDeArchivo(file),
          multipart: file.size > 10 * 1024 * 1024,
          // Sin esto, subir una grabación de 200 MB son varios minutos de
          // pantalla quieta y el usuario no sabe si va o se colgó.
          onUploadProgress: ({ percentage }) => {
            setUploadStatus(
              `Subiendo ${i + 1} de ${files.length}: ${file.name} (${mb} MB) — ${Math.round(percentage)}%`
            );
          },
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
      // Los errores del almacenamiento vienen en inglés y sin contexto («Vercel
      // Blob: Content type mismatch…»). Se traducen a algo accionable, que era
      // buena parte de lo que los usuarios reportaban como «error al subir».
      if (/No autorizado/i.test(msg)) {
        setError("Sesion expirada. Recarga la pagina e inicia sesion de nuevo.");
      } else if (/aborted/i.test(msg)) {
        setError("La subida fue cancelada. Intenta de nuevo.");
      } else if (/content type|not allowed|mismatch/i.test(msg)) {
        setError(
          "Uno de los archivos tiene un formato que no reconocemos. Convierte la grabación a MP3 o M4A " +
            "y vuelve a intentarlo."
        );
      } else if (/too large|maximum size|exceeded/i.test(msg)) {
        setError(
          `Un archivo supera el tamaño permitido (${MAX_AUDIO_MB} MB para audio, ${MAX_DOC_MB} MB para documentos).`
        );
      } else if (/token|expired|unauthorized|403/i.test(msg)) {
        setError("El permiso de subida caducó, seguramente por una conexión lenta. Vuelve a intentarlo.");
      } else if (/network|fetch|failed to fetch|econn/i.test(msg)) {
        setError("Se perdió la conexión durante la subida. Revisa tu internet e inténtalo de nuevo.");
      } else {
        setError(`No se pudo subir el archivo: ${msg}`);
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
                    background: idx < 4 ? "rgb(var(--accent-rgb) / 0.1)" : "rgb(var(--veil-rgb) / 0.04)",
                    border: idx === 0 ? "1.5px solid var(--accent)" : idx < 4 ? "1.5px solid rgb(var(--ok-rgb) / 0.5)" : "1.5px solid rgb(var(--veil-rgb) / 0.12)",
                    color: idx === 0 ? "var(--accent-hi)" : idx < 4 ? "var(--ok)" : "var(--ink-3)",
                  }}
                >
                  <span style={{ ...monoLabel, fontSize: "11px" }}>{step.num}</span>
                </div>
                <span
                  style={{
                    ...monoLabel,
                    color: idx === 0 ? "var(--accent-hi)" : idx < 4 ? "var(--ok)" : "var(--ink-3)",
                  }}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className="h-px w-8 sm:w-12 mx-1 flex-shrink-0 mt-[-18px]"
                  style={{ background: "rgb(var(--veil-rgb) / 0.07)" }}
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
                background: "rgb(var(--danger-rgb) / 0.08)",
                border: "1px solid rgb(var(--danger-rgb) / 0.25)",
                color: "var(--danger-text)",
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
                  color: "var(--accent-text)",
                  background: "rgb(var(--accent-rgb) / 0.1)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.4)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                01
              </span>
              <span style={{ ...monoLabelSm, color: "var(--ink-2)" }}>
                Propiedad
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "var(--ink)", fontSize: "16px", fontWeight: 500 }}
            >
              Selecciona tu propiedad
            </h3>
            {properties.length === 0 ? (
              <div
                className="rounded-xl p-4 text-center"
                style={{
                  background: "rgb(var(--warn-rgb) / 0.07)",
                  border: "1px solid rgb(var(--warn-rgb) / 0.25)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--warn-text)" }}>
                  No tienes propiedades registradas.{" "}
                  <a
                    href="/dashboard/propiedades"
                    style={{ color: "var(--accent-text)", fontWeight: 600, textDecoration: "underline" }}
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
                    background: "var(--surface-3)",
                    border: selectedProperty
                      ? "1px solid rgb(var(--accent-rgb) / 0.4)"
                      : "1px solid rgb(var(--veil-rgb) / 0.07)",
                    color: selectedProperty ? "var(--ink)" : "var(--ink-3)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid var(--accent)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgb(var(--accent-rgb) / 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = selectedProperty
                      ? "1px solid rgb(var(--accent-rgb) / 0.4)"
                      : "1px solid rgb(var(--veil-rgb) / 0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <option value="" style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}>
                    Seleccionar propiedad...
                  </option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id} style={{ background: "var(--surface-3)", color: "var(--ink)" }}>
                      {p.name} {p.address ? `— ${p.address}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronRight
                  className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-4 w-4"
                  style={{ color: "var(--ink-3)" }}
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
                  color: "var(--accent-text)",
                  background: "rgb(var(--accent-rgb) / 0.1)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.4)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                02
              </span>
              <span style={{ ...monoLabelSm, color: "var(--ink-2)" }}>
                Periodo
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "var(--ink)", fontSize: "16px", fontWeight: 500 }}
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
                    background: "var(--surface-3)",
                    border: "1px solid var(--hifi-hairline)",
                    color: "var(--ink)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid var(--accent)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgb(var(--accent-rgb) / 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgb(var(--veil-rgb) / 0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1} style={{ background: "var(--surface-3)" }}>{m}</option>
                  ))}
                </select>
                <ChevronRight
                  className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none h-4 w-4"
                  style={{ color: "var(--ink-3)" }}
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
                  background: "var(--surface-3)",
                  border: "1px solid var(--hifi-hairline)",
                  color: "var(--ink)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid var(--accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgb(var(--accent-rgb) / 0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid rgb(var(--veil-rgb) / 0.07)";
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
                  color: "var(--accent-text)",
                  background: "rgb(var(--accent-rgb) / 0.1)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.4)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                03
              </span>
              <span style={{ ...monoLabelSm, color: "var(--ink-2)" }}>
                Documentos
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "var(--ink)", fontSize: "16px", fontWeight: 500 }}
            >
              Que documentos necesitas?
            </h3>

            <div className="grid sm:grid-cols-2 gap-3">
              {([
                {
                  kind: "informe" as const,
                  Icon: FileBarChart,
                  accent: "var(--accent-hi)",
                  tint: "rgb(var(--accent-rgb) / 0.1)",
                  edge: "rgb(var(--accent-rgb) / 0.4)",
                  desc: "Resumen ejecutivo de la gestión mensual de la copropiedad.",
                },
                {
                  kind: "acta" as const,
                  Icon: Scale,
                  accent: "var(--ok)",
                  tint: "rgb(var(--ok-rgb) / 0.08)",
                  edge: "rgb(var(--ok-rgb) / 0.35)",
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
                      background: on ? tint : "var(--surface-3)",
                      border: `1px solid ${on ? edge : "rgb(var(--veil-rgb) / 0.07)"}`,
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
                      style={{ color: on ? accent : "var(--ink-3)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm font-medium block"
                        style={{ color: on ? accent : "var(--ink)" }}
                      >
                        {DOC_KIND_LABELS[kind]}
                      </span>
                      <span className="text-xs block mt-0.5" style={{ color: "var(--ink-3)" }}>
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
                background: includePptx ? "rgb(var(--warn-rgb) / 0.07)" : "var(--surface-3)",
                border: includePptx
                  ? "1px solid rgb(var(--warn-rgb) / 0.3)"
                  : "1px solid rgb(var(--veil-rgb) / 0.07)",
              }}
            >
              <input
                type="checkbox"
                checked={includePptx}
                disabled={docKind !== "informe"}
                onChange={(e) => setIncludePptx(e.target.checked)}
                className="h-4 w-4 rounded"
                style={{ accentColor: "var(--warn)" }}
              />
              <Presentation
                className="h-5 w-5 flex-shrink-0"
                style={{ color: includePptx ? "var(--warn-text)" : "var(--ink-3)" }}
              />
              <div className="flex-1">
                <span
                  className="text-sm font-medium block"
                  style={{ color: includePptx ? "var(--warn-text)" : "var(--ink)" }}
                >
                  Añadir presentación PPTX
                </span>
                <span className="text-xs block mt-0.5" style={{ color: "var(--ink-3)" }}>
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
                  color: "var(--accent-text)",
                  background: "rgb(var(--accent-rgb) / 0.1)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.4)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                04
              </span>
              <span style={{ ...monoLabelSm, color: "var(--ink-2)" }}>
                Archivos
              </span>
            </div>
            <h3
              className="font-medium mb-1"
              style={{ color: "var(--ink)", fontSize: "16px", fontWeight: 500 }}
            >
              Archivos para el {DOC_KIND_LABELS[docKind].toLowerCase()}
            </h3>
            {/* Cada documento tiene su propia bandeja: los archivos del otro no
                se mezclan ni se pierden al cambiar de tipo. */}
            <p className="text-xs mb-4" style={{ color: "var(--ink-3)" }}>
              Bandeja independiente
              {otherCount > 0
                ? ` — el ${DOC_KIND_LABELS[otherKind].toLowerCase()} conserva sus ${otherCount} ${otherCount === 1 ? "archivo" : "archivos"} aparte.`
                : ": lo que subas aquí solo alimenta este documento."}
            </p>

            {/* Recommendations panel */}
            <div
              className="mb-5 rounded-xl p-4"
              style={{
                background: "rgb(var(--accent-rgb) / 0.06)",
                border: "1px solid rgb(var(--accent-rgb) / 0.18)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4" style={{ color: "var(--accent-text)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--accent-text)" }}>
                  Que deberia subir para obtener buenos resultados?
                </span>
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--ink-2)" }}>
                No es obligatorio subir todo, pero entre mas informacion le des a la IA, mejores seran los documentos.
              </p>

              {/* Solo se muestran las recomendaciones del documento elegido:
                  mezclarlas era justo lo que hacía que se mezclaran los insumos. */}
              {docKind === "informe" ? (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileBarChart className="h-3.5 w-3.5" style={{ color: "var(--accent-text)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--accent-text)" }}>
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
                        <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: "var(--accent-text)" }} />
                        <span className="text-xs" style={{ color: "var(--ink-2)" }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Scale className="h-3.5 w-3.5" style={{ color: "var(--ok-text)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--ok-text)" }}>
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
                        <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: "var(--ok-text)" }} />
                        <span className="text-xs" style={{ color: "var(--ink-2)" }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                className="mt-2 pt-2"
                style={{ borderTop: "1px solid rgb(var(--accent-rgb) / 0.15)" }}
              >
                <p className="text-xs italic" style={{ color: "var(--ink-3)" }}>
                  {`Tambien puedes subir: PDFs, documentos Word, archivos de texto, hojas de calculo e imagenes de hasta ${MAX_DOC_MB} MB, y grabaciones de audio de hasta ${MAX_AUDIO_MB} MB.`}
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
                    ? "1.5px dashed var(--accent)"
                    : "1.5px dashed rgb(var(--veil-rgb) / 0.12)",
                  background: dragOver ? "rgb(var(--accent-rgb) / 0.08)" : "rgb(var(--veil-rgb) / 0.02)",
                }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{
                    background: dragOver ? "rgb(var(--accent-rgb) / 0.2)" : "rgb(var(--accent-rgb) / 0.1)",
                    border: "1px solid rgb(var(--accent-rgb) / 0.3)",
                  }}
                >
                  <Upload className="h-7 w-7" style={{ color: "var(--accent-text)" }} />
                </div>
                <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  Arrastra archivos o haz clic para seleccionar
                </span>
                <span className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                  {`PDF, Word, Excel, imagenes — hasta ${fileLimits.maxFiles} archivos · audio hasta ${MAX_AUDIO_MB} MB`}
                </span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  accept={ACCEPT_ARCHIVOS}
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
                      background: "var(--surface-3)",
                      border: "1px solid var(--hifi-hairline)",
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "var(--accent-text)" }} />
                      <span
                        className="text-sm truncate"
                        style={{
                          fontFamily: "'Geist Mono', monospace",
                          fontSize: "12px",
                          color: "var(--ink)",
                        }}
                      >
                        {file.name}
                      </span>
                      <span
                        className="flex-shrink-0 px-2 py-0.5 rounded"
                        style={{
                          ...monoLabel,
                          background: "rgb(var(--veil-rgb) / 0.06)",
                          color: "var(--ink-2)",
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
                      style={{ color: "var(--ink-3)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgb(var(--danger-rgb) / 0.1)";
                        e.currentTarget.style.color = "var(--danger-text)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--ink-3)";
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
                  color: "var(--accent-text)",
                  background: "rgb(var(--accent-rgb) / 0.1)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.4)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                }}
              >
                05
              </span>
              <span style={{ ...monoLabelSm, color: "var(--ink-2)" }}>
                Notas
              </span>
            </div>
            <h3
              className="font-medium mb-4"
              style={{ color: "var(--ink)", fontSize: "16px", fontWeight: 500 }}
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
                background: "var(--surface-3)",
                border: "1px solid var(--hifi-hairline)",
                color: "var(--ink)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgb(var(--accent-rgb) / 0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid rgb(var(--veil-rgb) / 0.07)";
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
              background: loading ? "rgb(var(--accent-rgb) / 0.4)" : "var(--accent)",
              color: "#ffffff",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 24px rgb(var(--accent-rgb) / 0.35)",
              border: "none",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "var(--accent-hi)";
                e.currentTarget.style.boxShadow = "0 6px 32px rgb(var(--accent-rgb) / 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 4px 24px rgb(var(--accent-rgb) / 0.35)";
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
