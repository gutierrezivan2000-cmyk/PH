"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { UnitImport } from "@/components/dashboard/UnitImport";
import { waLink, portalLinkMessage } from "@/lib/whatsapp";
import {
  Users,
  Loader2,
  Link2,
  RefreshCw,
  Send,
  CheckCircle2,
  ExternalLink,
  ArrowUpRight,
  Ban,
  QrCode,
  Mail,
  MessageCircle,
  Save,
  CreditCard,
  ChevronDown,
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
  portalToken: string | null;
}

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

export default function ResidentesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [waDirty, setWaDirty] = useState(false);
  const [waSaving, setWaSaving] = useState(false);

  // ePayco config (account-level, applies to all properties)
  const [showPay, setShowPay] = useState(false);
  const [payConfigured, setPayConfigured] = useState(false);
  const [payPublicKey, setPayPublicKey] = useState("");
  const [payCustId, setPayCustId] = useState("");
  const [payKey, setPayKey] = useState("");
  const [payTest, setPayTest] = useState(true);
  const [paySaving, setPaySaving] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/pagos/config")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setPayConfigured(!!d.configured);
          setPayPublicKey(d.publicKey || "");
          setPayCustId(d.pCustId || "");
          setPayKey(d.pKeyMasked || "");
          setPayTest(d.test !== false);
        }
      })
      .catch(() => {});
  }, []);

  async function savePayConfig() {
    setPaySaving(true);
    try {
      const res = await fetch("/api/pagos/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: payPublicKey, pCustId: payCustId, pKey: payKey, test: payTest }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Pago en línea configurado. Los residentes con saldo ya pueden pagar desde su portal." });
        setPayConfigured(!!(payPublicKey && payCustId && (payKey && !payKey.includes("•") || payConfigured)));
        setShowPay(false);
      } else {
        setMsg({ ok: false, text: "No se pudo guardar la configuración de pago." });
      }
    } finally {
      setPaySaving(false);
    }
  }

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/portal/tokens?propertyId=${pid}`);
      const data = await res.json();
      if (res.status === 403 && data.code === "plan_upgrade") {
        setUpgrade(true);
        return;
      }
      if (res.ok) {
        setUpgrade(false);
        setUnits(data.units || []);
        setWhatsapp(data.whatsapp || "");
        setWaDirty(false);
      }
    } catch {
      /* keep */
    }
  }, []);

  async function saveWhatsapp() {
    setWaSaving(true);
    try {
      const res = await fetch("/api/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: propertyId, whatsapp }),
      });
      if (res.ok) {
        setWaDirty(false);
        setMsg({ ok: true, text: "Número de WhatsApp guardado. Ya aparece en el portal de tus residentes." });
      } else {
        setMsg({ ok: false, text: "No se pudo guardar el número." });
      }
    } finally {
      setWaSaving(false);
    }
  }

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
      load(propertyId);
    }
  }, [propertyId, load]);

  const withToken = units.filter((u) => u.portalToken).length;
  const withEmail = units.filter((u) => u.email).length;
  const missingToken = units.filter((u) => !u.portalToken).length;

  async function generateAll() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudieron generar." });
        return;
      }
      setMsg({ ok: true, text: `${data.created} ${data.created === 1 ? "enlace generado" : "enlaces generados"}.` });
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function rotate(unitId: string) {
    if (!window.confirm("¿Generar un enlace nuevo? El enlace anterior dejará de funcionar de inmediato.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/portal/tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, action: "rotate" }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Enlace regenerado." });
        await load(propertyId);
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(unitId: string) {
    if (!window.confirm("¿Desactivar el portal de esta unidad? El residente perderá el acceso.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/portal/tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, action: "revoke" }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Portal desactivado." });
        await load(propertyId);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendAll() {
    if (!window.confirm(`¿Enviar el enlace del portal por correo a las ${withEmail} unidades con correo? Consumirá parte de tu cuota mensual de correos.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo enviar." });
        return;
      }
      setMsg({ ok: true, text: `Enlace enviado a ${data.sent} ${data.sent === 1 ? "residente" : "residentes"}.` });
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function sendOne(unitId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, unitId }),
      });
      const data = await res.json();
      setMsg(res.ok ? { ok: true, text: "Enlace enviado por correo." } : { ok: false, text: data.error || "No se pudo enviar." });
      if (res.ok) await load(propertyId);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(u: UnitRow) {
    if (!u.portalToken) return;
    try {
      await navigator.clipboard.writeText(`${origin}/u/${u.portalToken}`);
      setCopied(u.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div>
      <Header title="Residentes" subtitle="Portal por unidad — sin usuarios ni contraseñas" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-4xl mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {!loading && upgrade && (
          <div className="rounded-2xl p-8 text-center" style={{ ...card, borderColor: "rgba(124,92,255,0.30)" }}>
            <Users className="h-9 w-9 mx-auto mb-3" style={{ color: "#a78bff" }} />
            <p className="text-[16px] font-semibold mb-2" style={{ color: "#f6f5f7" }}>
              El portal de residentes es una función de los planes Business y Élite
            </p>
            <p className="text-[13px] mb-5 max-w-md mx-auto leading-relaxed" style={{ color: "rgba(246,245,247,0.55)" }}>
              Cada unidad recibe un enlace privado para ver su estado de cuenta, los comunicados y
              los documentos — sin registro ni contraseñas.
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
            <Users className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
            <p className="text-[14px]" style={{ color: "rgba(246,245,247,0.70)" }}>
              Crea una propiedad primero para activar el portal de residentes.
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

            {/* How it works */}
            <div
              className="rounded-2xl p-4 flex items-start gap-3"
              style={{ background: "rgba(95,180,255,0.06)", border: "1px solid rgba(95,180,255,0.20)" }}
            >
              <QrCode className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#5fb4ff" }} />
              <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(246,245,247,0.70)" }}>
                Cada unidad tiene un <strong>enlace privado</strong> (sin cuenta ni contraseña) donde el
                residente ve su estado de cuenta, comunicados y documentos. Genera los enlaces, compártelos
                por correo o WhatsApp, y rótalos si alguno se filtra.
              </p>
            </div>

            {/* WhatsApp de la administración */}
            <div className="rounded-2xl p-4" style={card}>
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-4 w-4" style={{ color: "#25D366" }} />
                <span className="text-[13px] font-medium" style={{ color: "#f6f5f7" }}>WhatsApp de la administración</span>
              </div>
              <p className="text-[12px] mb-3 leading-relaxed" style={{ color: "rgba(246,245,247,0.50)" }}>
                Aparece en el portal como botón <strong>&quot;Escríbenos por WhatsApp&quot;</strong>. Cuando un
                residente lo usa, el mensaje te llega <strong>ya identificado con su unidad</strong> — sabes
                de inmediato quién escribe.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={whatsapp}
                  onChange={(e) => { setWhatsapp(e.target.value); setWaDirty(true); }}
                  placeholder="Ej: 300 123 4567"
                  inputMode="tel"
                  className="h-10 px-3 rounded-lg text-[13px]"
                  style={{ background: "#0f0f13", border: "1px solid rgba(255,255,255,0.10)", color: "#f6f5f7", outline: "none", width: 200 }}
                />
                <button
                  onClick={saveWhatsapp}
                  disabled={waSaving || !waDirty}
                  className="inline-flex items-center gap-2 rounded-full text-white text-[12.5px] font-medium px-4 py-2 transition-all disabled:opacity-40 cursor-pointer"
                  style={{ background: "#25D366" }}
                >
                  {waSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar
                </button>
              </div>
            </div>

            {/* Pago en línea (ePayco) */}
            <div className="rounded-2xl" style={card}>
              <button onClick={() => setShowPay((v) => !v)} className="w-full flex items-center gap-3 p-4 cursor-pointer">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(95,180,255,0.10)" }}>
                  <CreditCard className="h-4 w-4" style={{ color: "#5fb4ff" }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[13.5px] font-medium" style={{ color: "#f6f5f7" }}>Pago en línea (ePayco)</p>
                  <p className="text-[11.5px]" style={{ color: payConfigured ? "#4cd6a0" : "rgba(246,245,247,0.45)" }}>
                    {payConfigured ? "Configurado — los residentes con saldo pueden pagar desde su portal" : "Sin configurar — conéctalo para recibir pagos en línea"}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "rgba(246,245,247,0.35)", transform: showPay ? "rotate(180deg)" : "none" }} />
              </button>
              {showPay && (
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[12px] leading-relaxed" style={{ color: "rgba(246,245,247,0.55)" }}>
                    Ingresa las llaves de <strong>tu propia cuenta ePayco</strong>. Los pagos de los
                    residentes llegan <strong>directo a tu cuenta</strong> — SOPH.IA solo concilia contra
                    la cartera y nunca retiene el dinero. Encuentra estas llaves en tu panel de ePayco →
                    Configuración → Llaves.
                  </p>
                  {[
                    { label: "Public Key", val: payPublicKey, set: setPayPublicKey, ph: "pub_test_..." },
                    { label: "P_CUST_ID_CLIENTE", val: payCustId, set: setPayCustId, ph: "123456" },
                    { label: "P_KEY", val: payKey, set: setPayKey, ph: "••••" },
                  ].map((f) => (
                    <div key={f.label}>
                      <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">{f.label}</label>
                      <input
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        placeholder={f.ph}
                        className="w-full h-10 px-3 rounded-lg text-[13px]"
                        style={{ background: "#0f0f13", border: "1px solid rgba(255,255,255,0.10)", color: "#f6f5f7", outline: "none", fontFamily: "var(--font-mono)" }}
                      />
                    </div>
                  ))}
                  <label className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: "rgba(246,245,247,0.60)" }}>
                    <input type="checkbox" checked={payTest} onChange={(e) => setPayTest(e.target.checked)} />
                    Modo de pruebas (desactívalo cuando estés listo para cobrar de verdad)
                  </label>
                  <button
                    onClick={savePayConfig}
                    disabled={paySaving}
                    className="inline-flex items-center gap-2 rounded-full text-white text-[12.5px] font-medium px-4 py-2 transition-all disabled:opacity-50 cursor-pointer"
                    style={{ background: "#5fb4ff" }}
                  >
                    {paySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Guardar configuración de pago
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              {missingToken > 0 && (
                <button
                  onClick={generateAll}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-50 cursor-pointer"
                  style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Generar {missingToken} {missingToken === 1 ? "enlace" : "enlaces"}
                </button>
              )}
              {withToken > 0 && withEmail > 0 && (
                <button
                  onClick={sendAll}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-50 cursor-pointer"
                  style={{ background: "rgba(76,214,160,0.14)", color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.35)" }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar a todos por correo ({withEmail})
                </button>
              )}
              <span style={{ ...monoMini, color: "rgba(246,245,247,0.40)" }}>
                {withToken}/{units.length} con enlace · {withEmail} con correo
              </span>
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

            {/* Units */}
            {units.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={card}>
                <Users className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
                <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                  Esta propiedad aún no tiene unidades
                </p>
                <p className="text-[12.5px] mb-4" style={{ color: "rgba(246,245,247,0.40)" }}>
                  Importa tu listado desde un archivo (Excel, PDF…) y la IA lo organiza, o agrégalas a mano.
                </p>
                <div className="flex justify-center mb-3">
                  <UnitImport propertyId={propertyId} onImported={(n) => { setMsg({ ok: true, text: `${n} ${n === 1 ? "unidad importada" : "unidades importadas"}.` }); load(propertyId); }} />
                </div>
                <Link
                  href="/dashboard/comunicados"
                  className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2"
                  style={{ background: "rgba(124,92,255,0.15)", color: "#a78bff", border: "1px solid rgba(124,92,255,0.40)" }}
                >
                  Agregar a mano
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={card}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["Unidad", "Correo", "Portal", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left whitespace-nowrap" style={{ ...monoLabel, color: "rgba(246,245,247,0.40)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td className="px-4 py-3">
                            <p className="text-[13px] font-medium" style={{ color: "#f6f5f7" }}>{u.label}</p>
                            {u.residentName && <p className="text-[11px]" style={{ color: "rgba(246,245,247,0.40)" }}>{u.residentName}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[12px]" style={{ color: u.email ? "rgba(246,245,247,0.65)" : "rgba(246,245,247,0.30)", fontFamily: "var(--font-mono)" }}>
                              {u.email || "sin correo"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.portalToken ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px]" style={{ ...monoMini, background: "rgba(76,214,160,0.10)", color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.30)" }}>
                                <CheckCircle2 className="h-3 w-3" /> Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10.5px]" style={{ ...monoMini, background: "rgba(255,255,255,0.05)", color: "rgba(246,245,247,0.45)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                Sin generar
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {u.portalToken ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => copyLink(u)} className="p-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06]" style={{ color: copied === u.id ? "#4cd6a0" : "rgba(246,245,247,0.55)" }} title="Copiar enlace">
                                  {copied === u.id ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                </button>
                                <a href={`/u/${u.portalToken}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: "rgba(246,245,247,0.55)" }} title="Abrir portal">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                                {u.email && (
                                  <button onClick={() => sendOne(u.id)} disabled={busy} className="p-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06]" style={{ color: "#a78bff" }} title="Enviar por correo">
                                    <Mail className="h-4 w-4" />
                                  </button>
                                )}
                                {(() => {
                                  const href = u.phone
                                    ? waLink(u.phone, portalLinkMessage({ propertyName: properties.find((p) => p.id === propertyId)?.name || "la copropiedad", unitLabel: u.label, portalUrl: `${origin}/u/${u.portalToken}` }))
                                    : null;
                                  return href ? (
                                    <a href={href} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: "#25D366" }} title="Enviar enlace por WhatsApp">
                                      <MessageCircle className="h-4 w-4" />
                                    </a>
                                  ) : null;
                                })()}
                                <button onClick={() => rotate(u.id)} disabled={busy} className="p-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06]" style={{ color: "rgba(246,245,247,0.45)" }} title="Regenerar enlace">
                                  <RefreshCw className="h-4 w-4" />
                                </button>
                                <button onClick={() => revoke(u.id)} disabled={busy} className="p-1.5 rounded-lg cursor-pointer hover:bg-white/[0.06]" style={{ color: "rgba(255,133,133,0.6)" }} title="Desactivar portal">
                                  <Ban className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={async () => {
                                  setBusy(true);
                                  await fetch("/api/portal/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, unitId: u.id }) }).catch(() => {});
                                  await load(propertyId);
                                  setBusy(false);
                                }}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] px-3 py-1.5 cursor-pointer transition-colors hover:bg-white/[0.06]"
                                style={{ color: "#a78bff", border: "1px solid rgba(124,92,255,0.35)" }}
                              >
                                <Link2 className="h-3 w-3" /> Generar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
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
