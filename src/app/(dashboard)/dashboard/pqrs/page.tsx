"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, ChevronDown, CircleCheck, Files, Home, Inbox, LoaderCircle, Lock, MessageSquareText, RotateCcw, User,
  type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { useModulos } from "@/components/dashboard/useModulos";
import {
  Aviso,
  Boton,
  CabeceraPieza,
  Casilla,
  Categoria,
  Esqueleto,
  Etiqueta,
  Loseta,
  Pagina,
  Pieza,
  Redactor,
  Segmentos,
  Vacio,
  unir,
  type Tono,
} from "@/components/kit";

interface PqrsMessage {
  id: string;
  fromAdmin: boolean;
  content: string;
  createdAt: string;
}
interface Pqrs {
  id: string;
  code: string;
  type: string;
  subject: string;
  status: string;
  unitLabel: string | null;
  residentName: string | null;
  residentContact: string | null;
  createdAt: string;
  messages: PqrsMessage[];
  property?: { name: string };
}

/** Cada tipo de solicitud con su color: petición azul · queja naranja · reclamo rojo · sugerencia verde. */
const TYPE_META: Record<string, { label: string; tono: Tono }> = {
  peticion: { label: "Petición", tono: "blue" },
  queja: { label: "Queja", tono: "orange" },
  reclamo: { label: "Reclamo", tono: "red" },
  sugerencia: { label: "Sugerencia", tono: "green" },
};

/** Cada estado con su icono y color: radicado 📥 azul · en proceso ◌ ámbar · resuelto ✓ verde · cerrado 🔒 gris. */
const STATUS_META: Record<string, { label: string; icono: LucideIcon; tono: Tono; accion: string }> = {
  radicado: { label: "Radicado", icono: Inbox, tono: "blue", accion: "Marcar radicado" },
  en_proceso: { label: "En proceso", icono: LoaderCircle, tono: "amber", accion: "Marcar en proceso" },
  resuelto: { label: "Resuelto", icono: CircleCheck, tono: "green", accion: "Marcar resuelto" },
  cerrado: { label: "Cerrado", icono: Lock, tono: "slate", accion: "Cerrar solicitud" },
};

