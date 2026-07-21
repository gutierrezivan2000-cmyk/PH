"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { fmtCOP } from "@/lib/cartera";
import {
  Wallet,
  Loader2,
  Plus,
  FileText,
  CheckCircle2,
  ChevronDown,
  Receipt,
  HandCoins,
  CalendarPlus,
  Trash2,
  ArrowUpRight,
  Users,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface UnitRow {
  id: string;
  label: string;
  residentName: string | null;
  email: string | null;
  monthlyFee: number | null;
  coeficiente: number | null;
  summary: {
    charged: number;
    paid: number;
    balance: number;
    overdueAmount: number;
    overdueDays: number;
  };
  lastPaymentAt: string | null;
}

interface Kpis {
  totalOwed: number;
  overdueUnits: number;
  collectedThisMonth: number;
  chargedThisMonth: number;
  unitsCount: number;
}

interface RecentPayment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  receivedAt: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CarteraPage() {
  const now = new Date();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [panel, setPanel] = useState<"" | "causar" | "pago" | "cobro">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Causar
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dueDay, setDueDay] = useState(10);

  // Pago
  const [payUnit, setPayUnit] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("transferencia");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState(todayIso());
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);

  // Cobro
  const [chUnit, setChUnit] = useState("");
  const [chConcept, setChConcept] = useState("");
  const [chAmount, setChAmount] = useState("");
  const [chType, setChType] = useState("extraordinaria");
  const [chDue, setChDue] = useState(todayIso());

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/cartera?propertyId=${pid}`);
      const data = await res.json();
      if (res.status === 403 && data.code === "plan_upgrade") {
        setUpgrade(true);
        return;
      }
      if (res.ok) {
        setUpgrade(false);
        setUnits(data.units || []);
        setKpis(data.kpis || null);
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
      setPanel("");
      setPayUnit("");
      setChUnit("");
      load(propertyId);
    }
  }, [propertyId, load]);

  // Recent payments for the selected pay-unit (allows deleting mistakes).
  useEffect(() => {
    if (!payUnit) {
      setRecentPayments([]);
      return;
    }
    let active = true;
    fetch(`/api/cartera/unit/${payUnit}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data.payments)) {
          setRecentPayments(
            [...data.payments]
              .sort(
                (a: RecentPayment, b: RecentPayment) =>
                  new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
              )
              .slice(0, 5)
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [payUnit, units]);

  async function causar() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cartera/causar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, month, year, dueDay }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo causar el mes." });
        return;
      }
      const parts = [`${data.created} ${data.created === 1 ? "cuota causada" : "cuotas causadas"}`];
      if (data.skippedExisting > 0) parts.push(`${data.skippedExisting} ya existían`);
      if (data.skippedNoFee > 0) parts.push(`${data.skippedNoFee} unidades sin cuota configurada`);
      setMsg({ ok: true, text: `${MONTHS[month - 1]} ${year}: ${parts.join(" · ")}.` });
      setPanel("");
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function registrarPago(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(payAmount.replace(/[.$\s]/g, ""), 10);
    if (!payUnit || !Number.isFinite(amt) || amt <= 0) {
      setMsg({ ok: false, text: "Selecciona la unidad y un monto válido." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cartera/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          unitId: payUnit,
          amount: amt,
          method: payMethod,
          reference: payRef.trim() || undefined,
          receivedAt: payDate ? `${payDate}T12:00:00` : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo registrar el pago." });
        return;
      }
      const creditNote = data.credit > 0 ? ` (${fmtCOP(data.credit)} quedan como saldo a favor)` : "";
      setMsg({ ok: true, text: `Pago de ${fmtCOP(amt)} registrado${creditNote}.` });
      setPayAmount("");
      setPayRef("");
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function eliminarPago(id: string) {
    if (!window.confirm("¿Eliminar este pago? Se revertirá su aplicación a los cobros.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cartera/payments?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setMsg({ ok: true, text: "Pago eliminado y aplicación revertida." });
        await load(propertyId);
        setPayUnit((u) => u); // retrigger recent payments
      } else {
        const data = await res.json();
        setMsg({ ok: false, text: data.error || "No se pudo eliminar." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function crearCobro(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(chAmount.replace(/[.$\s]/g, ""), 10);
    if (!chUnit || !chConcept.trim() || !Number.isFinite(amt) || amt <= 0) {
      setMsg({ ok: false, text: "Completa unidad, concepto y monto." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cartera/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          unitId: chUnit,
          concept: chConcept,
          amount: amt,
          type: chType,
          dueDate: chDue,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo crear el cobro." });
        return;
      }
      setMsg({ ok: true, text: `Cobro "${chConcept.trim()}" de ${fmtCOP(amt)} creado.` });
      setChConcept("");
      setChAmount("");
      setPanel("");
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function saveUnitField(unitId: string, field: "monthlyFee" | "coeficiente", raw: string) {
    const clean = raw.replace(/[.$\s%]/g, "").replace(",", ".");
    const value = clean === "" ? null : Number(clean);
    if (value !== null && !Number.isFinite(value)) return;
    try {
      const res = await fetch(`/api/properties/${propertyId}/units`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: unitId, [field]: value }),
      });
      if (res.ok) await load(propertyId);
    } catch {
      // silent — the reload keeps state truthful
    }
  }

  function estadoChip(u: UnitRow) {
    const s = u.summary;
    if (s.balance < 0) {
      return { text: `A favor ${fmtCOP(-s.balance)}`, color: "#5fb4ff", bg: "rgba(95,180,255,0.10)", border: "rgba(95,180,255,0.30)" };
    }
    if (s.balance === 0) {
      return { text: "Al día", color: "#4cd6a0", bg: "rgba(76,214,160,0.10)", border: "rgba(76,214,160,0.30)" };
    }
    if (s.overdueDays > 30) {
      return { text: `Mora ${s.overdueDays}d`, color: "#ff6f6f", bg: "rgba(255,111,111,0.10)", border: "rgba(255,111,111,0.30)" };
    }
    if (s.overdueDays > 0) {
      return { text: `Mora ${s.overdueDays}d`, color: "#ffb958", bg: "rgba(255,185,88,0.10)", border: "rgba(255,185,88,0.30)" };
    }
    return { text: "Pendiente", color: "rgba(246,245,247,0.55)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" };
  }

  const panelBtn = (key: typeof panel, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => {
        setPanel((p) => (p === key ? "" : key));
        setMsg(null);
      }}
      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 transition-all cursor-pointer"
      style={{
        background: panel === key ? "rgba(124,92,255,0.15)" : "rgba(255,255,255,0.05)",
        color: panel === key ? "#a78bff" : "rgba(246,245,247,0.65)",
        border: `1px solid ${panel === key ? "rgba(124,92,255,0.45)" : "rgba(255,255,255,0.10)"}`,
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div>
      <Header title="Cartera" subtitle="Cuotas, pagos y estados de cuenta por unidad" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {/* Plan upgrade */}
        {!loading && upgrade && (
          <div className="rounded-2xl p-8 text-center" style={{ ...card, borderColor: "rgba(124,92,255,0.30)" }}>
            <Wallet className="h-9 w-9 mx-auto mb-3" style={{ color: "#a78bff" }} />
            <p className="text-[16px] font-semibold mb-2" style={{ color: "#f6f5f7" }}>
              La cartera es una función de los planes Business y Élite
            </p>
            <p className="text-[13px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: "rgba(246,245,247,0.55)" }}>
              Causación mensual de cuotas, registro de pagos, estados de cuenta imprimibles y
              control de morosidad por unidad.
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
            <Wallet className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
            <p className="text-[14px]" style={{ color: "rgba(246,245,247,0.70)" }}>
              Crea una propiedad primero para gestionar su cartera.
            </p>
          </div>
        )}

        {!loading && !upgrade && properties.length > 0 && (
          <>
            {/* Property selector */}
            <div className="rounded-2xl p-4 flex flex-wrap items-center gap-2" style={card}>
              <span style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }}>Propiedad</span>
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
            </div>

            {/* KPIs */}
            {kpis && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Cartera pendiente", value: fmtCOP(kpis.totalOwed), color: kpis.totalOwed > 0 ? "#ffb958" : "#4cd6a0" },
                  { label: "Unidades en mora", value: `${kpis.overdueUnits} / ${kpis.unitsCount}`, color: kpis.overdueUnits > 0 ? "#ff8585" : "#4cd6a0" },
                  { label: "Recaudado este mes", value: fmtCOP(kpis.collectedThisMonth), color: "#4cd6a0" },
                  { label: "Causado este mes", value: fmtCOP(kpis.chargedThisMonth), color: "rgba(246,245,247,0.80)" },
                ].map((k) => (
                  <div key={k.label} className="rounded-2xl p-4" style={card}>
                    <p style={{ ...monoLabel, color: "rgba(246,245,247,0.40)" }} className="mb-2">
                      {k.label}
                    </p>
                    <p className="text-[18px] font-semibold tracking-tight" style={{ color: k.color }}>
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {panelBtn("causar", <CalendarPlus className="h-3.5 w-3.5" />, "Causar mes")}
              {panelBtn("pago", <HandCoins className="h-3.5 w-3.5" />, "Registrar pago")}
              {panelBtn("cobro", <Receipt className="h-3.5 w-3.5" />, "Cobro extra")}
            </div>

            {/* Message */}
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

            {/* Causar panel */}
            {panel === "causar" && (
              <div className="rounded-2xl p-5 space-y-4" style={card}>
                <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>
                  Causar cuotas de administración
                </p>
                <p className="text-[12px]" style={{ color: "rgba(246,245,247,0.50)" }}>
                  Crea el cobro mensual para cada unidad con cuota configurada. Es seguro
                  repetirlo: las unidades ya causadas se omiten.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Mes</label>
                    <div className="relative">
                      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...inputStyle, width: 150, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        {MONTHS.map((mn, i) => (
                          <option key={mn} value={i + 1} style={{ background: "#15151a" }}>{mn}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Año</label>
                    <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} min={2020} max={2100} />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Vence el día</label>
                    <input type="number" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} min={1} max={28} />
                  </div>
                  <button
                    onClick={causar}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-50 cursor-pointer"
                    style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                    Causar {MONTHS[month - 1]}
                  </button>
                </div>
              </div>
            )}

            {/* Pago panel */}
            {panel === "pago" && (
              <form onSubmit={registrarPago} className="rounded-2xl p-5 space-y-4" style={card}>
                <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>
                  Registrar pago recibido
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Unidad</label>
                    <div className="relative">
                      <select value={payUnit} onChange={(e) => setPayUnit(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="" style={{ background: "#15151a" }}>Selecciona…</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id} style={{ background: "#15151a" }}>
                            {u.label}{u.summary.balance > 0 ? ` — debe ${fmtCOP(u.summary.balance)}` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Monto (COP)</label>
                    <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="350.000" style={inputStyle} inputMode="numeric" />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Método</label>
                    <div className="relative">
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="transferencia" style={{ background: "#15151a" }}>Transferencia</option>
                        <option value="efectivo" style={{ background: "#15151a" }}>Efectivo</option>
                        <option value="consignacion" style={{ background: "#15151a" }}>Consignación</option>
                        <option value="otro" style={{ background: "#15151a" }}>Otro</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Fecha</label>
                    <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
                  </div>
                  <div className="sm:col-span-2">
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Referencia (opcional)</label>
                    <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="No. de transacción" style={inputStyle} maxLength={100} />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-50 cursor-pointer"
                  style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HandCoins className="h-3.5 w-3.5" />}
                  Registrar pago
                </button>

                {payUnit && recentPayments.length > 0 && (
                  <div className="pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ ...monoLabel, color: "rgba(246,245,247,0.40)" }} className="mb-2">
                      Últimos pagos de esta unidad
                    </p>
                    <div className="space-y-1.5">
                      {recentPayments.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 text-[12px]" style={{ color: "rgba(246,245,247,0.60)" }}>
                          <span style={monoMini}>
                            {new Date(p.receivedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" })}
                          </span>
                          <span className="font-medium" style={{ color: "#4cd6a0" }}>{fmtCOP(p.amount)}</span>
                          <span className="flex-1 truncate">{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                          <button
                            type="button"
                            onClick={() => eliminarPago(p.id)}
                            className="p-1 rounded cursor-pointer hover:bg-white/[0.06]"
                            style={{ color: "rgba(255,133,133,0.60)" }}
                            title="Eliminar pago"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            )}

            {/* Cobro panel */}
            {panel === "cobro" && (
              <form onSubmit={crearCobro} className="rounded-2xl p-5 space-y-4" style={card}>
                <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>
                  Cobro adicional (extraordinaria u otro)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Unidad</label>
                    <div className="relative">
                      <select value={chUnit} onChange={(e) => setChUnit(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="" style={{ background: "#15151a" }}>Selecciona…</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id} style={{ background: "#15151a" }}>{u.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Concepto</label>
                    <input value={chConcept} onChange={(e) => setChConcept(e.target.value)} placeholder="Ej: Cuota extraordinaria fachada" style={inputStyle} maxLength={200} />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Monto (COP)</label>
                    <input value={chAmount} onChange={(e) => setChAmount(e.target.value)} placeholder="120.000" style={inputStyle} inputMode="numeric" />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Tipo</label>
                    <div className="relative">
                      <select value={chType} onChange={(e) => setChType(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="extraordinaria" style={{ background: "#15151a" }}>Extraordinaria</option>
                        <option value="otro" style={{ background: "#15151a" }}>Otro</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "rgba(246,245,247,0.42)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">Vence</label>
                    <input type="date" value={chDue} onChange={(e) => setChDue(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-50 cursor-pointer"
                  style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Crear cobro
                </button>
              </form>
            )}

            {/* Units table */}
            {units.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={card}>
                <Users className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
                <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                  Esta propiedad aún no tiene unidades
                </p>
                <p className="text-[12.5px] mb-4" style={{ color: "rgba(246,245,247,0.40)" }}>
                  Agrégalas en Comunicados → Destinatarios. Tip: incluye cuota y coeficiente en
                  cada línea — &quot;Apto 101, María, maria@x.com, 1,25, 350.000&quot;.
                </p>
                <Link
                  href="/dashboard/comunicados"
                  className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2"
                  style={{ background: "rgba(124,92,255,0.15)", color: "#a78bff", border: "1px solid rgba(124,92,255,0.40)" }}
                >
                  Agregar unidades
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={card}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["Unidad", "Cuota mensual", "Coef. %", "Saldo", "Estado", "Último pago", ""].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left whitespace-nowrap"
                            style={{ ...monoLabel, color: "rgba(246,245,247,0.40)" }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => {
                        const chip = estadoChip(u);
                        return (
                          <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <td className="px-4 py-3">
                              <p className="text-[13px] font-medium" style={{ color: "#f6f5f7" }}>{u.label}</p>
                              {u.residentName && (
                                <p className="text-[11px]" style={{ color: "rgba(246,245,247,0.40)" }}>{u.residentName}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                key={`fee-${u.id}-${u.monthlyFee}`}
                                defaultValue={u.monthlyFee ? u.monthlyFee.toLocaleString("es-CO") : ""}
                                placeholder="—"
                                inputMode="numeric"
                                onBlur={(e) => {
                                  const cur = u.monthlyFee ? u.monthlyFee.toLocaleString("es-CO") : "";
                                  if (e.target.value.trim() !== cur) {
                                    saveUnitField(u.id, "monthlyFee", e.target.value);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                                className="w-24 h-8 px-2 rounded-lg text-[12.5px] text-right"
                                style={{
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  color: "#f6f5f7",
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                key={`coef-${u.id}-${u.coeficiente}`}
                                defaultValue={u.coeficiente ?? ""}
                                placeholder="—"
                                inputMode="decimal"
                                onBlur={(e) => {
                                  const cur = u.coeficiente != null ? String(u.coeficiente) : "";
                                  if (e.target.value.trim() !== cur) {
                                    saveUnitField(u.id, "coeficiente", e.target.value);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                                className="w-16 h-8 px-2 rounded-lg text-[12.5px] text-right"
                                style={{
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  color: "#f6f5f7",
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className="text-[13px] font-semibold"
                                style={{ color: u.summary.balance > 0 ? "#ffb958" : u.summary.balance < 0 ? "#5fb4ff" : "rgba(246,245,247,0.55)" }}
                              >
                                {u.summary.balance !== 0 ? fmtCOP(Math.abs(u.summary.balance)) : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className="px-2.5 py-1 rounded-full text-[10.5px] font-medium"
                                style={{ background: chip.bg, color: chip.color, border: `1px solid ${chip.border}` }}
                              >
                                {chip.text}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span style={{ ...monoMini, color: "rgba(246,245,247,0.40)" }}>
                                {u.lastPaymentAt
                                  ? new Date(u.lastPaymentAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
                                  : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setPanel("pago");
                                    setPayUnit(u.id);
                                    setMsg(null);
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                  className="p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.06]"
                                  style={{ color: "#4cd6a0" }}
                                  title="Registrar pago"
                                >
                                  <HandCoins className="h-4 w-4" />
                                </button>
                                <a
                                  href={`/cartera/${u.id}/estado`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
                                  style={{ color: "rgba(246,245,247,0.55)" }}
                                  title="Estado de cuenta (imprimir/PDF)"
                                >
                                  <FileText className="h-4 w-4" />
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
