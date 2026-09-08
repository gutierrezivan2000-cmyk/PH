"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles, Upload, X, CheckCircle2, Trash2, FileSpreadsheet } from "lucide-react";
import { ASSET_KIND_LABELS, recurrenceLabel, type AssetKind } from "@/lib/common-assets";

interface ExtractedAsset {
  kind: AssetKind;
  name: string;
  provider: string | null;
  reference: string | null;
  dueDate: string | null; // "YYYY-MM-DD"
  recurrenceMonths: number | null;
}

/** Ver la misma nota en units/import: Vercel corta el cuerpo en 4,5 MB. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function errorForStatus(status: number): string {
  if (status === 413) return "El archivo es demasiado grande. Guárdalo como CSV e inténtalo de nuevo.";
  if (status === 429) return "Alcanzaste el límite de importaciones por hora. Intenta más tarde.";
  if (status === 504 || status === 408)
    return "El archivo tardó demasiado en procesarse. Prueba con menos filas o guárdalo como CSV.";
  if (status >= 500) return "El servidor falló al procesar el archivo. Inténtalo de nuevo en un momento.";
  return "No se pudo procesar el archivo.";
}

const monoLabel: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

/**
 * Importación de la bitácora asistida por IA: sube un Excel/PDF/Word con la
 * lista de zonas comunes y pólizas, Claude la organiza, el admin revisa y
 * corrige (sobre todo las fechas, lo más propenso a errores) antes de crear.
 */
export function AssetImport({
  propertyId,
  onImported,
}: {
  propertyId: string;
  onImported: (created: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ExtractedAsset[] | null>(null);
  const [fileName, setFileName] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setPreview(null);
    setFileName(file.name);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 4 MB. ` +
          `Si es un Excel, guárdalo como CSV: pesa muchísimo menos.`
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/properties/${propertyId}/common-assets/import`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      const assets = data?.assets || [];
      if (assets.length === 0) {
        setError("No se reconoció ninguna zona común ni póliza en el archivo.");
        return;
      }
      setPreview(assets);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateRow(i: number, patch: Partial<ExtractedAsset>) {
    setPreview((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, ...patch } : r)) : prev));
  }

  async function confirm() {
    if (!preview || preview.length === 0) return;
    if (preview.some((a) => !a.dueDate)) {
      setError("Completa la fecha de todas las filas antes de crear los registros.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/common-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, assets: preview }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      setPreview(null);
      setFileName("");
      onImported(data.created || 0);
    } catch {
      setError("Error de red.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.pdf,.docx,.txt"
        onChange={onFile}
        className="hidden"
      />

      {!preview && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          className="inline-flex items-center gap-2 rounded-full text-[12px] font-medium px-4 py-2 transition-all disabled:opacity-60 cursor-pointer"
          style={{ background: "rgb(var(--accent-rgb) / 0.14)", color: "var(--accent-text)", border: "1px solid rgb(var(--accent-rgb) / 0.35)" }}
        >
          {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {parsing ? "Leyendo el archivo con IA…" : "Importar de archivo (Excel/PDF) con IA"}
        </button>
      )}

      {parsing && (
        <p className="text-[11.5px] mt-2 flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> {fileName}
        </p>
      )}

      {error && <p className="text-[12px] mt-2" style={{ color: "var(--danger-text)" }}>{error}</p>}

      {preview && (
        <div className="mt-3 rounded-xl overflow-hidden" style={{ background: "var(--hifi-bg-elev)", border: "1px solid rgb(var(--accent-rgb) / 0.25)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgb(var(--veil-rgb) / 0.06)" }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: "var(--ok-text)" }} />
              <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {preview.length} {preview.length === 1 ? "registro detectado" : "registros detectados"}
              </span>
            </div>
            <button onClick={() => { setPreview(null); setFileName(""); }} className="p-1 rounded cursor-pointer hover:bg-white/[0.06]" style={{ color: "var(--ink-3)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="px-4 pt-3 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Revisa sobre todo las fechas — son lo más fácil de leer mal desde un documento escaneado.
          </p>

          <div className="max-h-80 overflow-y-auto mt-2">
            {preview.map((a, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 px-4 py-2.5"
                style={{ borderBottom: i < preview.length - 1 ? "1px solid rgb(var(--veil-rgb) / 0.04)" : "none" }}
              >
                <button
                  onClick={() => updateRow(i, { kind: a.kind === "poliza" ? "zona_comun" : "poliza" })}
                  className="shrink-0 px-2 py-0.5 rounded text-[9px] cursor-pointer"
                  style={{
                    ...monoLabel,
                    fontSize: 9,
                    color: a.kind === "poliza" ? "var(--warn)" : "var(--info)",
                    background: a.kind === "poliza" ? "rgb(var(--warn-rgb) / 0.1)" : "rgb(var(--info-rgb) / 0.1)",
                    border: `1px solid ${a.kind === "poliza" ? "rgb(var(--warn-rgb) / 0.3)" : "rgb(var(--info-rgb) / 0.3)"}`,
                  }}
                  title="Cambiar tipo"
                >
                  {ASSET_KIND_LABELS[a.kind]}
                </button>
                <span className="text-[12.5px] font-medium truncate" style={{ color: "var(--ink)", minWidth: 120, maxWidth: 220 }}>
                  {a.name}
                </span>
                <span className="flex-1 min-w-0 text-[11.5px] truncate" style={{ color: "var(--ink-2)" }}>
                  {[a.provider, a.reference ? `Ref. ${a.reference}` : null, a.recurrenceMonths ? recurrenceLabel(a.recurrenceMonths) : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
                <input
                  type="date"
                  value={a.dueDate || ""}
                  onChange={(e) => updateRow(i, { dueDate: e.target.value || null })}
                  className="shrink-0 rounded px-2 py-1 text-[11.5px]"
                  style={{
                    background: "rgb(var(--veil-rgb) / 0.04)",
                    border: `1px solid ${a.dueDate ? "rgb(var(--veil-rgb) / 0.1)" : "rgb(var(--danger-rgb) / 0.4)"}`,
                    color: "var(--ink)",
                    colorScheme: "dark",
                  }}
                />
                <button
                  onClick={() => setPreview((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))}
                  className="p-1 rounded cursor-pointer hover:bg-white/[0.06] shrink-0"
                  style={{ color: "rgb(var(--danger-rgb) / 0.5)" }}
                  title="Quitar de la lista"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--hifi-hairline)" }}>
            <button
              onClick={confirm}
              disabled={creating || preview.length === 0}
              className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2 transition-all disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Crear {preview.length} {preview.length === 1 ? "registro" : "registros"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
