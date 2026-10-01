"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check, CalendarPlus, CirclePlus, Coins, Copy, FileText, HandCoins, Hourglass, Lock, MessageCircle, Percent,
  Receipt, Sparkles, Trash2, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { COMING_SOON } from "@/lib/feature-flags";
import { fmtCOP, computeAgingReport } from "@/lib/cartera";
import { waLink, paymentReminderMessage } from "@/lib/whatsapp";
import {
  AccionesFila,
  AreaTexto,
  Aviso,
  Boton,
  BotonFila,
  BotonIcono,
  CabeceraPieza,
  Campo,
  Entrada,
  Esqueleto,
  Estado,
  Etiqueta,
  Kpi,
  Kpis,
  Loseta,
  MenuMas,
  Modal,
  Pagina,
  Panel,
  PestanasUnidas,
  Pieza,
  Seccion,
  Selector,
  Tabla,
  Vacio,
  avisar,
  unir,
  type ColumnaTabla,
  type ItemMenu,
  type Tono,
} from "@/components/kit";

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

interface CarteraKpis {
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

type PanelId = "" | "causar" | "pago" | "cobro" | "intereses" | "carta";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const METODOS: Record<string, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  consignacion: "Consignación",
  otro: "Otro",
};

/** Las cinco tareas de la cartera, cada una con su icono y su color: se elige una y se abre su formulario. */
const ACCIONES: Array<{ id: Exclude<PanelId, "">; icono: LucideIcon; tono: Tono; titulo: string; texto: string }> = [
  { id: "causar", icono: CalendarPlus, tono: "blue", titulo: "Causar mes", texto: "Crea la cuota del mes en cada unidad" },
  { id: "pago", icono: HandCoins, tono: "green", titulo: "Registrar pago", texto: "Anota lo que pagó una unidad" },
  { id: "cobro", icono: Receipt, tono: "amber", titulo: "Cobro extra", texto: "Cuota extraordinaria u otro cobro" },
  { id: "intereses", icono: Percent, tono: "orange", titulo: "Intereses", texto: "Cobra el interés de mora del mes" },
  { id: "carta", icono: Sparkles, tono: "ai", titulo: "Carta de cobro IA", texto: "La IA redacta la carta por ti" },
];

