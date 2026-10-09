"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, BadgeCheck, Check, CircleCheck, Home, Link2, Printer, RotateCcw, X, type LucideIcon } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { useModulos } from "@/components/dashboard/useModulos";
import {
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

/** Cada tipo con su icono y color: paz y salvo ✓ verde · residencia 🏠 celeste. */
const TYPE_META: Record<string, { icono: LucideIcon; tono: Tono; detalle: string }> = {
  paz_y_salvo: { icono: CircleCheck, tono: "green", detalle: "Certifica que la unidad está a paz y salvo hasta una fecha." },
  residencia: { icono: Home, tono: "sky", detalle: "Constancia de que el titular reside en la unidad." },
};

function endOfMonthIso(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Estilos locales: formulario de expedición, avisos posteriores y lista de certificados. */
const CSS_CERTIFICADOS = `
.ce-pest { margin: 0 0 22px; }
.ce-form { margin: 0 0 24px; }
.ce-campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20px; align-items: start; margin-top: 22px; }
.ce-campos > .ancho { grid-column: 1 / -1; }
.ce-campos .k-fld { margin-bottom: 18px; }
.ce-mas { margin-top: 8px; display: grid; gap: 8px; }
.ce-ok { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 0 0 20px; padding: 14px 18px; border-radius: 22px; background: var(--c-green-soft); border: 1.5px solid var(--c-green-line); }
.ce-ok > span { flex: 1 1 220px; font-size: 15.5px; font-weight: 800; }
.ce-lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.ce-item { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 16px 20px; border-radius: 24px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.ce-item.revocado { background: transparent; box-shadow: none; border-style: dashed; border-color: var(--line-strong); }
.ce-item > .t { flex: 1 1 220px; min-width: 0; }
.ce-item > .t b { display: block; font-size: 16.5px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
.ce-item.revocado > .t b { color: var(--ink-3); text-decoration: line-through; }
.ce-item > .t small { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; margin-top: 4px; font-size: 13.5px; color: var(--ink-3); }
.ce-item > .t small .cod { font-weight: 800; color: var(--ink-2); letter-spacing: .03em; }
.ce-item > .acc { display: flex; flex-wrap: wrap; gap: 8px; }
.ce-item > .acc > .k-bt { margin-left: 0; }
@media (max-width: 860px) {
  .ce-campos { grid-template-columns: minmax(0, 1fr); }
  .ce-item { padding: 14px; }
  .ce-item > .acc { width: 100%; }
}
`;

function CertificadosPage() {
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
  // Certificado que se va a revocar (confirmación en un <Modal>, antes window.confirm).
  const [porRevocar, setPorRevocar] = useState<Certificate | null>(null);

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

  // Revocar cambia al instante la página pública de verificación a «REVOCADO»: la
  // dirección destructiva pide confirmación en un <Modal> (porRevocar) antes de llegar aquí.
  async function toggleRevoke(cert: Certificate) {
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

  const botonExpedir = showForm ? (
    <Boton variante="secundario" icono={X} onClick={() => setShowForm(false)}>Cancelar</Boton>
  ) : (
    <Boton flecha="crea" onClick={() => setShowForm(true)} disabled={properties.length === 0}>Expedir certificado</Boton>
  );

  return (
    <div>
      <style href="k-certificados-local" precedence="default">
        {CSS_CERTIFICADOS}
      </style>
      <Header
        title="Certificados"
        subtitle="Paz y salvos y constancias con verificación QR"
      />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            titulo="Certificados"
            subtitulo="Paz y salvos y constancias con verificación QR"
            acciones={!loading && properties.length > 0 ? botonExpedir : undefined}
          />

          {loading && <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando certificados…" />}

          {!loading && properties.length === 0 && (
            <Vacio
              titulo="Crea una propiedad primero para expedir certificados."
              texto="Cada certificado se expide a nombre de una unidad de tu copropiedad."
              acciones={<Boton href="/dashboard/propiedades" flecha="crea">Agregar propiedad</Boton>}
            />
          )}

          {!loading && properties.length > 0 && (
            <>
              <PestanasUnidas
                className="ce-pest"
                etiquetaAccesible="Copropiedad"
                valor={propertyId}
                alCambiar={setPropertyId}
                items={properties.map((p) => ({ id: p.id, etiqueta: p.name }))}
              />

              {/* Formulario de expedición */}
              {showForm && (
                <form onSubmit={createCert} className="ce-form">
                  <Panel titulo="Expedir certificado" titular icono={BadgeCheck} tono="teal" nivel={2}>
                    <OpcionesFila etiquetaAccesible="Tipo de certificado">
                      {(["paz_y_salvo", "residencia"] as const).map((t) => (
                        <OpcionFila
                          key={t}
                          name="ce-tipo"
                          value={t}
                          icono={TYPE_META[t].icono}
                          tono={TYPE_META[t].tono}
                          etiqueta={TYPE_LABELS[t]}
                          detalle={TYPE_META[t].detalle}
                          checked={type === t}
                          onChange={() => setType(t)}
                        />
                      ))}
                    </OpcionesFila>

                    <div className="ce-campos">
                      <Campo id="ce-unidad" etiqueta="Unidad">
                        {units.length > 0 ? (
                          <Selector
                            id="ce-unidad"
                            value={unitId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setUnitId(v);
                              // Clear any stale free-text label so it can never
                              // override the selected directory unit.
                              if (v) setUnitLabel("");
                            }}
                          >
                            <option value="">Escribir manualmente…</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                                {u.residentName ? ` — ${u.residentName}` : ""}
                              </option>
                            ))}
                          </Selector>
                        ) : (
                          <Entrada
                            id="ce-unidad"
                            value={unitLabel}
                            onChange={(e) => setUnitLabel(e.target.value)}
                            placeholder="Ej: Apto 502"
                            maxLength={60}
                          />
                        )}
                        {units.length > 0 && !unitId && (
                          <div className="ce-mas">
                            <Entrada
                              aria-label="Nombre de la unidad, escrito a mano"
                              value={unitLabel}
                              onChange={(e) => setUnitLabel(e.target.value)}
                              placeholder="Ej: Apto 502"
                              maxLength={60}
                            />
                          </div>
                        )}
                      </Campo>
                      <Campo id="ce-titular" etiqueta="Titular">
                        <Entrada
                          id="ce-titular"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="Nombre completo"
                          maxLength={120}
                        />
                      </Campo>
                      <Campo id="ce-documento" etiqueta="Documento" opcional>
                        <Entrada
                          id="ce-documento"
                          value={recipientDocument}
                          onChange={(e) => setRecipientDocument(e.target.value)}
                          placeholder="C.C. 1.234.567.890"
                          maxLength={30}
                        />
                      </Campo>
                      {type === "paz_y_salvo" ? (
                        <Campo id="ce-hasta" etiqueta="A paz y salvo hasta">
                          <Entrada id="ce-hasta" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                        </Campo>
                      ) : (
                        <Campo id="ce-desde" etiqueta="Reside desde" opcional>
                          <Entrada
                            id="ce-desde"
                            value={residesSince}
                            onChange={(e) => setResidesSince(e.target.value)}
                            placeholder="Ej: enero de 2023"
                            maxLength={100}
                          />
                        </Campo>
                      )}
                      <Campo id="ce-nota" etiqueta="Nota adicional" opcional className="ancho">
                        <Entrada
                          id="ce-nota"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Texto adicional que aparecerá en el documento"
                          maxLength={600}
                        />
                      </Campo>
                    </div>

                    {formError && <p className="k-err" role="alert" style={{ margin: "0 0 14px" }}>{formError}</p>}

                    <Boton type="submit" icono={BadgeCheck} tono="teal" cargando={creating} textoCargando="Expidiendo…">
                      Expedir y abrir para imprimir
                    </Boton>
                  </Panel>
                </form>
              )}

              {/* Avisos posteriores a expedir */}
              {notice && (
                <div style={{ marginBottom: 20 }}>
                  <Aviso enLinea tipo="aviso" titulo={notice} />
                </div>
              )}
              {issuedId && (
                <div className="ce-ok">
                  <Loseta icono={CircleCheck} tono="green" tam={36} />
                  <span>Certificado expedido correctamente.</span>
                  <Boton href={`/certificados/${issuedId}/imprimir`} nuevaPestana icono={Printer} tono="green" tam={40}>
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
              {certs.length === 0 ? (
                <Vacio
                  titulo="Aún no has expedido certificados en esta propiedad"
                  texto="Cada certificado incluye un código QR público de verificación anti-fraude."
                  acciones={!showForm ? <Boton flecha="crea" onClick={() => setShowForm(true)}>Expedir certificado</Boton> : undefined}
                />
              ) : (
                <ul className="ce-lista" aria-label="Certificados expedidos">
                  {certs.map((c) => {
                    const revoked = c.status !== "valid";
                    const meta = TYPE_META[c.type];
                    return (
                      <li key={c.id} className={unir("ce-item", revoked && "revocado")}>
                        <Loseta
                          icono={revoked ? Ban : meta?.icono ?? BadgeCheck}
                          tono={revoked ? "red" : meta?.tono ?? "teal"}
                          suave={revoked}
                        />
                        <div className="t">
                          <b>{c.unitLabel} · {c.recipientName}</b>
                          <small>
                            <Categoria tono={meta?.tono ?? "slate"}>{TYPE_LABELS[c.type] || c.type}</Categoria>
                            <span>
                              {new Date(c.createdAt).toLocaleDateString("es-CO", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <span className="cod">{c.verifyCode}</span>
                            {revoked ? (
                              <Etiqueta icono={Ban} tono="red">Revocado</Etiqueta>
                            ) : (
                              <Etiqueta icono={CircleCheck} tono="green">Vigente</Etiqueta>
                            )}
                          </small>
                        </div>
                        <div className="acc">
                          <BotonFila href={`/certificados/${c.id}/imprimir`} nuevaPestana icono={Printer} tono="slate" title="Imprimir / PDF">
                            Imprimir
                          </BotonFila>
                          <BotonFila
                            onClick={() => copyVerifyLink(c)}
                            icono={copied === c.id ? Check : Link2}
                            tono={copied === c.id ? "green" : "blue"}
                            title="Copiar enlace de verificación"
                          >
                            {copied === c.id ? "Copiado" : "Copiar enlace"}
                          </BotonFila>
                          {revoked ? (
                            <BotonFila
                              onClick={() => toggleRevoke(c)}
                              disabled={busyId === c.id}
                              icono={RotateCcw}
                              tono="green"
                            >
                              {busyId === c.id ? "Guardando…" : "Restaurar"}
                            </BotonFila>
                          ) : (
                            <BotonFila
                              onClick={() => setPorRevocar(c)}
                              disabled={busyId === c.id}
                              icono={Ban}
                              tono="red"
                            >
                              {busyId === c.id ? "Guardando…" : "Revocar"}
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
        abierto={!!porRevocar}
        alCerrar={() => setPorRevocar(null)}
        titulo={`¿Revocar el certificado de ${porRevocar?.recipientName ?? ""} (${porRevocar?.unitLabel ?? ""})?`}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorRevocar(null)}>Cancelar</Boton>
            <Boton
              variante="peligro"
              lleno
              icono={Ban}
              onClick={() => {
                const c = porRevocar;
                setPorRevocar(null);
                if (c) void toggleRevoke(c);
              }}
            >
              Revocar certificado
            </Boton>
          </>
        }
      >
        <p>El enlace público de verificación mostrará «Documento REVOCADO». Podrás restaurarlo después.</p>
      </Modal>
    </div>
  );
}

/**
 * Envoltorio del gate. La comprobación va en un componente SIN hooks para que
 * CertificadosPage no llegue a montarse cuando la función está pausada: con el
 * early-return dentro, sus useEffect ya habían disparado las peticiones de
 * carga y se descargaban datos que nadie iba a ver.
 */
export default function CertificadosRoute() {
  const { visible } = useModulos();
  if (!visible("certificados")) {
    return (
      <div>
        <Header title="Certificados" subtitle="Paz y salvos y constancias con verificación QR" />
        <ComingSoon
          icon={BadgeCheck}
          title="Certificados"
          description="La expedición de paz y salvos y constancias con verificación QR vuelve pronto — la estamos afinando antes de activarla."
        />
      </div>
    );
  }
  return <CertificadosPage />;
}
