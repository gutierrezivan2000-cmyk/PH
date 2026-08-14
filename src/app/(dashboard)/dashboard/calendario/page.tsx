"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { AssetImport } from "@/components/dashboard/AssetImport";
import { ASSET_KIND_LABELS, recurrenceLabel, type AssetKind } from "@/lib/common-assets";
import {
  CalendarClock,
  Check,
  Plus,
  Loader2,
  X,
  EyeOff,
  Trash2,
  Building2,
  ChevronDown,
  Settings2,
  ClipboardList,
  Sparkles,
  Archive,
} from "lucide-react";

interface CalendarItem {
  key: string;
  propertyId: string;
  propertyName: string;
  title: string;
  description: string;
  category: string;
  dueDate: string;
  source: "auto" | "custom" | "asset";
  status: "pending" | "done" | "dismissed";
}

interface CommonAsset {
  id: string;
  propertyId: string;
  kind: AssetKind;
  name: string;
  provider: string | null;
  reference: string | null;
  notes: string | null;
  dueDate: string;
  recurrenceMonths: number | null;
}

interface PropertyInfo {
  id: string;
  name: string;
  features: {
    ascensor?: boolean;
    piscina?: boolean;
    plantaElectrica?: boolean;
    gimnasio?: boolean;
    empleadosDirectos?: boolean;
    polizaVence?: string | null;
  };
  hasProfile?: boolean;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  legal:         { label: "Legal",         color: "#a78bff", bg: "rgba(124,92,255,0.10)",  border: "rgba(124,92,255,0.30)"  },
  poliza:        { label: "Póliza",        color: "#ffb958", bg: "rgba(255,185,88,0.10)",  border: "rgba(255,185,88,0.30)"  },
  mantenimiento: { label: "Mantenimiento", color: "#5fb4ff", bg: "rgba(95,180,255,0.10)",  border: "rgba(95,180,255,0.30)"  },
  sgsst:         { label: "SG-SST",        color: "#ff8585", bg: "rgba(255,111,111,0.10)", border: "rgba(255,111,111,0.30)" },
  finanzas:      { label: "Finanzas",      color: "#4cd6a0", bg: "rgba(76,214,160,0.10)",  border: "rgba(76,214,160,0.30)"  },
  informe:       { label: "Informe",       color: "#5fd6c6", bg: "rgba(95,214,198,0.10)",  border: "rgba(95,214,198,0.30)"  },
  asamblea:      { label: "Asamblea",      color: "#8fa8ff", bg: "rgba(143,168,255,0.10)", border: "rgba(143,168,255,0.30)" },
  custom:        { label: "Recordatorio",  color: "rgba(255,255,255,0.60)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)" },
};

const monoLabel: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const monoMini: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "11px",
  letterSpacing: "0.06em",
};

const card: React.CSSProperties = {
  background: "var(--hifi-surface-1)",
  border: "1px solid var(--hifi-hairline)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--hifi-bg-elev)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f6f5f7",
  borderRadius: "10px",
  height: "38px",
  padding: "0 12px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
};

function daysUntil(dueDate: string): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - base.getTime()) / 86400000);
}

function relativeLabel(days: number): string {
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days > 1) return `En ${days} días`;
  if (days === -1) return "Venció ayer";
  return `Hace ${Math.abs(days)} días`;
}

function formatDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/*
 * AssetForm, AssetRow y RegistroTab viven FUERA de CalendarioPage a propósito.
 * Definidos dentro, cada render del padre creaba funciones nuevas y React
 * remontaba el subárbol entero: comprobado en el navegador — se escribía en el
 * formulario, se pulsaba un chip de propiedad y el campo quedaba vacío. Lo
 * mismo borraba la vista previa del import por IA con hasta 300 filas ya
 * revisadas. Aquí su identidad es estable y conservan su estado.
 */

