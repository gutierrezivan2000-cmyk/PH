"use client";

import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { refrescarIndice } from "@/components/dashboard/datosIndice";
import { upload } from "@vercel/blob/client";
import {
  AreaTexto,
  Aviso,
  Boton,
  CabeceraPieza,
  Campo,
  ErrorCarga,
  Esqueleto,
  Estado,
  FilaArchivo,
  ListaArchivos,
  Pagina,
  Panel,
  Pieza,
  ProgresoGeneracion,
  Resumen,
  TipoArchivo,
  ZonaSubida,
  nombreCorto,
  pesoLegible,
  type EtapaGeneracion,
} from "@/components/kit";

interface ActaRequirement {
  item: string;
  status: "completo" | "pendiente";
  detail: string;
}

interface Generation {
  id: string;
  type: string;
  status: string;
  progress?: number;
  month: number;
  year: number;
  tokensUsed: number;
  costUsd: number;
  errorMessage?: string;
  outputFiles?: {
    informeHtml?: string;
    actaHtml?: string;
    informeMarkdown?: string;
    actaMarkdown?: string;
    presentacionPptx?: string;
    transcripcion?: string;
    actaRequirements?: string;
    pptxRequested?: string;
  };
  /** La fila de /api/jobs trae los insumos; la copia de sessionStorage, no. */
  inputFiles?: { name: string; type?: string }[] | null;
  property: {
    name: string;
  };
  createdAt: string;
  completedAt?: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Etapas reales del trabajo: son los puntos de avance que escribe
// runGeneration (src/lib/generation/run.ts: 5 → 10 → 25 → 60 → 70 → 90 → 100).
// El tramo 60–89 guarda los documentos y, solo si se pidió, arma la
// presentación: por eso va como una sola etapa y no se anuncia una
// presentación que nadie pidió.
const ETAPAS = [
  { min: 0, nombre: "Preparando los archivos" },
  { min: 10, nombre: "Analizando el contenido" },
  { min: 25, nombre: "Generando los documentos con IA" },
  { min: 60, nombre: "Creando los documentos" },
  { min: 90, nombre: "Finalizando" },
];

function etapasDe(progreso: number, archivos?: number): EtapaGeneracion[] {
  return ETAPAS.map((e, i) => {
    const siguiente = ETAPAS[i + 1]?.min ?? 101;
    const estado = progreso >= siguiente ? "listo" : progreso >= e.min ? "curso" : "espera";
    const nombre =
      i === 0 && archivos ? `Preparando ${archivos === 1 ? "el archivo" : `los ${archivos} archivos`}` : e.nombre;
    return { nombre, estado };
  });
}

function parseActaRequirements(raw?: string): ActaRequirement[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** «29 de agosto de 2026, 5:25 p. m.» (hora de este equipo). */
function fechaHora(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  return `${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()} de ${d.getFullYear()}, ${hora}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/* ════════════════════════════════════════════════════════════════════
   Estilos locales (filas de documento, requisitos y pie de la pantalla)
   ════════════════════════════════════════════════════════════════════ */

const CSS_RESULTADO = `
.res-fila { margin-bottom: 56px; }
.res-lado { min-width: 0; }
.res-docs { list-style: none; margin: 0; padding: 0; }
.res-doc { position: relative; display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; column-gap: 16px; align-items: center;
  min-height: 76px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.res-doc > .k-tipo { justify-self: start; }
.res-doc .t { min-width: 0; }
.res-doc .t b { display: block; font-size: 18px; font-weight: 700; line-height: 1.2; letter-spacing: -.005em; }
.res-doc .t > .d { display: block; margin-top: 3px; font-size: 14px; line-height: 1.35; color: var(--ink-3); }
.res-doc .t .k-estado { margin-top: 6px; }
.res-doc .acc { display: flex; gap: 10px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
.res-doc.error { background: var(--danger-pale); box-shadow: calc(var(--g) / -2) 0 0 var(--danger-pale), calc(var(--g) / 2) 0 0 var(--danger-pale); }
.res-doc.error .t > .d { color: var(--ink); }
.res-doc.error > .k-tipo { color: var(--danger-text); }
.res-cifra { margin: 0; display: flex; align-items: flex-end; gap: 12px; }
.res-cifra > b { font-size: 48px; font-weight: 800; font-stretch: 62%; letter-spacing: -.03em; line-height: .8;
  font-feature-settings: "tnum" 0, "lnum" 1; }
.res-cifra > span { font-size: 15px; line-height: 1.25; color: var(--ink-2); }
.res-lado .k-aviso { margin-top: 20px; }
.res-reqs { list-style: none; margin: 0; padding: 0; }
.res-req { display: grid; grid-template-columns: 124px minmax(0, 1fr); column-gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.res-req b { display: block; font-size: 16px; font-weight: 650; line-height: 1.25; }
.res-req span.d { display: block; margin-top: 3px; font-size: 14px; line-height: 1.4; color: var(--ink-3); }
.res-req > .k-estado { align-self: start; margin-top: 1px; }
.res-apoyo { margin: -4px 0 18px; font-size: 15px; line-height: 1.45; color: var(--ink-2); max-width: 60ch; }
.res-corr .k-zona { margin-top: 4px; }
.res-corr .k-aviso { margin-top: 16px; }
.res-corr .enviar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 20px; }
.res-corr .enviar p { margin: 0; font-size: 14px; line-height: 1.4; color: var(--ink-3); overflow-wrap: anywhere; }
.res-corr .enviar p:empty { display: none; }
.res-nav { display: flex; flex-wrap: wrap; gap: 10px; border-top: 2px solid var(--rule); padding-top: 20px; }
@media (max-width: 860px) {
  .res-fila { margin-bottom: 40px; }
  .res-lado { margin-top: 28px; }
  .res-doc { grid-template-columns: 52px minmax(0, 1fr); row-gap: 12px; align-items: start; padding: 14px 0; }
  .res-doc .acc { grid-column: 1 / -1; justify-content: stretch; }
  .res-doc .acc .k-btn { flex: 1 1 100%; min-height: 48px; }
  .res-doc.error { box-shadow: -8px 0 0 var(--danger-pale), 8px 0 0 var(--danger-pale); }
  .res-req { grid-template-columns: minmax(0, 1fr); row-gap: 6px; }
  .res-corr .enviar .k-btn { width: 100%; }
  .res-nav .k-btn { flex: 1 1 100%; }
  .res-nav .k-btn.k-sec { justify-content: flex-start; gap: 12px; }
}
`;

function FilaDocumento({ tipo, nombre, detalle, estado, accion, error }: {
  tipo: string; nombre: string; detalle?: ReactNode; estado?: ReactNode; accion?: ReactNode; error?: boolean;
}) {
  return (
    <li className={`res-doc${error ? " error" : ""}`}>
      <TipoArchivo>{tipo}</TipoArchivo>
      <div className="t">
        <b>{nombre}</b>
        {detalle && <span className="d">{detalle}</span>}
        {estado}
      </div>
      {accion ? <div className="acc">{accion}</div> : <span />}
    </li>
  );
}

export default function JobResultPage() {
  const params = useParams();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [pptxError, setPptxError] = useState("");
  const pptxTriggered = useRef(false);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(`gen-${params.jobId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setGeneration(parsed);
        if (parsed.status === "completed") setDisplayProgress(100);
        setLoading(false);
        return;
      }
    } catch {
      // fall through
    }

    let cancelled = false;
    const fetchJob = async () => {
      const res = await fetch(`/api/jobs/${params.jobId}`);
      if (res.ok && !cancelled) {
        const data = await res.json();
        setGeneration(data);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
          // Un informe nuevo cambia «N por generar» y «N doc.» del índice.
          if (data.status === "completed") refrescarIndice();
        }
      }
      if (!cancelled) setLoading(false);
    };

    fetchJob();
    const interval = setInterval(fetchJob, 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [params.jobId]);

  useEffect(() => {
    const target = generation?.status === "completed" ? 100 : (generation?.progress ?? 0);
    if (target > displayProgress) {
      const timer = setTimeout(() => {
        setDisplayProgress((prev) => Math.min(prev + 1, target));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [generation?.progress, generation?.status, displayProgress]);

  const triggerPptx = useCallback(async (genId: string) => {
    if (pptxTriggered.current) return;
    pptxTriggered.current = true;
    setPptxLoading(true);
    setPptxError("");

    try {
      const res = await fetch("/api/generate/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId: genId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPptxError(data.error || "Error al generar la presentación.");
        return;
      }

      const refreshRes = await fetch(`/api/jobs/${genId}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setGeneration(refreshData);
      }
    } catch {
      setPptxError("Error de conexión al generar la presentación.");
    } finally {
      setPptxLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only regenerate a PPTX the user actually asked for (pptxRequested marker),
    // and only if the background attempt didn't already produce one. Without the
    // marker guard, every informe-only result silently fabricated a slideshow.
    if (
      generation?.status === "completed" &&
      generation.outputFiles?.pptxRequested &&
      !generation.outputFiles?.presentacionPptx &&
      generation.outputFiles?.informeMarkdown
    ) {
      triggerPptx(generation.id);
    }
  }, [generation?.status, generation?.outputFiles, generation?.id, triggerPptx]);

  if (loading) {
    return (
      <div>
        <Header title="Resultado" />
        <Pagina>
          <Pieza>
            <Esqueleto variante="completo" filas={4} etiquetaAccesible="Cargando el resultado de la generación…" />
          </Pieza>
        </Pagina>
      </div>
    );
  }

  if (!generation) {
    return (
      <div>
        <Header title="Resultado" />
        <Pagina>
          <Pieza>
            <ErrorCarga
              titulo="Generación no encontrada."
              texto="Es posible que haya expirado o no exista."
              acciones={
                <Boton variante="secundario" href="/dashboard/historial" flecha="vuelve">
                  Ir al historial
                </Boton>
              }
            />
          </Pieza>
        </Pagina>
      </div>
    );
  }

  const isProcessing = generation.status === "processing" || generation.status === "pending";
  const isCompleted = generation.status === "completed";
  const isFailed = generation.status === "failed";
  const actaRequirements = parseActaRequirements(generation.outputFiles?.actaRequirements);

  const periodo = `${MONTHS[generation.month - 1]} ${generation.year}`;
  const subtitulo = `${generation.property.name} · ${periodo.toLowerCase()}`;
  const insumos = Array.isArray(generation.inputFiles) ? generation.inputFiles : null;
  const salida = generation.outputFiles;
  const pptxPendiente = Boolean(!salida?.presentacionPptx && salida?.pptxRequested && salida?.informeMarkdown);
  const nDocs =
    [salida?.informeHtml, salida?.actaHtml, salida?.presentacionPptx, salida?.transcripcion].filter(Boolean).length +
    (pptxPendiente ? 1 : 0);

  return (
    <div>
      <style href="k-generar-resultado-local" precedence="default">
        {CSS_RESULTADO}
      </style>
      <Header
        // Nombre corto: el completo ya va en el subtítulo de la pieza y en la
        // barra de 72 px no cabía junto a la miga sin partirse en dos líneas.
        title={`${nombreCorto(generation.property.name)} · ${MONTHS[generation.month - 1]} ${generation.year}`}
        breadcrumbs={[{ label: "Generar", href: "/dashboard/generar" }]}
      />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="02"
            titulo={isCompleted ? "Documentos listos." : isFailed ? "Error en la generación" : "Generando…"}
            subtitulo={subtitulo}
          />

          {/* ── Procesando ── */}
          {isProcessing && (
            <div className="k-r12 res-fila">
              <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                <ProgresoGeneracion
                  titulo={`Documentos de ${periodo.toLowerCase()}`}
                  subtitulo={generation.property.name}
                  porcentaje={displayProgress}
                  etapas={etapasDe(displayProgress, insumos?.length)}
                  nota="El proceso continúa aunque cierres esta página. Esta vista se actualiza automáticamente."
                />
              </div>
              <div className="res-lado" style={{ gridColumn: "8 / 13" }}>
                <Panel titulo="Qué se está generando">
                  <Resumen
                    etiquetaAccesible="Datos de la generación en curso"
                    filas={[
                      { etiqueta: "Propiedad", valor: generation.property.name },
                      { etiqueta: "Periodo", valor: periodo },
                      ...(insumos
                        ? [{ etiqueta: "Archivos", valor: insumos.length ? plural(insumos.length, "archivo", "archivos") : "Ninguno" }]
                        : []),
                      ...(fechaHora(generation.createdAt)
                        ? [{ etiqueta: "Iniciada", valor: fechaHora(generation.createdAt) }]
                        : []),
                    ]}
                  />
                </Panel>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {isFailed && (
            <div className="k-r12 res-fila">
              <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                <ErrorCarga
                  titulo="No pudimos generar los documentos."
                  texto={generation.errorMessage || "Ocurrió un error inesperado."}
                  acciones={
                    <Boton href="/dashboard/generar" flecha="avanza">
                      Intentar de nuevo
                    </Boton>
                  }
                />
              </div>
            </div>
          )}

          {/* ── Documentos ── */}
          {isCompleted && salida && (
            <div className="k-r12 res-fila">
              <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                <Panel titulo="Documentos generados" nota={plural(nDocs, "documento", "documentos")}>
                  <ul className="res-docs">
                    {salida.informeHtml && (
                      <FilaDocumento
                        tipo="INF"
                        nombre="Informe de gestión"
                        accion={
                          <Boton href={salida.informeHtml} nuevaPestana flecha="avanza" tam={40}>
                            Abrir e imprimir como PDF
                          </Boton>
                        }
                      />
                    )}

                    {salida.actaHtml && (
                      <FilaDocumento
                        tipo="ACTA"
                        nombre="Acta legal"
                        accion={
                          <Boton href={salida.actaHtml} nuevaPestana flecha="avanza" tam={40}>
                            Abrir e imprimir como PDF
                          </Boton>
                        }
                      />
                    )}

                    {salida.presentacionPptx ? (
                      <FilaDocumento
                        tipo="PRES"
                        nombre="Presentación PPTX"
                        detalle="PowerPoint listo para presentar"
                        accion={
                          <Boton variante="secundario" href={salida.presentacionPptx} descargar tam={40}>
                            Descargar
                          </Boton>
                        }
                      />
                    ) : pptxPendiente ? (
                      // Mismo marcador que usa el efecto que dispara la generación: sin
                      // esto, todo informe SIN presentación pintaba una fila
                      // "Preparando…" que nadie iba a completar nunca.
                      <FilaDocumento
                        tipo="PRES"
                        nombre="Presentación PPTX"
                        error={Boolean(pptxError) && !pptxLoading}
                        detalle={!pptxLoading && pptxError ? pptxError : undefined}
                        estado={
                          pptxLoading ? (
                            <Estado tipo="enCurso" tamLetra={14}>Generando la presentación…</Estado>
                          ) : pptxError ? (
                            <Estado tipo="vencido" tamLetra={14}>Error</Estado>
                          ) : (
                            <Estado tipo="pendiente" tamLetra={14}>Preparando…</Estado>
                          )
                        }
                        accion={
                          !pptxLoading && pptxError ? (
                            <Boton
                              variante="secundario"
                              tam={40}
                              onClick={() => { pptxTriggered.current = false; triggerPptx(generation.id); }}
                            >
                              Reintentar
                            </Boton>
                          ) : undefined
                        }
                      />
                    ) : null}

                    {salida.transcripcion && (
                      <FilaDocumento
                        tipo="TXT"
                        nombre="Transcripción de insumos"
                        detalle="Verifica la transcripción de audios y el análisis de fotos."
                        accion={
                          <Boton variante="secundario" href={salida.transcripcion} nuevaPestana tam={40}>
                            Abrir
                          </Boton>
                        }
                      />
                    )}
                  </ul>
                </Panel>
              </div>
              <div className="res-lado" style={{ gridColumn: "8 / 13" }}>
                <Panel titulo="Resumen">
                  <Resumen
                    etiquetaAccesible="Datos de la generación"
                    filas={[
                      { etiqueta: "Propiedad", valor: generation.property.name },
                      { etiqueta: "Periodo", valor: periodo },
                      ...(fechaHora(generation.completedAt)
                        ? [{ etiqueta: "Generados", valor: fechaHora(generation.completedAt) }]
                        : []),
                      ...(insumos
                        ? [{ etiqueta: "Archivos usados", valor: insumos.length ? plural(insumos.length, "archivo", "archivos") : "Ninguno" }]
                        : []),
                    ]}
                  />
                </Panel>
              </div>
            </div>
          )}

          {/* ── Requisitos del acta ── */}
          {isCompleted && generation.outputFiles?.actaHtml && actaRequirements.length > 0 && (
            <ActaRequirementsChecklist requirements={actaRequirements} />
          )}

          {/* ── Correcciones ── */}
          {isCompleted && (generation.outputFiles?.informeHtml || generation.outputFiles?.actaHtml) && (
            <CorrectionPanel
              generationId={generation.id}
              hasInforme={!!generation.outputFiles?.informeHtml}
              hasActa={!!generation.outputFiles?.actaHtml}
              onRefreshed={(data) => { pptxTriggered.current = false; setGeneration(data); }}
            />
          )}

          {/* ── Volver ── */}
          <nav className="res-nav" aria-label="Siguientes pasos">
            <Boton variante="secundario" href="/dashboard/historial" flecha="vuelve">
              Historial
            </Boton>
            {isCompleted && (
              <Boton href="/dashboard/generar" flecha="crea">
                Nueva generación
              </Boton>
            )}
          </nav>
        </Pieza>
      </Pagina>
    </div>
  );
}

function ActaRequirementsChecklist({ requirements }: { requirements: ActaRequirement[] }) {
  const completed = requirements.filter((r) => r.status === "completo").length;
  const total = requirements.length;
  const allComplete = completed === total;
  const faltan = total - completed;

  return (
    <div className="k-r12 res-fila">
      <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
        <Panel titulo="Requisitos del acta legal" nota="Verificación según la Ley 675 de 2001">
          <ul className="res-reqs">
            {requirements.map((req, i) => (
              <li key={i} className="res-req">
                {req.status === "completo" ? (
                  <Estado tipo="ok" tamLetra={14}>Completo</Estado>
                ) : (
                  <Estado tipo="falta" tamLetra={14}>Pendiente</Estado>
                )}
                <div>
                  <b>{req.item}</b>
                  <span className="d">{req.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="res-lado" style={{ gridColumn: "8 / 13" }}>
        <p className="res-cifra">
          <b>{completed}</b>
          <span>de {plural(total, "requisito completo", "requisitos completos")}</span>
        </p>
        {!allComplete && (
          <Aviso
            tipo="info"
            enLinea
            rol={null}
            titulo={`Hay ${faltan} ${faltan > 1 ? "requisitos pendientes" : "requisito pendiente"}.`}
            texto="Puedes completarlos usando el panel de correcciones de abajo, indicando la información faltante."
          />
        )}
      </div>
    </div>
  );
}

function CorrectionPanel({ generationId, hasInforme, hasActa, onRefreshed }: { generationId: string; hasInforme: boolean; hasActa: boolean; onRefreshed: (data: Generation) => void }) {
  const [instruction, setInstruction] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Elegidos con el selector o soltados en la zona: como antes, hasta 10.
  const handleFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles].slice(0, 10));
  };

  const handleCorrect = async () => {
    if (!instruction.trim() && files.length === 0) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setUploadStatus("");

    try {
      // Upload files if any
      const blobFiles: { url: string; name: string; type: string; size: number }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStatus(`Subiendo ${i + 1}/${files.length}: ${file.name}`);
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const result = await upload(`corrections/${Date.now()}-${safeName}`, file, {
          access: "private",
          handleUploadUrl: "/api/upload/token",
          contentType: file.type || "application/octet-stream",
          multipart: file.size > 10 * 1024 * 1024,
        });
        blobFiles.push({ url: result.url, name: file.name, type: file.type, size: file.size });
      }

      setUploadStatus("Aplicando corrección…");

      const res = await fetch("/api/generate/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          instruction: instruction.trim() || "Complementa los documentos con la informacion de los archivos adjuntos.",
          blobFiles,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al corregir.");
        return;
      }

      const docs = (data.documentsUpdated as string[]) || [];
      const docNames = docs.map((d: string) => d === "informe" ? "Informe" : "Acta").join(" y ");
      // `warning` llega cuando algún documento quedó fuera (demasiado extenso o
      // respuesta cortada). Callarlo dejaba creer que se corrigió todo.
      const warning = typeof data.warning === "string" ? data.warning : "";
      // Concordancia: «Acta actualizada», «Informe actualizado», «Informe y Acta actualizados».
      const actualizado = docs.length > 1 ? "actualizados" : docs[0] === "acta" ? "actualizada" : "actualizado";
      setSuccess(
        `${docNames} ${actualizado} exitosamente.${hasInforme ? " La presentación PPTX se regenerará." : ""}` +
          (warning ? ` ${warning}` : "")
      );
      setInstruction("");
      setFiles([]);

      const refreshRes = await fetch(`/api/jobs/${generationId}`);
      if (refreshRes.ok) onRefreshed(await refreshRes.json());
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
      setUploadStatus("");
    }
  };

  const docLabel = hasInforme && hasActa ? "a todos los documentos" : hasInforme ? "al informe" : "al acta";
  const canSubmit = instruction.trim() || files.length > 0;

  return (
    <div className="k-r12 res-fila res-corr">
      <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
        <Panel titular titulo="Corregir o complementar documentos">
          <p className="res-apoyo">
            Escribe instrucciones o sube archivos adicionales. Los cambios se aplican {docLabel}.
          </p>
          <Campo id="res-instruccion" etiqueta="Instrucciones">
            <AreaTexto
              id="res-instruccion"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              placeholder="Ej.: agrega que se realizó mantenimiento del ascensor el 15 de marzo. El costo fue de $2.500.000…"
            />
          </Campo>

          <ZonaSubida
            compacta
            titulo="Subir archivos adicionales"
            texto="Audios, PDF, fotos, Excel: para complementar información faltante."
            etiquetaAccesible="Subir archivos adicionales para la corrección"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.ogg,.m4a,.webm"
            alElegir={handleFiles}
          />

          {files.length > 0 && (
            <ListaArchivos etiquetaAccesible="Archivos para la corrección">
              {files.map((file, i) => (
                <FilaArchivo
                  key={`${file.name}-${i}`}
                  nombre={file.name}
                  detalle={pesoLegible(file.size)}
                  estado="listo"
                  alQuitar={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
            </ListaArchivos>
          )}

          {error && <Aviso tipo="error" enLinea titulo={error} />}
          {success && <Aviso tipo="ok" enLinea titulo={success} />}

          <div className="enviar">
            <Boton onClick={handleCorrect} disabled={!canSubmit} cargando={loading} textoCargando="Corrigiendo…">
              Aplicar corrección
            </Boton>
            {/* El avance de la subida va en texto aparte: en el botón no cabe un nombre de archivo largo. */}
            <p role="status">{loading ? uploadStatus : ""}</p>
            {!canSubmit && !loading && <p>Escribe una instrucción o sube un archivo para aplicarla.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
