"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3, ChevronDown, Download, Landmark, ListPlus, Lock, PenLine, PiggyBank, Plus, Receipt, Save, Scale,
  ShieldAlert, ShieldCheck, Trash2, TrendingUp, type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { useModulos } from "@/components/dashboard/useModulos";
import { fmtCOP } from "@/lib/cartera";
import { defaultBudgetItems, type BudgetItem, type BudgetExecution } from "@/lib/presupuesto";
import {
  Aviso,
  BarraProgreso,
  Boton,
  BotonIcono,
  CabeceraPieza,
  Campo,
  Categoria,
  Entrada,
  Esqueleto,
  Kpi,
  Kpis,
  Loseta,
  Modal,
  Pagina,
  Panel,
  PestanasUnidas,
  Pieza,
  Segmentos,
  Selector,
  Vacio,
  unir,
  type Tono,
} from "@/components/kit";

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

const TYPE_LABELS: Record<string, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  fondo_aporte: "Aporte al fondo",
  fondo_retiro: "Retiro del fondo",
};

/** Cada tipo de movimiento con su icono y color: ingreso ↗ verde · gasto 🧾 ámbar · fondo 🏛 verde/ámbar. */
const TIPO_META: Record<string, { icono: LucideIcon; tono: Tono }> = {
  ingreso: { icono: TrendingUp, tono: "green" },
  gasto: { icono: Receipt, tono: "amber" },
  fondo_aporte: { icono: Landmark, tono: "green" },
  fondo_retiro: { icono: Landmark, tono: "amber" },
};

