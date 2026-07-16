"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Layers, Loader2, CheckCircle2, AlertTriangle, RefreshCw, FileText, Search, ArrowRight, Clock,
} from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type PreviewRow = {
  propertyId: string;
  name: string;
  city: string | null;
  groupLabel: string | null;
  fileCount: number;
  ready: boolean;
  alreadyGenerated: boolean;
};

type Progress = {
  total: number; completed: number; failed: number; pending: number; processing: number; done: boolean;
  items: { generationId: string; propertyName: string; status: string; errorMessage: string | null }[];
};

export function BatchGenerator() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const years = [now.getFullYear(), now.getFullYear() - 1];

  const [docTypes, setDocTypes] = useState({ informe: true, acta: true, pptx: false });
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [regenerate, setRegenerate] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the readiness preview whenever the period changes.
  useEffect(() => {
    if (batchId) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/empresa/batch?month=${month}&year=${year}`)
      .then((r) => (r.ok ? r.json() : { properties: [] }))
      .then((d) => {
        if (!active) return;
        const list: PreviewRow[] = Array.isArray(d.properties) ? d.properties : [];
        setRows(list);
        // Default-select ready properties that aren't already generated.
        setSelected(new Set(list.filter((p) => p.ready && !p.alreadyGenerated).map((p) => p.propertyId)));
      })
      .catch(() => setError("No se pudo cargar la lista de propiedades."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, year, batchId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.city || "").toLowerCase().includes(q));
  }, [rows, query]);

  const readyCount = rows.filter((r) => r.ready).length;
  const selectableIds = rows.filter((r) => r.ready).map((r) => r.propertyId);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllReady = () => setSelected(new Set(selectableIds));
  const clearAll = () => setSelected(new Set());

  const launch = async () => {
    setError("");
    const docs = Object.entries(docTypes).filter(([, v]) => v).map(([k]) => k);
    if (!docTypes.informe && !docTypes.acta) { setError("Elige al menos informe o acta."); return; }
    if (selected.size === 0) { setError("Selecciona al menos una propiedad lista."); return; }
    setLaunching(true);
    try {
      const res = await fetch("/api/empresa/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, docTypes: docs, propertyIds: [...selected], regenerate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "No se pudo iniciar el lote."); return; }
      setBatchId(data.batchId);
    } catch {
      setError("Error de conexión al iniciar el lote.");
    } finally {
      setLaunching(false);
    }
  };

  // Poll progress once a batch is running.
  const poll = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/empresa/batch/${id}`);
      if (r.ok) setProgress(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!batchId) return;
    poll(batchId);
    pollRef.current = setInterval(() => poll(batchId), 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [batchId, poll]);

  useEffect(() => {
    if (progress?.done && pollRef.current) clearInterval(pollRef.current);
  }, [progress?.done]);

  const retryFailed = async () => {
    if (!batchId) return;
    setRetrying(true);
    try {
      await fetch(`/api/empresa/batch/${batchId}`, { method: "POST" });
      await poll(batchId);
      if (!pollRef.current || progress?.done) {
        pollRef.current = setInterval(() => poll(batchId), 4000);
      }
    } finally {
      setRetrying(false);
    }
  };

  const selectBase = "rounded-lg border border-border bg-card text-sm text-foreground px-3 h-9 focus-visible:outline-none focus-visible:border-[#7c5cff] transition-all cursor-pointer";

  // ── Progress view ──────────────────────────────────────────────────────────
  if (batchId && progress) {
    const pct = progress.total ? Math.round(((progress.completed + progress.failed) / progress.total) * 100) : 0;
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Lote de {MONTHS[month - 1]} {year}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {progress.done ? "Completado" : "Generando… el procesamiento continúa aunque cierres esta página."}
              </p>
            </div>
            <span className="text-2xl font-semibold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "#9a7fff" }}>
              {progress.completed}/{progress.total}
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-secondary mb-3">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: progress.failed > 0 ? "#ffb958" : "#4cd6a0" }} />
          </div>
          <div className="flex flex-wrap gap-4 text-[12px]" style={{ fontFamily: "var(--font-mono)" }}>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#4cd6a0" }} /> {progress.completed} listas</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" style={{ color: "#9a7fff" }} /> {progress.pending + progress.processing} en cola</span>
            {progress.failed > 0 && <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" style={{ color: "#ff6f6f" }} /> {progress.failed} fallidas</span>}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {progress.items.map((it) => (
              <li key={it.generationId} className="px-5 py-3 flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[13px] text-foreground">{it.propertyName}</span>
                <ItemStatus status={it.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          {progress.failed > 0 && (
            <button onClick={retryFailed} disabled={retrying} className="inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-medium border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-50">
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reintentar fallidas
            </button>
          )}
          <Link href="/empresa/propiedades" className="inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-medium text-white transition-all hover:opacity-90" style={{ background: "#7c5cff" }}>
            Ver propiedades <ArrowRight className="h-4 w-4" />
          </Link>
          <button onClick={() => { setBatchId(null); setProgress(null); }} className="inline-flex items-center gap-2 rounded-xl px-4 h-10 text-sm font-medium border border-border text-foreground hover:bg-secondary transition-colors">
            Nuevo lote
          </button>
        </div>
      </div>
    );
  }

  // ── Configuration view ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "rgba(255,111,111,0.10)", border: "1px solid rgba(255,111,111,0.25)", color: "#ff6f6f" }}>
          {error}
        </div>
      )}

      {/* Period + doc types */}
      <div className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase text-muted-foreground/70" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}>Periodo</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectBase}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectBase}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <span className="text-[11px] uppercase text-muted-foreground/70" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}>Documentos</span>
          {([["informe", "Informe"], ["acta", "Acta"], ["pptx", "Presentación"]] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5 text-[13px] text-foreground cursor-pointer">
              <input type="checkbox" checked={docTypes[k]} onChange={(e) => setDocTypes((d) => ({ ...d, [k]: e.target.checked }))} className="accent-[#7c5cff]" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: "rgba(255,255,255,0.35)" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar propiedad…" className="w-full h-9 rounded-lg border border-border bg-card text-sm text-foreground pl-8 pr-3 placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-[#7c5cff] transition-all" />
          </div>
          <span className="text-[12px] text-muted-foreground">
            {readyCount} de {rows.length} listas · <strong className="text-foreground">{selected.size} seleccionadas</strong>
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} className="accent-[#7c5cff]" />
              Regenerar ya generadas
            </label>
            <button onClick={selectAllReady} className="text-[12px] text-[#9a7fff] hover:underline">Todas las listas</button>
            <button onClick={clearAll} className="text-[12px] text-muted-foreground hover:text-foreground">Ninguna</button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <Layers className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No hay propiedades para este periodo.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-[460px] overflow-y-auto">
            {filtered.map((p) => {
              const disabled = !p.ready;
              return (
                <li key={p.propertyId} className={`px-5 py-3 flex items-center gap-3 ${disabled ? "opacity-60" : "hover:bg-secondary/40"} transition-colors`}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.propertyId)}
                    disabled={disabled}
                    onChange={() => toggle(p.propertyId)}
                    className="accent-[#7c5cff] flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{p.city || "—"}{p.groupLabel ? ` · ${p.groupLabel}` : ""}</p>
                  </div>
                  {p.alreadyGenerated && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ fontFamily: "var(--font-mono)", background: "rgba(76,214,160,0.10)", color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.25)" }}>ya generado</span>
                  )}
                  {p.ready ? (
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-mono)" }}>{p.fileCount} arch.</span>
                  ) : (
                    <Link href={`/empresa/propiedades/${p.propertyId}`} className="text-[11px] whitespace-nowrap hover:underline" style={{ color: "#ffb958" }}>
                      faltan datos →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={launch}
          disabled={launching || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-xl px-5 h-11 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "#7c5cff", boxShadow: "0 4px 20px rgba(124,92,255,0.35)" }}
        >
          {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
          Generar {selected.size} {selected.size === 1 ? "propiedad" : "propiedades"}
        </button>
        <p className="text-[12px] text-muted-foreground">
          Solo se generan las propiedades con datos cargados. Las demás aparecen como “faltan datos”.
        </p>
      </div>
    </div>
  );
}

function ItemStatus({ status }: { status: string }) {
  if (status === "completed") return <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "#4cd6a0" }}><CheckCircle2 className="h-3.5 w-3.5" /> Listo</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "#ff6f6f" }}><AlertTriangle className="h-3.5 w-3.5" /> Error</span>;
  if (status === "processing") return <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "#9a7fff" }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando</span>;
  return <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><Clock className="h-3.5 w-3.5" /> En cola</span>;
}
