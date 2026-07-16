"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  CalendarDays,
  Upload,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  StickyNote,
} from "lucide-react";

type FileRef = { name: string; url: string; type: string; size: number };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function MonthlyDataCard({ propertyId }: { propertyId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [files, setFiles] = useState<FileRef[]>([]);
  const [additionalText, setAdditionalText] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const years = [now.getFullYear(), now.getFullYear() - 1];

  // Load staged data whenever the period changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSaved(false);
    fetch(`/api/empresa/properties/${propertyId}/monthly?month=${month}&year=${year}`)
      .then((r) => (r.ok ? r.json() : { files: [], additionalText: "" }))
      .then((d) => {
        if (!active) return;
        setFiles(Array.isArray(d.files) ? d.files : []);
        setAdditionalText(d.additionalText || "");
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [propertyId, month, year]);

  const persist = useCallback(
    async (nextFiles: FileRef[], nextText: string) => {
      setError("");
      try {
        const res = await fetch(`/api/empresa/properties/${propertyId}/monthly`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, year, files: nextFiles, additionalText: nextText }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || "No se pudo guardar.");
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        setError("Error de conexión al guardar.");
      }
    },
    [propertyId, month, year]
  );

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const added: FileRef[] = [];
      for (const file of Array.from(list).slice(0, 20)) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const result = await blobUpload(
          `monthly/${propertyId}/${year}-${month}/${Date.now()}-${safeName}`,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/upload/token",
            contentType: file.type || "application/octet-stream",
          }
        );
        added.push({ name: file.name, url: result.url, type: file.type, size: file.size });
      }
      const next = [...files, ...added].slice(0, 20);
      setFiles(next);
      await persist(next, additionalText);
    } catch {
      setError("No se pudo subir el archivo. Revisa el tipo y que no supere 25 MB.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = async (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    await persist(next, additionalText);
  };

  const onNoteChange = (v: string) => {
    setAdditionalText(v);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => persist(files, v), 700);
  };

  const selectBase =
    "rounded-lg border border-border bg-card text-sm text-foreground px-3 h-9 focus-visible:outline-none focus-visible:border-[#7c5cff] transition-all cursor-pointer";

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2 flex-wrap">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Datos del mes</p>
        <span className="text-[11px] text-muted-foreground">para la generación en lote</span>
        <div className="flex items-center gap-2 ml-auto">
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "#4cd6a0" }}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectBase}>
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectBase}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-5">
        <p className="text-[13px] text-muted-foreground mb-4">
          Sube aquí los archivos de <strong className="text-foreground">{MONTHS[month - 1]} {year}</strong> de
          esta copropiedad (cartera, estados financieros, PQRS, actas previas…). Se usarán cuando generes en lote.
        </p>

        {error && (
          <div className="mb-4 rounded-xl px-4 py-2.5 text-[13px]" style={{ background: "rgba(255,111,111,0.10)", border: "1px solid rgba(255,111,111,0.25)", color: "#ff6f6f" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <>
            {/* File list */}
            {files.length > 0 && (
              <ul className="space-y-2 mb-4">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "#1d1d24", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <FileText className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-[13px] text-foreground">{f.name}</span>
                    <span className="text-[11px] text-muted-foreground/60" style={{ fontFamily: "var(--font-mono)" }}>
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button onClick={() => removeFile(i)} className="text-muted-foreground/60 hover:text-[#ff6f6f] transition-colors" aria-label="Quitar">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Upload dropzone */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || files.length >= 20}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-6 transition-colors hover:border-[#7c5cff]/50 disabled:opacity-50"
              style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.02)" }}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#9a7fff" }} />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-[13px] text-muted-foreground">
                {uploading ? "Subiendo…" : files.length >= 20 ? "Máximo 20 archivos" : "Subir archivos (PDF, Excel, Word, imágenes)"}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {/* Notes */}
            <div className="mt-4">
              <label className="flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground/70 mb-2" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}>
                <StickyNote className="h-3 w-3" /> Notas del mes (opcional)
              </label>
              <textarea
                value={additionalText}
                onChange={(e) => onNoteChange(e.target.value)}
                rows={3}
                placeholder="Ej. Aprobada cuota extraordinaria de $X; pendiente cambio de bomba…"
                className="w-full rounded-xl border border-border bg-card text-sm text-foreground px-3 py-2.5 placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:border-[#7c5cff] transition-all resize-y"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