/** Color de cada tramo de mora: cuanto más antigua, más grave (ámbar → naranja → rojo → fucsia). */
const TONO_EDAD: Record<string, Tono> = { d30: "amber", d60: "orange", d90: "red", d90plus: "fuchsia" };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** «25 sept 2026»: cabe en una columna estrecha sin partirse. */
function fechaCompacta(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/* Estilos locales: tareas, formularios, cartera por edades, mayores deudores y tabla de unidades. */
const CSS_CARTERA = `
.ca-ctx { margin: 0 0 16px; }
.ca-acciones { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 0 0 22px; }
.ca-acc { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 14px 16px; text-align: left; border-radius: 22px; background: var(--surface-1); border: 1.5px solid var(--line); box-shadow: var(--sh-1); cursor: pointer; transition: background .15s, border-color .15s; }
.ca-acc:hover { background: var(--hl); border-color: var(--h-line); }
.ca-acc[aria-expanded="true"] { background: var(--h-soft); border-color: var(--h-a); }
.ca-acc .t { min-width: 0; display: grid; gap: 2px; }
.ca-acc .t b { font-size: 16px; font-weight: 800; letter-spacing: -.01em; line-height: 1.2; }
.ca-acc .t small { font-size: 13.5px; line-height: 1.3; color: var(--ink-2); }
.ca-panel { margin: 0 0 24px; scroll-margin-top: 96px; }
.ca-nota { margin: 0 0 16px; max-width: 72ch; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
.ca-aviso { margin: 0 0 16px; }
.ca-campos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 18px; align-items: start; }
.ca-campos .k-fld { margin-bottom: 16px; }
.ca-campos .doble { grid-column: span 2; }
.ca-campos .todo { grid-column: 1 / -1; }
.ca-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 14px; margin-top: 4px; }
.ca-recientes { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); }
.ca-recientes h4 { margin: 0 0 6px; font-size: 16px; font-weight: 800; letter-spacing: -.01em; }
.ca-recientes ul { list-style: none; margin: 0; padding: 0; }
.ca-recientes li { display: grid; grid-template-columns: 100px auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 6px 0; border-top: 1px solid var(--line); font-size: 15px; }
.ca-recientes li:first-child { border-top: 0; }
.ca-recientes .f { color: var(--ink-3); font-weight: 600; white-space: nowrap; font-feature-settings: "tnum" 1; }
.ca-recientes b { color: var(--ok-text); font-weight: 800; font-feature-settings: "tnum" 1; }
.ca-recientes .m { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
.ca-carta { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--line); }
.ca-carta .k-in { line-height: 1.6; }
.ca-sincorreo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 14.5px; color: var(--ink-2); }
.ca-edades { margin: 0 0 24px; }
.ca-edades-barra { display: flex; gap: 3px; height: 14px; margin: 4px 0 18px; border-radius: 999px; overflow: hidden; background: var(--surface-3); }
.ca-edades-barra > i { display: block; min-width: 6px; background: linear-gradient(90deg, var(--h-a), var(--h-b)); }
.ca-leyenda { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 18px; }
.ca-leyenda li { min-width: 0; }
.ca-leyenda .r { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--ink-2); }
.ca-leyenda .r i { flex: none; width: 12px; height: 12px; border-radius: 4px; background: var(--h-a); }
.ca-leyenda b { display: block; margin-top: 4px; font-size: 19px; font-weight: 800; letter-spacing: -.02em; font-feature-settings: "tnum" 1; }
.ca-leyenda small { display: block; font-size: 13.5px; color: var(--ink-3); }
.ca-leyenda li.cero b { color: var(--ink-3); font-weight: 700; }
.ca-deudores-t { display: flex; align-items: center; gap: 10px; margin: 22px 0 6px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
.ca-deudores { list-style: none; margin: 0; padding: 0; }
.ca-deudores li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 4px 16px; padding: 8px 0; border-top: 1px solid var(--line); }
.ca-deudores li:first-child { border-top: 0; }
.ca-deudores .n b { font-size: 16px; font-weight: 800; }
.ca-deudores .n span { display: block; font-size: 14px; color: var(--ink-3); }
.ca-deudores .m { font-size: 16px; font-weight: 800; color: var(--danger-text); font-feature-settings: "tnum" 1; }
.ca-deudores .d { min-width: 64px; text-align: right; font-size: 14px; font-weight: 700; color: var(--ink-2); }
.ca-tabla-env { overflow-x: auto; margin: 0 0 8px; }
.ca-tabla-env .k-tabla { column-gap: clamp(14px, 1.6vw, 24px); }
.ca-uni { line-height: 1.2; }
.ca-uni b { display: block; font-size: 17px; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; }
.ca-uni span { display: block; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; color: var(--ink-3); }
.ca-cel { display: block; }
.ca-cel .k-in { min-height: 42px; height: 42px; padding: 0 12px; font-size: 15px; text-align: right; font-feature-settings: "tnum" 1; }
.ca-et { display: none; }
.ca-saldo b { display: block; font-size: 16px; font-weight: 800; font-feature-settings: "tnum" 1; }
.ca-saldo b.debe { color: var(--warn-text); }
.ca-saldo b.favor { color: var(--info-text); }
.ca-saldo b.cero { color: var(--ink-3); font-weight: 600; }
.ca-saldo small { display: block; margin-top: 2px; font-size: 13px; font-weight: 500; color: var(--ink-3); }
.ca-est { display: grid; gap: 4px; justify-items: start; }
.ca-est small { font-size: 13px; font-weight: 600; color: var(--ink-3); }
@media (min-width: 861px) {
  .ca-tabla-env .k-tabla { min-width: 940px; }
}
@media (max-width: 1100px) {
  .ca-acciones { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ca-campos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 861px) and (max-width: 1180px) {
  .ca-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .ca-kpis .k-kpi.k-32 > b { font-size: clamp(15px, 4.8vw, 24px); }
  .ca-tabla-env { overflow: visible; }
  .ca-et { display: block; margin: 0 0 4px; font-size: 13px; font-weight: 700; color: var(--ink-3); }
  .ca-cel { min-width: 150px; }
  .ca-cel .k-in { text-align: left; }
  .ca-uni b { white-space: normal; overflow-wrap: anywhere; font-size: 16px; }
  .ca-uni span { white-space: normal; font-size: 13px; }
  .ca-leyenda { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .ca-acciones { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .ca-acciones .ca-acc:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .ca-acc { padding: 12px; gap: 10px; }
  .ca-acc .t small { display: none; }
  .ca-campos { grid-template-columns: minmax(0, 1fr); }
  .ca-campos .doble { grid-column: 1 / -1; }
  .ca-recientes li { grid-template-columns: auto minmax(0, 1fr) auto; }
  .ca-recientes .f { grid-column: 1 / -1; }
  .ca-deudores li { grid-template-columns: minmax(0, 1fr) auto; }
  .ca-deudores .d { grid-column: 1; grid-row: 2; text-align: left; }
  .ca-deudores li > .k-bt { grid-column: 2; grid-row: 2; }
}
`;

/** Estado de una unidad: siempre icono + color + palabra (en mora, al día, a favor, pendiente). */
function EstadoUnidad({ u }: { u: UnitRow }) {
  const s = u.summary;
  if (s.balance < 0) return <Etiqueta icono={CirclePlus} tono="blue">A favor</Etiqueta>;
  if (s.balance === 0) return <Estado tipo="ok" tamLetra={14}>Al día</Estado>;
  if (s.overdueDays > 30) return <Estado tipo="vencido" tamLetra={14}>En mora</Estado>;
  if (s.overdueDays > 0) return <Estado tipo="falta" tamLetra={14}>En mora</Estado>;
  return <Estado tipo="pendiente" tamLetra={14}>Pendiente</Estado>;
}

function CarteraPage() {
  const now = new Date();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [kpis, setKpis] = useState<CarteraKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [panel, setPanel] = useState<PanelId>("");
  // Errores del formulario abierto (los éxitos salen como aviso flotante: avisar()).
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Confirmaciones en un <Modal> (antes window.confirm).
  const [porEliminarPago, setPorEliminarPago] = useState<RecentPayment | null>(null);
  const [porLiquidar, setPorLiquidar] = useState<number | null>(null);
  const [porEnviarCarta, setPorEnviarCarta] = useState(false);

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
      setError(null);
      setPanel("");
      setPayUnit("");
      setChUnit("");
      setCartaUnit("");
      setCartaSubject("");
      setCartaContent("");
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

  function irAlPanel() {
    setTimeout(() => document.getElementById("ca-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  function alternarPanel(id: Exclude<PanelId, "">) {
    setPanel((p) => (p === id ? "" : id));
    setError(null);
  }

  function cerrarPanel() {
    setPanel("");
    setError(null);
  }

  async function causar() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cartera/causar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, month, year, dueDay }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo causar el mes.");
        return;
      }
      const parts = [`${MONTHS[month - 1]} ${year}`];
      if (data.skippedExisting > 0) parts.push(`${data.skippedExisting} ya existían`);
      if (data.skippedNoFee > 0) parts.push(`${data.skippedNoFee} unidades sin cuota configurada`);
      avisar({
        tipo: "ok",
        titulo: `${data.created} ${data.created === 1 ? "cuota causada." : "cuotas causadas."}`,
        texto: `${parts.join(" · ")}.`,
      });
      setPanel("");
      await load(propertyId);
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  async function registrarPago(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(payAmount.replace(/[.$\s]/g, ""), 10);
    if (!payUnit || !Number.isFinite(amt) || amt <= 0) {
      setError("Selecciona la unidad y un monto válido.");
      return;
    }
    setBusy(true);
    setError(null);
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
        setError(data.error || "No se pudo registrar el pago.");
        return;
      }
      avisar({
        tipo: "ok",
        titulo: `Pago de ${fmtCOP(amt)} registrado.`,
        texto: data.credit > 0 ? `${fmtCOP(data.credit)} quedan como saldo a favor.` : undefined,
      });
      setPayAmount("");
      setPayRef("");
      await load(propertyId);
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  // La confirmación («¿Eliminar este pago?») la pide el <Modal> (porEliminarPago).
  async function eliminarPago(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cartera/payments?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        avisar({ tipo: "ok", titulo: "Pago eliminado.", texto: "Se revirtió su aplicación a los cobros." });
        await load(propertyId);
        setPayUnit((u) => u); // retrigger recent payments
      } else {
        const data = await res.json();
        setError(data.error || "No se pudo eliminar.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function crearCobro(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(chAmount.replace(/[.$\s]/g, ""), 10);
    if (!chUnit || !chConcept.trim() || !Number.isFinite(amt) || amt <= 0) {
      setError("Completa unidad, concepto y monto.");
      return;
    }
    setBusy(true);
    setError(null);
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
        setError(data.error || "No se pudo crear el cobro.");
        return;
      }
      avisar({ tipo: "ok", titulo: "Cobro creado.", texto: `«${chConcept.trim()}» por ${fmtCOP(amt)}.` });
      setChConcept("");
      setChAmount("");
      setPanel("");
      await load(propertyId);
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  // Valida la tasa y abre la confirmación; la liquidación real es liquidarIntereses().
  function pedirLiquidacion() {
    const pct = parseFloat(rate.replace(",", "."));
    if (!Number.isFinite(pct) || pct <= 0) {
      setError("Indica una tasa mensual válida (ej: 2.1).");
      return;
    }
    setError(null);
    setPorLiquidar(pct);
  }

  async function liquidarIntereses(pct: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cartera/intereses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, month: intMonth, year: intYear, rate: pct }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo liquidar.");
        return;
      }
      if (data.created > 0) {
        avisar({
          tipo: "ok",
          titulo: "Intereses liquidados.",
          texto: `${plural(data.created, "unidad", "unidades")} por ${fmtCOP(data.total)} en total.`,
        });
      } else {
        avisar({ tipo: "info", titulo: "No había saldos en mora por liquidar.", texto: "Este mes no se creó ningún cobro de interés." });
      }
      setPanel("");
      await load(propertyId);
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  async function generarCarta() {
    if (!cartaUnit) {
      setError("Selecciona la unidad morosa.");
      return;
    }
    setCartaBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cartera/carta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", unitId: cartaUnit, tone: cartaTone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo generar la carta.");
        return;
      }
      setCartaSubject(data.subject || "");
      setCartaContent(data.content || "");
    } catch {
      setError("Error de red al generar la carta.");
    } finally {
      setCartaBusy(false);
    }
  }

  // Valida la carta y abre la confirmación; el envío real es enviarCarta().
  function pedirEnvioCarta() {
    if (!cartaUnit || !cartaSubject.trim() || !cartaContent.trim()) return;
    setPorEnviarCarta(true);
  }

  async function enviarCarta() {
    if (!cartaUnit || !cartaSubject.trim() || !cartaContent.trim()) return;
    const u = units.find((x) => x.id === cartaUnit);
    setCartaSending(true);
    setError(null);
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
        setError(data.error || "No se pudo enviar la carta.");
        return;
      }
      avisar({ tipo: "ok", titulo: "Carta de cobro enviada por correo.", texto: u?.label });
      setPanel("");
      setCartaSubject("");
      setCartaContent("");
    } catch {
      setError("Error de red al enviar.");
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

  // Atajos desde la tabla y los mayores deudores: abren el formulario ya con la unidad elegida.
  function abrirPago(u: UnitRow) {
    setPanel("pago");
    setPayUnit(u.id);
    setError(null);
    irAlPanel();
  }

  function abrirCarta(u: UnitRow) {
    setPanel("carta");
    setCartaUnit(u.id);
    setCartaSubject("");
    setCartaContent("");
    setError(null);
    irAlPanel();
  }

  // ── Datos derivados ─────────────────────────────────────────────────
  const propiedad = properties.find((p) => p.id === propertyId);
  const aging = computeAgingReport(units);
  const totalOverdue = aging.reduce((s, a) => s + a.amount, 0);
  const morosos = [...units]
    .filter((u) => u.summary.balance > 0 && u.summary.overdueDays > 0)
    .sort((a, b) => b.summary.balance - a.summary.balance)
    .slice(0, 5);
  const cartaU = units.find((x) => x.id === cartaUnit);
  const accionActiva = ACCIONES.find((a) => a.id === panel);

  const columnas: ColumnaTabla<UnitRow>[] = [
    {
      id: "u", titulo: "Unidad", ancho: "minmax(0, 1fr)", principal: true, claseCelda: "ca-uni",
      celda: (u) => (
        <>
          <b>{u.label}</b>
          {u.residentName && <span title={u.residentName}>{u.residentName}</span>}
        </>
      ),
    },
    {
      id: "c", titulo: "Cuota mensual", ancho: "132px", claseCelda: "ca-cel",
      celda: (u) => (
        <>
          <span className="ca-et" aria-hidden="true">Cuota mensual</span>
          <Entrada
            key={`fee-${u.id}-${u.monthlyFee}`}
            aria-label={`Cuota mensual de ${u.label}`}
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
          />
        </>
      ),
    },
    {
      id: "k", titulo: "Coef. %", ancho: "84px", claseCelda: "ca-cel",
      celda: (u) => (
        <>
          <span className="ca-et" aria-hidden="true">Coeficiente %</span>
          <Entrada
            key={`coef-${u.id}-${u.coeficiente}`}
            aria-label={`Coeficiente de ${u.label}`}
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
          />
        </>
      ),
    },
    {
      id: "s", titulo: "Saldo", alinear: "fin", ancho: "minmax(0, 1.3fr)", claseCelda: "k-td-cifra ca-saldo",
      celda: (u) => {
        const b = u.summary.balance;
        return (
          <>
            <span className="ca-et" aria-hidden="true">Saldo</span>
            <b className={b > 0 ? "debe" : b < 0 ? "favor" : "cero"}>{b !== 0 ? fmtCOP(Math.abs(b)) : "—"}</b>
            <small>{u.lastPaymentAt ? `Pagó el ${fechaCorta(u.lastPaymentAt)}` : "Sin pagos"}</small>
          </>
        );
      },
    },
    {
      id: "e", titulo: "Estado", ancho: "minmax(0, 1fr)",
      celda: (u) => (
        <span className="ca-est">
          <span className="ca-et" aria-hidden="true">Estado</span>
          <EstadoUnidad u={u} />
          {u.summary.balance > 0 && u.summary.overdueDays > 0 && <small>{plural(u.summary.overdueDays, "día", "días")}</small>}
        </span>
      ),
    },
    {
      id: "a", titulo: "Acciones", tituloOculto: true, alinear: "fin", ancho: "auto", claseCelda: "k-td-acc",
      celda: (u) => {
        const wa =
          u.summary.balance > 0 && u.phone
            ? waLink(
                u.phone,
                paymentReminderMessage({
                  propertyName: propiedad?.name || "la copropiedad",
                  unitLabel: u.label,
                  balanceText: fmtCOP(u.summary.balance),
                })
              )
            : null;
        const items: ItemMenu[] = [
          { etiqueta: "Estado de cuenta (imprimir o PDF)", href: `/cartera/${u.id}/estado`, nuevaPestana: true, icono: FileText, tono: "blue" },
          wa
            ? { etiqueta: "Recordar el pago por WhatsApp", href: wa, nuevaPestana: true, icono: MessageCircle, tono: "green" }
            : {
                etiqueta: "Recordar el pago por WhatsApp",
                nota: u.summary.balance <= 0 ? "no debe" : "sin teléfono",
                deshabilitado: true,
                icono: MessageCircle,
                tono: "green",
              },
          u.summary.balance > 0
            ? { etiqueta: "Redactar carta de cobro con IA", alElegir: () => abrirCarta(u), icono: Sparkles, tono: "ai" }
            : { etiqueta: "Redactar carta de cobro con IA", nota: "no debe", deshabilitado: true, icono: Sparkles, tono: "ai" },
        ];
        return (
          <AccionesFila>
            <BotonFila icono={HandCoins} tono="green" onClick={() => abrirPago(u)} aria-label={`Registrar pago: ${u.label}`}>
              Registrar pago
            </BotonFila>
            <MenuMas etiquetaAccesible={`Más acciones · ${u.label}`} items={items} />
          </AccionesFila>
        );
      },
    },
  ];

  return (
    <div>
      <style href="k-cartera-local" precedence="default">
        {CSS_CARTERA}
      </style>
      <Header title="Cartera" subtitle="Cuotas, pagos y estados de cuenta por unidad" />
      <Pagina>
        <Pieza>
          <CabeceraPieza titulo="Cartera" subtitulo="Cuotas, pagos y estados de cuenta por unidad" />

          {loading && <Esqueleto variante="completo" filas={4} etiquetaAccesible="Cargando la cartera…" />}

          {!loading && upgrade && (
            <Vacio
              icono={Lock}
              tono="violet"
              titulo="La cartera es una función de los planes Business y Élite"
              texto="Causación mensual de cuotas, registro de pagos, estados de cuenta imprimibles y control de morosidad por unidad."
              acciones={<Boton href="/dashboard/suscripcion">Ver planes</Boton>}
            />
          )}

          {!loading && !upgrade && properties.length === 0 && (
            <Vacio
              titulo="Crea una propiedad primero para gestionar su cartera."
              texto="La cartera se lleva por copropiedad: sus unidades, sus cuotas y sus pagos."
              acciones={<Boton href="/dashboard/propiedades" flecha="crea">Agregar propiedad</Boton>}
            />
          )}

          {!loading && !upgrade && properties.length > 0 && (
            <>
              {/* Contexto: copropiedad */}
              <div className="ca-ctx">
                <PestanasUnidas
                  etiquetaAccesible="Copropiedad"
                  valor={propertyId}
                  alCambiar={setPropertyId}
                  items={properties.map((p) => ({ id: p.id, etiqueta: p.name }))}
                />
              </div>

              {/* ¿Qué quieres hacer? — cada tarea con su icono y su color */}
              <div className="ca-acciones">
                {ACCIONES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="ca-acc"
                    data-h={a.tono}
                    aria-expanded={panel === a.id}
                    aria-controls="ca-panel"
                    onClick={() => alternarPanel(a.id)}
                  >
                    <Loseta icono={a.icono} tono={a.tono} tam={40} />
                    <span className="t">
                      <b>{a.titulo}</b>
                      <small>{a.texto}</small>
                    </span>
                  </button>
                ))}
              </div>

              {/* Formulario de la tarea elegida */}
              {accionActiva && (
                <Panel
                  id="ca-panel"
                  className="ca-panel"
                  nivel={2}
                  icono={accionActiva.icono}
                  tono={accionActiva.tono}
                  titulo={
                    panel === "causar"
                      ? "Causar cuotas de administración"
                      : panel === "pago"
                        ? "Registrar pago recibido"
                        : panel === "cobro"
                          ? "Cobro adicional (extraordinaria u otro)"
                          : panel === "intereses"
                            ? "Liquidar intereses de mora"
                            : "Carta de cobro con IA"
                  }
                  nota={panel === "carta" ? <Etiqueta icono={Coins} tono="green">Metra</Etiqueta> : undefined}
                >
                  {error && (
                    <div className="ca-aviso">
                      <Aviso enLinea tipo="error" titulo={error} alCerrar={() => setError(null)} />
                    </div>
                  )}

                  {/* Causar */}
                  {panel === "causar" && (
                    <>
                      <p className="ca-nota">
                        Crea el cobro mensual para cada unidad con cuota configurada. Es seguro repetirlo: las unidades ya causadas se omiten.
                      </p>
                      <div className="ca-campos">
                        <Campo id="ca-mes" etiqueta="Mes">
                          <Selector id="ca-mes" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                            {MONTHS.map((mn, i) => (
                              <option key={mn} value={i + 1}>{mn}</option>
                            ))}
                          </Selector>
                        </Campo>
                        <Campo id="ca-anio" etiqueta="Año">
                          <Entrada id="ca-anio" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2100} />
                        </Campo>
                        <Campo id="ca-dia" etiqueta="Vence el día" ayuda="Un día del 1 al 28.">
                          <Entrada id="ca-dia" type="number" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} min={1} max={28} />
                        </Campo>
                      </div>
                      <div className="ca-pie">
                        <Boton icono={CalendarPlus} tono="blue" onClick={causar} cargando={busy} textoCargando="Causando…">
                          Causar {MONTHS[month - 1]}
                        </Boton>
                        <Boton variante="secundario" onClick={cerrarPanel}>Cancelar</Boton>
                      </div>
                    </>
                  )}

                  {/* Pago */}
                  {panel === "pago" && (
                    <form onSubmit={registrarPago}>
                      <div className="ca-campos">
                        <Campo id="ca-pago-unidad" etiqueta="Unidad">
                          <Selector id="ca-pago-unidad" value={payUnit} onChange={(e) => setPayUnit(e.target.value)}>
                            <option value="">Selecciona…</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}{u.summary.balance > 0 ? ` — debe ${fmtCOP(u.summary.balance)}` : ""}
                              </option>
                            ))}
                          </Selector>
                        </Campo>
                        <Campo id="ca-pago-monto" etiqueta="Monto (COP)">
                          <Entrada id="ca-pago-monto" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="350.000" inputMode="numeric" />
                        </Campo>
                        <Campo id="ca-pago-metodo" etiqueta="Método">
                          <Selector id="ca-pago-metodo" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                            {Object.entries(METODOS).map(([v, t]) => (
                              <option key={v} value={v}>{t}</option>
                            ))}
                          </Selector>
                        </Campo>
                        <Campo id="ca-pago-fecha" etiqueta="Fecha">
                          <Entrada id="ca-pago-fecha" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                        </Campo>
                        <Campo id="ca-pago-ref" etiqueta="Referencia" opcional className="doble">
                          <Entrada id="ca-pago-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="No. de transacción" maxLength={100} />
                        </Campo>
                      </div>
                      <div className="ca-pie">
                        <Boton type="submit" icono={HandCoins} tono="green" cargando={busy} textoCargando="Registrando…">
                          Registrar pago
                        </Boton>
                        <Boton variante="secundario" onClick={cerrarPanel}>Cancelar</Boton>
                      </div>

                      {payUnit && recentPayments.length > 0 && (
                        <div className="ca-recientes">
                          <h4>Últimos pagos de esta unidad</h4>
                          <ul>
                            {recentPayments.map((p) => (
                              <li key={p.id}>
                                <span className="f">{fechaCompacta(p.receivedAt)}</span>
                                <b>{fmtCOP(p.amount)}</b>
                                <span className="m">{METODOS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                                <BotonIcono
                                  etiquetaAccesible={`Eliminar el pago de ${fmtCOP(p.amount)} del ${fechaLarga(p.receivedAt)}`}
                                  tam={40}
                                  sinBorde
                                  onClick={() => setPorEliminarPago(p)}
                                >
                                  <Trash2 />
                                </BotonIcono>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </form>
                  )}

                  {/* Cobro extra */}
                  {panel === "cobro" && (
                    <form onSubmit={crearCobro}>
                      <div className="ca-campos">
                        <Campo id="ca-cobro-unidad" etiqueta="Unidad">
                          <Selector id="ca-cobro-unidad" value={chUnit} onChange={(e) => setChUnit(e.target.value)}>
                            <option value="">Selecciona…</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>{u.label}</option>
                            ))}
                          </Selector>
                        </Campo>
                        <Campo id="ca-cobro-concepto" etiqueta="Concepto" className="doble">
                          <Entrada id="ca-cobro-concepto" value={chConcept} onChange={(e) => setChConcept(e.target.value)} placeholder="Ej: Cuota extraordinaria fachada" maxLength={200} />
                        </Campo>
                        <Campo id="ca-cobro-monto" etiqueta="Monto (COP)">
                          <Entrada id="ca-cobro-monto" value={chAmount} onChange={(e) => setChAmount(e.target.value)} placeholder="120.000" inputMode="numeric" />
                        </Campo>
                        <Campo id="ca-cobro-tipo" etiqueta="Tipo">
                          <Selector id="ca-cobro-tipo" value={chType} onChange={(e) => setChType(e.target.value)}>
                            <option value="extraordinaria">Extraordinaria</option>
                            <option value="otro">Otro</option>
                          </Selector>
                        </Campo>
                        <Campo id="ca-cobro-vence" etiqueta="Vence">
                          <Entrada id="ca-cobro-vence" type="date" value={chDue} onChange={(e) => setChDue(e.target.value)} />
                        </Campo>
                      </div>
                      <div className="ca-pie">
                        <Boton type="submit" flecha="crea" cargando={busy} textoCargando="Creando…">
                          Crear cobro
                        </Boton>
                        <Boton variante="secundario" onClick={cerrarPanel}>Cancelar</Boton>
                      </div>
                    </form>
                  )}

                  {/* Intereses */}
                  {panel === "intereses" && (
                    <>
                      <div className="ca-aviso">
                        <Aviso
                          enLinea
                          tipo="info"
                          titulo="Tope legal: 1,5 veces el interés bancario corriente, sin exceder la usura (Art. 30, Ley 675)."
                          texto="Consulta la tasa certificada por la Superfinanciera para tu mes. Se crea un cobro de interés por cada unidad con saldo vencido, una sola vez por mes y nunca sobre intereses anteriores."
                        />
                      </div>
                      <div className="ca-campos">
                        <Campo id="ca-int-tasa" etiqueta="Tasa mensual %">
                          <Entrada id="ca-int-tasa" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="2.1" inputMode="decimal" />
                        </Campo>
                        <Campo id="ca-int-mes" etiqueta="Mes">
                          <Selector id="ca-int-mes" value={intMonth} onChange={(e) => setIntMonth(Number(e.target.value))}>
                            {MONTHS.map((mn, i) => (
                              <option key={mn} value={i + 1}>{mn}</option>
                            ))}
                          </Selector>
                        </Campo>
                        <Campo id="ca-int-anio" etiqueta="Año">
                          <Entrada id="ca-int-anio" type="number" value={intYear} onChange={(e) => setIntYear(Number(e.target.value))} min={2020} max={2100} />
                        </Campo>
                      </div>
                      <div className="ca-pie">
                        <Boton icono={Percent} tono="orange" onClick={pedirLiquidacion} cargando={busy} textoCargando="Liquidando…">
                          Liquidar intereses
                        </Boton>
                        <Boton variante="secundario" onClick={cerrarPanel}>Cancelar</Boton>
                      </div>
                    </>
                  )}

                  {/* Carta de cobro (Metra) */}
                  {panel === "carta" && (
                    <>
                      <div className="ca-campos">
                        <Campo id="ca-carta-unidad" etiqueta="Unidad morosa" className="doble">
                          <Selector
                            id="ca-carta-unidad"
                            value={cartaUnit}
                            onChange={(e) => {
                              setCartaUnit(e.target.value);
                              setCartaSubject("");
                              setCartaContent("");
                            }}
                          >
                            <option value="">Selecciona…</option>
                            {units
                              .filter((u) => u.summary.balance > 0)
                              .map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.label} — debe {fmtCOP(u.summary.balance)}
                                  {u.summary.overdueDays > 0 ? ` (${u.summary.overdueDays} d de mora)` : ""}
                                </option>
                              ))}
                          </Selector>
                        </Campo>
                        <Campo id="ca-carta-tono" etiqueta="Tono de la carta">
                          <Selector
                            id="ca-carta-tono"
                            value={cartaTone}
                            onChange={(e) => setCartaTone(e.target.value as typeof cartaTone)}
                          >
                            <option value="recordatorio">Recordatorio amable (1er aviso)</option>
                            <option value="persuasivo">Cobro persuasivo (2do aviso)</option>
                            <option value="prejuridico">Prejurídico (último aviso)</option>
                          </Selector>
                        </Campo>
                      </div>
                      <div className="ca-pie">
                        <Boton
                          icono={Sparkles}
                          tono="ai"
                          onClick={generarCarta}
                          disabled={!cartaUnit}
                          cargando={cartaBusy}
                          textoCargando="Redactando con los datos de la deuda…"
                        >
                          Redactar carta
                        </Boton>
                        <Boton variante="secundario" onClick={cerrarPanel}>Cancelar</Boton>
                      </div>

                      {cartaContent && (
                        <div className="ca-carta">
                          <div className="ca-campos">
                            <Campo id="ca-carta-asunto" etiqueta="Asunto" className="todo">
                              <Entrada id="ca-carta-asunto" value={cartaSubject} onChange={(e) => setCartaSubject(e.target.value)} maxLength={150} />
                            </Campo>
                            <Campo id="ca-carta-texto" etiqueta="Carta" ayuda="Edítala si lo necesitas." className="todo">
                              <AreaTexto
                                id="ca-carta-texto"
                                value={cartaContent}
                                onChange={(e) => setCartaContent(e.target.value)}
                                rows={12}
                                maxLength={10000}
                              />
                            </Campo>
                          </div>
                          <div className="ca-pie">
                            <Boton
                              onClick={pedirEnvioCarta}
                              disabled={!cartaU?.email}
                              cargando={cartaSending}
                              textoCargando="Enviando…"
                            >
                              Enviar por correo
                            </Boton>
                            <Boton
                              variante="secundario"
                              icono={cartaCopied ? Check : Copy}
                              tono={cartaCopied ? "green" : "slate"}
                              onClick={copiarCarta}
                            >
                              {cartaCopied ? "Copiado" : "Copiar texto"}
                            </Boton>
                            {!cartaU?.email && (
                              <span className="ca-sincorreo">
                                <Estado tipo="falta" tamLetra={14}>La unidad no tiene correo</Estado>
                                Copia el texto para enviarlo por otro medio.
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </Panel>
              )}

              {/* Cifras clave */}
              {kpis && (
                <div style={{ marginBottom: 24 }}>
                  <Kpis className="ca-kpis">
                    <Kpi
                      icono={Wallet}
                      tono={kpis.totalOwed > 0 ? "amber" : "green"}
                      cifra={fmtCOP(kpis.totalOwed)}
                      tamLetra={32}
                      etiqueta="Cartera pendiente"
                      variacion={kpis.totalOwed > 0 ? "por recaudar" : "todo recaudado"}
                    />
                    <Kpi
                      icono={Users}
                      tono={kpis.overdueUnits > 0 ? "red" : "green"}
                      cifra={`${kpis.overdueUnits}`}
                      unidad={`de ${kpis.unitsCount}`}
                      tamLetra={32}
                      alerta={kpis.overdueUnits > 0}
                      etiqueta="Unidades en mora"
                      variacion={kpis.overdueUnits > 0 ? "requieren gestión" : "ninguna en mora"}
                      malo={kpis.overdueUnits > 0}
                    />
                    <Kpi
                      icono={HandCoins}
                      tono={kpis.collectedThisMonth > 0 ? "green" : "slate"}
                      cifra={fmtCOP(kpis.collectedThisMonth)}
                      tamLetra={32}
                      etiqueta="Recaudado este mes"
                      variacion="pagos registrados"
                    />
                    <Kpi
                      icono={Receipt}
                      tono={kpis.chargedThisMonth > 0 ? "blue" : "slate"}
                      cifra={fmtCOP(kpis.chargedThisMonth)}
                      tamLetra={32}
                      etiqueta="Causado este mes"
                      variacion="cuotas emitidas"
                    />
                  </Kpis>
                </div>
              )}

              {/* Cartera por edades + mayores deudores */}
              {totalOverdue > 0 && (
                <div className="ca-edades">
                  <Panel titulo="Cartera por edades" nota={`${fmtCOP(totalOverdue)} en mora`} icono={Hourglass} tono="orange" nivel={2}>
                    <div
                      className="ca-edades-barra"
                      role="img"
                      aria-label={`Cartera en mora por antigüedad: ${aging.filter((a) => a.amount > 0).map((a) => `${a.label} ${fmtCOP(a.amount)}`).join(", ")}`}
                    >
                      {aging.map((a) =>
                        a.amount > 0 ? (
                          <i
                            key={a.bucket}
                            data-h={TONO_EDAD[a.bucket]}
                            style={{ width: `${(a.amount / totalOverdue) * 100}%` }}
                            title={`${a.label}: ${fmtCOP(a.amount)}`}
                          />
                        ) : null
                      )}
                    </div>
                    <ul className="ca-leyenda">
                      {aging.map((a) => (
                        <li key={a.bucket} data-h={TONO_EDAD[a.bucket]} className={unir(a.amount <= 0 && "cero")}>
                          <span className="r"><i />{a.label}</span>
                          <b>{fmtCOP(a.amount)}</b>
                          <small>{plural(a.count, "unidad", "unidades")}</small>
                        </li>
                      ))}
                    </ul>

                    {morosos.length > 0 && (
                      <>
                        <h3 className="ca-deudores-t">
                          <Loseta icono={Users} tono="red" tam={28} />
                          Mayores deudores
                        </h3>
                        <ul className="ca-deudores">
                          {morosos.map((u) => (
                            <li key={u.id}>
                              <div className="n">
                                <b>{u.label}</b>
                                {u.residentName && <span>{u.residentName}</span>}
                              </div>
                              <span className="m">{fmtCOP(u.summary.balance)}</span>
                              <span className="d">{plural(u.summary.overdueDays, "día", "días")}</span>
                              <BotonFila icono={Sparkles} tono="ai" onClick={() => abrirCarta(u)} aria-label={`Redactar carta de cobro para ${u.label}`}>
                                Redactar carta
                              </BotonFila>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </Panel>
                </div>
              )}

              {/* Unidades */}
              {units.length === 0 ? (
                <Vacio
                  icono={Users}
                  tono="sky"
                  titulo="Esta propiedad aún no tiene unidades"
                  texto="Importa tu listado desde un archivo y la IA lo organiza, o agrégalas a mano. Puedes incluir cuota y coeficiente en la misma línea."
                  acciones={<Boton href="/dashboard/residentes" flecha="crea">Agregar unidades</Boton>}
                />
              ) : (
                <Seccion
                  id="ca-unidades"
                  titulo="Cuenta de cada unidad"
                  nota={`${plural(units.length, "unidad", "unidades")} · edita la cuota y el coeficiente directamente`}
                  icono={Users}
                  tono="sky"
                >
                  <div className="ca-tabla-env">
                    <Tabla
                      etiquetaAccesible={`Cartera de ${propiedad?.name ?? "la copropiedad"}`}
                      filas={units}
                      claveFila={(u) => u.id}
                      columnas={columnas}
                      filaConError={(u) => u.summary.overdueDays > 30 && u.summary.balance > 0}
                      alta
                    />
                  </div>
                </Seccion>
              )}
            </>
          )}
        </Pieza>
      </Pagina>

      {/* ¿Eliminar este pago? */}
      <Modal
        abierto={!!porEliminarPago}
        alCerrar={() => setPorEliminarPago(null)}
        titulo="¿Eliminar este pago?"
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorEliminarPago(null)}>Cancelar</Boton>
            <Boton
              variante="peligro"
              lleno
              onClick={() => {
                const p = porEliminarPago;
                setPorEliminarPago(null);
                if (p) void eliminarPago(p.id);
              }}
            >
              Eliminar pago
            </Boton>
          </>
        }
      >
        {porEliminarPago && (
          <p>
            El pago de {fmtCOP(porEliminarPago.amount)} del {fechaLarga(porEliminarPago.receivedAt)} dejará de contarse y se revertirá su aplicación a los cobros.
          </p>
        )}
      </Modal>

      {/* ¿Liquidar intereses? */}
      <Modal
        abierto={porLiquidar !== null}
        alCerrar={() => setPorLiquidar(null)}
        titulo={`¿Liquidar intereses de ${MONTHS[intMonth - 1]} ${intYear}?`}
        icono={Percent}
        tono="orange"
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorLiquidar(null)}>Cancelar</Boton>
            <Boton
              icono={Percent}
              tono="orange"
              onClick={() => {
                const pct = porLiquidar;
                setPorLiquidar(null);
                if (pct !== null) void liquidarIntereses(pct);
              }}
            >
              Liquidar intereses
            </Boton>
          </>
        }
      >
        <p>
          Se cobrará el {porLiquidar}% mensual sobre los saldos en mora. Se creará un cobro de interés por cada unidad morosa, una sola vez por mes.
        </p>
      </Modal>

      {/* ¿Enviar la carta? */}
      <Modal
        abierto={porEnviarCarta}
        alCerrar={() => setPorEnviarCarta(false)}
        titulo={`¿Enviar esta carta a ${cartaU?.label || "la unidad"}?`}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorEnviarCarta(false)}>Cancelar</Boton>
            <Boton
              onClick={() => {
                setPorEnviarCarta(false);
                void enviarCarta();
              }}
            >
              Enviar carta
            </Boton>
          </>
        }
      >
        <p>
          Saldrá por correo{cartaU?.email ? ` a ${cartaU.email}` : ""}. Revísala antes: un correo enviado no se puede deshacer.
        </p>
      </Modal>
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
