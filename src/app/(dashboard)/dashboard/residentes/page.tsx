"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
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

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
      }
    } catch {
      /* keep */
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
              <div className="rounded-2xl p-10 text-center" style={card}>
                <Users className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
                <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                  Esta propiedad aún no tiene unidades
                </p>
                <p className="text-[12.5px] mb-4" style={{ color: "rgba(246,245,247,0.40)" }}>
                  Agrégalas en Comunicados → Destinatarios o en Cartera.
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