function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 20);
  } catch {
    return `r${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

/** Cifra con signo legible: «−$2.478.000» en vez de «$-2.478.000». */
function fmtSigno(n: number): string {
  return n < 0 ? `−${fmtCOP(-n)}` : fmtCOP(n);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Estilos locales: barra de contexto, ejecución por rubro, movimientos y edición del presupuesto. */
const CSS_PRESUPUESTO = `
.pr-ctx { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 0 0 16px; }
.pr-ctx > .k-pest { flex: 1 1 auto; min-width: 0; }
.pr-ctx > .k-select { flex: 0 0 130px; }
.pr-vista { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 0 0 22px; }
.pr-vista > .k-btn { margin-left: auto; }
.pr-fondo { margin: 0 0 24px; }
.pr-fondo p { margin: 0 0 8px; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
.pr-fondo p strong { color: var(--ink); font-weight: 800; }
.pr-fondo .k-barra { margin: 14px 0 6px; }
.pr-fondo .acc { margin-top: 12px; }
.pr-grupo { margin: 0 0 20px; padding: 20px 24px 8px; border-radius: 26px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.pr-grupo > header { display: flex; align-items: center; gap: 14px; margin: 0 0 8px; }
.pr-grupo > header h3 { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -.015em; }
.pr-grupo > header .tot { font-size: 15.5px; font-weight: 700; color: var(--ink-2); font-feature-settings: "tnum" 1; text-align: right; }
.pr-grupo > header .tot b { color: var(--ink); font-weight: 800; }
.pr-filas { list-style: none; margin: 0; padding: 0; }
.pr-fila { padding: 14px 0; border-top: 1px solid var(--line); }
.pr-fila .l1 { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 8px; }
.pr-fila .l1 span { font-size: 16px; font-weight: 700; }
.pr-fila .l1 b { font-size: 15.5px; font-weight: 800; white-space: nowrap; font-feature-settings: "tnum" 1; }
.pr-fila .l1 b small { font-size: inherit; font-weight: 500; color: var(--ink-3); }
.pr-fila .l1 b.pasa { color: var(--danger-text); }
.pr-grupo .k-barra > i, .pr-fondo .k-barra > i { background: linear-gradient(90deg, var(--h-a), var(--h-b)); }
.pr-grupo .k-barra.excede > i, .pr-fondo .k-barra.excede > i { background: var(--danger); }
.pr-fila .l2 { display: grid; grid-template-columns: minmax(0, 1fr) 52px; align-items: center; gap: 12px; }
.pr-fila .l2 > span { text-align: right; font-size: 14px; font-weight: 800; color: var(--ink-2); font-feature-settings: "tnum" 1; }
.pr-fila .l2 > span.pasa { color: var(--danger-text); }
.pr-fila .l2.sin .k-barra > i { background: var(--ink-3); opacity: .4; }
.pr-mov { margin: 0 0 24px; overflow: hidden; border-radius: 26px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.pr-mov > button { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 20px; text-align: left; background: transparent; cursor: pointer; }
.pr-mov > button:hover { background: var(--hl); }
.pr-mov > button > span:not(.k-tile) { flex: 1 1 auto; min-width: 0; }
.pr-mov > button b { display: block; font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
.pr-mov > button small { display: block; margin-top: 2px; font-size: 14px; color: var(--ink-2); }
.pr-mov > button .chev { width: 20px; height: 20px; flex: none; color: var(--ink-3); }
.pr-mov > button[aria-expanded="true"] .chev { transform: rotate(180deg); }
.pr-mov form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); column-gap: 18px; align-items: start; padding: 4px 20px 22px; }
.pr-mov form .k-fld { grid-column: span 2; margin-bottom: 16px; }
.pr-mov form .k-fld.doble { grid-column: span 4; }
.pr-mov form .acc { grid-column: 1 / -1; }
.pr-lista { margin: 0 0 8px; padding: 20px 24px 12px; border-radius: 26px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.pr-lista > h3 { margin: 0 0 8px; display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 800; letter-spacing: -.015em; }
.pr-lista ul { list-style: none; margin: 0; padding: 0; }
.pr-lista li { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto auto; align-items: center; gap: 4px 14px; padding: 12px 0; border-top: 1px solid var(--line); }
.pr-lista li .c b { display: block; font-size: 15.5px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
.pr-lista li .c small { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 3px; font-size: 13.5px; color: var(--ink-3); }
.pr-lista li .m { font-size: 16px; font-weight: 800; white-space: nowrap; font-feature-settings: "tnum" 1; }
.pr-lista li .m.mas { color: var(--ok-text); }
.pr-lista li .m.menos { color: var(--warn-text); }
.pr-edit { display: grid; grid-template-columns: minmax(0, 1fr) 176px auto; align-items: center; gap: 10px; padding: 6px 0; }
.pr-edit .k-in { min-height: 46px; }
.pr-edit .monto { text-align: right; font-feature-settings: "tnum" 1; }
.pr-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 4px; }
.pr-pie .n { font-size: 14.5px; font-weight: 600; color: var(--ink-2); }
@media (min-width: 861px) and (max-width: 1180px) {
  .pr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .pr-kpis .k-kpi.k-32 > b { font-size: clamp(15px, 4.8vw, 24px); }
  .pr-ctx > .k-select { flex: 1 1 100%; }
  .pr-vista > .k-btn { margin-left: 0; }
  .pr-grupo, .pr-lista { padding: 16px 16px 6px; border-radius: 22px; }
  .pr-grupo > header { flex-wrap: wrap; }
  .pr-mov form { grid-template-columns: minmax(0, 1fr); padding: 2px 14px 18px; }
  .pr-mov form .k-fld, .pr-mov form .k-fld.doble { grid-column: 1 / -1; }
  .pr-lista li { grid-template-columns: 40px minmax(0, 1fr) auto; }
  .pr-lista li > .k-ic { grid-column: 3; grid-row: 2; }
  .pr-edit { grid-template-columns: minmax(0, 1fr) auto; padding: 8px 0; }
  .pr-edit > :first-child { grid-column: 1 / -1; }
  .pr-edit .monto-c { grid-column: 1; }
}
`;

/** Tabla de ejecución de un grupo (ingresos o gastos): cada rubro con su barra y su porcentaje. */
function TablaEjecucion({ titulo, grupo, execution }: { titulo: string; grupo: "ingresos" | "gastos"; execution: BudgetExecution }) {
  const g = execution[grupo];
  if (g.rows.length === 0) return null;
  const esIngreso = grupo === "ingresos";
  return (
    <section className="pr-grupo" aria-label={titulo} data-h={esIngreso ? "green" : "amber"}>
      <header>
        <Loseta icono={esIngreso ? TrendingUp : Receipt} tono={esIngreso ? "green" : "amber"} />
        <h3>{titulo}</h3>
        <span className="tot">
          <b>{fmtCOP(g.executed)}</b> de {fmtCOP(g.budgeted)}
        </span>
      </header>
      <ul className="pr-filas">
        {g.rows.map((row) => {
          const over = row.budgeted > 0 && row.executed > row.budgeted;
          const sinPresupuesto = row.budgeted === 0 && row.executed > 0;
          const pct = Math.min(100, row.budgeted > 0 ? row.pct : row.executed > 0 ? 100 : 0);
          return (
            <li key={row.id} className="pr-fila">
              <div className="l1">
                <span>{row.concept}</span>
                <b className={over ? "pasa" : undefined}>
                  {fmtCOP(row.executed)} <small>/ {fmtCOP(row.budgeted)}</small>
                </b>
              </div>
              <div className={unir("l2", sinPresupuesto && "sin")}>
                <BarraProgreso valor={pct} excede={over} decorativa />
                <span className={over ? "pasa" : undefined}>
                  {row.budgeted > 0 ? (
                    `${row.pct}%`
                  ) : (
                    <>
                      <span className="sr-only">Sin presupuesto asignado</span>
                      <span aria-hidden="true">—</span>
                    </>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PresupuestoPage() {
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
  // Movimiento que se va a eliminar (confirmación en un <Modal>, antes window.confirm).
  const [porEliminar, setPorEliminar] = useState<LedgerEntry | null>(null);

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

  // La confirmación («¿Eliminar este movimiento?») la pide el <Modal> (porEliminar).
  async function deleteMovement(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/presupuesto/movimientos?id=${id}`, { method: "DELETE" });
      if (res.ok) await load(propertyId, year);
    } finally {
      setBusy(false);
    }
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const conPresupuesto = tab === "ejecucion" && items.length > 0;

  return (
    <div>
      <style href="k-presupuesto-local" precedence="default">
        {CSS_PRESUPUESTO}
      </style>
      <Header title="Presupuesto" subtitle="Presupuesto anual, ejecución y fondo de imprevistos" />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            titulo="Presupuesto"
            subtitulo="Presupuesto anual, ejecución y fondo de imprevistos"
            acciones={
              !loading && !upgrade && conPresupuesto ? (
                <Boton
                  variante="secundario"
                  href={`/api/presupuesto/export?propertyId=${propertyId}&year=${year}`}
                  descargar
                  icono={Download}
                  tono="green"
                >
                  Excel para contador
                </Boton>
              ) : undefined
            }
          />

          {loading && <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando el presupuesto…" />}

          {!loading && upgrade && (
            <Vacio
              icono={Lock}
              tono="violet"
              titulo="El presupuesto es una función de los planes Business y Élite"
              texto="Presupuesto anual por rubros, ejecución mes a mes, fondo de imprevistos y exporte a Excel para el contador."
              acciones={<Boton href="/dashboard/suscripcion">Ver planes</Boton>}
            />
          )}

          {!loading && !upgrade && properties.length === 0 && (
            <Vacio
              titulo="Crea una propiedad primero para armar su presupuesto."
              texto="El presupuesto se arma por copropiedad y por año."
              acciones={<Boton href="/dashboard/propiedades" flecha="crea">Agregar propiedad</Boton>}
            />
          )}

          {!loading && !upgrade && properties.length > 0 && (
            <>
              {/* Contexto: copropiedad y año */}
              <div className="pr-ctx">
                <PestanasUnidas
                  etiquetaAccesible="Copropiedad"
                  valor={propertyId}
                  alCambiar={setPropertyId}
                  items={properties.map((p) => ({ id: p.id, etiqueta: p.name }))}
                />
                <Selector aria-label="Año del presupuesto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Selector>
              </div>

              {/* Vista */}
              <div className="pr-vista">
                <Segmentos
                  etiquetaAccesible="Vista del presupuesto"
                  valor={tab}
                  alCambiar={(v) => { setTab(v as "ejecucion" | "presupuesto"); setMsg(null); }}
                  items={[
                    { id: "ejecucion", etiqueta: "Ejecución", icono: BarChart3, tono: "blue" },
                    { id: "presupuesto", etiqueta: "Editar presupuesto", icono: PenLine, tono: "violet" },
                  ]}
                />
              </div>

              {msg && (
                <div style={{ marginBottom: 18 }}>
                  <Aviso enLinea tipo={msg.ok ? "ok" : "error"} titulo={msg.text} />
                </div>
              )}

              {/* ── EJECUCIÓN ─────────────────────────────── */}
              {tab === "ejecucion" && (
                <>
                  {items.length === 0 ? (
                    <Vacio
                      icono={PiggyBank}
                      tono="lime"
                      titulo={`Aún no hay presupuesto para ${year}`}
                      texto="Arma el presupuesto anual por rubros para comparar contra la ejecución real."
                      acciones={
                        <Boton icono={ListPlus} tono="violet" onClick={() => setTab("presupuesto")}>
                          Armar presupuesto
                        </Boton>
                      }
                    />
                  ) : execution ? (
                    <>
                      <div style={{ marginBottom: 24 }}>
                        <Kpis className="pr-kpis">
                          <Kpi
                            icono={TrendingUp}
                            tono="green"
                            cifra={fmtCOP(execution.ingresos.executed)}
                            tamLetra={32}
                            etiqueta="Ingresos ejecutados"
                            variacion={`de ${fmtCOP(execution.ingresos.budgeted)} presupuestado`}
                          />
                          <Kpi
                            icono={Receipt}
                            tono="amber"
                            cifra={fmtCOP(execution.gastos.executed)}
                            tamLetra={32}
                            etiqueta="Gastos ejecutados"
                            variacion={`de ${fmtCOP(execution.gastos.budgeted)} presupuestado`}
                          />
                          <Kpi
                            icono={Scale}
                            tono={execution.resultado >= 0 ? "green" : "red"}
                            cifra={fmtSigno(execution.resultado)}
                            tamLetra={32}
                            alerta={execution.resultado < 0}
                            etiqueta="Resultado"
                            variacion={execution.resultado >= 0 ? "superávit acumulado" : "déficit acumulado"}
                            malo={execution.resultado < 0}
                          />
                          <Kpi
                            icono={execution.fondo.compliant ? ShieldCheck : ShieldAlert}
                            tono={execution.fondo.compliant ? "green" : "red"}
                            cifra={fmtCOP(execution.fondo.balance)}
                            tamLetra={32}
                            alerta={!execution.fondo.compliant}
                            etiqueta="Fondo de imprevistos"
                            variacion={execution.fondo.compliant ? "cumple el 1% de ley" : "por debajo del 1% de ley"}
                            malo={!execution.fondo.compliant}
                          />
                        </Kpis>
                      </div>

                      {/* Fondo de imprevistos */}
                      <div className="pr-fondo" data-h={execution.fondo.compliant ? "green" : "amber"}>
                        <Panel
                          titulo="Fondo de imprevistos (Art. 35, Ley 675)"
                          icono={execution.fondo.compliant ? ShieldCheck : ShieldAlert}
                          tono={execution.fondo.compliant ? "green" : "amber"}
                          nivel={2}
                        >
                          <p>
                            Mínimo legal: 1% del presupuesto de gastos = <strong>{fmtCOP(execution.fondo.required)}</strong>. Saldo actual:{" "}
                            <strong>{fmtCOP(execution.fondo.balance)}</strong> (aportes {fmtCOP(execution.fondo.aportes)} − retiros{" "}
                            {fmtCOP(execution.fondo.retiros)}).
                          </p>
                          {execution.fondo.required > 0 && (
                            <BarraProgreso
                              valor={Math.min(100, (execution.fondo.balance / execution.fondo.required) * 100)}
                              excede={!execution.fondo.compliant}
                              etiquetaAccesible="Avance hacia el mínimo legal del fondo"
                            />
                          )}
                          {!execution.fondo.compliant && execution.fondo.required > 0 && (
                            <p style={{ color: "var(--warn-text)", fontWeight: 700 }}>
                              Faltan {fmtCOP(Math.max(0, execution.fondo.required - execution.fondo.balance))} para cumplir el mínimo.
                            </p>
                          )}
                          <div className="acc">
                            <Boton
                              variante="secundario"
                              tam={40}
                              icono={Landmark}
                              tono="green"
                              onClick={() => {
                                setShowMov(true);
                                setMovType("fondo_aporte");
                                setMovConcept("Aporte al fondo de imprevistos");
                                setTimeout(() => document.getElementById("pr-mov")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                              }}
                            >
                              Registrar aporte
                            </Boton>
                          </div>
                        </Panel>
                      </div>

                      <TablaEjecucion titulo="Ingresos" grupo="ingresos" execution={execution} />
                      <TablaEjecucion titulo="Gastos" grupo="gastos" execution={execution} />
                    </>
                  ) : null}

                  {/* Registrar movimiento */}
                  {items.length > 0 && (
                    <div className="pr-mov" id="pr-mov" data-h="green">
                      <button
                        type="button"
                        aria-expanded={showMov}
                        aria-controls="pr-mov-form"
                        onClick={() => setShowMov((v) => !v)}
                      >
                        <Loseta icono={Plus} tono="green" />
                        <span>
                          <b>Registrar movimiento</b>
                          <small>Ingreso, gasto o movimiento del fondo</small>
                        </span>
                        <ChevronDown className="chev" aria-hidden="true" focusable="false" />
                      </button>
                      {showMov && (
                        <form id="pr-mov-form" onSubmit={addMovement}>
                          <Campo id="pr-tipo" etiqueta="Tipo">
                            <Selector
                              id="pr-tipo"
                              value={movType}
                              onChange={(e) => { setMovType(e.target.value); setMovItem(""); }}
                            >
                              <option value="gasto">Gasto</option>
                              <option value="ingreso">Ingreso</option>
                              <option value="fondo_aporte">Aporte al fondo</option>
                              <option value="fondo_retiro">Retiro del fondo</option>
                            </Selector>
                          </Campo>
                          {(movType === "ingreso" || movType === "gasto") && (
                            <Campo id="pr-rubro" etiqueta="Rubro">
                              <Selector id="pr-rubro" value={movItem} onChange={(e) => setMovItem(e.target.value)}>
                                <option value="">Sin rubro</option>
                                {items.filter((i) => i.group === movType).map((i) => (
                                  <option key={i.id} value={i.id}>{i.concept}</option>
                                ))}
                              </Selector>
                            </Campo>
                          )}
                          <Campo id="pr-fecha" etiqueta="Fecha">
                            <Entrada id="pr-fecha" type="date" value={movDate} onChange={(e) => setMovDate(e.target.value)} />
                          </Campo>
                          <Campo id="pr-concepto" etiqueta="Concepto" className="doble">
                            <Entrada id="pr-concepto" value={movConcept} onChange={(e) => setMovConcept(e.target.value)} placeholder="Ej: Pago vigilancia mayo" maxLength={120} />
                          </Campo>
                          <Campo id="pr-monto" etiqueta="Monto (COP)">
                            <Entrada id="pr-monto" value={movAmount} onChange={(e) => setMovAmount(e.target.value)} placeholder="1.200.000" inputMode="numeric" />
                          </Campo>
                          <div className="acc">
                            <Boton type="submit" flecha="crea" cargando={busy} textoCargando="Registrando…">
                              Registrar
                            </Boton>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Movimientos */}
                  {entries.length > 0 && (
                    <section className="pr-lista" aria-labelledby="pr-mov-t">
                      <h3 id="pr-mov-t">
                        <Loseta icono={Receipt} tono="slate" tam={36} />
                        Movimientos {year}
                      </h3>
                      <ul>
                        {entries.slice(0, 60).map((e) => {
                          const positive = e.type === "ingreso" || e.type === "fondo_aporte";
                          const meta = TIPO_META[e.type] ?? TIPO_META.gasto;
                          return (
                            <li key={e.id}>
                              <Loseta icono={meta.icono} tono={meta.tono} tam={40} suave />
                              <div className="c">
                                <b>{e.concept}</b>
                                <small>
                                  <Categoria tono={meta.tono}>{TYPE_LABELS[e.type] || e.type}</Categoria>
                                  <span>{new Date(e.date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>
                                </small>
                              </div>
                              <span className={unir("m", positive ? "mas" : "menos")}>
                                {positive ? "+" : "−"}{fmtCOP(e.amount)}
                              </span>
                              <BotonIcono etiquetaAccesible={`Eliminar el movimiento «${e.concept}»`} tam={40} sinBorde onClick={() => setPorEliminar(e)}>
                                <Trash2 />
                              </BotonIcono>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                </>
              )}

              {/* ── EDITAR PRESUPUESTO ───────────────────── */}
              {tab === "presupuesto" && (
                <>
                  {items.length === 0 && (
                    <div style={{ marginBottom: 22 }}>
                      <Panel titulo="Empieza con una plantilla" icono={ListPlus} tono="violet" nivel={2}>
                        <p style={{ margin: "0 0 16px", fontSize: 15.5, color: "var(--ink-2)" }}>
                          Empieza con una plantilla de rubros típicos de PH y ajústala, o agrega los tuyos.
                        </p>
                        <Boton icono={ListPlus} tono="violet" onClick={loadTemplate}>Cargar plantilla</Boton>
                      </Panel>
                    </div>
                  )}

                  {(["ingreso", "gasto"] as const).map((group) => {
                    const groupItems = items.filter((i) => i.group === group);
                    const total = groupItems.reduce((s, i) => s + i.budgeted, 0);
                    const esIngreso = group === "ingreso";
                    return (
                      <section key={group} className="pr-grupo" aria-label={esIngreso ? "Ingresos" : "Gastos"} data-h={esIngreso ? "green" : "amber"}>
                        <header>
                          <Loseta icono={esIngreso ? TrendingUp : Receipt} tono={esIngreso ? "green" : "amber"} />
                          <h3>{esIngreso ? "Ingresos" : "Gastos"}</h3>
                          <span className="tot"><b>{fmtCOP(total)}</b></span>
                        </header>
                        <div>
                          {groupItems.map((it) => (
                            <div key={it.id} className="pr-edit">
                              <Entrada
                                aria-label="Concepto del rubro"
                                value={it.concept}
                                onChange={(e) => updateItem(it.id, "concept", e.target.value)}
                                placeholder="Concepto del rubro"
                                maxLength={120}
                              />
                              <span className="monto-c">
                                <Entrada
                                  aria-label={`Monto presupuestado de ${it.concept || "este rubro"}`}
                                  className="monto"
                                  value={it.budgeted ? it.budgeted.toLocaleString("es-CO") : ""}
                                  onChange={(e) => updateItem(it.id, "budgeted", e.target.value)}
                                  placeholder="0"
                                  inputMode="numeric"
                                />
                              </span>
                              <BotonIcono etiquetaAccesible={`Quitar el rubro ${it.concept || "sin nombre"}`} tam={40} sinBorde onClick={() => removeItem(it.id)}>
                                <Trash2 />
                              </BotonIcono>
                            </div>
                          ))}
                          <div style={{ padding: "8px 0 14px" }}>
                            <Boton variante="fantasma" tam={40} flecha="crea" onClick={() => addItem(group)}>
                              Agregar rubro
                            </Boton>
                          </div>
                        </div>
                      </section>
                    );
                  })}

                  {items.length > 0 && (
                    <div className="pr-pie">
                      <Boton
                        icono={Save}
                        tono="violet"
                        onClick={saveBudget}
                        disabled={!dirty}
                        cargando={busy}
                        textoCargando="Guardando…"
                      >
                        {dirty ? "Guardar presupuesto" : "Guardado"}
                      </Boton>
                      <span className="n">
                        Fondo de imprevistos requerido: {fmtCOP(Math.round(items.filter((i) => i.group === "gasto").reduce((s, i) => s + i.budgeted, 0) * 0.01))}
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Pieza>
      </Pagina>

      <Modal
        abierto={!!porEliminar}
        alCerrar={() => setPorEliminar(null)}
        titulo="¿Eliminar este movimiento?"
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorEliminar(null)}>Cancelar</Boton>
            <Boton
              variante="peligro"
              lleno
              onClick={() => {
                const e = porEliminar;
                setPorEliminar(null);
                if (e) void deleteMovement(e.id);
              }}
            >
              Eliminar movimiento
            </Boton>
          </>
        }
      >
        {porEliminar && (
          <p>
            «{porEliminar.concept}» por {fmtCOP(porEliminar.amount)} dejará de contarse en la ejecución del presupuesto.
          </p>
        )}
      </Modal>
    </div>
  );
}

/**
 * Envoltorio del gate. La comprobación va en un componente SIN hooks para que
 * PresupuestoPage no llegue a montarse cuando la función está pausada: con el
 * early-return dentro, sus useEffect ya habían disparado las peticiones de
 * carga y se descargaban datos que nadie iba a ver.
 */
export default function PresupuestoRoute() {
  const { visible } = useModulos();
  if (!visible("presupuesto")) {
    return (
      <div>
        <Header title="Presupuesto" subtitle="Presupuesto anual, ejecución y fondo de imprevistos" />
        <ComingSoon
          icon={PiggyBank}
          title="Presupuesto"
          description="El presupuesto anual, la ejecución por rubro y el fondo de imprevistos vuelven pronto — los estamos afinando antes de activarlos."
        />
      </div>
    );
  }
  return <PresupuestoPage />;
}
