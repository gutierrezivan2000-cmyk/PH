"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { fmtCOP } from "@/lib/cartera";
import { defaultBudgetItems, type BudgetItem, type BudgetExecution } from "@/lib/presupuesto";
import {
  PieChart,
  Loader2,
  Plus,
  Trash2,
  Save,
  Download,
  ChevronDown,
  CheckCircle2,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  Landmark,
  ListPlus,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface LedgerEntry {
  id: string;
  date: string;
  concept: string;
  itemId: string | null;
  type: string;
  amount: number;
  note: string | null;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TYPE_LABELS: Record<string, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  fondo_aporte: "Aporte al fondo",
  fondo_retiro: "Retiro del fondo",
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
  background: "#15151a",
  border: "1px solid rgba(255,255,255,0.07)",
};

const inputStyle: React.CSSProperties = {
  background: "#0f0f13",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#f6f5f7",
  borderRadius: "10px",
  height: "40px",
  padding: "0 12px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
};

function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 20);
  } catch {
    return `r${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PresupuestoPage() {
  const now = new Date();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [tab, setTab] = useState<"ejecucion" | "presupuesto">("ejecucion");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState<BudgetItem[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [execution, setExecution] = useState<BudgetExecution | null>(null);
  const [dirty, setDirty] = useState(false);

  // Movement form
  const [showMov, setShowMov] = useState(false);
  const [movType, setMovType] = useState("gasto");
  const [movItem, setMovItem] = useState("");
  const [movConcept, setMovConcept] = useState("");
  const [movAmount, setMovAmount] = useState("");
  const [movDate, setMovDate] = useState(todayIso());

  const load = useCallback(async (pid: string, yr: number) => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/presupuesto?propertyId=${pid}&year=${yr}`);
      const data = await res.json();
      if (res.status === 403 && data.code === "plan_upgrade") {
        setUpgrade(true);
        return;
      }
      if (res.ok) {
        setUpgrade(false);
        setItems(data.items || []);
        setEntries(data.entries || []);
        setExecution(data.execution || null);
        setDirty(false);
      }
    } catch {
      // keep
    }
  }, []);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setProperties(data.map((p: Property) => ({ id: p.id, name: p.name })));
          setPropertyId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (propertyId) {
      setMsg(null);
      setShowMov(false);
      load(propertyId, year);
    }
  }, [propertyId, year, load]);

  // ── Budget editing ───────────────────────────────────────────
  function updateItem(id: string, field: "concept" | "budgeted", value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, [field]: field === "budgeted" ? Math.max(0, parseInt(value.replace(/[.\s]/g, ""), 10) || 0) : value }
          : it
      )
    );
    setDirty(true);
  }
  function addItem(group: "ingreso" | "gasto") {
    setItems((prev) => [...prev, { id: newId(), concept: "", group, budgeted: 0 }]);
    setDirty(true);
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setDirty(true);
  }
  function loadTemplate() {
    setItems(defaultBudgetItems(() => newId()));
    setDirty(true);
  }

  async function saveBudget() {
    setBusy(true);
    setMsg(null);
    try {
      const clean = items.filter((it) => it.concept.trim());
      const res = await fetch("/api/presupuesto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, year, items: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo guardar." });
        return;
      }
      setMsg({ ok: true, text: "Presupuesto guardado." });
      await load(propertyId, year);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function addMovement(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(movAmount.replace(/[.$\s]/g, ""), 10);
    if (!movConcept.trim() || !Number.isFinite(amt) || amt <= 0) {
      setMsg({ ok: false, text: "Concepto y monto son requeridos." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const isFondo = movType.startsWith("fondo");
      const res = await fetch("/api/presupuesto/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          date: movDate,
          concept: movConcept,
          itemId: isFondo ? undefined : movItem || undefined,
          type: movType,
          amount: amt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo registrar." });
        return;
      }
      setMsg({ ok: true, text: `Movimiento de ${fmtCOP(amt)} registrado.` });
      setMovConcept("");
      setMovAmount("");
      await load(propertyId, year);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function deleteMovement(id: string) {
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/presupuesto/movimientos?id=${id}`, { method: "DELETE" });
      if (res.ok) await load(propertyId, year);
    } finally {
      setBusy(false);
    }
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  function ExecTable({ title, group }: { title: string; group: "ingresos" | "gastos" }) {
    if (!execution) return null;
    const g = execution[group];
    if (g.rows.length === 0) return null;
    const accent = group === "ingresos" ? "#4cd6a0" : "#ffb958";
    return (
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ ...monoLabel, color: accent }}>{title}</span>
          <span style={{ ...monoMini, color: "rgba(246,245,247,0.45)" }}>
            {fmtCOP(g.executed)} / {fmtCOP(g.budgeted)}
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {g.rows.map((row) => {
            const over = row.budgeted > 0 && row.executed > row.budgeted;
            return (
              <div key={row.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-[13px]" style={{ color: "#f6f5f7" }}>{row.concept}</span>
                  <span className="text-[12.5px] font-medium whitespace-nowrap" style={{ color: over ? "#ff8585" : "rgba(246,245,247,0.75)" }}>
                    {fmtCOP(row.executed)}
                    <span style={{ color: "rgba(246,245,247,0.35)" }}> / {fmtCOP(row.budgeted)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, row.budgeted > 0 ? row.pct : row.executed > 0 ? 100 : 0)}%`,
                        background: over ? "#ff6f6f" : accent,
                      }}
                    />
                  </div>
                  <span style={{ ...monoMini, color: over ? "#ff8585" : "rgba(246,245,247,0.40)", minWidth: 38, textAlign: "right" }}>
                    {row.budgeted > 0 ? `${row.pct}%` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Presupuesto" subtitle="Presupuesto anual, ejecución y fondo de imprevistos" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-4xl mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {!loading && upgrade && (
          <div className="rounded-2xl p-8 text-center" style={{ ...card, borderColor: "rgba(124,92,255,0.30)" }}>
            <PieChart className="h-9 w-9 mx-auto mb-3" style={{ color: "#a78bff" }} />
            <p className="text-[16px] font-semibold mb-2" style={{ color: "#f6f5f7" }}>
              El presupuesto es una función de los planes Business y Élite
            </p>
            <p className="text-[13px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: "rgba(246,245,247,0.55)" }}>
              Presupuesto anual por rubros, ejecución mes a mes, fondo de imprevistos y exporte a
              Excel para el contador.
            </p>
            <Link
              href="/dashboard/suscripcion"
              className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-6 py-3"
              style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
            >
              Ver planes
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {!loading && !upgrade && properties.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={card}>
            <PieChart className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
            <p className="text-[14px]" style={{ color: "rgba(246,245,247,0.70)" }}>
              Crea una propiedad primero para armar su presupuesto.
            </p>
          </div>
        )}

        {!loading && !upgrade && properties.length > 0 && (
          <>
            {/* Selectors */}
            <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={card}>
              <div className="flex flex-wrap gap-2 flex-1">
                {properties.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPropertyId(p.id)}
                    className="px-3 py-1.5 rounded-full text-[12px] transition-all cursor-pointer"
                    style={{
                      border: `1px solid ${propertyId === p.id ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                      background: propertyId === p.id ? "rgba(124,92,255,0.15)" : "transparent",
                      color: propertyId === p.id ? "#a78bff" : "rgba(246,245,247,0.55)",
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="relative">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inputStyle, width: 110, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                  {years.map((y) => (
                    <option key={y} value={y} style={{ background: "#15151a" }}>{y}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              {(["ejecucion", "presupuesto"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setMsg(null); }}
                  className="px-4 py-2 rounded-full text-[12.5px] font-medium transition-all cursor-pointer capitalize"
                  style={{
                    border: `1px solid ${tab === t ? "rgba(124,92,255,0.45)" : "rgba(255,255,255,0.10)"}`,
                    background: tab === t ? "rgba(124,92,255,0.15)" : "rgba(255,255,255,0.03)",
                    color: tab === t ? "#a78bff" : "rgba(246,245,247,0.60)",
                  }}
                >
                  {t === "ejecucion" ? "Ejecución" : "Editar presupuesto"}
                </button>
              ))}
              {tab === "ejecucion" && items.length > 0 && (
                <a
                  href={`/api/presupuesto/export?propertyId=${propertyId}&year=${year}`}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 transition-all cursor-pointer"
                  style={{ background: "rgba(76,214,160,0.12)", color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.30)" }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Excel para contador
                </a>
              )}
            </div>

            {msg && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12.5px]"
                style={
                  msg.ok
                    ? { background: "rgba(76,214,160,0.10)", border: "1px solid rgba(76,214,160,0.30)", color: "#4cd6a0" }
                    : { background: "rgba(255,111,111,0.10)", border: "1px solid rgba(255,111,111,0.30)", color: "#ff8585" }
                }
              >
                {msg.ok && <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-px" />}
                <span>{msg.text}</span>
              </div>
            )}

            {/* ── EJECUCIÓN TAB ─────────────────────────────── */}
            {tab === "ejecucion" && (
              <>
                {items.length === 0 ? (
                  <div className="rounded-2xl p-10 text-center" style={card}>
                    <PieChart className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
                    <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                      Aún no hay presupuesto para {year}
                    </p>
                    <p className="text-[12.5px] mb-4" style={{ color: "rgba(246,245,247,0.40)" }}>
                      Arma el presupuesto anual por rubros para comparar contra la ejecución real.
                    </p>
                    <button
                      onClick={() => setTab("presupuesto")}
                      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 cursor-pointer"
                      style={{ background: "rgba(124,92,255,0.15)", color: "#a78bff", border: "1px solid rgba(124,92,255,0.40)" }}
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                      Armar presupuesto
                    </button>
                  </div>
                ) : execution ? (
                  <>
                    {/* Summary KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: "Ingresos ejecutados", value: fmtCOP(execution.ingresos.executed), color: "#4cd6a0" },
                        { label: "Gastos ejecutados", value: fmtCOP(execution.gastos.executed), color: "#ffb958" },
                        { label: "Resultado", value: fmtCOP(execution.resultado), color: execution.resultado >= 0 ? "#4cd6a0" : "#ff8585" },
                        { label: "Fondo imprevistos", value: fmtCOP(execution.fondo.balance), color: execution.fondo.compliant ? "#4cd6a0" : "#ff8585" },
                      ].map((k) => (
                        <div key={k.label} className="rounded-2xl p-4" style={card}>
                          <p style={{ ...monoLabel, color: "rgba(246,245,247,0.40)" }} className="mb-2">{k.label}</p>
                          <p className="text-[17px] font-semibold tracking-tight" style={{ color: k.color }}>{k.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Fondo de imprevistos card */}
                    <div
                      className="rounded-2xl p-5"
                      style={{
                        ...card,
                        borderColor: execution.fondo.compliant ? "rgba(76,214,160,0.25)" : "rgba(255,185,88,0.30)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {execution.fondo.compliant ? (
                          <ShieldCheck className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#4cd6a0" }} />
                        ) : (
                          <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#ffb958" }} />
                        )}
                        <div className="flex-1">
                          <p className="text-[13.5px] font-medium mb-0.5" style={{ color: "#f6f5f7" }}>
                            Fondo de imprevistos (Art. 35, Ley 675)
                          </p>
                          <p className="text-[12px]" style={{ color: "rgba(246,245,247,0.55)" }}>
                            Mínimo legal: 1% del presupuesto de gastos = <strong>{fmtCOP(execution.fondo.required)}</strong>.
                            {" "}Saldo actual: <strong style={{ color: execution.fondo.compliant ? "#4cd6a0" : "#ffb958" }}>{fmtCOP(execution.fondo.balance)}</strong>
                            {" "}(aportes {fmtCOP(execution.fondo.aportes)} − retiros {fmtCOP(execution.fondo.retiros)}).
                          </p>
                          {!execution.fondo.compliant && execution.fondo.required > 0 && (
                            <p className="text-[12px] mt-1.5" style={{ color: "#ffb958" }}>
                              Faltan {fmtCOP(Math.max(0, execution.fondo.required - execution.fondo.balance))} para cumplir el mínimo.
                            </p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => { setShowMov(true); setMovType("fondo_aporte"); setMovConcept("Aporte al fondo de imprevistos"); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}
                              className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] px-3 py-1.5 cursor-pointer transition-colors hover:bg-white/[0.06]"
                              style={{ color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.30)" }}
                            >
                              <Landmark className="h-3 w-3" />
                              Registrar aporte
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <ExecTable title="Ingresos" group="ingresos" />
                    <ExecTable title="Gastos" group="gastos" />
                  </>
                ) : null}

                {/* Register movement */}
                {items.length > 0 && (
                  <div className="rounded-2xl" style={card}>
                    <button
                      onClick={() => setShowMov((v) => !v)}
                      className="w-full flex items-center gap-3 p-4 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(124,92,255,0.12)" }}>
                        <Plus className="h-4 w-4" style={{ color: "#a78bff" }} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>Registrar movimiento</p>
                        <p className="text-[11.5px]" style={{ color: "rgba(246,245,247,0.45)" }}>Ingreso, gasto o movimiento del fondo</p>
                      </div>
                      <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "rgba(246,245,247,0.35)", transform: showMov ? "rotate(180deg)" : "none" }} />
                    </button>
                    {showMov && (
                      <form onSubmit={addMovement} className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <div>
                            <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Tipo</label>
                            <div className="relative">
                              <select value={movType} onChange={(e) => { setMovType(e.target.value); setMovItem(""); }} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                                <option value="gasto" style={{ background: "#15151a" }}>Gasto</option>
                                <option value="ingreso" style={{ background: "#15151a" }}>Ingreso</option>
                                <option value="fondo_aporte" style={{ background: "#15151a" }}>Aporte al fondo</option>
                                <option value="fondo_retiro" style={{ background: "#15151a" }}>Retiro del fondo</option>
                              </select>
                              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
                            </div>
                          </div>
                          {(movType === "ingreso" || movType === "gasto") && (
                            <div>
                              <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Rubro</label>
                              <div className="relative">
                                <select value={movItem} onChange={(e) => setMovItem(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                                  <option value="" style={{ background: "#15151a" }}>Sin rubro</option>
                                  {items.filter((i) => i.group === movType).map((i) => (
                                    <option key={i.id} value={i.id} style={{ background: "#15151a" }}>{i.concept}</option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
                              </div>
                            </div>
                          )}
                          <div>
                            <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Fecha</label>
                            <input type="date" value={movDate} onChange={(e) => setMovDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
                          </div>
                          <div className="sm:col-span-2">
                            <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Concepto</label>
                            <input value={movConcept} onChange={(e) => setMovConcept(e.target.value)} placeholder="Ej: Pago vigilancia mayo" style={inputStyle} maxLength={120} />
                          </div>
                          <div>
                            <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Monto (COP)</label>
                            <input value={movAmount} onChange={(e) => setMovAmount(e.target.value)} placeholder="1.200.000" style={inputStyle} inputMode="numeric" />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-50 cursor-pointer"
                          style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Registrar
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Movements list */}
                {entries.length > 0 && (
                  <div className="rounded-2xl overflow-hidden" style={card}>
                    <div className="px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <span style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}>Movimientos {year}</span>
                    </div>
                    <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                      {entries.slice(0, 60).map((e) => {
                        const positive = e.type === "ingreso" || e.type === "fondo_aporte";
                        return (
                          <div key={e.id} className="px-5 py-2.5 flex items-center gap-3">
                            <span style={{ ...monoMini, color: "rgba(246,245,247,0.40)", minWidth: 58 }}>
                              {new Date(e.date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="text-[12.5px] truncate block" style={{ color: "#f6f5f7" }}>{e.concept}</span>
                              <span style={{ ...monoMini, color: "rgba(246,245,247,0.35)" }}>{TYPE_LABELS[e.type] || e.type}</span>
                            </span>
                            <span className="text-[12.5px] font-medium whitespace-nowrap" style={{ color: positive ? "#4cd6a0" : "#ffb958" }}>
                              {positive ? "+" : "−"}{fmtCOP(e.amount)}
                            </span>
                            <button onClick={() => deleteMovement(e.id)} className="p-1 rounded cursor-pointer hover:bg-white/[0.06]" style={{ color: "rgba(255,133,133,0.55)" }} title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── PRESUPUESTO TAB ───────────────────────────── */}
            {tab === "presupuesto" && (
              <>
                {items.length === 0 && (
                  <div className="rounded-2xl p-5 flex flex-wrap items-center gap-3" style={{ ...card, borderColor: "rgba(124,92,255,0.22)" }}>
                    <p className="text-[13px] flex-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                      Empieza con una plantilla de rubros típicos de PH y ajústala, o agrega los tuyos.
                    </p>
                    <button
                      onClick={loadTemplate}
                      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 cursor-pointer"
                      style={{ background: "#7c5cff", color: "#fff" }}
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                      Cargar plantilla
                    </button>
                  </div>
                )}

                {(["ingreso", "gasto"] as const).map((group) => {
                  const groupItems = items.filter((i) => i.group === group);
                  const total = groupItems.reduce((s, i) => s + i.budgeted, 0);
                  const accent = group === "ingreso" ? "#4cd6a0" : "#ffb958";
                  return (
                    <div key={group} className="rounded-2xl overflow-hidden" style={card}>
                      <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        <span style={{ ...monoLabel, color: accent }}>{group === "ingreso" ? "Ingresos" : "Gastos"}</span>
                        <span style={{ ...monoMini, color: "rgba(246,245,247,0.55)" }}>{fmtCOP(total)}</span>
                      </div>
                      <div className="p-3 space-y-2">
                        {groupItems.map((it) => (
                          <div key={it.id} className="flex items-center gap-2">
                            <input
                              value={it.concept}
                              onChange={(e) => updateItem(it.id, "concept", e.target.value)}
                              placeholder="Concepto del rubro"
                              className="flex-1 h-9 px-3 rounded-lg text-[13px]"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f6f5f7", outline: "none" }}
                              maxLength={120}
                            />
                            <input
                              value={it.budgeted ? it.budgeted.toLocaleString("es-CO") : ""}
                              onChange={(e) => updateItem(it.id, "budgeted", e.target.value)}
                              placeholder="0"
                              inputMode="numeric"
                              className="w-36 h-9 px-3 rounded-lg text-[13px] text-right"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#f6f5f7", outline: "none" }}
                            />
                            <button onClick={() => removeItem(it.id)} className="p-2 rounded-lg cursor-pointer hover:bg-white/[0.06]" style={{ color: "rgba(255,133,133,0.55)" }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addItem(group)}
                          className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.04]"
                          style={{ color: "rgba(246,245,247,0.55)" }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Agregar rubro
                        </button>
                      </div>
                    </div>
                  );
                })}

                {items.length > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={saveBudget}
                      disabled={busy || !dirty}
                      className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-40 cursor-pointer"
                      style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {dirty ? "Guardar presupuesto" : "Guardado"}
                    </button>
                    <span style={{ ...monoMini, color: "rgba(246,245,247,0.40)" }}>
                      Fondo de imprevistos requerido: {fmtCOP(Math.round(items.filter((i) => i.group === "gasto").reduce((s, i) => s + i.budgeted, 0) * 0.01))}
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
