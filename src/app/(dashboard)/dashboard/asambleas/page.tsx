"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban, CalendarDays, CircleCheck, Clock, FileCheck2, Gavel, Landmark, MailCheck, Printer, RotateCcw, Send, X, Zap,
  Check, type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { COMING_SOON } from "@/lib/feature-flags";
import { addBusinessDays } from "@/lib/compliance";
import {
  AreaTexto,
  Aviso,
  Boton,
  BotonFila,
  CabeceraPieza,
  Campo,
  Categoria,
  Entrada,
  Esqueleto,
  Etiqueta,
  Loseta,
  Modal,
  OpcionFila,
  OpcionesFila,
  Pagina,
  Panel,
  PestanasUnidas,
  Pieza,
  Selector,
  Vacio,
  unir,
  type Tono,
} from "@/components/kit";

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

/** Cada tipo de asamblea con su icono y color: ordinaria 📅 violeta · extraordinaria ⚡ ámbar. */
const TIPO_META: Record<string, { label: string; icono: LucideIcon; tono: Tono; detalle: string }> = {
  ordinaria: { label: "Ordinaria", icono: CalendarDays, tono: "violet", detalle: "La reunión anual de copropietarios." },
  extraordinaria: { label: "Extraordinaria", icono: Zap, tono: "amber", detalle: "Para asuntos urgentes que no pueden esperar a la reunión anual." },
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

/* Estilos locales: formulario de convocatoria, avisos posteriores y lista de asambleas. */
const CSS_ASAMBLEAS = `
.as-pest { margin: 0 0 22px; }
.as-form { margin: 0 0 24px; }
.as-campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20px; align-items: start; margin-top: 22px; }
.as-campos > .ancho { grid-column: 1 / -1; }
.as-campos .k-fld { margin-bottom: 18px; }
.as-ok { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 0 0 20px; padding: 14px 18px; border-radius: 22px; background: var(--c-green-soft); border: 1.5px solid var(--c-green-line); }
.as-ok > span { flex: 1 1 220px; font-size: 15.5px; font-weight: 800; }
.as-lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.as-item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 16px; padding: 18px 20px; border-radius: 26px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.as-item.cancelada { background: transparent; box-shadow: none; border-style: dashed; border-color: var(--line-strong); }
.as-item > .ico { grid-row: 1 / span 3; }
.as-cab { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.as-cab h3 { flex: 1 1 240px; min-width: 0; margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -.01em; line-height: 1.3; }
.as-item.cancelada h3 { color: var(--ink-3); text-decoration: line-through; }
.as-datos { margin: 0; font-size: 14.5px; line-height: 1.45; color: var(--ink-2); }
.as-enviada { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 700; color: var(--ok-text); }
.as-enviada svg { width: 17px; height: 17px; }
.as-acc { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.as-acc .sep { flex: 1 1 auto; }
.as-acc > .k-bt { margin-left: 0; }
@media (max-width: 860px) {
  .as-campos { grid-template-columns: minmax(0, 1fr); }
  .as-item { grid-template-columns: minmax(0, 1fr); padding: 14px; }
  .as-item > .ico { display: none; }
}
`;

function AsambleasPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [sentOkId, setSentOkId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  // Confirmaciones en un <Modal> (antes window.confirm): enviar por correo y cancelar la asamblea.
  const [porEnviar, setPorEnviar] = useState<Assembly | null>(null);
  const [porCancelar, setPorCancelar] = useState<Assembly | null>(null);

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

  // La confirmación («consumirá parte de tu cuota mensual de correos») la pide el <Modal> (porEnviar).
  async function sendByEmail(a: Assembly) {
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

  const botonNueva = showForm ? (
    <Boton variante="secundario" icono={X} onClick={() => setShowForm(false)}>Cancelar</Boton>
  ) : (
    <Boton flecha="crea" onClick={() => setShowForm(true)}>Nueva convocatoria</Boton>
  );

  return (
    <div>
      <style href="k-asambleas-local" precedence="default">
        {CSS_ASAMBLEAS}
      </style>
      <Header
        title="Asambleas"
        subtitle="Convocatorias y control de términos legales (Ley 675)"
      />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            titulo="Asambleas"
            subtitulo="Convocatorias y control de términos legales (Ley 675)"
            acciones={!loading && properties.length > 0 ? botonNueva : undefined}
          />

          {loading && <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando asambleas…" />}

          {!loading && properties.length === 0 && (
            <Vacio
              icono={Gavel}
              titulo="Crea una propiedad primero para convocar asambleas."
              texto="Cada convocatoria se hace para una copropiedad."
              acciones={<Boton href="/dashboard/propiedades" flecha="crea">Agregar propiedad</Boton>}
            />
          )}

          {!loading && properties.length > 0 && (
            <>
              <PestanasUnidas
                className="as-pest"
                etiquetaAccesible="Copropiedad"
                valor={propertyId}
                alCambiar={setPropertyId}
                items={properties.map((p) => ({ id: p.id, etiqueta: p.name }))}
              />

              {/* Formulario */}
              {showForm && (
                <form onSubmit={createAssembly} className="as-form">
                  <Panel titulo="Nueva convocatoria" titular icono={Gavel} tono="fuchsia" nivel={2}>
                    <OpcionesFila etiquetaAccesible="Tipo de asamblea">
                      {(["ordinaria", "extraordinaria"] as const).map((t) => (
                        <OpcionFila
                          key={t}
                          name="as-tipo"
                          value={t}
                          icono={TIPO_META[t].icono}
                          tono={TIPO_META[t].tono}
                          etiqueta={TIPO_META[t].label}
                          detalle={TIPO_META[t].detalle}
                          checked={type === t}
                          onChange={() => setType(t)}
                        />
                      ))}
                    </OpcionesFila>

                    <div className="as-campos">
                      <Campo id="as-fecha" etiqueta="Fecha y hora">
                        <Entrada id="as-fecha" type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
                      </Campo>
                      <Campo id="as-modalidad" etiqueta="Modalidad">
                        <Selector id="as-modalidad" value={modality} onChange={(e) => setModality(e.target.value)}>
                          <option value="presencial">Presencial</option>
                          <option value="virtual">Virtual</option>
                          <option value="mixta">Mixta</option>
                        </Selector>
                      </Campo>
                      <Campo id="as-lugar" etiqueta={modality === "virtual" ? "Enlace de la reunión" : "Lugar"} className="ancho">
                        <Entrada
                          id="as-lugar"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder={modality === "virtual" ? "https://meet…" : "Ej: Salón social"}
                          maxLength={300}
                        />
                      </Campo>
                      <Campo id="as-agenda" etiqueta="Orden del día (un punto por línea)" className="ancho">
                        <AreaTexto id="as-agenda" value={agendaText} onChange={(e) => setAgendaText(e.target.value)} rows={8} />
                      </Campo>
                    </div>

                    {/* Comprobación del plazo legal */}
                    {noticeDays !== null && (
                      <div style={{ marginBottom: 18 }}>
                        <Aviso
                          enLinea
                          rol={null}
                          tipo={noticeWarning ? "aviso" : "ok"}
                          titulo={noticeDays >= 0 ? `Convocas con ${noticeDays} días de antelación.` : "La fecha seleccionada ya pasó."}
                          texto={
                            type === "ordinaria"
                              ? noticeWarning
                                ? "La ley exige mínimo 15 días calendario para asamblea ordinaria (Art. 39, Ley 675) — la convocatoria podría ser impugnable."
                                : "Cumple el mínimo legal de 15 días calendario (Art. 39, Ley 675)."
                              : undefined
                          }
                        />
                      </div>
                    )}

                    {formError && <p className="k-err" role="alert" style={{ margin: "0 0 14px" }}>{formError}</p>}

                    <Boton type="submit" icono={Gavel} tono="fuchsia" cargando={creating} textoCargando="Creando…">
                      Crear y abrir convocatoria
                    </Boton>
                  </Panel>
                </form>
              )}

              {/* Avisos */}
              {notice && (
                <div style={{ marginBottom: 20 }}>
                  <Aviso enLinea tipo="aviso" titulo={notice} />
                </div>
              )}
              {createdId && (
                <div className="as-ok">
                  <Loseta icono={CircleCheck} tono="green" tam={36} />
                  <span>Convocatoria creada.</span>
                  <Boton href={`/asambleas/${createdId}/convocatoria`} nuevaPestana icono={Printer} tono="green" tam={40}>
                    Abrir para imprimir
                  </Boton>
                </div>
              )}
              {actionError && (
                <div style={{ marginBottom: 16 }}>
                  <Aviso enLinea tipo="error" titulo={actionError} />
                </div>
              )}

              {/* Lista */}
              {assemblies.length === 0 ? (
                <Vacio
                  icono={Landmark}
                  titulo="Sin asambleas convocadas en esta propiedad"
                  texto="La convocatoria valida los plazos de la Ley 675 y los términos del acta se vigilan desde la Bitácora."
                  acciones={!showForm ? <Boton flecha="crea" onClick={() => setShowForm(true)}>Nueva convocatoria</Boton> : undefined}
                />
              ) : (
                <ul className="as-lista" aria-label="Asambleas">
                  {assemblies.map((a) => {
                    const when = new Date(a.date);
                    const meetingDay = new Date(when.getFullYear(), when.getMonth(), when.getDate());
                    const actaDue = addBusinessDays(meetingDay, 20);
                    const impugEnd = new Date(meetingDay);
                    impugEnd.setMonth(impugEnd.getMonth() + 2);
                    const past = meetingDay.getTime() < Date.now();
                    const cancelled = a.status === "cancelada";
                    const meta = TIPO_META[a.type] ?? TIPO_META.ordinaria;

                    return (
                      <li key={a.id} className={unir("as-item", cancelled && "cancelada")}>
                        <Loseta icono={cancelled ? Ban : meta.icono} tono={cancelled ? "red" : meta.tono} suave={cancelled} />
                        <div className="as-cab">
                          <Categoria tono={meta.tono}>{meta.label}</Categoria>
                          <h3>{fmtDate(a.date)}</h3>
                          {cancelled ? (
                            <Etiqueta icono={Ban} tono="red">Cancelada</Etiqueta>
                          ) : a.convokedAt ? (
                            <Etiqueta icono={MailCheck} tono="green">Convocada</Etiqueta>
                          ) : (
                            <Etiqueta icono={Clock} tono="amber">Sin enviar</Etiqueta>
                          )}
                        </div>

                        {!cancelled && (
                          <p className="as-datos">
                            {past ? (
                              <>
                                Acta: antes del {fmtShort(actaDue)}
                                {a.actaReadyAt ? " ✓ publicada" : ""} · Impugnación hasta {fmtShort(impugEnd)}
                              </>
                            ) : (
                              <>
                                {a.modality.charAt(0).toUpperCase() + a.modality.slice(1)}
                                {a.location ? ` · ${a.location}` : ""} · {a.agenda?.length || 0} puntos
                              </>
                            )}
                          </p>
                        )}

                        {sentOkId === a.id && (
                          <p className="as-enviada" role="status">
                            <Check aria-hidden="true" focusable="false" />
                            Convocatoria enviada por correo a las unidades.
                          </p>
                        )}

                        <div className="as-acc">
                          <BotonFila href={`/asambleas/${a.id}/convocatoria`} nuevaPestana icono={Printer} tono="slate">
                            Convocatoria
                          </BotonFila>
                          {!cancelled && !past && (
                            <BotonFila onClick={() => setPorEnviar(a)} disabled={busyId === a.id} icono={Send} tono="teal">
                              {busyId === a.id ? "Enviando…" : "Enviar por correo"}
                            </BotonFila>
                          )}
                          {!cancelled && !past && !a.convokedAt && (
                            <BotonFila onClick={() => patch(a.id, "mark_convoked")} disabled={busyId === a.id} icono={Check} tono="green">
                              Marcar enviada
                            </BotonFila>
                          )}
                          {!cancelled && past && !a.actaReadyAt && (
                            <BotonFila onClick={() => patch(a.id, "acta_ready")} disabled={busyId === a.id} icono={FileCheck2} tono="green">
                              Acta publicada
                            </BotonFila>
                          )}
                          <span className="sep" />
                          {!cancelled ? (
                            <BotonFila onClick={() => setPorCancelar(a)} disabled={busyId === a.id} icono={Ban} tono="red">
                              Cancelar asamblea
                            </BotonFila>
                          ) : (
                            <BotonFila onClick={() => patch(a.id, "restore")} disabled={busyId === a.id} icono={RotateCcw} tono="green">
                              Restaurar
                            </BotonFila>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Pieza>
      </Pagina>

      <Modal
        abierto={!!porEnviar}
        alCerrar={() => setPorEnviar(null)}
        titulo="¿Enviar la convocatoria por correo a todas las unidades con correo de esta propiedad?"
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorEnviar(null)}>Cancelar</Boton>
            <Boton
              icono={Send}
              tono="teal"
              onClick={() => {
                const a = porEnviar;
                setPorEnviar(null);
                if (a) void sendByEmail(a);
              }}
            >
              Enviar convocatoria
            </Boton>
          </>
        }
      >
        <p>Consumirá parte de tu cuota mensual de correos.</p>
      </Modal>

      <Modal
        abierto={!!porCancelar}
        alCerrar={() => setPorCancelar(null)}
        titulo="¿Cancelar esta asamblea?"
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorCancelar(null)}>Volver</Boton>
            <Boton
              variante="peligro"
              lleno
              icono={Ban}
              onClick={() => {
                const a = porCancelar;
                setPorCancelar(null);
                if (a) void patch(a.id, "cancel");
              }}
            >
              Sí, cancelar la asamblea
            </Boton>
          </>
        }
      >
        <p>Sus términos desaparecerán de la Bitácora. Podrás restaurarla después.</p>
      </Modal>
    </div>
  );
}

/**
 * Envoltorio del gate. La comprobación va en un componente SIN hooks para que
 * AsambleasPage no llegue a montarse cuando la función está pausada: con el
 * early-return dentro, sus useEffect ya habían disparado las peticiones de
 * carga y se descargaban datos que nadie iba a ver.
 */
export default function AsambleasRoute() {
  if (COMING_SOON.asambleas) {
    return (
      <div>
        <Header title="Asambleas" subtitle="Convocatorias y control de términos legales (Ley 675)" />
        <ComingSoon
          icon={Gavel}
          title="Asambleas"
          description="La convocatoria de asambleas y el control de términos de la Ley 675 vuelven pronto — los estamos afinando antes de activarlos."
        />
      </div>
    );
  }
  return <AsambleasPage />;
}
