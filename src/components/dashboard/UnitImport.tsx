"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles, Upload, X, CheckCircle2, Trash2, FileSpreadsheet } from "lucide-react";

interface ExtractedUnit {
  label: string;
  residentName?: string | null;
  email?: string | null;
  phone?: string | null;
  coeficiente?: number | null;
  monthlyFee?: number | null;
}

const monoLabel: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

/**
 * AI-assisted unit import: attach Excel/CSV/PDF/Word, Claude organizes it into
 * a unit list, admin reviews (and removes) rows, then creates them. Reusable
 * across Comunicados / Residentes / Cartera.
 */
export function UnitImport({
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
  const [preview, setPreview] = useState<ExtractedUnit[] | null>(null);
  const [fileName, setFileName] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setParsing(true);
    setPreview(null);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/properties/${propertyId}/units/import`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo procesar el archivo.");
        return;
      }
      setPreview(data.units || []);
    } catch {
      setError("Error de red al subir el archivo.");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirm() {
    if (!preview || preview.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/properties/${propertyId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units: preview }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudieron crear las unidades.");
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

  const withEmail = preview?.filter((u) => u.email).length ?? 0;

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
          style={{ background: "rgba(124,92,255,0.14)", color: "#a78bff", border: "1px solid rgba(124,92,255,0.35)" }}
        >
          {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {parsing ? "Leyendo el archivo con IA…" : "Importar de archivo (Excel/PDF) con IA"}
        </button>
      )}

      {parsing && (
        <p className="text-[11.5px] mt-2 flex items-center gap-1.5" style={{ color: "rgba(246,245,247,0.45)" }}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> {fileName}
        </p>
      )}

      {error && <p className="text-[12px] mt-2" style={{ color: "#ff8585" }}>{error}</p>}

      {preview && (
        <div className="mt-3 rounded-xl overflow-hidden" style={{ background: "#0f0f13", border: "1px solid rgba(124,92,255,0.25)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: "#4cd6a0" }} />
              <span className="text-[13px] font-medium" style={{ color: "#f6f5f7" }}>
                {preview.length} {preview.length === 1 ? "unidad detectada" : "unidades detectadas"}
              </span>
              <span style={{ ...monoLabel, color: "rgba(246,245,247,0.40)" }}>· {withEmail} con correo</span>
            </div>
            <button onClick={() => { setPreview(null); setFileName(""); }} className="p-1 rounded cursor-pointer hover:bg-white/[0.06]" style={{ color: "rgba(246,245,247,0.45)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {preview.map((u, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: i < preview.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span className="text-[12.5px] font-medium" style={{ color: "#f6f5f7", minWidth: 90 }}>{u.label}</span>
                <span className="flex-1 min-w-0 text-[11.5px] truncate" style={{ color: "rgba(246,245,247,0.55)" }}>
                  {[u.residentName, u.email, u.phone, u.coeficiente ? `${u.coeficiente}%` : null, u.monthlyFee ? `$${u.monthlyFee.toLocaleString("es-CO")}` : null].filter(Boolean).join(" · ") || "—"}
                </span>
                <button
                  onClick={() => setPreview((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))}
                  className="p-1 rounded cursor-pointer hover:bg-white/[0.06] flex-shrink-0"
                  style={{ color: "rgba(255,133,133,0.5)" }}
                  title="Quitar de la lista"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={confirm}
              disabled={creating || preview.length === 0}
              className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2 transition-all disabled:opacity-50 cursor-pointer"
              style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Crear {preview.length} {preview.length === 1 ? "unidad" : "unidades"}
            </button>
            <span className="text-[11.5px]" style={{ color: "rgba(246,245,247,0.40)" }}>
              Revisa la lista y quita lo que no aplique. Podrás editar cada unidad después.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