function AssetForm({
  properties,
  reloadAll,
  onDone,
}: {
  properties: PropertyInfo[];
  reloadAll: () => Promise<void>;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<AssetKind>("zona_comun");
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState(properties[0]?.id || "");
  const [provider, setProvider] = useState("");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !propertyId || !dueDate) {
      setErr("Completa nombre, propiedad y fecha.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/common-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          kind,
          name,
          provider: provider || undefined,
          reference: reference || undefined,
          dueDate,
          recurrenceMonths: recurrence || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error || "No se pudo crear el registro.");
        return;
      }
      await reloadAll();
      onDone();
    } catch {
      setErr("Error de red. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="ui-card ui-sheen ui-rise p-5 space-y-4">
      <div className="flex items-center gap-2">
        {(["zona_comun", "poliza"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className="ui-chip px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer"
            style={{
              border: `1px solid ${kind === k ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
              background: kind === k ? "rgba(124,92,255,0.15)" : "transparent",
              color: kind === k ? "#a78bff" : "rgba(246,245,247,0.55)",
            }}
          >
            {ASSET_KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
            Nombre
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "poliza" ? "Ej: Todo riesgo área común" : "Ej: Ascensor Torre A"}
            style={inputStyle}
            maxLength={150}
          />
        </div>
        <div>
          <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
            Propiedad
          </label>
          <div className="relative">
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id} style={{ background: "var(--hifi-surface-1)" }}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
          </div>
        </div>
        <div>
          <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
            {kind === "poliza" ? "Vence" : "Próximo mantenimiento"}
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ ...inputStyle, colorScheme: "dark" }}
          />
        </div>
        <div>
          <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
            {kind === "poliza" ? "Aseguradora" : "Contratista"} (opcional)
          </label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle} maxLength={150} />
        </div>
        <div>
          <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
            {kind === "poliza" ? "Número de póliza" : "Contrato"} (opcional)
          </label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} style={inputStyle} maxLength={100} />
        </div>
        <div className="sm:col-span-2">
          <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
            Se repite cada (meses, opcional)
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            placeholder="Ej: 12 para una póliza anual"
            style={{ ...inputStyle, width: 220 }}
          />
        </div>
      </div>
      {err && <p className="text-[12px]" style={{ color: "#ff8585" }}>{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="ui-press ui-btn-glow inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 cursor-pointer"
        style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Guardar en la bitácora
      </button>
    </form>
  );
}

function AssetRow({
  asset,
  properties,
  propertyFilter,
  assetBusy,
  markAsset,
  deleteAsset,
}: {
  asset: CommonAsset;
  properties: PropertyInfo[];
  propertyFilter: string;
  assetBusy: string | null;
  markAsset: (a: CommonAsset, action: "done" | "archive") => void;
  deleteAsset: (a: CommonAsset) => void;
}) {
  const d = daysUntil(asset.dueDate.slice(0, 10));
  const urgencyColor = d < 0 ? "#ff6f6f" : d <= 7 ? "#ffb958" : "rgba(246,245,247,0.55)";
  const propName = properties.find((p) => p.id === asset.propertyId)?.name;
  const busy = assetBusy === asset.id;

  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3.5"
      style={{ ...card, borderColor: d < 0 ? "rgba(255,111,111,0.25)" : "rgba(255,255,255,0.07)" }}
    >
      <span
        className="mt-0.5 shrink-0 px-2 py-0.5 rounded text-[9px]"
        style={{
          ...monoLabel,
          fontSize: 9,
          color: asset.kind === "poliza" ? "#ffb958" : "#5fb4ff",
          background: asset.kind === "poliza" ? "rgba(255,185,88,0.10)" : "rgba(95,180,255,0.10)",
          border: `1px solid ${asset.kind === "poliza" ? "rgba(255,185,88,0.30)" : "rgba(95,180,255,0.30)"}`,
        }}
      >
        {ASSET_KIND_LABELS[asset.kind]}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>{asset.name}</span>
          {propertyFilter === "all" && propName && (
            <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ ...monoMini, color: "rgba(246,245,247,0.40)" }}>
              <Building2 className="h-3 w-3" />
              {propName}
            </span>
          )}
        </div>
        {(asset.provider || asset.reference || asset.recurrenceMonths) && (
          <p className="text-[12px] mt-1" style={{ color: "rgba(246,245,247,0.50)" }}>
            {[asset.provider, asset.reference ? `Ref. ${asset.reference}` : null, asset.recurrenceMonths ? `se repite ${recurrenceLabel(asset.recurrenceMonths)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p className="mt-1.5" style={{ ...monoMini, color: urgencyColor }}>
          {relativeLabel(d)} · {formatDue(asset.dueDate.slice(0, 10))}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => markAsset(asset, "done")}
          disabled={busy}
          className="p-1.5 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors"
          style={{ color: "#4cd6a0" }}
          title={asset.recurrenceMonths ? "Marcar hecho — pasa al próximo ciclo" : "Marcar hecho y archivar"}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => deleteAsset(asset)}
          disabled={busy}
          className="p-1.5 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors"
          style={{ color: "rgba(246,245,247,0.30)" }}
          title="Eliminar del registro"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function RegistroTab({
  assets,
  properties,
  propertyFilter,
  setPropertyFilter,
  showAssetForm,
  setShowAssetForm,
  assetsLoading,
  assetBusy,
  markAsset,
  deleteAsset,
  reloadAll,
}: {
  assets: CommonAsset[];
  properties: PropertyInfo[];
  propertyFilter: string;
  setPropertyFilter: (v: string) => void;
  showAssetForm: boolean;
  setShowAssetForm: React.Dispatch<React.SetStateAction<boolean>>;
  assetsLoading: boolean;
  assetBusy: string | null;
  markAsset: (a: CommonAsset, action: "done" | "archive") => void;
  deleteAsset: (a: CommonAsset) => void;
  reloadAll: () => Promise<void>;
}) {
  const filtered = assets
    .filter((a) => propertyFilter === "all" || a.propertyId === propertyFilter)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const importTargetId = propertyFilter !== "all" ? propertyFilter : properties[0]?.id;

  return (
    <>
      <div className="ui-card ui-sheen p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}>Propiedad</span>
        <div className="ui-scroll flex gap-2 flex-1 overflow-x-auto pb-0.5">
          <button
            onClick={() => setPropertyFilter("all")}
            className="ui-chip px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer whitespace-nowrap shrink-0"
            style={{
              border: `1px solid ${propertyFilter === "all" ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
              background: propertyFilter === "all" ? "rgba(124,92,255,0.15)" : "transparent",
              color: propertyFilter === "all" ? "#a78bff" : "rgba(246,245,247,0.55)",
            }}
          >
            Todas
          </button>
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => setPropertyFilter(p.id)}
              className="ui-chip px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer whitespace-nowrap shrink-0"
              style={{
                border: `1px solid ${propertyFilter === p.id ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                background: propertyFilter === p.id ? "rgba(124,92,255,0.15)" : "transparent",
                color: propertyFilter === p.id ? "#a78bff" : "rgba(246,245,247,0.55)",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAssetForm((v) => !v)}
          className="ui-press inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 cursor-pointer"
          style={{
            background: showAssetForm ? "rgba(255,255,255,0.06)" : "#7c5cff",
            color: showAssetForm ? "rgba(246,245,247,0.70)" : "#fff",
          }}
        >
          {showAssetForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAssetForm ? "Cancelar" : "Añadir"}
        </button>
      </div>

      {!showAssetForm && importTargetId && (
        <div className="ui-card ui-sheen p-4 flex items-start gap-3">
          <Sparkles className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#a78bff" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium mb-0.5" style={{ color: "#f6f5f7" }}>
              ¿Tienes el listado en un documento?
            </p>
            <p className="text-[12px] mb-2.5" style={{ color: "rgba(246,245,247,0.50)" }}>
              Sube el Excel, PDF o Word con tus zonas comunes y pólizas — la IA organiza la lista
              {propertyFilter === "all" ? ` para ${properties.find((p) => p.id === importTargetId)?.name}` : ""} y tú revisas antes de guardar.
            </p>
            <AssetImport propertyId={importTargetId} onImported={() => reloadAll()} />
          </div>
        </div>
      )}

      {showAssetForm && (
        <AssetForm properties={properties} reloadAll={reloadAll} onDone={() => setShowAssetForm(false)} />
      )}

      {assetsLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
        </div>
      )}

      {!assetsLoading && filtered.length === 0 && (
        <div className="rounded-2xl p-10 text-center" style={card}>
          <ClipboardList className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
          <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
            Aún no hay zonas comunes ni pólizas registradas
          </p>
          <p className="text-[12.5px]" style={{ color: "rgba(246,245,247,0.40)" }}>
            Añádelas a mano o importa el listado desde un documento — cada una avisa en Recordatorios cuando se acerca su fecha.
          </p>
        </div>
      )}

      {!assetsLoading && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((a) => (
            <AssetRow
                key={a.id}
                asset={a}
                properties={properties}
                propertyFilter={propertyFilter}
                assetBusy={assetBusy}
                markAsset={markAsset}
                deleteAsset={deleteAsset}
              />
          ))}
        </div>
      )}
    </>
  );
}

export default function CalendarioPage() {
  const [tab, setTab] = useState<"recordatorios" | "registro">("recordatorios");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [properties, setProperties] = useState<PropertyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [showDone, setShowDone] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Add-reminder form
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addProperty, setAddProperty] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  // Building profile editor
  const [profileFor, setProfileFor] = useState<string | null>(null);

  // Registro de zonas comunes y pólizas
  const [assets, setAssets] = useState<CommonAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetBusy, setAssetBusy] = useState<string | null>(null);
  const [showAssetForm, setShowAssetForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
        setProperties(data.properties || []);
      }
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssets = useCallback(async () => {
    try {
      const res = await fetch("/api/common-assets");
      const data = await res.json();
      if (res.ok) setAssets(data.assets || []);
    } catch {
      // keep whatever we had
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  // Ambas pestañas comparten la misma fuente de verdad: un cambio en el
  // registro debe reflejarse de inmediato en la línea de tiempo de recordatorios.
  const reloadAll = useCallback(async () => {
    await Promise.all([load(), loadAssets()]);
  }, [load, loadAssets]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          it.status !== "dismissed" &&
          (propertyFilter === "all" || it.propertyId === propertyFilter)
      ),
    [items, propertyFilter]
  );

  const pending = filtered.filter((it) => it.status === "pending");
  const done = filtered.filter((it) => it.status === "done");

  const overdue = pending.filter((it) => daysUntil(it.dueDate) < 0);
  const soon = pending.filter((it) => {
    const d = daysUntil(it.dueDate);
    return d >= 0 && d <= 30;
  });
  const later = pending.filter((it) => daysUntil(it.dueDate) > 30);

  const unconfigured = properties.filter((p) => !p.hasProfile);

  async function mark(item: CalendarItem, action: "done" | "undo" | "dismiss") {
    setBusyKey(item.key);
    try {
      // Los ítems de la bitácora (zonas comunes/pólizas) viven en su propio
      // registro con su propia semántica: "hecho" en uno recurrente adelanta
      // la fecha en vez de solo marcarlo, y no tiene "deshacer".
      const res =
        item.source === "asset"
          ? await fetch("/api/common-assets", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: item.key.replace(/^asset-/, ""),
                action: action === "dismiss" ? "archive" : action === "undo" ? "restore" : "done",
              }),
            })
          : await fetch("/api/calendar", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                propertyId: item.propertyId,
                itemKey: item.key,
                action,
              }),
            });
      if (res.ok) await (item.source === "asset" ? reloadAll() : load());
    } finally {
      setBusyKey(null);
    }
  }

  async function markAsset(asset: CommonAsset, action: "done" | "archive") {
    setAssetBusy(asset.id);
    try {
      const res = await fetch("/api/common-assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, action }),
      });
      if (res.ok) await reloadAll();
    } finally {
      setAssetBusy(null);
    }
  }

  async function deleteAsset(asset: CommonAsset) {
    setAssetBusy(asset.id);
    try {
      const res = await fetch(`/api/common-assets?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      if (res.ok) await reloadAll();
    } finally {
      setAssetBusy(null);
    }
  }

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addTitle.trim() || !addDate || !addProperty) {
      setAddError("Completa título, propiedad y fecha.");
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: addProperty,
          title: addTitle,
          description: addDesc,
          dueDate: addDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "No se pudo crear el recordatorio.");
        return;
      }
      setAddTitle("");
      setAddDate("");
      setAddDesc("");
      setShowAdd(false);
      await load();
    } catch {
      setAddError("Error de red. Intenta de nuevo.");
    } finally {
      setAddBusy(false);
    }
  }


  function ItemRow({ item }: { item: CalendarItem }) {
    const d = daysUntil(item.dueDate);
    const isDone = item.status === "done";
    const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.custom;
    const urgencyColor = isDone
      ? "rgba(246,245,247,0.35)"
      : d < 0
        ? "#ff6f6f"
        : d <= 7
          ? "#ffb958"
          : "rgba(246,245,247,0.55)";

    return (
      <div
        className="rounded-xl p-4 flex items-start gap-3.5 transition-colors"
        style={{
          ...card,
          borderColor: !isDone && d < 0 ? "rgba(255,111,111,0.25)" : "rgba(255,255,255,0.07)",
          opacity: isDone ? 0.6 : 1,
        }}
      >
        {/* Toggle done */}
        <button
          onClick={() => mark(item, isDone ? "undo" : "done")}
          disabled={busyKey === item.key}
          className="mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer"
          style={{
            borderColor: isDone ? "#4cd6a0" : "rgba(255,255,255,0.25)",
            background: isDone ? "rgba(76,214,160,0.15)" : "transparent",
          }}
          title={isDone ? "Marcar como pendiente" : "Marcar como hecho"}
        >
          {busyKey === item.key ? (
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#4cd6a0" }} />
          ) : isDone ? (
            <Check className="h-3 w-3" style={{ color: "#4cd6a0" }} />
          ) : null}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[13.5px] font-medium"
              style={{
                color: "#f6f5f7",
                textDecoration: isDone ? "line-through" : "none",
              }}
            >
              {item.title}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[9px]"
              style={{
                ...monoLabel,
                fontSize: 9,
                color: cat.color,
                background: cat.bg,
                border: `1px solid ${cat.border}`,
              }}
            >
              {cat.label}
            </span>
            {propertyFilter === "all" && (
              <span
                className="inline-flex items-center gap-1 text-[10.5px]"
                style={{ ...monoMini, color: "rgba(246,245,247,0.40)" }}
              >
                <Building2 className="h-3 w-3" />
                {item.propertyName}
              </span>
            )}
          </div>
          {item.description && !isDone && (
            <p
              className="text-[12px] leading-relaxed mt-1"
              style={{ color: "rgba(246,245,247,0.50)" }}
            >
              {item.description}
            </p>
          )}
          <p className="mt-1.5" style={{ ...monoMini, color: urgencyColor }}>
            {relativeLabel(d)} · {formatDue(item.dueDate)}
          </p>
        </div>

        {/* Secondary actions */}
        {!isDone && (
          <button
            onClick={() => mark(item, "dismiss")}
            disabled={busyKey === item.key}
            className="mt-0.5 p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.05]"
            style={{ color: "rgba(246,245,247,0.30)" }}
            title={
              item.source === "custom"
                ? "Eliminar recordatorio"
                : item.source === "asset"
                  ? "Archivar — deja de recordarse"
                  : "No aplica / ocultar"
            }
          >
            {item.source === "custom" ? (
              <Trash2 className="h-3.5 w-3.5" />
            ) : item.source === "asset" ? (
              <Archive className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    );
  }

  function Group({ title, color, list }: { title: string; color: string; list: CalendarItem[] }) {
    if (list.length === 0) return null;
    return (
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <span style={{ ...monoLabel, color }}>{title}</span>
          <span
            className="px-1.5 py-0.5 rounded-md text-[10px]"
            style={{ ...monoMini, background: "rgba(255,255,255,0.05)", color: "rgba(246,245,247,0.45)" }}
          >
            {list.length}
          </span>
        </div>
        <div className="space-y-2.5">
          {list.map((it) => (
            <ItemRow key={`${it.propertyId}:${it.key}`} item={it} />
          ))}
        </div>
      </div>
    );
  }

  function ProfileEditor({ property }: { property: PropertyInfo }) {
    const [f, setF] = useState({ ...property.features });
    const [saving, setSaving] = useState(false);

    const toggles: { key: keyof typeof f; label: string }[] = [
      { key: "ascensor", label: "Ascensor" },
      { key: "piscina", label: "Piscina" },
      { key: "plantaElectrica", label: "Planta eléctrica" },
      { key: "gimnasio", label: "Gimnasio" },
      { key: "empleadosDirectos", label: "Empleados directos" },
    ];

    async function save() {
      setSaving(true);
      try {
        const res = await fetch("/api/properties", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: property.id, features: f }),
        });
        if (res.ok) {
          setProfileFor(null);
          await load();
        }
      } finally {
        setSaving(false);
      }
    }

    return (
      <div className="rounded-2xl p-5" style={{ ...card, borderColor: "rgba(124,92,255,0.25)" }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>
            Perfil del edificio — {property.name}
          </p>
          <button
            onClick={() => setProfileFor(null)}
            className="p-1 rounded-lg cursor-pointer hover:bg-white/[0.05]"
            style={{ color: "rgba(246,245,247,0.35)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[12px] mb-4" style={{ color: "rgba(246,245,247,0.45)" }}>
          Marca lo que tiene esta copropiedad y SOPH.IA generará sus obligaciones automáticamente.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {toggles.map((t) => {
            const on = f[t.key] === true;
            return (
              <button
                key={t.key}
                onClick={() => setF((prev) => ({ ...prev, [t.key]: !on }))}
                className="ui-chip px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  border: `1px solid ${on ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.12)"}`,
                  background: on ? "rgba(124,92,255,0.15)" : "transparent",
                  color: on ? "#a78bff" : "rgba(246,245,247,0.55)",
                }}
              >
                {on ? "✓ " : ""}
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
              Vencimiento póliza zonas comunes
            </label>
            <input
              type="date"
              value={f.polizaVence || ""}
              onChange={(e) => setF((prev) => ({ ...prev, polizaVence: e.target.value || null }))}
              style={{ ...inputStyle, width: 180, colorScheme: "dark" }}
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="ui-press ui-btn-glow inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 cursor-pointer"
            style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Guardar perfil
          </button>
        </div>
      </div>
    );
  }

  const profileProperty = profileFor ? properties.find((p) => p.id === profileFor) : null;

  return (
    <div>
      <Header
        title="Bitácora"
        subtitle="Zonas comunes, pólizas y vencimientos legales de tus copropiedades"
      />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1080px] mx-auto space-y-4">
        {/* Tabs: la línea de tiempo de recordatorios vs. el registro que la alimenta */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--hifi-bg-elev)", border: "1px solid var(--hifi-hairline)" }}>
          {(
            [
              { key: "recordatorios" as const, label: "Recordatorios", Icon: CalendarClock },
              { key: "registro" as const, label: "Zonas comunes y pólizas", Icon: ClipboardList },
            ]
          ).map(({ key, label, Icon }) => {
            const on = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="ui-chip inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer"
                style={{
                  background: on ? "var(--hifi-accent)" : "transparent",
                  color: on ? "#fff" : "rgba(246,245,247,0.55)",
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>

      {tab === "recordatorios" && (
      <>
        {/* Property filter + actions */}
        <div className="ui-card ui-sheen p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <span style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}>Propiedad</span>
          <div className="ui-scroll flex gap-2 flex-1 overflow-x-auto pb-0.5">
            <button
              onClick={() => setPropertyFilter("all")}
              className="ui-chip px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer whitespace-nowrap shrink-0"
              style={{
                border: `1px solid ${propertyFilter === "all" ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                background: propertyFilter === "all" ? "rgba(124,92,255,0.15)" : "transparent",
                color: propertyFilter === "all" ? "#a78bff" : "rgba(246,245,247,0.55)",
              }}
            >
              Todas
            </button>
            {properties.map((p) => (
              <button
                key={p.id}
                onClick={() => setPropertyFilter(p.id)}
                className="ui-chip px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  border: `1px solid ${propertyFilter === p.id ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                  background: propertyFilter === p.id ? "rgba(124,92,255,0.15)" : "transparent",
                  color: propertyFilter === p.id ? "#a78bff" : "rgba(246,245,247,0.55)",
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setShowAdd((v) => !v);
              if (properties.length > 0 && !addProperty) setAddProperty(properties[0].id);
            }}
            className="ui-press inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 cursor-pointer"
            style={{
              background: showAdd ? "rgba(255,255,255,0.06)" : "#7c5cff",
              color: showAdd ? "rgba(246,245,247,0.70)" : "#fff",
            }}
          >
            {showAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showAdd ? "Cancelar" : "Recordatorio"}
          </button>
        </div>

        {/* Configure-profile prompt for the selected property */}
        {propertyFilter !== "all" && !profileFor && (
          <button
            onClick={() => setProfileFor(propertyFilter)}
            className="inline-flex items-center gap-2 text-[12px] cursor-pointer transition-colors hover:text-white"
            style={{ ...monoMini, color: "rgba(246,245,247,0.45)" }}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Editar perfil del edificio
          </button>
        )}

        {/* Unconfigured banner */}
        {!loading && unconfigured.length > 0 && !profileFor && propertyFilter === "all" && (
          <div
            className="rounded-2xl p-4 flex flex-wrap items-center gap-3"
            style={{ background: "rgba(124,92,255,0.07)", border: "1px solid rgba(124,92,255,0.25)" }}
          >
            <CalendarClock className="h-4 w-4 flex-shrink-0" style={{ color: "#a78bff" }} />
            <p className="text-[12.5px] flex-1" style={{ color: "rgba(246,245,247,0.75)" }}>
              {unconfigured.length === 1
                ? `Configura el perfil de ${unconfigured[0].name} para generar sus obligaciones (ascensor, piscina, póliza…).`
                : `${unconfigured.length} propiedades sin perfil configurado — configúralas para generar sus obligaciones.`}
            </p>
            <button
              onClick={() => setProfileFor(unconfigured[0].id)}
              className="rounded-full text-[12px] font-medium px-4 py-2 cursor-pointer"
              style={{ background: "#7c5cff", color: "#fff" }}
            >
              Configurar
            </button>
          </div>
        )}

        {/* Profile editor */}
        {profileProperty && <ProfileEditor key={profileProperty.id} property={profileProperty} />}

        {/* Add reminder form */}
        {showAdd && (
          <form onSubmit={addReminder} className="ui-card ui-sheen ui-rise p-5 space-y-4">
            <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>
              Nuevo recordatorio
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                  Título
                </label>
                <input
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Ej: Renovar contrato de vigilancia"
                  style={inputStyle}
                  maxLength={200}
                />
              </div>
              <div>
                <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                  Propiedad
                </label>
                <div className="relative">
                  <select
                    value={addProperty}
                    onChange={(e) => setAddProperty(e.target.value)}
                    style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: "var(--hifi-surface-1)" }}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5"
                    style={{ color: "rgba(246,245,247,0.42)" }}
                  />
                </div>
              </div>
              <div>
                <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                  Fecha límite
                </label>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  style={{ ...inputStyle, colorScheme: "dark" }}
                />
              </div>
              <div className="sm:col-span-2">
                <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                  Descripción (opcional)
                </label>
                <input
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  placeholder="Detalles del recordatorio"
                  style={inputStyle}
                  maxLength={2000}
                />
              </div>
            </div>
            {addError && (
              <p className="text-[12px]" style={{ color: "#ff8585" }}>
                {addError}
              </p>
            )}
            <button
              type="submit"
              disabled={addBusy}
              className="ui-press ui-btn-glow inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 cursor-pointer"
              style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
            >
              {addBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Crear recordatorio
            </button>
          </form>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {/* Empty state */}
        {!loading && properties.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={card}>
            <CalendarClock className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
            <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
              Crea tu primera propiedad para activar el calendario
            </p>
            <p className="text-[12.5px]" style={{ color: "rgba(246,245,247,0.40)" }}>
              Las obligaciones legales y de mantenimiento se generan automáticamente por copropiedad.
            </p>
          </div>
        )}

        {/* Groups */}
        {!loading && properties.length > 0 && (
          <>
            <Group title="Vencidos" color="#ff6f6f" list={overdue} />
            <Group title="Próximos 30 días" color="#ffb958" list={soon} />
            <Group title="Más adelante" color="rgba(246,245,247,0.42)" list={later} />

            {pending.length === 0 && (
              <div className="rounded-2xl p-10 text-center" style={card}>
                <Check className="h-8 w-8 mx-auto mb-3" style={{ color: "#4cd6a0" }} />
                <p className="text-[14px]" style={{ color: "rgba(246,245,247,0.70)" }}>
                  Todo al día. Sin obligaciones pendientes en el horizonte.
                </p>
              </div>
            )}

            {/* Completed (collapsible) */}
            {done.length > 0 && (
              <div>
                <button
                  onClick={() => setShowDone((v) => !v)}
                  className="flex items-center gap-2 mb-2.5 cursor-pointer"
                >
                  <span style={{ ...monoLabel, color: "rgba(246,245,247,0.35)" }}>
                    Completados
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[10px]"
                    style={{ ...monoMini, background: "rgba(255,255,255,0.05)", color: "rgba(246,245,247,0.45)" }}
                  >
                    {done.length}
                  </span>
                  <ChevronDown
                    className="h-3.5 w-3.5 transition-transform"
                    style={{
                      color: "rgba(246,245,247,0.35)",
                      transform: showDone ? "rotate(180deg)" : "none",
                    }}
                  />
                </button>
                {showDone && (
                  <div className="space-y-2.5">
                    {done.map((it) => (
                      <ItemRow key={`${it.propertyId}:${it.key}`} item={it} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </>
      )}

      {tab === "registro" && (
        <RegistroTab
          assets={assets}
          properties={properties}
          propertyFilter={propertyFilter}
          setPropertyFilter={setPropertyFilter}
          showAssetForm={showAssetForm}
          setShowAssetForm={setShowAssetForm}
          assetsLoading={assetsLoading}
          assetBusy={assetBusy}
          markAsset={markAsset}
          deleteAsset={deleteAsset}
          reloadAll={reloadAll}
        />
      )}
      </div>
    </div>
  );
}