function fecha(d: string) {
  return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FILTERS: Array<{ key: string; label: string; icono: LucideIcon; tono: Tono }> = [
  { key: "", label: "Todas", icono: Files, tono: "slate" },
  { key: "radicado", label: "Radicado", icono: STATUS_META.radicado.icono, tono: STATUS_META.radicado.tono },
  { key: "en_proceso", label: "En proceso", icono: STATUS_META.en_proceso.icono, tono: STATUS_META.en_proceso.tono },
  { key: "resuelto", label: "Resuelto", icono: STATUS_META.resuelto.icono, tono: STATUS_META.resuelto.tono },
  { key: "cerrado", label: "Cerrado", icono: STATUS_META.cerrado.icono, tono: STATUS_META.cerrado.tono },
];

/* Estilos locales: la bandeja es una lista de tarjetas que se abren para ver el hilo y responder. */
const CSS_PQRS = `
.pq-filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 0 0 20px; }
.pq-lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.pq-item { overflow: hidden; border-radius: 26px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.pq-item.abierta { border-color: var(--h-line); }
.pq-cab { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 20px; text-align: left; background: transparent; cursor: pointer; }
.pq-cab:hover { background: var(--hl); }
.pq-tx { flex: 1 1 auto; min-width: 0; display: grid; gap: 6px; }
.pq-tit { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.pq-tit b { font-size: 16.5px; font-weight: 800; line-height: 1.25; letter-spacing: -.01em; overflow-wrap: anywhere; }
.pq-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 16px; font-size: 13.5px; line-height: 1.4; color: var(--ink-3); }
.pq-meta > span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.pq-meta svg { width: 15px; height: 15px; flex: none; }
.pq-meta .cod { font-weight: 800; color: var(--ink-2); letter-spacing: .02em; }
.pq-cab .chev { width: 20px; height: 20px; flex: none; color: var(--ink-3); }
.pq-item.abierta .chev { transform: rotate(180deg); }
.pq-cuerpo { display: grid; gap: 16px; padding: 4px 20px 22px 78px; }
.pq-quien { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 700; color: var(--ink-2); }
.pq-quien svg { width: 16px; height: 16px; }
.pq-hilo { display: grid; gap: 10px; }
.pq-msg { max-width: min(72ch, 100%); padding: 12px 16px 14px; border-radius: 20px 20px 20px 6px; background: var(--surface-2); }
.pq-msg.admin { justify-self: end; border-radius: 20px 20px 6px 20px; background: rgb(var(--accent-rgb) / .12); box-shadow: inset 0 0 0 1px rgb(var(--accent-rgb) / .32); }
.pq-msg .k-msg-meta { margin: 0 0 4px; }
.pq-msg .tx { margin: 0; font-size: 15.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.pq-estados { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.pq-estados > span { margin-right: 4px; font-size: 14px; font-weight: 800; color: var(--ink-2); }
@media (max-width: 860px) {
  .pq-cab { flex-wrap: wrap; gap: 10px 12px; padding: 14px; }
  .pq-cab > .ico { display: none; }
  .pq-cab > .k-estado { order: 3; }
  .pq-cuerpo { padding: 2px 14px 18px; }
}
`;

function PqrsInboxPage() {
  const [list, setList] = useState<Pqrs[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [canAct, setCanAct] = useState(true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pqrs${status ? `?status=${status}` : ""}`);
      const data = await res.json();
      if (res.status === 403 && data.code === "plan_upgrade") {
        setUpgrade(true);
        return;
      }
      if (res.ok) {
        // Reading is always allowed: a resident's request must never be
        // invisible. Only answering needs the plan (canAct === false).
        setUpgrade(false);
        setCanAct(data.canAct !== false);
        setList(data.pqrs || []);
        setCounts(data.counts || {});
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  async function act(id: string, opts: { reply?: string; status?: string; notify?: boolean }) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pqrs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo actualizar." });
        return;
      }
      setMsg({ ok: true, text: data.notified ? "Respuesta enviada y notificada por correo." : "Actualizado." });
      setReply("");
      await load(filter);
    } finally {
      setBusy(false);
    }
  }

  const pending = (counts.radicado || 0) + (counts.en_proceso || 0);

  return (
    <div>
      <style href="k-pqrs-local" precedence="default">
        {CSS_PQRS}
      </style>
      <Header title="PQRS" subtitle="Peticiones, quejas y reclamos de los residentes" />
      <Pagina>
        <Pieza>
          <CabeceraPieza titulo="PQRS" subtitulo="Peticiones, quejas y reclamos de los residentes" />

          {loading && list.length === 0 && !upgrade && (
            <Esqueleto variante="tabla" filas={4} etiquetaAccesible="Cargando las solicitudes…" />
          )}

          {upgrade && (
            <Vacio
              icono={Lock}
              tono="violet"
              titulo="Las PQRS de residentes son parte de los planes Business y Élite"
              texto="Los residentes radican peticiones, quejas y reclamos desde su portal (sin cuenta) y tú respondes desde aquí."
              acciones={<Boton href="/dashboard/suscripcion">Ver planes</Boton>}
            />
          )}

          {!upgrade && (
            <>
              {!canAct && (
                <div style={{ marginBottom: 20 }}>
                  <Aviso
                    enLinea
                    rol={null}
                    tipo="aviso"
                    titulo="Puedes leer las solicitudes de tus residentes, pero para responderlas necesitas el plan Business o Élite."
                    texto="Mientras tanto, el portal dejó de recibir solicitudes nuevas."
                    accion={{ etiqueta: "Ver planes", href: "/dashboard/suscripcion" }}
                  />
                </div>
              )}

              <div className="pq-filtros">
                <Segmentos
                  etiquetaAccesible="Filtrar por estado"
                  valor={filter}
                  alCambiar={setFilter}
                  items={FILTERS.map((f) => ({
                    id: f.key,
                    etiqueta: f.label,
                    icono: f.icono,
                    tono: f.tono,
                    conteo: f.key ? counts[f.key] || undefined : undefined,
                  }))}
                />
                {pending > 0 && (
                  <Etiqueta icono={LoaderCircle} tono="amber">
                    {pending} {pending === 1 ? "pendiente" : "pendientes"}
                  </Etiqueta>
                )}
              </div>

              {msg && (
                <div style={{ marginBottom: 16 }}>
                  <Aviso enLinea tipo={msg.ok ? "ok" : "error"} titulo={msg.text} />
                </div>
              )}

              {!loading && list.length === 0 ? (
                <Vacio
                  icono={MessageSquareText}
                  tono="pink"
                  titulo={filter ? "Sin solicitudes en este estado" : "Aún no hay solicitudes de residentes"}
                  texto="Aparecerán aquí cuando un residente radique una PQRS desde su portal."
                />
              ) : (
                <ul className="pq-lista" aria-label="Solicitudes de los residentes">
                  {list.map((p) => {
                    const st = STATUS_META[p.status] || STATUS_META.radicado;
                    const tipo = TYPE_META[p.type] || { label: p.type, tono: "slate" as Tono };
                    const isOpen = expanded === p.id;
                    const correo = p.residentContact && /[^@\s]+@[^@\s]+\.[^@\s]+/.test(p.residentContact);
                    return (
                      <li key={p.id} className={unir("pq-item", isOpen && "abierta")} data-h={st.tono}>
                        <button
                          type="button"
                          className="pq-cab"
                          aria-expanded={isOpen}
                          aria-controls={`pq-${p.id}`}
                          onClick={() => { setExpanded(isOpen ? null : p.id); setReply(""); setMsg(null); }}
                        >
                          <Loseta icono={st.icono} tono={st.tono} />
                          <span className="pq-tx">
                            <span className="pq-tit">
                              <Categoria tono={tipo.tono}>{tipo.label}</Categoria>
                              <b>{p.subject}</b>
                            </span>
                            <span className="pq-meta">
                              <span className="cod">{p.code}</span>
                              {p.property?.name && (
                                <span><Building2 aria-hidden="true" focusable="false" />{p.property.name}</span>
                              )}
                              {p.unitLabel && (
                                <span><Home aria-hidden="true" focusable="false" />{p.unitLabel}</span>
                              )}
                              <span>{fecha(p.createdAt)}</span>
                            </span>
                          </span>
                          <Etiqueta icono={st.icono} tono={st.tono}>{st.label}</Etiqueta>
                          <ChevronDown className="chev" aria-hidden="true" focusable="false" />
                        </button>

                        {isOpen && (
                          <div id={`pq-${p.id}`} className="pq-cuerpo">
                            {(p.residentName || p.residentContact) && (
                              <p className="pq-quien">
                                <User aria-hidden="true" focusable="false" />
                                {[p.residentName, p.residentContact].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            <div className="pq-hilo">
                              {p.messages.map((m) => (
                                <div key={m.id} className={unir("pq-msg", m.fromAdmin && "admin")}>
                                  <p className="k-msg-meta">
                                    <b>{m.fromAdmin ? "Administración" : p.residentName || "Residente"}</b>
                                    <span>{fecha(m.createdAt)}</span>
                                  </p>
                                  <p className="tx">{m.content}</p>
                                </div>
                              ))}
                            </div>

                            {p.status !== "cerrado" && canAct && (
                              <>
                                <Redactor
                                  etiqueta="Tu respuesta al residente"
                                  placeholder="Escribe tu respuesta…"
                                  valor={reply}
                                  alCambiar={setReply}
                                  alEnviar={() => act(p.id, { reply, notify })}
                                  enviando={busy}
                                  deshabilitado={busy}
                                  enviarConEnter={false}
                                  filas={3}
                                  etiquetaEnviar="Responder"
                                  textoEnviando="Enviando…"
                                  herramientas={
                                    correo ? (
                                      <Casilla
                                        etiqueta="Notificar por correo"
                                        checked={notify}
                                        onChange={(e) => setNotify(e.target.checked)}
                                      />
                                    ) : undefined
                                  }
                                />
                                <div className="pq-estados">
                                  <span>Cambiar estado:</span>
                                  {["en_proceso", "resuelto", "cerrado"].filter((s) => s !== p.status).map((s) => (
                                    <Boton
                                      key={s}
                                      variante="secundario"
                                      tam={40}
                                      icono={STATUS_META[s].icono}
                                      tono={STATUS_META[s].tono}
                                      disabled={busy}
                                      onClick={() => act(p.id, { status: s })}
                                    >
                                      {STATUS_META[s].accion}
                                    </Boton>
                                  ))}
                                </div>
                              </>
                            )}
                            {p.status === "cerrado" && (
                              <div className="pq-estados">
                                <Boton
                                  variante="secundario"
                                  tam={40}
                                  icono={RotateCcw}
                                  tono="amber"
                                  disabled={busy}
                                  onClick={() => act(p.id, { status: "en_proceso" })}
                                >
                                  Reabrir
                                </Boton>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Pieza>
      </Pagina>
    </div>
  );
}

/**
 * Envoltorio del gate. La comprobación va en un componente SIN hooks para que
 * PqrsInboxPage no llegue a montarse cuando la función está pausada: con el
 * early-return dentro, sus useEffect ya habían disparado las peticiones de
 * carga y se descargaban datos que nadie iba a ver.
 */
export default function PqrsRoute() {
  const { visible } = useModulos();
  if (!visible("pqrs")) {
    return (
      <div>
        <Header title="PQRS" subtitle="Peticiones, quejas y reclamos de los residentes" />
        <ComingSoon
          icon={MessageSquareText}
          title="PQRS"
          description="La bandeja de peticiones, quejas y reclamos de los residentes vuelve pronto — la estamos afinando antes de activarla."
        />
      </div>
    );
  }
  return <PqrsInboxPage />;
}
