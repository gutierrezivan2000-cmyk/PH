"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { addBusinessDays } from "@/lib/compliance";
import {
  Gavel,
  Loader2,
  Plus,
  Printer,
  Send,
  CheckCircle2,
  Ban,
  RotateCcw,
  FileCheck2,
  AlertTriangle,
  ChevronDown,
  MailCheck,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface Assembly {
  id: string;
  type: string;
  date: string;
  modality: string;
  location: string | null;
  agenda: string[];
  status: string;
  convokedAt: string | null;
  actaReadyAt: string | null;
  property?: { name: string };
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

const DEFAULT_AGENDA_ORD = [
  "Verificación del quórum",
  "Elección de presidente y secretario de la asamblea",
  "Lectura y aprobación del orden del día",
  "Informe de gestión de la administración",
  "Estados financieros y ejecución presupuestal",
  "Aprobación del presupuesto y cuota de administración",
  "Elección del consejo de administración",
  "Proposiciones y varios",
];

function daysNoticeFor(dateStr: string): number | null {
  if (!dateStr) return null;
  const when = new Date(dateStr);
  if (Number.isNaN(when.getTime())) return null;
  const now = new Date();
  const a = new Date(when.getFullYear(), when.getMonth(), when.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AsambleasPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [sentOkId, setSentOkId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"ordinaria" | "extraordinaria">("ordinaria");
  const [dateStr, setDateStr] = useState("");
  const [modality, setModality] = useState("presencial");
  const [location, setLocation] = useState("");
  const [agendaText, setAgendaText] = useState(DEFAULT_AGENDA_ORD.join("\n"));
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  const load = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/assemblies${pid ? `?propertyId=${pid}` : ""}`);
      const data = await res.json();
      if (res.ok) setAssemblies(data.assemblies || []);
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
      setActionError("");
      setSentOkId(null);
      setNotice("");
      setCreatedId(null);
      load(propertyId);
    }
  }, [propertyId, load]);

  const noticeDays = daysNoticeFor(dateStr);
  const noticeWarning =
    type === "ordinaria" && noticeDays !== null && noticeDays < 15;

  async function createAssembly(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    setCreatedId(null);
    const agenda = agendaText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!dateStr || agenda.length === 0) {
      setFormError("Indica fecha/hora y al menos un punto del orden del día.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/assemblies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          type,
          date: new Date(dateStr).toISOString(),
          modality,
          location: location.trim() || undefined,
          agenda,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "No se pudo crear la convocatoria.");
        return;
      }
      let opened = false;
      if (data.id) {
        opened = !!window.open(`/asambleas/${data.id}/convocatoria`, "_blank");
      }
      setShowForm(false);
      setDateStr("");
      setLocation("");
      if (data.demo) {
        setNotice("Modo demo: la convocatoria se generó pero no se guarda en la demo.");
      } else if (data.id && !opened) {
        setCreatedId(data.id);
      }
      await load(propertyId);
    } catch {
      setFormError("Error de red. Intenta de nuevo.");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, action: string) {
    setActionError("");
    setBusyId(id);
    try {
      const res = await fetch("/api/assemblies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        await load(propertyId);
      } else {
        setActionError("No se pudo actualizar. Intenta de nuevo.");
      }
    } catch {
      setActionError("Error de red. Intenta de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendByEmail(a: Assembly) {
    if (
      !window.confirm(
        "¿Enviar la convocatoria por correo a todas las unidades con email de esta propiedad? Consumirá parte de tu cuota mensual de correos."
      )
    ) {
      return;
    }
    setActionError("");
    setSentOkId(null);
    setBusyId(a.id);
    try {
      const when = new Date(a.date);
      const tipoLabel = a.type === "ordinaria" ? "Ordinaria" : "Extraordinaria";
      const fecha = when.toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const horaStr = when.toLocaleTimeString("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const modalidad =
        a.modality === "mixta"
          ? "Mixta (presencial y virtual)"
          : a.modality.charAt(0).toUpperCase() + a.modality.slice(1);
      const agendaList = (a.agenda || [])
        .map((item, i) => `${i + 1}. ${item}`)
        .join("\n");
      const content = `Estimados propietarios:

Por medio de la presente, y en cumplimiento del artículo 39 de la Ley 675 de 2001, se convoca a la Asamblea General ${tipoLabel} de Copropietarios.

Fecha: ${fecha}
Hora: ${horaStr}
Modalidad: ${modalidad}${a.location ? `\n${a.modality === "virtual" ? "Enlace" : "Lugar"}: ${a.location}` : ""}

ORDEN DEL DÍA
${agendaList}

Quórum: la asamblea sesionará con un número plural de propietarios que represente más del 50% de los coeficientes de copropiedad. De no lograrse, la nueva reunión sesionará el tercer día hábil siguiente a las 8:00 p.m. con cualquier número plural de asistentes (Art. 41, Ley 675).

Quienes no puedan asistir podrán hacerse representar mediante poder escrito.

Agradecemos su puntual asistencia.

Cordialmente,
La Administración`;

      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          subject: `Convocatoria: Asamblea General ${tipoLabel} — ${fecha}`,
          content,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "No se pudo enviar la convocatoria.");
        return;
      }
      await fetch("/api/assemblies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, action: "mark_convoked" }),
      });
      setSentOkId(a.id);
      await load(propertyId);
    } catch {
      setActionError("Error de red al enviar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Header
        title="Asambleas"
        subtitle="Convocatorias y control de términos legales (Ley 675)"
      />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7c5cff" }} />
          </div>
        )}

        {!loading && properties.length === 0 && (
          <div className="rounded-2xl p-10 text-center" style={card}>
            <Gavel className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
            <p className="text-[14px]" style={{ color: "rgba(246,245,247,0.70)" }}>
              Crea una propiedad primero para convocar asambleas.
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
                {showForm ? "Cancelar" : "Nueva convocatoria"}
              </button>
            </div>

            {/* Form */}
            {showForm && (
              <form onSubmit={createAssembly} className="rounded-2xl p-5 space-y-4" style={card}>
                <div className="flex gap-2">
                  {(["ordinaria", "extraordinaria"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className="flex-1 px-3 py-2.5 rounded-xl text-[12.5px] font-medium transition-all cursor-pointer capitalize"
                      style={{
                        border: `1px solid ${type === t ? "rgba(124,92,255,0.50)" : "rgba(255,255,255,0.10)"}`,
                        background: type === t ? "rgba(124,92,255,0.15)" : "transparent",
                        color: type === t ? "#a78bff" : "rgba(246,245,247,0.55)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Fecha y hora
                    </label>
                    <input
                      type="datetime-local"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      style={{ ...inputStyle, colorScheme: "dark" }}
                    />
                  </div>
                  <div>
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Modalidad
                    </label>
                    <div className="relative">
                      <select
                        value={modality}
                        onChange={(e) => setModality(e.target.value)}
                        style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}
                      >
                        <option value="presencial" style={{ background: "#15151a" }}>Presencial</option>
                        <option value="virtual" style={{ background: "#15151a" }}>Virtual</option>
                        <option value="mixta" style={{ background: "#15151a" }}>Mixta</option>
                      </select>
                      <ChevronDown
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3.5 w-3.5"
                        style={{ color: "rgba(246,245,247,0.42)" }}
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      {modality === "virtual" ? "Enlace de la reunión" : "Lugar"}
                    </label>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={modality === "virtual" ? "https://meet…" : "Ej: Salón social"}
                      style={inputStyle}
                      maxLength={300}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label style={{ ...monoLabel, color: "rgba(246,245,247,0.42)" }} className="block mb-1.5">
                      Orden del día (un punto por línea)
                    </label>
                    <textarea
                      value={agendaText}
                      onChange={(e) => setAgendaText(e.target.value)}
                      rows={8}
                      style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                    />
                  </div>
                </div>

                {/* Legal notice check */}
                {noticeDays !== null && (
                  <div
                    className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12.5px]"
                    style={
                      noticeWarning
                        ? { background: "rgba(255,185,88,0.10)", border: "1px solid rgba(255,185,88,0.30)", color: "#ffb958" }
                        : { background: "rgba(76,214,160,0.08)", border: "1px solid rgba(76,214,160,0.25)", color: "#4cd6a0" }
                    }
                  >
                    {noticeWarning ? (
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-px" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-px" />
                    )}
                    <span>
                      {noticeDays >= 0
                        ? `Convocas con ${noticeDays} días de antelación.`
                        : "La fecha seleccionada ya pasó."}{" "}
                      {type === "ordinaria" &&
                        (noticeWarning
                          ? "La ley exige mínimo 15 días calendario para asamblea ordinaria (Art. 39, Ley 675) — la convocatoria podría ser impugnable."
                          : "Cumple el mínimo legal de 15 días calendario (Art. 39, Ley 675).")}
                    </span>
                  </div>
                )}

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
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />}
                  {creating ? "Creando…" : "Crear y abrir convocatoria"}
                </button>
              </form>
            )}

            {/* Notices */}
            {notice && (
              <p
                className="text-[12.5px] rounded-xl p-3"
                style={{ background: "rgba(255,185,88,0.10)", color: "#ffb958", border: "1px solid rgba(255,185,88,0.30)" }}
              >
                {notice}
              </p>
            )}
            {createdId && (
              <div
                className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                style={{ background: "rgba(76,214,160,0.08)", border: "1px solid rgba(76,214,160,0.30)" }}
              >
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#4cd6a0" }} />
                <span className="text-[12.5px] flex-1" style={{ color: "#4cd6a0" }}>
                  Convocatoria creada.
                </span>
                <a
                  href={`/asambleas/${createdId}/convocatoria`}
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
            {assemblies.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={card}>
                <Gavel className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(246,245,247,0.25)" }} />
                <p className="text-[14px] mb-1" style={{ color: "rgba(246,245,247,0.70)" }}>
                  Sin asambleas convocadas en esta propiedad
                </p>
                <p className="text-[12.5px]" style={{ color: "rgba(246,245,247,0.40)" }}>
                  La convocatoria valida los plazos de la Ley 675 y los términos del acta se
                  vigilan desde el Calendario.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {assemblies.map((a) => {
                  const when = new Date(a.date);
                  const meetingDay = new Date(when.getFullYear(), when.getMonth(), when.getDate());
                  const actaDue = addBusinessDays(meetingDay, 20);
                  const impugEnd = new Date(meetingDay);
                  impugEnd.setMonth(impugEnd.getMonth() + 2);
                  const past = meetingDay.getTime() < Date.now();
                  const cancelled = a.status === "cancelada";

                  return (
                    <div key={a.id} className="rounded-xl p-4 space-y-2.5" style={{ ...card, opacity: cancelled ? 0.55 : 1 }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="px-2.5 py-1 rounded-lg text-[10px]"
                          style={{
                            ...monoLabel,
                            fontSize: 9.5,
                            background: a.type === "ordinaria" ? "rgba(143,168,255,0.10)" : "rgba(255,185,88,0.10)",
                            color: a.type === "ordinaria" ? "#8fa8ff" : "#ffb958",
                            border: `1px solid ${a.type === "ordinaria" ? "rgba(143,168,255,0.30)" : "rgba(255,185,88,0.30)"}`,
                          }}
                        >
                          {a.type}
                        </span>
                        <p className="text-[13.5px] font-medium flex-1" style={{ color: "#f6f5f7", textDecoration: cancelled ? "line-through" : "none" }}>
                          {fmtDate(a.date)}
                        </p>
                        {cancelled ? (
                          <span style={{ ...monoMini, color: "#ff8585" }}>CANCELADA</span>
                        ) : a.convokedAt ? (
                          <span className="inline-flex items-center gap-1" style={{ ...monoMini, color: "#4cd6a0" }}>
                            <MailCheck className="h-3 w-3" />
                            Convocada
                          </span>
                        ) : (
                          <span style={{ ...monoMini, color: "#ffb958" }}>Sin enviar</span>
                        )}
                      </div>

                      {!cancelled && (
                        <p style={{ ...monoMini, color: "rgba(246,245,247,0.40)" }}>
                          {past ? (
                            <>
                              Acta: antes del {fmtShort(actaDue)}
                              {a.actaReadyAt ? " ✓ publicada" : ""} · Impugnación hasta {fmtShort(impugEnd)}
                            </>
                          ) : (
                            <>
                              {a.modality}
                              {a.location ? ` · ${a.location}` : ""} · {a.agenda?.length || 0} puntos
                            </>
                          )}
                        </p>
                      )}

                      {sentOkId === a.id && (
                        <p className="text-[12px]" style={{ color: "#4cd6a0" }}>
                          Convocatoria enviada por correo a las unidades.
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        <a
                          href={`/asambleas/${a.id}/convocatoria`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] px-3 py-1.5 transition-colors hover:bg-white/[0.06]"
                          style={{ color: "rgba(246,245,247,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}
                        >
                          <Printer className="h-3 w-3" />
                          Convocatoria
                        </a>
                        {!cancelled && !past && (
                          <button
                            onClick={() => sendByEmail(a)}
                            disabled={busyId === a.id}
                            className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] px-3 py-1.5 transition-colors cursor-pointer hover:bg-white/[0.06] disabled:opacity-50"
                            style={{ color: "#a78bff", border: "1px solid rgba(124,92,255,0.35)" }}
                          >
                            {busyId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Enviar por correo
                          </button>
                        )}
                        {!cancelled && !past && !a.convokedAt && (
                          <button
                            onClick={() => patch(a.id, "mark_convoked")}
                            disabled={busyId === a.id}
                            className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] px-3 py-1.5 transition-colors cursor-pointer hover:bg-white/[0.06] disabled:opacity-50"
                            style={{ color: "rgba(246,245,247,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Marcar enviada
                          </button>
                        )}
                        {!cancelled && past && !a.actaReadyAt && (
                          <button
                            onClick={() => patch(a.id, "acta_ready")}
                            disabled={busyId === a.id}
                            className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] px-3 py-1.5 transition-colors cursor-pointer hover:bg-white/[0.06] disabled:opacity-50"
                            style={{ color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.35)" }}
                          >
                            <FileCheck2 className="h-3 w-3" />
                            Acta publicada
                          </button>
                        )}
                        <span className="flex-1" />
                        {!cancelled ? (
                          <button
                            onClick={() => {
                              if (window.confirm("¿Cancelar esta asamblea? Sus términos desaparecerán del calendario.")) {
                                patch(a.id, "cancel");
                              }
                            }}
                            disabled={busyId === a.id}
                            className="p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.06]"
                            style={{ color: "rgba(255,133,133,0.70)" }}
                            title="Cancelar asamblea"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => patch(a.id, "restore")}
                            disabled={busyId === a.id}
                            className="p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.06]"
                            style={{ color: "#4cd6a0" }}
                            title="Restaurar"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
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
