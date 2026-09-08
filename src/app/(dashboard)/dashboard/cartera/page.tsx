"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { COMING_SOON } from "@/lib/feature-flags";
import { fmtCOP, computeAgingReport } from "@/lib/cartera";
import { waLink, paymentReminderMessage } from "@/lib/whatsapp";
import { StatCard, EmptyState, SkeletonList, Toast, type ToastMsg } from "@/components/ui/surface";
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
  Percent,
  Sparkles,
  Send,
  Copy,
  MessageCircle,
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
  phone: string | null;
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
  background: "var(--hifi-surface-1)",
  border: "1px solid var(--hifi-hairline)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--hifi-bg-elev)",
  border: "1px solid rgb(var(--veil-rgb) / 0.1)",
  color: "var(--ink)",
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

function CarteraPage() {
  const now = new Date();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [panel, setPanel] = useState<"" | "causar" | "pago" | "cobro" | "intereses" | "carta">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Intereses
  const [rate, setRate] = useState("");
  const [intMonth, setIntMonth] = useState(now.getMonth() + 1);
  const [intYear, setIntYear] = useState(now.getFullYear());

  // Carta de cobro (Metra)
  const [cartaUnit, setCartaUnit] = useState("");
  const [cartaTone, setCartaTone] = useState<"recordatorio" | "persuasivo" | "prejuridico">("recordatorio");
  const [cartaSubject, setCartaSubject] = useState("");
  const [cartaContent, setCartaContent] = useState("");
  const [cartaBusy, setCartaBusy] = useState(false);
  const [cartaSending, setCartaSending] = useState(false);
  const [cartaCopied, setCartaCopied] = useState(false);

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
        if (data.meta?.tasaMora != null) {
          setRate((prev) => prev || String(data.meta.tasaMora));
        }
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

  async function liquidarIntereses() {
    const pct = parseFloat(rate.replace(",", "."));
    if (!Number.isFinite(pct) || pct <= 0) {
      setMsg({ ok: false, text: "Indica una tasa mensual válida (ej: 2.1)." });
      return;
    }
    if (
      !window.confirm(
        `¿Liquidar intereses de ${MONTHS[intMonth - 1]} ${intYear} al ${pct}% mensual sobre los saldos en mora? Se creará un cobro de interés por unidad morosa (una sola vez por mes).`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cartera/intereses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, month: intMonth, year: intYear, rate: pct }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo liquidar." });
        return;
      }
      setMsg({
        ok: true,
        text:
          data.created > 0
            ? `Intereses liquidados: ${data.created} ${data.created === 1 ? "unidad" : "unidades"} por ${fmtCOP(data.total)} en total.`
            : "No había saldos en mora pendientes de liquidar este mes.",
      });
      setPanel("");
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function generarCarta() {
    if (!cartaUnit) {
      setMsg({ ok: false, text: "Selecciona la unidad morosa." });
      return;
    }
    setCartaBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cartera/carta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", unitId: cartaUnit, tone: cartaTone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo generar la carta." });
        return;
      }
      setCartaSubject(data.subject || "");
      setCartaContent(data.content || "");
    } catch {
      setMsg({ ok: false, text: "Error de red al generar la carta." });
    } finally {
      setCartaBusy(false);
    }
  }

  async function enviarCarta() {
    if (!cartaUnit || !cartaSubject.trim() || !cartaContent.trim()) return;
    const u = units.find((x) => x.id === cartaUnit);
    if (
      !window.confirm(
        `¿Enviar esta carta de cobro por correo a ${u?.label || "la unidad"}${u?.email ? ` (${u.email})` : ""}?`
      )
    ) {
      return;
    }
    setCartaSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cartera/carta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          unitId: cartaUnit,
          subject: cartaSubject,
          content: cartaContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo enviar la carta." });
        return;
      }
      setMsg({ ok: true, text: "Carta de cobro enviada por correo." });
      setPanel("");
      setCartaSubject("");
      setCartaContent("");
    } catch {
      setMsg({ ok: false, text: "Error de red al enviar." });
    } finally {
      setCartaSending(false);
    }
  }

  async function copiarCarta() {
    try {
      await navigator.clipboard.writeText(`${cartaSubject}\n\n${cartaContent}`);
      setCartaCopied(true);
      setTimeout(() => setCartaCopied(false), 2000);
    } catch {
      // clipboard unavailable
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
      return { text: `A favor ${fmtCOP(-s.balance)}`, color: "var(--info-text)", bg: "rgb(var(--info-rgb) / 0.1)", border: "rgb(var(--info-rgb) / 0.3)" };
    }
    if (s.balance === 0) {
      return { text: "Al día", color: "var(--ok-text)", bg: "rgb(var(--ok-rgb) / 0.1)", border: "rgb(var(--ok-rgb) / 0.3)" };
    }
    if (s.overdueDays > 30) {
      return { text: `Mora ${s.overdueDays}d`, color: "var(--danger-text)", bg: "rgb(var(--danger-rgb) / 0.1)", border: "rgb(var(--danger-rgb) / 0.3)" };
    }
    if (s.overdueDays > 0) {
      return { text: `Mora ${s.overdueDays}d`, color: "var(--warn-text)", bg: "rgb(var(--warn-rgb) / 0.1)", border: "rgb(var(--warn-rgb) / 0.3)" };
    }
    return { text: "Pendiente", color: "var(--ink-2)", bg: "rgb(var(--veil-rgb) / 0.05)", border: "rgb(var(--veil-rgb) / 0.12)" };
  }

  const panelBtn = (key: typeof panel, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => {
        setPanel((p) => (p === key ? "" : key));
        setMsg(null);
      }}
      className="ui-press inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 cursor-pointer"
      style={{
        background: panel === key ? "rgb(var(--accent-rgb) / 0.15)" : "rgb(var(--veil-rgb) / 0.05)",
        color: panel === key ? "var(--accent-hi)" : "var(--ink-2)",
        border: `1px solid ${panel === key ? "rgb(var(--accent-rgb) / 0.45)" : "rgb(var(--veil-rgb) / 0.1)"}`,
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div>
      <Header title="Cartera" subtitle="Cuotas, pagos y estados de cuenta por unidad" />
      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-[1320px] mx-auto space-y-4">
        {loading && <SkeletonList rows={5} kpis={4} />}

        {/* Plan upgrade */}
        {!loading && upgrade && (
          <div className="rounded-2xl p-8 text-center" style={{ ...card, borderColor: "rgb(var(--accent-rgb) / 0.3)" }}>
            <Wallet className="h-9 w-9 mx-auto mb-3" style={{ color: "var(--accent-text)" }} />
            <p className="text-[16px] font-semibold mb-2" style={{ color: "var(--ink)" }}>
              La cartera es una función de los planes Business y Élite
            </p>
            <p className="text-[13px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Causación mensual de cuotas, registro de pagos, estados de cuenta imprimibles y
              control de morosidad por unidad.
            </p>
            <Link
              href="/dashboard/suscripcion"
              className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-6 py-3"
              style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
            >
              Ver planes
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {!loading && !upgrade && properties.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={card}>
            <Wallet className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--ink-4)" }} />
            <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
              Crea una propiedad primero para gestionar su cartera.
            </p>
          </div>
        )}

        {!loading && !upgrade && properties.length > 0 && (
          <>
            {/* Toolbar: context on top, actions below. Sharing one row made the
                five actions wrap awkwardly the moment the property name was long. */}
            <div className="ui-card ui-sheen">
              <div className="ui-scroll overflow-x-auto px-4 pt-3 pb-3">
                <div
                  className="inline-flex items-center gap-1.5 p-1 rounded-xl"
                  style={{ background: "var(--hifi-bg-elev)", border: "1px solid var(--hifi-hairline)" }}
                >
                  {properties.map((p) => {
                    const on = propertyId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPropertyId(p.id)}
                        className="ui-chip px-3 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer whitespace-nowrap"
                        style={{
                          background: on ? "var(--hifi-accent)" : "transparent",
                          color: on ? "#fff" : "var(--ink-2)",
                          boxShadow: on ? "0 6px 16px -8px rgb(var(--accent-rgb) / 0.9)" : "none",
                        }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px" style={{ background: "var(--hifi-hairline)" }} />

              <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                {panelBtn("causar", <CalendarPlus className="h-3.5 w-3.5" />, "Causar mes")}
                {panelBtn("pago", <HandCoins className="h-3.5 w-3.5" />, "Registrar pago")}
                {panelBtn("cobro", <Receipt className="h-3.5 w-3.5" />, "Cobro extra")}
                {panelBtn("intereses", <Percent className="h-3.5 w-3.5" />, "Intereses")}
                {panelBtn("carta", <Sparkles className="h-3.5 w-3.5" />, "Carta de cobro IA")}
              </div>
            </div>

            {/* KPIs — each with a coloured accent rail so the row reads as data,
                not as four identical grey boxes. */}
            {kpis && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 ui-stagger">
                {[
                  { label: "Cartera pendiente", value: fmtCOP(kpis.totalOwed), Icon: Wallet, rail: kpis.totalOwed > 0 ? "var(--warn)" : "var(--ok)", hint: kpis.totalOwed > 0 ? "por recaudar" : "todo recaudado" },
                  { label: "Unidades en mora", value: `${kpis.overdueUnits}`, sub: `de ${kpis.unitsCount}`, Icon: Users, rail: kpis.overdueUnits > 0 ? "var(--danger)" : "var(--ok)", hint: kpis.overdueUnits > 0 ? "requieren gestión" : "ninguna en mora" },
                  { label: "Recaudado este mes", value: fmtCOP(kpis.collectedThisMonth), Icon: HandCoins, rail: "var(--ok)", hint: "pagos registrados" },
                  { label: "Causado este mes", value: fmtCOP(kpis.chargedThisMonth), Icon: Receipt, rail: "var(--info)", hint: "cuotas emitidas" },
                ].map((k) => {
                  const empty = /^\$?0$/.test(String(k.value).replace(/\./g, ""));
                  return (
                    <div key={k.label} className="ui-card ui-sheen relative overflow-hidden p-4 pl-5">
                      <span
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ background: empty ? "rgb(var(--veil-rgb) / 0.1)" : k.rail }}
                      />
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <span style={{ ...monoLabel, color: "var(--ink-3)" }}>{k.label}</span>
                        <span
                          className="flex items-center justify-center rounded-lg flex-shrink-0"
                          style={{ width: 26, height: 26, background: empty ? "rgb(var(--veil-rgb) / 0.04)" : `${k.rail}1a` }}
                        >
                          <k.Icon className="h-3.5 w-3.5" style={{ color: empty ? "var(--ink-4)" : k.rail }} />
                        </span>
                      </div>
                      <p
                        className="ui-count font-semibold tracking-tight leading-none tabular-nums"
                        style={{
                          // Fixed 26px clipped "$4.200.000" inside the 2-column
                          // mobile grid — scale it down with the viewport instead.
                          fontSize: "clamp(19px, 5.1vw, 26px)",
                          color: empty ? "var(--ink-3)" : "var(--ink)",
                        }}
                      >
                        {k.value}
                        {k.sub && (
                          <span className="ml-1.5 font-normal" style={{ fontSize: 14, color: "var(--ink-4)" }}>
                            {k.sub}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] mt-1.5" style={{ color: "var(--ink-4)" }}>
                        {k.hint}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Feedback: floating toast (auto-dismiss) */}
            <Toast msg={msg as ToastMsg | null} onDone={() => setMsg(null)} />

            {/* Causar panel */}
            {panel === "causar" && (
              <div className="ui-card ui-sheen ui-rise p-5 space-y-4">
                <p className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                  Causar cuotas de administración
                </p>
                <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Crea el cobro mensual para cada unidad con cuota configurada. Es seguro
                  repetirlo: las unidades ya causadas se omiten.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Mes</label>
                    <div className="relative">
                      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...inputStyle, width: 150, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        {MONTHS.map((mn, i) => (
                          <option key={mn} value={i + 1} style={{ background: "var(--hifi-surface-1)" }}>{mn}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Año</label>
                    <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} min={2020} max={2100} />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Vence el día</label>
                    <input type="number" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} min={1} max={28} />
                  </div>
                  <button
                    onClick={causar}
                    disabled={busy}
                    className="ui-press ui-btn-glow inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 cursor-pointer"
                    style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                    Causar {MONTHS[month - 1]}
                  </button>
                </div>
              </div>
            )}

            {/* Pago panel */}
            {panel === "pago" && (
              <form onSubmit={registrarPago} className="ui-card ui-sheen ui-rise p-5 space-y-4">
                <p className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                  Registrar pago recibido
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Unidad</label>
                    <div className="relative">
                      <select value={payUnit} onChange={(e) => setPayUnit(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="" style={{ background: "var(--hifi-surface-1)" }}>Selecciona…</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id} style={{ background: "var(--hifi-surface-1)" }}>
                            {u.label}{u.summary.balance > 0 ? ` — debe ${fmtCOP(u.summary.balance)}` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Monto (COP)</label>
                    <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="350.000" style={inputStyle} inputMode="numeric" />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Método</label>
                    <div className="relative">
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="transferencia" style={{ background: "var(--hifi-surface-1)" }}>Transferencia</option>
                        <option value="efectivo" style={{ background: "var(--hifi-surface-1)" }}>Efectivo</option>
                        <option value="consignacion" style={{ background: "var(--hifi-surface-1)" }}>Consignación</option>
                        <option value="otro" style={{ background: "var(--hifi-surface-1)" }}>Otro</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Fecha</label>
                    <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
                  </div>
                  <div className="sm:col-span-2">
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Referencia (opcional)</label>
                    <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="No. de transacción" style={inputStyle} maxLength={100} />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="ui-press ui-btn-glow inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 cursor-pointer"
                  style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HandCoins className="h-3.5 w-3.5" />}
                  Registrar pago
                </button>

                {payUnit && recentPayments.length > 0 && (
                  <div className="pt-2" style={{ borderTop: "1px solid var(--hifi-hairline)" }}>
                    <p style={{ ...monoLabel, color: "var(--ink-3)" }} className="mb-2">
                      Últimos pagos de esta unidad
                    </p>
                    <div className="space-y-1.5">
                      {recentPayments.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 text-[12px]" style={{ color: "var(--ink-2)" }}>
                          <span style={monoMini}>
                            {new Date(p.receivedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" })}
                          </span>
                          <span className="font-medium" style={{ color: "var(--ok-text)" }}>{fmtCOP(p.amount)}</span>
                          <span className="flex-1 truncate">{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                          <button
                            type="button"
                            onClick={() => eliminarPago(p.id)}
                            className="p-1 rounded cursor-pointer hover:bg-white/[0.06]"
                            style={{ color: "rgb(var(--danger-rgb) / 0.6)" }}
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
              <form onSubmit={crearCobro} className="ui-card ui-sheen ui-rise p-5 space-y-4">
                <p className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                  Cobro adicional (extraordinaria u otro)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Unidad</label>
                    <div className="relative">
                      <select value={chUnit} onChange={(e) => setChUnit(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="" style={{ background: "var(--hifi-surface-1)" }}>Selecciona…</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id} style={{ background: "var(--hifi-surface-1)" }}>{u.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Concepto</label>
                    <input value={chConcept} onChange={(e) => setChConcept(e.target.value)} placeholder="Ej: Cuota extraordinaria fachada" style={inputStyle} maxLength={200} />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Monto (COP)</label>
                    <input value={chAmount} onChange={(e) => setChAmount(e.target.value)} placeholder="120.000" style={inputStyle} inputMode="numeric" />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Tipo</label>
                    <div className="relative">
                      <select value={chType} onChange={(e) => setChType(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        <option value="extraordinaria" style={{ background: "var(--hifi-surface-1)" }}>Extraordinaria</option>
                        <option value="otro" style={{ background: "var(--hifi-surface-1)" }}>Otro</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Vence</label>
                    <input type="date" value={chDue} onChange={(e) => setChDue(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="ui-press ui-btn-glow inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 cursor-pointer"
                  style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Crear cobro
                </button>
              </form>
            )}

            {/* Intereses panel */}
            {panel === "intereses" && (
              <div className="ui-card ui-sheen ui-rise p-5 space-y-4">
                <p className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                  Liquidar intereses de mora
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
                  Crea un cobro de interés por cada unidad con saldo vencido (una sola vez por
                  mes, nunca sobre intereses anteriores). Tope legal: 1.5× el interés bancario
                  corriente vigente, sin exceder la usura (Art. 30, Ley 675). Consulta la tasa
                  certificada por la Superfinanciera para tu mes.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">
                      Tasa mensual %
                    </label>
                    <input
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder="2.1"
                      style={{ ...inputStyle, width: 100 }}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Mes</label>
                    <div className="relative">
                      <select value={intMonth} onChange={(e) => setIntMonth(Number(e.target.value))} style={{ ...inputStyle, width: 150, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                        {MONTHS.map((mn, i) => (
                          <option key={mn} value={i + 1} style={{ background: "var(--hifi-surface-1)" }}>{mn}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Año</label>
                    <input type="number" value={intYear} onChange={(e) => setIntYear(Number(e.target.value))} style={{ ...inputStyle, width: 100 }} min={2020} max={2100} />
                  </div>
                  <button
                    onClick={liquidarIntereses}
                    disabled={busy}
                    className="ui-press ui-btn-glow inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 cursor-pointer"
                    style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Percent className="h-3.5 w-3.5" />}
                    Liquidar
                  </button>
                </div>
              </div>
            )}

            {/* Carta de cobro panel (Metra) */}
            {panel === "carta" && (
              <div className="ui-card ui-sheen ui-rise p-5 space-y-4" style={{ borderColor: "rgb(var(--ok-rgb) / 0.25)" }}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: "var(--ok-text)" }} />
                  <p className="text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                    Carta de cobro con IA
                  </p>
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px]"
                    style={{ ...monoLabel, fontSize: 9, background: "rgb(var(--ok-rgb) / 0.12)", color: "var(--ok-text)", border: "1px solid rgb(var(--ok-rgb) / 0.3)" }}
                  >
                    Metra
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Unidad morosa</label>
                    <div className="relative">
                      <select
                        value={cartaUnit}
                        onChange={(e) => {
                          setCartaUnit(e.target.value);
                          setCartaSubject("");
                          setCartaContent("");
                        }}
                        style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}
                      >
                        <option value="" style={{ background: "var(--hifi-surface-1)" }}>Selecciona…</option>
                        {units
                          .filter((u) => u.summary.balance > 0)
                          .map((u) => (
                            <option key={u.id} value={u.id} style={{ background: "var(--hifi-surface-1)" }}>
                              {u.label} — debe {fmtCOP(u.summary.balance)}
                              {u.summary.overdueDays > 0 ? ` (${u.summary.overdueDays}d mora)` : ""}
                            </option>
                          ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Tono</label>
                    <div className="relative">
                      <select
                        value={cartaTone}
                        onChange={(e) => setCartaTone(e.target.value as typeof cartaTone)}
                        style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}
                      >
                        <option value="recordatorio" style={{ background: "var(--hifi-surface-1)" }}>Recordatorio amable (1er aviso)</option>
                        <option value="persuasivo" style={{ background: "var(--hifi-surface-1)" }}>Cobro persuasivo (2do aviso)</option>
                        <option value="prejuridico" style={{ background: "var(--hifi-surface-1)" }}>Prejurídico (último aviso)</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5" style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                </div>
                <button
                  onClick={generarCarta}
                  disabled={cartaBusy || !cartaUnit}
                  className="inline-flex items-center gap-2 rounded-full text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-40 cursor-pointer"
                  style={{ background: "rgb(var(--ok-rgb) / 0.14)", color: "var(--ok-text)", border: "1px solid rgb(var(--ok-rgb) / 0.35)" }}
                >
                  {cartaBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {cartaBusy ? "Redactando con los datos de la deuda…" : "Redactar carta"}
                </button>

                {cartaContent && (
                  <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--hifi-hairline)" }}>
                    <div>
                      <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">Asunto</label>
                      <input value={cartaSubject} onChange={(e) => setCartaSubject(e.target.value)} style={inputStyle} maxLength={150} />
                    </div>
                    <div>
                      <label style={{ ...monoLabel, color: "var(--ink-3)" }} className="block mb-1.5">
                        Carta (edítala si lo necesitas)
                      </label>
                      <textarea
                        value={cartaContent}
                        onChange={(e) => setCartaContent(e.target.value)}
                        rows={12}
                        style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                        maxLength={10000}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={enviarCarta}
                        disabled={cartaSending || !units.find((u) => u.id === cartaUnit)?.email}
                        className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-40 cursor-pointer"
                        style={{ background: "var(--accent)", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
                      >
                        {cartaSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Enviar por correo
                      </button>
                      <button
                        onClick={copiarCarta}
                        className="inline-flex items-center gap-2 rounded-full text-[13px] font-medium px-5 py-2.5 transition-all cursor-pointer"
                        style={{ background: "rgb(var(--veil-rgb) / 0.06)", color: cartaCopied ? "var(--ok-text)" : "var(--ink-2)", border: "1px solid rgb(var(--veil-rgb) / 0.12)" }}
                      >
                        {cartaCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {cartaCopied ? "Copiado" : "Copiar texto"}
                      </button>
                      {!units.find((u) => u.id === cartaUnit)?.email && (
                        <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                          La unidad no tiene correo — copia el texto para enviarlo por otro medio.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aging + top morosos */}
            {(() => {
              const aging = computeAgingReport(units);
              const totalOverdue = aging.reduce((s, a) => s + a.amount, 0);
              if (totalOverdue <= 0) return null;
              const AGING_COLORS: Record<string, string> = {
                d30: "var(--warn)",
                d60: "#ff9c58",
                d90: "var(--danger)",
                d90plus: "var(--danger)",
              };
              const morosos = [...units]
                .filter((u) => u.summary.balance > 0 && u.summary.overdueDays > 0)
                .sort((a, b) => b.summary.balance - a.summary.balance)
                .slice(0, 5);
              return (
                <div className="ui-card ui-sheen ui-rise p-5 space-y-4">
                  <p style={{ ...monoLabel, color: "var(--ink-3)" }}>
                    Cartera por edades · {fmtCOP(totalOverdue)} en mora
                  </p>
                  {/* Stacked bar */}
                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "rgb(var(--veil-rgb) / 0.05)" }}>
                    {aging.map((a) =>
                      a.amount > 0 ? (
                        <div
                          key={a.bucket}
                          style={{ width: `${(a.amount / totalOverdue) * 100}%`, background: AGING_COLORS[a.bucket] }}
                          title={`${a.label}: ${fmtCOP(a.amount)}`}
                        />
                      ) : null
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {aging.map((a) => (
                      <div key={a.bucket}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: AGING_COLORS[a.bucket] }} />
                          <span style={{ ...monoMini, color: "var(--ink-3)" }}>{a.label}</span>
                        </div>
                        <p className="text-[13.5px] font-semibold" style={{ color: a.amount > 0 ? "var(--ink)" : "var(--ink-4)" }}>
                          {fmtCOP(a.amount)}
                        </p>
                        <p className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                          {a.count} {a.count === 1 ? "unidad" : "unidades"}
                        </p>
                      </div>
                    ))}
                  </div>
                  {morosos.length > 0 && (
                    <div className="pt-3" style={{ borderTop: "1px solid var(--hifi-hairline)" }}>
                      <p style={{ ...monoLabel, color: "var(--ink-3)" }} className="mb-2">
                        Mayores deudores
                      </p>
                      <div className="space-y-1.5">
                        {morosos.map((u) => (
                          <div key={u.id} className="flex items-center gap-3">
                            <span className="text-[12.5px] font-medium flex-1" style={{ color: "var(--ink)" }}>
                              {u.label}
                              {u.residentName ? (
                                <span style={{ color: "var(--ink-3)" }}> · {u.residentName}</span>
                              ) : null}
                            </span>
                            <span className="text-[12.5px] font-semibold" style={{ color: "var(--danger-text)" }}>
                              {fmtCOP(u.summary.balance)}
                            </span>
                            <span style={{ ...monoMini, color: "var(--ink-4)" }}>
                              {u.summary.overdueDays}d
                            </span>
                            <button
                              onClick={() => {
                                setPanel("carta");
                                setCartaUnit(u.id);
                                setCartaSubject("");
                                setCartaContent("");
                                setMsg(null);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="inline-flex items-center gap-1 rounded-full text-[11px] px-2.5 py-1 cursor-pointer transition-colors hover:bg-white/[0.06]"
                              style={{ color: "var(--ok-text)", border: "1px solid rgb(var(--ok-rgb) / 0.3)" }}
                            >
                              <Sparkles className="h-3 w-3" />
                              Carta
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Units table */}
            {units.length === 0 ? (
              <EmptyState
                icon={Users}
                tone="accent"
                title="Esta propiedad aún no tiene unidades"
                description="Importa tu listado desde un archivo y la IA lo organiza, o agrégalas a mano. Puedes incluir cuota y coeficiente en la misma línea."
                action={
                  <Link
                    href="/dashboard/residentes"
                    className="ui-press inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium px-5 py-2.5"
                    style={{ background: "var(--hifi-accent)", color: "#fff", boxShadow: "0 8px 24px -8px rgb(var(--accent-rgb) / 0.5)" }}
                  >
                    Agregar unidades
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
            ) : (
              <div className="ui-card ui-sheen overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "rgb(var(--veil-rgb) / 0.02)", borderBottom: "1px solid var(--hifi-hairline)" }}>
                        {["Unidad", "Cuota mensual", "Coef. %", "Saldo", "Estado", "Último pago", ""].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left whitespace-nowrap"
                            style={{ ...monoLabel, color: "var(--ink-3)" }}
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
                          <tr key={u.id} className="ui-row" style={{ borderBottom: "1px solid var(--hifi-hairline)" }}>
                            <td className="px-4 py-3">
                              <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{u.label}</p>
                              {u.residentName && (
                                <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>{u.residentName}</p>
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
                                className="ui-input ui-focus w-24 h-8 px-2 rounded-lg text-[12.5px] text-right"
                                style={{
                                  background: "rgb(var(--veil-rgb) / 0.04)",
                                  border: "1px solid rgb(var(--veil-rgb) / 0.08)",
                                  color: "var(--ink)",
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
                                className="ui-input ui-focus w-16 h-8 px-2 rounded-lg text-[12.5px] text-right"
                                style={{
                                  background: "rgb(var(--veil-rgb) / 0.04)",
                                  border: "1px solid rgb(var(--veil-rgb) / 0.08)",
                                  color: "var(--ink)",
                                  outline: "none",
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className="text-[13px] font-semibold"
                                style={{ color: u.summary.balance > 0 ? "var(--warn-text)" : u.summary.balance < 0 ? "var(--info)" : "var(--ink-2)" }}
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
                              <span style={{ ...monoMini, color: "var(--ink-3)" }}>
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
                                  className="ui-press p-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06]"
                                  style={{ color: "var(--ok-text)" }}
                                  title="Registrar pago"
                                >
                                  <HandCoins className="h-4 w-4" />
                                </button>
                                <a
                                  href={`/cartera/${u.id}/estado`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ui-press p-1.5 rounded-lg hover:bg-white/[0.06]"
                                  style={{ color: "var(--ink-2)" }}
                                  title="Estado de cuenta (imprimir/PDF)"
                                >
                                  <FileText className="h-4 w-4" />
                                </a>
                                {(() => {
                                  if (u.summary.balance <= 0 || !u.phone) return null;
                                  const href = waLink(
                                    u.phone,
                                    paymentReminderMessage({
                                      propertyName: properties.find((p) => p.id === propertyId)?.name || "la copropiedad",
                                      unitLabel: u.label,
                                      balanceText: fmtCOP(u.summary.balance),
                                    })
                                  );
                                  return href ? (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ui-press p-1.5 rounded-lg hover:bg-white/[0.06]"
                                      style={{ color: "#25D366" }}
                                      title="Recordar pago por WhatsApp"
                                    >
                                      <MessageCircle className="h-4 w-4" />
                                    </a>
                                  ) : null;
                                })()}
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

/**
 * Envoltorio del gate. La comprobación va en un componente SIN hooks para que
 * CarteraPage no llegue a montarse cuando la función está pausada: con el
 * early-return dentro, sus useEffect ya habían disparado las peticiones de
 * carga y se descargaban datos que nadie iba a ver.
 */
export default function CarteraRoute() {
  if (COMING_SOON.cartera) {
    return (
      <div>
        <Header title="Cartera" subtitle="Cuotas, pagos y estados de cuenta por unidad" />
        <ComingSoon
          icon={Wallet}
          title="Cartera"
          description="La gestión de cuotas, pagos, mora y estados de cuenta por unidad vuelve pronto — la estamos afinando antes de activarla."
        />
      </div>
    );
  }
  return <CarteraPage />;
}
