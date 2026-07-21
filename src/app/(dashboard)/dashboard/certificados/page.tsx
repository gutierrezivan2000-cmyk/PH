"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import {
  BadgeCheck,
  Loader2,
  Plus,
  Printer,
  Link2,
  Ban,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  label: string;
  residentName: string | null;
}

interface Certificate {
  id: string;
  type: string;
  recipientName: string;
  unitLabel: string;
  status: string;
  verifyCode: string;
  createdAt: string;
  property?: { name: string };
}

const TYPE_LABELS: Record<string, string> = {
  paz_y_salvo: "Paz y Salvo",
  residencia: "Residencia",
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

function endOfMonthIso(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CertificadosPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"paz_y_salvo" | "residencia">("paz_y_salvo");
  const [unitId, setUnitId] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientDocument, setRecipientDocument] = useState("");
  const [validUntil, setValidUntil] = useState(endOfMonthIso());
  const [residesSince, setResidesSince] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const loadCerts = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/certificates${pid ? `?propertyId=${pid}` : ""}`);
      const data = await res.json();
      if (res.ok) setCerts(data.certificates || []);
    } catch {
      // keep
    }
  }, []);

  const loadUnits = useCallback(async (pid: string) => {
    if (!pid) return;
    try {
      const res = await fetch(`/api/properties/${pid}/units`);
      const data = await res.json();
      setUnits(Array.isArray(data) ? data : []);
    } catch {
      setUnits([]);
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
      // Reset per-property form state so a stale unit from the previous
      // property can never leak into a certificate for the new one.
      setUnitId("");
      setUnitLabel("");
      setIssuedId(null);
      setNotice("");
      loadCerts(propertyId);
      loadUnits(propertyId);
    }
  }, [propertyId, loadCerts, loadUnits]);

  async function createCert(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    setIssuedId(null);
    if (!recipientName.trim() || (!unitId && !unitLabel.trim())) {
      setFormError("Indica la unidad y el nombre del titular.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          type,
          unitId: unitId || undefined,
          // When a directory unit is selected, never send the free-text label —
          // the server resolves the label from the unit itself.
          unitLabel: unitId ? undefined : unitLabel.trim() || undefined,
          recipientName,
          recipientDocument: recipientDocument.trim() || undefined,
          validUntil: type === "paz_y_salvo" ? validUntil || undefined : undefined,
          residesSince: type === "residencia" ? residesSince.trim() || undefined : undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "No se pudo expedir el certificado.");
        return;
      }
      // Open the print view as close to the click as possible — popup blockers
      // (Safari especially) may still block it, so keep a fallback link.
      let opened = false;
      if (data.id) {
        opened = !!window.open(`/certificados/${data.id}/imprimir`, "_blank");
      }
      setRecipientName("");
      setRecipientDocument("");
      setNote("");
      setResidesSince("");
      setUnitId("");
      setUnitLabel("");
      setValidUntil(endOfMonthIso());
      setShowForm(false);
      if (data.demo) {
        setNotice("Modo demo: el certificado se generó pero no se guarda ni se imprime en la demo.");
      } else if (data.id && !opened) {
        setIssuedId(data.id);
      }
      await loadCerts(propertyId);
    } catch {
      setFormError("Error de red. Intenta de nuevo.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleRevoke(cert: Certificate) {
    // Revoking flips the public verification page to "REVOCADO" instantly —
    // confirm the destructive direction.
    if (
      cert.status === "valid" &&
      !window.confirm(
        `¿Revocar el certificado de ${cert.recipientName} (${cert.unitLabel})? El enlace público de verificación mostrará "Documento REVOCADO".`
      )
    ) {
      return;
    }
    setActionError("");
    setBusyId(cert.id);
    try {
      const res = await fetch("/api/certificates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cert.id,
          action: cert.status === "valid" ? "revoke" : "restore",
        }),
      });
      if (res.ok) {
        await loadCerts(propertyId);
      } else {
        setActionError("No se pudo actualizar el certificado. Intenta de nuevo.");
      }
    } catch {
      setActionError("Error de red. Intenta de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyVerifyLink(cert: Certificate) {
    const url = `${window.location.origin}/verificar/${cert.verifyCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(cert.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div>
      <Header
        title="Certificados"
        subtitle="Paz y salvos y constancias con verificación QR"
      />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {!loading && properties.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={card}>
            <BadgeCheck className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
            <p className="text-[14px]" style={{ color: "rgba(246,245,247,0.70)" }}>
              Crea una propiedad primero para expedir certificados.
            </p>
          </div>
        )}

        {!loading && properties.length > 0 && (
          <>
            {/* Property + new */}
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
              <button
                onClick={() => setShowForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-2 transition-all cursor-pointer"
                style={{
                  background: showForm ? "rgba(255,255,255,0.06)" : "#7c5cff",
                  color: showForm ? "rgba(246,245,247,0.70)" : "#fff",
                }}
              >
                <Plus
                  className="h-3.5 w-3.5 transition-transform"
                  style={{ transform: showForm ? "rotate(45deg)" : "none" }}
                />
                {showForm ? "Cancelar" : "Expedir certificado"}
              </button>
            </div>

            {/* Issue form */}
            {showForm && (
              <form onSubmit={createCert} className="rounded-2xl p-5 space-y-4" style={card}>
                <div className="flex gap-2">
                  {(["paz_y_salvo", "residencia"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className="flex-1 px-3 py-2.5 rounded-xl text-[12.5px] font-medium transition-all cursor-pointer"
                      style={{
                        border: `1px solid ${type === t ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                        background: type === t ? "rgba(124,92,255,0.15)" : "transparent",
                        color: type === t ? "#a78bff" : "rgba(246,245,247,0.55)",
                      }}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Unidad
                    </label>
                    {units.length > 0 ? (
                      <div className="relative">
                        <select
                          value={unitId}
                          onChange={(e) => {
                            const v = e.target.value;
                            setUnitId(v);
                            // Clear any stale free-text label so it can never
                            // override the selected directory unit.
                            if (v) setUnitLabel("");
                          }}
                          style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}
                        >
                          <option value="" style={{ background: "#15151a" }}>
                            Escribir manualmente…
                          </option>
                          {units.map((u) => (
                            <option key={u.id} value={u.id} style={{ background: "#15151a" }}>
                              {u.label}
                              {u.residentName ? ` — ${u.residentName}` : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5"
                          style={{ color: "rgba(246,245,247,0.42)" }}
                        />
                      </div>
                    ) : null}
                    {(!unitId || units.length === 0) && (
                      <input
                        value={unitLabel}
                        onChange={(e) => setUnitLabel(e.target.value)}
                        placeholder="Ej: Apto 502"
                        style={{ ...inputStyle, marginTop: units.length > 0 ? 8 : 0 }}
                        maxLength={60}
                      />
                    )}
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Titular
                    </label>
                    <input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Nombre completo"
                      style={inputStyle}
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Documento (opcional)
                    </label>
                    <input
                      value={recipientDocument}
                      onChange={(e) => setRecipientDocument(e.target.value)}
                      placeholder="C.C. 1.234.567.890"
                      style={inputStyle}
                      maxLength={30}
                    />
                  </div>
                  {type === "paz_y_salvo" ? (
                    <div>
                      <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                        A paz y salvo hasta
                      </label>
                      <input
                        type="date"
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                        style={{ ...inputStyle, colorScheme: "dark" }}
                      />
                    </div>
                  ) : (
                    <div>
                      <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                        Reside desde (opcional)
                      </label>
                      <input
                        value={residesSince}
                        onChange={(e) => setResidesSince(e.target.value)}
                        placeholder="Ej: enero de 2023"
                        style={inputStyle}
                        maxLength={100}
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Nota adicional (opcional)
                    </label>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Texto adicional que aparecerá en el documento"
                      style={inputStyle}
                      maxLength={600}
                    />
                  </div>
                </div>

                {formError && (
                  <p className="text-[12px]" style={{ color: "#ff8585" }}>
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-full text-white text-[13px] font-medium px-5 py-2.5 transition-all disabled:opacity-50 cursor-pointer"
                  style={{ background: "#7c5cff", boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)" }}
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                  {creating ? "Expidiendo…" : "Expedir y abrir para imprimir"}
                </button>
              </form>
            )}

            {/* Post-issue notices */}
            {notice && (
              <p
                className="text-[12.5px] rounded-xl p-3"
                style={{
                  background: "rgba(255,185,88,0.10)",
                  color: "#ffb958",
                  border: "1px solid rgba(255,185,88,0.30)",
                }}
              >
                {notice}
              </p>
            )}
            {issuedId && (
              <div
                className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                style={{
                  background: "rgba(76,214,160,0.08)",
                  border: "1px solid rgba(76,214,160,0.30)",
                }}
              >
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#4cd6a0" }} />
                <span className="text-[12.5px] flex-1" style={{ color: "#4cd6a0" }}>
                  Certificado expedido correctamente.
                </span>
                <a
                  href={`/certificados/${issuedId}/imprimir`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium px-4 py-1.5"
                  style={{ background: "#4cd6a0", color: "#0a0a0a" }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Abrir para imprimir
                </a>
              </div>
            )}
            {actionError && (
              <p className="text-[12px]" style={{ color: "#ff8585" }}>
                {actionError}
              </p>
            )}

            {/* List */}
            {certs.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={card}>
                <BadgeCheck className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
                <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                  Aún no has expedido certificados en esta propiedad
                </p>
                <p className="text-[12.5px]" style={{ color: "rgba(246,245,247,0.40)" }}>
                  Cada certificado incluye un código QR público de verificación anti-fraude.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {certs.map((c) => {
                  const revoked = c.status !== "valid";
                  return (
                    <div key={c.id} className="rounded-xl p-4 flex flex-wrap items-center gap-3" style={card}>
                      <span
                        className="px-2.5 py-1 rounded-lg text-[10px] flex-shrink-0"
                        style={{
                          ...monoLabel,
                          fontSize: 9.5,
                          background: c.type === "paz_y_salvo" ? "rgba(76,214,160,0.10)" : "rgba(95,180,255,0.10)",
                          color: c.type === "paz_y_salvo" ? "#4cd6a0" : "#5fb4ff",
                          border: `1px solid ${c.type === "paz_y_salvo" ? "rgba(76,214,160,0.30)" : "rgba(95,180,255,0.30)"}`,
                        }}
                      >
                        {TYPE_LABELS[c.type] || c.type}
                      </span>
                      <div className="flex-1 min-w-[160px]">
                        <p
                          className="text-[13.5px] font-medium"
                          style={{
                            color: revoked ? "rgba(246,245,247,0.40)" : "#f6f5f7",
                            textDecoration: revoked ? "line-through" : "none",
                          }}
                        >
                          {c.unitLabel} · {c.recipientName}
                        </p>
                        <p style={{ ...monoMini, color: "rgba(246,245,247,0.38)" }}>
                          {new Date(c.createdAt).toLocaleDateString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {" · "}
                          {c.verifyCode}
                          {revoked && (
                            <span style={{ color: "#ff8585" }}> · REVOCADO</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a
                          href={`/certificados/${c.id}/imprimir`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg transition-colors hover:bg-white/[0.06]"
                          style={{ color: "rgba(246,245,247,0.55)" }}
                          title="Imprimir / PDF"
                        >
                          <Printer className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => copyVerifyLink(c)}
                          className="p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.06]"
                          style={{ color: copied === c.id ? "#4cd6a0" : "rgba(246,245,247,0.55)" }}
                          title="Copiar enlace de verificación"
                        >
                          {copied === c.id ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => toggleRevoke(c)}
                          disabled={busyId === c.id}
                          className="p-2 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.06]"
                          style={{ color: revoked ? "#4cd6a0" : "#ff8585" }}
                          title={revoked ? "Restaurar" : "Revocar"}
                        >
                          {busyId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : revoked ? (
                            <RotateCcw className="h-4 w-4" />
                          ) : (
                            <Ban className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
