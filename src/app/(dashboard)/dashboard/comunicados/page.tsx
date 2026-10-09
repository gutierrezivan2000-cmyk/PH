"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, Mail, Megaphone, Send, Sparkles, Trash2, Users, Check, MessageCircle, History } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { useModulos } from "@/components/dashboard/useModulos";
import { UnitImport } from "@/components/dashboard/UnitImport";
import {
  AreaTexto,
  Aviso,
  BarraProgreso,
  Boton,
  CabeceraPieza,
  Campo,
  Entrada,
  Esqueleto,
  Etiqueta,
  Loseta,
  Modal,
  Pagina,
  Panel,
  PestanasUnidas,
  Pieza,
  Seccion,
  Vacio,
} from "@/components/kit";

interface Property {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  label: string;
  residentName: string | null;
  email: string | null;
}

interface Announcement {
  id: string;
  subject: string;
  content: string;
  recipientCount: number;
  sentAt: string | null;
  createdAt: string;
  property?: { name: string };
}

/* Estilos locales: selector de copropiedad + cuota, destinatarios, redactor y enviados. */
const CSS_COMUNICADOS = `
.co-sel { display: grid; gap: 14px; margin: 0 0 20px; }
.co-cuota { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px 14px; padding: 14px 18px; border-radius: 22px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.co-cuota .t { font-size: 14.5px; font-weight: 700; color: var(--ink-2); white-space: nowrap; }
.co-cuota .t b { color: var(--ink); font-weight: 800; }
.co-dest { margin: 0 0 20px; overflow: hidden; border-radius: 26px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.co-dest > button { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 20px; text-align: left; background: transparent; cursor: pointer; }
.co-dest > button:hover { background: var(--hl); }
.co-dest > button > span:not(.k-tile) { flex: 1 1 auto; min-width: 0; }
.co-dest > button b { display: block; font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
.co-dest > button small { display: block; margin-top: 2px; font-size: 14px; color: var(--ink-2); }
.co-dest > button .chev { width: 20px; height: 20px; flex: none; color: var(--ink-3); }
.co-dest > button[aria-expanded="true"] .chev { transform: rotate(180deg); }
.co-dest .cuerpo { display: grid; gap: 16px; padding: 4px 20px 22px; }
.co-chips { display: flex; flex-wrap: wrap; gap: 8px; max-height: 190px; overflow-y: auto; }
.co-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 4px 4px 14px; border-radius: 999px; background: var(--surface-2); font-size: 14px; font-weight: 800; }
.co-chip small { font-size: 13px; font-weight: 500; color: var(--ink-3); }
.co-chip button { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; color: var(--ink-3); background: transparent; cursor: pointer; }
.co-chip button:hover { color: var(--danger-text); background: var(--c-red-soft); }
.co-chip button svg { width: 15px; height: 15px; }
.co-o { display: flex; align-items: center; gap: 14px; font-size: 13.5px; font-weight: 800; color: var(--ink-3); }
.co-o::before, .co-o::after { content: ""; flex: 1; height: 1px; background: var(--line-strong); }
.co-fila { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.co-fila .msg { font-size: 14.5px; font-weight: 600; color: var(--ink-2); }
.co-ia { display: grid; gap: 12px; margin: 0 0 22px; padding: 16px 18px 18px; border-radius: 22px; border: 1.5px solid var(--c-ai-line); background: linear-gradient(120deg, var(--c-ai-soft), transparent 85%), var(--surface-2); }
.co-ia h4 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 800; color: var(--ink); }
.co-ia .fila { display: flex; flex-wrap: wrap; gap: 10px; }
.co-ia .fila .k-in { flex: 1 1 280px; }
.co-acc { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-top: 8px; }
.co-env { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.co-env > li { padding: 16px 20px; border-radius: 24px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.co-env .cab { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.co-env h3 { flex: 1 1 240px; min-width: 0; margin: 0; font-size: 16.5px; font-weight: 800; letter-spacing: -.01em; line-height: 1.3; }
.co-env p { margin: 8px 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.co-env .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; font-size: 13.5px; color: var(--ink-3); }
.co-env .meta > span { display: inline-flex; align-items: center; gap: 6px; }
.co-env .meta svg { width: 15px; height: 15px; }
@media (max-width: 860px) {
  .co-cuota { grid-template-columns: minmax(0, 1fr); }
  .co-cuota .t { white-space: normal; }
  .co-dest > button { padding: 14px; }
  .co-dest .cuerpo { padding: 2px 14px 18px; }
  .co-ia { padding: 14px 14px 16px; }
  .co-acc .k-btn { flex: 1 1 100%; }
}
`;

function ComunicadosPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState<string>("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number }>({ used: 0, limit: 500 });
  const [loading, setLoading] = useState(true);

  // Recipients editor
  const [showRecipients, setShowRecipients] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  // Unidad que se va a eliminar (confirmación en un <Modal>, antes window.confirm).
  const [porQuitar, setPorQuitar] = useState<Unit | null>(null);

  // Compose
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [waCopied, setWaCopied] = useState(false);

  const emailCount = units.filter((u) => u.email).length;

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

  const loadAnnouncements = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/announcements${pid ? `?propertyId=${pid}` : ""}`);
      const data = await res.json();
      if (res.ok) {
        setAnnouncements(data.announcements || []);
        if (data.quota) setQuota(data.quota);
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
      loadUnits(propertyId);
      loadAnnouncements(propertyId);
      setConfirming(false);
      setSendMsg(null);
    }
  }, [propertyId, loadUnits, loadAnnouncements]);

  async function addRecipients() {
    if (!bulkText.trim() || !propertyId) return;
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const res = await fetch(`/api/properties/${propertyId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: bulkText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkMsg(data.error || "No se pudo importar.");
      } else {
        setBulkMsg(
          `${data.created} agregadas${data.skipped ? ` · ${data.skipped} omitidas (duplicadas)` : ""}`
        );
        setBulkText("");
        await loadUnits(propertyId);
      }
    } catch {
      setBulkMsg("Error de red.");
    } finally {
      setBulkBusy(false);
    }
  }

  // La confirmación la pide el <Modal> (porQuitar); aquí solo se elimina.
  async function removeUnit(id: string) {
    const res = await fetch(`/api/properties/${propertyId}/units?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBulkMsg(data.error || "No se pudo eliminar la unidad.");
      return;
    }
    setBulkMsg("");
    await loadUnits(propertyId);
  }

  async function draftWithAI() {
    if (!brief.trim()) return;
    setDrafting(true);
    setSendMsg(null);
    try {
      const propertyName = properties.find((p) => p.id === propertyId)?.name;
      const res = await fetch("/api/announcements/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyName, brief }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendMsg({ ok: false, text: data.error || "No se pudo generar el borrador." });
      } else {
        setSubject(data.subject || "");
        setContent(data.content || "");
      }
    } catch {
      setSendMsg({ ok: false, text: "Error de red al generar el borrador." });
    } finally {
      setDrafting(false);
    }
  }

  async function sendAnnouncement() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, subject, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendMsg({ ok: false, text: data.error || "No se pudo enviar." });
      } else {
        setSendMsg({
          ok: true,
          text: `Comunicado enviado a ${data.sent} ${data.sent === 1 ? "destinatario" : "destinatarios"}.`,
        });
        setSubject("");
        setContent("");
        setBrief("");
        await loadAnnouncements(propertyId);
      }
    } catch {
      setSendMsg({ ok: false, text: "Error de red al enviar." });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  const quotaPct = quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0;

  return (
    <div>
      <style href="k-comunicados-local" precedence="default">
        {CSS_COMUNICADOS}
      </style>
      <Header
        title="Comunicados"
        subtitle="Circulares oficiales para tus copropiedades, redactadas con IA"
      />
      <Pagina>
        <Pieza>
          <CabeceraPieza titulo="Comunicados" subtitulo="Circulares oficiales para tus copropiedades, redactadas con IA" />

          {loading && <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando comunicados…" />}

          {!loading && properties.length === 0 && (
            <Vacio
              icono={Mail}
              titulo="Crea una propiedad primero para enviar comunicados."
              texto="Los comunicados salen por correo a las unidades de una copropiedad."
              acciones={<Boton href="/dashboard/propiedades" flecha="crea">Agregar propiedad</Boton>}
            />
          )}

          {!loading && properties.length > 0 && (
            <>
              {/* Copropiedad + cuota de correos del mes */}
              <div className="co-sel">
                <PestanasUnidas
                  etiquetaAccesible="Copropiedad"
                  valor={propertyId}
                  alCambiar={setPropertyId}
                  items={properties.map((p) => ({ id: p.id, etiqueta: p.name }))}
                />
                <div className="co-cuota">
                  <Loseta icono={Mail} tono={quotaPct > 90 ? "red" : quotaPct > 70 ? "amber" : "teal"} tam={36} />
                  <BarraProgreso valor={quotaPct} excede={quotaPct > 90} decorativa />
                  <span className="t">
                    <b>{quota.used.toLocaleString("es-CO")}</b> de {quota.limit.toLocaleString("es-CO")} correos este mes
                  </span>
                </div>
              </div>

              {/* Destinatarios */}
              <div className="co-dest" data-h="green">
                <button
                  type="button"
                  aria-expanded={showRecipients}
                  aria-controls="co-dest-cuerpo"
                  onClick={() => setShowRecipients((v) => !v)}
                >
                  <Loseta icono={Users} tono="green" />
                  <span>
                    <b>Destinatarios</b>
                    <small>
                      {units.length === 0
                        ? "Sin unidades registradas — agrégalas para poder enviar"
                        : `${units.length} unidades · ${emailCount} con correo`}
                    </small>
                  </span>
                  <ChevronDown className="chev" aria-hidden="true" focusable="false" />
                </button>

                {showRecipients && (
                  <div id="co-dest-cuerpo" className="cuerpo">
                    {units.length > 0 && (
                      <div className="co-chips">
                        {units.map((u) => (
                          <span key={u.id} className="co-chip">
                            {u.label}
                            {u.email && <small>· {u.email}</small>}
                            <button
                              type="button"
                              onClick={() => setPorQuitar(u)}
                              aria-label={`Quitar la unidad ${u.label}`}
                              title={`Quitar la unidad ${u.label}`}
                            >
                              <Trash2 aria-hidden="true" focusable="false" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* AI file import (Excel/PDF/Word) */}
                    <UnitImport
                      propertyId={propertyId}
                      onImported={(n) => {
                        setBulkMsg(`${n} ${n === 1 ? "unidad importada" : "unidades importadas"} desde el archivo.`);
                        loadUnits(propertyId);
                      }}
                    />

                    <div className="co-o">o a mano</div>

                    <Campo id="co-lineas" etiqueta="Agregar unidades (una por línea)">
                      <AreaTexto
                        id="co-lineas"
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        rows={4}
                        placeholder={"Apto 101, María Pérez, maria@correo.com, 3001112233\nApto 102, juan@correo.com\ncarlos@correo.com"}
                      />
                    </Campo>
                    <div className="co-fila">
                      <Boton
                        variante="secundario"
                        tam={40}
                        flecha="crea"
                        onClick={addRecipients}
                        disabled={!bulkText.trim()}
                        cargando={bulkBusy}
                        textoCargando="Agregando…"
                      >
                        Agregar
                      </Boton>
                      {bulkMsg && <span className="msg" role="status">{bulkMsg}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Nuevo comunicado */}
              <Panel titulo="Nuevo comunicado" titular icono={Megaphone} tono="amber" nivel={2}>
                <div className="co-ia" data-h="ai">
                  <h4>
                    <Loseta icono={Sparkles} tono="ai" tam={32} />
                    Redactar con IA
                  </h4>
                  <div className="fila">
                    <Entrada
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      placeholder="Ej: corte de agua el martes 25 de 8am a 2pm por mantenimiento del tanque"
                      aria-label="Cuéntale a la IA de qué trata el comunicado"
                      maxLength={1500}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !drafting) draftWithAI();
                      }}
                    />
                    <Boton
                      onClick={draftWithAI}
                      disabled={!brief.trim()}
                      cargando={drafting}
                      textoCargando="Redactando…"
                      icono={Sparkles}
                      tono="ai"
                    >
                      Redactar
                    </Boton>
                  </div>
                </div>

                <Campo id="co-asunto" etiqueta="Asunto">
                  <Entrada
                    id="co-asunto"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Asunto del comunicado"
                    maxLength={150}
                  />
                </Campo>

                <Campo id="co-contenido" etiqueta="Contenido">
                  <AreaTexto
                    id="co-contenido"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={9}
                    placeholder="Escribe el comunicado o usa el redactor IA de arriba…"
                    maxLength={10000}
                  />
                </Campo>

                {sendMsg && (
                  <div style={{ marginBottom: 16 }}>
                    <Aviso enLinea tipo={sendMsg.ok ? "ok" : "error"} titulo={sendMsg.text} />
                  </div>
                )}

                <div className="co-acc">
                  {/* Confirmar el envío es la señal de peligro: el botón pasa a rojo y pide un segundo clic. */}
                  <Boton
                    variante={confirming ? "peligro" : "primario"}
                    lleno={confirming}
                    icono={Send}
                    tono="teal"
                    onClick={sendAnnouncement}
                    disabled={!subject.trim() || !content.trim() || emailCount === 0}
                    cargando={sending}
                    textoCargando="Enviando…"
                  >
                    {confirming
                      ? `Confirmar envío a ${emailCount} ${emailCount === 1 ? "correo" : "correos"}`
                      : `Enviar a ${emailCount} ${emailCount === 1 ? "destinatario" : "destinatarios"}`}
                  </Boton>
                  {confirming && !sending && (
                    <Boton variante="secundario" onClick={() => setConfirming(false)}>
                      Cancelar
                    </Boton>
                  )}
                  {subject.trim() && content.trim() && (
                    <Boton
                      variante="secundario"
                      icono={waCopied ? Check : MessageCircle}
                      tono="green"
                      title="Copia el texto para pegarlo en una difusión de WhatsApp"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(`*${subject.trim()}*\n\n${content.trim()}`);
                          setWaCopied(true);
                          setTimeout(() => setWaCopied(false), 2000);
                        } catch {
                          /* clipboard unavailable */
                        }
                      }}
                    >
                      {waCopied ? "Copiado" : "Copiar para WhatsApp"}
                    </Boton>
                  )}
                  {emailCount === 0 && (
                    <span className="msg" style={{ fontSize: 14.5, color: "var(--ink-2)" }}>
                      Agrega destinatarios con correo para habilitar el envío.
                    </span>
                  )}
                </div>
              </Panel>

              {/* Enviados */}
              {announcements.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <Seccion id="co-enviados" titulo="Enviados" nota="lo más reciente primero" icono={History} tono="slate">
                    <ul className="co-env">
                      {announcements.map((a) => (
                        <li key={a.id}>
                          <div className="cab">
                            <h3>{a.subject}</h3>
                            <Etiqueta icono={Users} tono="teal">
                              {a.recipientCount} {a.recipientCount === 1 ? "destinatario" : "destinatarios"}
                            </Etiqueta>
                          </div>
                          <p>{a.content}</p>
                          <div className="meta">
                            {a.property?.name && (
                              <span>
                                <Building2 aria-hidden="true" focusable="false" />
                                {a.property.name}
                              </span>
                            )}
                            <span>
                              {new Date(a.sentAt || a.createdAt).toLocaleDateString("es-CO", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Seccion>
                </div>
              )}
            </>
          )}
        </Pieza>
      </Pagina>

      <Modal
        abierto={!!porQuitar}
        alCerrar={() => setPorQuitar(null)}
        titulo={`¿Eliminar la unidad ${porQuitar?.label || ""}?`}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorQuitar(null)}>Cancelar</Boton>
            <Boton
              variante="peligro"
              lleno
              onClick={() => {
                const u = porQuitar;
                setPorQuitar(null);
                if (u) void removeUnit(u.id);
              }}
            >
              Eliminar unidad
            </Boton>
          </>
        }
      >
        <p>
          Se quita de la copropiedad por completo (no solo de los comunicados). Si tiene movimientos de cartera, no
          podrá eliminarse.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Envoltorio del gate. La comprobación va en un componente SIN hooks para que
 * ComunicadosPage no llegue a montarse cuando la función está pausada: con el
 * early-return dentro, sus useEffect ya habían disparado las peticiones de
 * carga y se descargaban datos que nadie iba a ver.
 */
export default function ComunicadosRoute() {
  const { visible } = useModulos();
  if (!visible("comunicados")) {
    return (
      <div>
        <Header title="Comunicados" subtitle="Circulares oficiales para tus copropiedades, redactadas con IA" />
        <ComingSoon
          icon={Send}
          title="Comunicados"
          description="El envío de circulares oficiales redactadas con IA vuelve pronto — lo estamos afinando antes de activarlo."
        />
      </div>
    );
  }
  return <ComunicadosPage />;
}
