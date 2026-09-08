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

/**
 * Vercel corta el cuerpo de una petición serverless en 4,5 MB. La ruta decía
 * aceptar 8 MB, así que un archivo de 5 MB nunca llegaba al handler: la
 * plataforma cerraba la conexión y el navegador lo reportaba como fallo de red.
 */
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
  // Aviso del servidor cuando el archivo no cupo en una sola lectura.
  const [note, setNote] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setPreview(null);
    setNote("");
    setFileName(file.name);

    // Se comprueba ANTES de subir: la plataforma corta la petición por encima
    // de su límite de cuerpo, y el usuario esperaba toda la subida para recibir
    // un "error de red" sin explicación.
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
      const res = await fetch(`/api/properties/${propertyId}/units/import`, { method: "POST", body: fd });

      // El cuerpo de error de la plataforma (413, 504) es texto plano o HTML,
      // no JSON. Al hacer res.json() antes de mirar res.ok, el SyntaxError caía
      // en el catch y TODO fallo se mostraba como "Error de red al subir el
      // archivo", ocultando la causa real.
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      const units = data?.units || [];
      if (units.length === 0) {
        setError(
          "No se reconoció ninguna unidad en el archivo. Revisa que tenga una fila por unidad " +
            "con al menos el número de apartamento."
        );
        return;
      }
      setNote(data?.truncated ? data?.note || "" : "");
      setPreview(units);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      setPreview(null);
      setFileName("");
      setNote("");
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
                {preview.length} {preview.length === 1 ? "unidad detectada" : "unidades detectadas"}
              </span>
              <span style={{ ...monoLabel, color: "var(--ink-3)" }}>· {withEmail} con correo</span>
            </div>
            <button onClick={() => { setPreview(null); setFileName(""); setNote(""); }} className="p-1 rounded cursor-pointer hover:bg-white/[0.06]" style={{ color: "var(--ink-3)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {note && (
            <p
              className="px-4 py-2.5 text-[11.5px]"
              style={{ background: "rgba(255,193,94,0.10)", color: "#ffc15e", borderBottom: "1px solid rgb(var(--veil-rgb) / 0.06)" }}
            >
              {note}
            </p>
          )}

          <div className="max-h-72 overflow-y-auto">
            {preview.map((u, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: i < preview.length - 1 ? "1px solid rgb(var(--veil-rgb) / 0.04)" : "none" }}>
                <span className="text-[12.5px] font-medium" style={{ color: "var(--ink)", minWidth: 90 }}>{u.label}</span>
                <span className="flex-1 min-w-0 text-[11.5px] truncate" style={{ color: "var(--ink-2)" }}>
                  {[u.residentName, u.email, u.phone, u.coeficiente ? `${u.coeficiente}%` : null, u.monthlyFee ? `$${u.monthlyFee.toLocaleString("es-CO")}` : null].filter(Boolean).join(" · ") || "—"}
                </span>
                <button
                  onClick={() => setPreview((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))}
                  className="p-1 rounded cursor-pointer hover:bg-white/[0.06] flex-shrink-0"
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
              Crear {preview.length} {preview.length === 1 ? "unidad" : "unidades"}
            </button>
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              Revisa la lista y quita lo que no aplique. Podrás editar cada unidad después.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
