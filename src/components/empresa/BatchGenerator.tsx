"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOC_KIND_LABELS, docTypesFromSelection, type DocKind } from "@/lib/generation/doc-kind";
import {
  AccionesFila,
  Aviso,
  Boton,
  BotonFila,
  Buscador,
  Casilla,
  Esqueleto,
  Estado,
  Opcion,
  Panel,
  ProgresoGeneracion,
  RejillaMeses,
  Segmentos,
  SinResultados,
  Tabla,
  Vacio,
  type EtapaGeneracion,
} from "@/components/kit";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type PreviewRow = {
  propertyId: string;
  name: string;
  city: string | null;
  groupLabel: string | null;
  fileCount: number;
  ready: boolean;
  alreadyGenerated: boolean;
};

type Progress = {
  total: number; completed: number; failed: number; pending: number; processing: number; done: boolean;
  items: { generationId: string; propertyName: string; status: string; errorMessage: string | null }[];
};

export function BatchGenerator() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const years = [now.getFullYear(), now.getFullYear() - 1];

  // Un lote produce UN tipo de documento. Informe y acta necesitan insumos
  // distintos, así que mezclarlos en el mismo lote ensuciaba ambos resultados.
  const [docKind, setDocKind] = useState<DocKind>("informe");
  const [includePptx, setIncludePptx] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [regenerate, setRegenerate] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the readiness preview whenever the period changes.
  useEffect(() => {
    if (batchId) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/empresa/batch?month=${month}&year=${year}&docKind=${docKind}`)
      .then((r) => (r.ok ? r.json() : { properties: [] }))
      .then((d) => {
        if (!active) return;
        const list: PreviewRow[] = Array.isArray(d.properties) ? d.properties : [];
        setRows(list);
        // Default-select ready properties that aren't already generated.
        setSelected(new Set(list.filter((p) => p.ready && !p.alreadyGenerated).map((p) => p.propertyId)));
      })
      .catch(() => setError("No se pudo cargar la lista de propiedades."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, year, docKind, batchId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.city || "").toLowerCase().includes(q));
  }, [rows, query]);

  const readyCount = rows.filter((r) => r.ready).length;
  const selectableIds = rows.filter((r) => r.ready).map((r) => r.propertyId);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllReady = () => setSelected(new Set(selectableIds));
  const clearAll = () => setSelected(new Set());

  const launch = async () => {
    setError("");
    const docs = docTypesFromSelection({ kind: docKind, includePptx });
    if (selected.size === 0) { setError("Selecciona al menos una propiedad lista."); return; }
    setLaunching(true);
    try {
      const res = await fetch("/api/empresa/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, docTypes: docs, propertyIds: [...selected], regenerate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "No se pudo iniciar el lote."); return; }
      setBatchId(data.batchId);
    } catch {
      setError("Error de conexión al iniciar el lote.");
    } finally {
      setLaunching(false);
    }
  };

  // Poll progress once a batch is running.
  const poll = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/empresa/batch/${id}`);
      if (r.ok) setProgress(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!batchId) return;
    poll(batchId);
    pollRef.current = setInterval(() => poll(batchId), 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [batchId, poll]);

  useEffect(() => {
    if (progress?.done && pollRef.current) clearInterval(pollRef.current);
  }, [progress?.done]);

  const retryFailed = async () => {
    if (!batchId) return;
    setRetrying(true);
    try {
      await fetch(`/api/empresa/batch/${batchId}`, { method: "POST" });
      await poll(batchId);
      if (!pollRef.current || progress?.done) {
        pollRef.current = setInterval(() => poll(batchId), 4000);
      }
    } finally {
      setRetrying(false);
    }
  };

  // ── Progress view ──────────────────────────────────────────────────────────
  if (batchId && progress) {
    const pct = progress.total ? Math.round(((progress.completed + progress.failed) / progress.total) * 100) : 0;
    const enCola = progress.pending + progress.processing;
    // Una fila por propiedad del lote, con el estado real de su generación.
    const etapas: EtapaGeneracion[] = progress.items.map((it) => ({
      nombre: it.propertyName,
      estado:
        it.status === "completed" ? "listo"
        : it.status === "failed" ? "error"
        : it.status === "processing" ? "curso"
        : "espera",
      motivo: it.status === "failed" ? it.errorMessage || undefined : undefined,
    }));
    return (
      <div className="emp-lote">
        <style href="k-empresa-lote" precedence="default">{CSS_LOTE}</style>
        <div className="emp-prog">
          <ProgresoGeneracion
            titulo={`Lote de ${MONTHS[month - 1].toLowerCase()} ${year}`}
            subtitulo={
              `${progress.completed} de ${progress.total} listas` +
              ` · ${enCola} en cola` +
              (progress.failed > 0 ? ` · ${progress.failed} ${progress.failed === 1 ? "fallida" : "fallidas"}` : "")
            }
            porcentaje={pct}
            etapas={etapas}
            nota={progress.done ? "Completado." : "Generando… el procesamiento continúa aunque cierres esta página."}
            acciones={
              <>
                {progress.failed > 0 && (
                  <Boton variante="secundario" onClick={retryFailed} cargando={retrying} textoCargando="Reintentando…">
                    Reintentar fallidas
                  </Boton>
                )}
                <Boton variante="secundario" onClick={() => { setBatchId(null); setProgress(null); }}>
                  Nuevo lote
                </Boton>
                <Boton href="/empresa/propiedades" flecha="avanza">Ver propiedades</Boton>
              </>
            }
          />
        </div>
      </div>
    );
  }

  // ── Configuration view ─────────────────────────────────────────────────────
  const hayConsulta = query.trim().length > 0;
  return (
    <div className="emp-lote">
      <style href="k-empresa-lote" precedence="default">{CSS_LOTE}</style>
      {error && <Aviso enLinea tipo="error" titulo={error} className="emp-lote-err" />}

      {/* Periodo + documento */}
      <div className="emp-conf">
        <Panel titulo="Periodo" nota={`${MONTHS[month - 1]} ${year}`} className="emp-conf-per">
          <Segmentos
            etiquetaAccesible="Año del lote"
            valor={String(year)}
            alCambiar={(id) => setYear(Number(id))}
            items={years.map((y) => ({ id: String(y), etiqueta: String(y) }))}
            className="emp-anios"
          />
          <RejillaMeses
            nombre="batchMonth"
            etiquetaAccesible={`Mes del lote · ${year}`}
            valor={month}
            alCambiar={setMonth}
          />
        </Panel>

        <Panel titulo="Documento" nota="uno por lote" className="emp-conf-doc">
          <div className="k-ctls" role="radiogroup" aria-label="Documento a generar">
            {(["informe", "acta"] as const).map((k) => (
              <Opcion
                key={k}
                name="batchDocKind"
                etiqueta={DOC_KIND_LABELS[k]}
                checked={docKind === k}
                onChange={() => { setDocKind(k); if (k === "acta") setIncludePptx(false); }}
              />
            ))}
          </div>
          <div className="k-ctls emp-pptx">
            <Casilla
              etiqueta="Incluir presentación"
              detalle={docKind === "informe" ? "Diapositivas del informe de gestión." : "Un acta no tiene diapositivas."}
              checked={includePptx}
              disabled={docKind !== "informe"}
              onChange={(e) => setIncludePptx(e.target.checked)}
            />
          </div>
        </Panel>
      </div>

      {/* Lista de propiedades */}
      <Panel
        titulo="Propiedades"
        nota={`${readyCount} de ${rows.length} con datos del mes · ${selected.size} ${selected.size === 1 ? "seleccionada" : "seleccionadas"}`}
        className="emp-lista"
      >
        <div className="emp-barra">
          <Buscador
            etiquetaAccesible="Buscar propiedad"
            placeholder="Buscar propiedad…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="emp-barra-acc">
            <Casilla etiqueta="Regenerar ya generadas" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} />
            <Boton variante="fantasma" tam={40} onClick={selectAllReady} disabled={selectableIds.length === 0}>
              Todas las listas
            </Boton>
            <Boton variante="fantasma" tam={40} onClick={clearAll} disabled={selected.size === 0}>
              Ninguna
            </Boton>
          </div>
        </div>

        {loading ? (
          <Esqueleto variante="tabla" filas={4} etiquetaAccesible="Cargando las propiedades…" />
        ) : (
          <Tabla<PreviewRow>
            etiquetaAccesible={`Propiedades para el lote de ${MONTHS[month - 1].toLowerCase()} ${year}`}
            filas={filtered}
            claveFila={(p) => p.propertyId}
            vacio={
              hayConsulta ? (
                <SinResultados
                  nivel={3}
                  consulta={query.trim()}
                  titulo={`No encontramos «${query.trim()}» en tu portafolio.`}
                  texto="Busca por nombre o ciudad de la copropiedad."
                  acciones={<Boton variante="fantasma" onClick={() => setQuery("")}>Limpiar búsqueda</Boton>}
                />
              ) : (
                <Vacio
                  nivel={3}
                  titulo="No hay propiedades para este periodo."
                  acciones={<Boton variante="secundario" href="/empresa/propiedades">Ver propiedades</Boton>}
                />
              )
            }
            columnas={[
              {
                id: "sel",
                titulo: "Incluir",
                ancho: "56px",
                principal: true,
                celda: (p) => (
                  <Casilla
                    checked={selected.has(p.propertyId)}
                    disabled={!p.ready}
                    onChange={() => toggle(p.propertyId)}
                    aria-label={p.ready ? `Incluir ${p.name}` : `${p.name}: faltan datos del mes`}
                  />
                ),
              },
              {
                id: "prop",
                titulo: "Propiedad",
                ancho: "minmax(0, 3fr)",
                celda: (p) => (
                  <span className="emp-lnom">
                    <b>{p.name}</b>
                    <span>{p.city || "Sin ciudad"}{p.groupLabel ? ` · ${p.groupLabel}` : ""}</span>
                  </span>
                ),
              },
              {
                id: "datos",
                titulo: "Datos del mes",
                ancho: "minmax(0, 1.6fr)",
                celda: (p) =>
                  p.ready ? (
                    <Estado tipo="ok" tamLetra={14}>
                      {p.fileCount} {p.fileCount === 1 ? "archivo" : "archivos"}
                    </Estado>
                  ) : (
                    <Estado tipo="falta" tamLetra={14}>Faltan datos</Estado>
                  ),
              },
              {
                id: "gen",
                titulo: "Este periodo",
                ancho: "minmax(0, 1.4fr)",
                celda: (p) =>
                  p.alreadyGenerated ? (
                    <Estado tipo="ok" tamLetra={14}>Ya generado</Estado>
                  ) : (
                    <Estado tipo="pendiente" tamLetra={14}>Sin generar</Estado>
                  ),
              },
              {
                id: "acc",
                titulo: "Acciones",
                tituloOculto: true,
                alinear: "fin",
                ancho: "auto",
                claseCelda: "k-td-acc",
                celda: (p) =>
                  p.ready ? null : (
                    <AccionesFila>
                      <BotonFila href={`/empresa/propiedades/${p.propertyId}`} aria-label={`Cargar datos de ${p.name}`}>
                        Cargar datos
                      </BotonFila>
                    </AccionesFila>
                  ),
              },
            ]}
          />
        )}
      </Panel>

      <div className="emp-lanzar">
        <Boton
          tam={56}
          flecha="avanza"
          onClick={launch}
          disabled={selected.size === 0}
          cargando={launching}
          textoCargando="Iniciando el lote…"
          ancho="movil"
        >
          Generar {selected.size} {selected.size === 1 ? "propiedad" : "propiedades"}
        </Boton>
        <p>
          Solo se generan las propiedades con datos cargados. Las demás aparecen como «Faltan datos».
        </p>
      </div>
    </div>
  );
}

const CSS_LOTE = `
.emp-lote-err { margin-bottom: 24px; }
.emp-conf { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--g); align-items: start; margin-bottom: 48px; }
.emp-conf-per { grid-column: 1 / 8; }
.emp-conf-doc { grid-column: 8 / 13; }
.emp-anios { margin-bottom: 16px; }
.emp-pptx { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
.emp-lista { margin-bottom: 32px; }
.emp-barra { display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap; margin-bottom: 16px; }
.emp-barra > .k-campo { flex: 1 1 280px; max-width: 420px; }
.emp-barra-acc { display: flex; align-items: center; gap: 4px 12px; flex-wrap: wrap; margin-left: auto; }
.emp-lnom { display: block; min-width: 0; }
.emp-lnom b { display: block; font-size: 16px; font-weight: 650; line-height: 1.2; overflow-wrap: anywhere; }
.emp-lnom > span { display: block; margin-top: 3px; font-size: 14px; line-height: 1.3; color: var(--ink-3); }
.emp-lanzar { display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap; }
.emp-lanzar p { margin: 0; flex: 1 1 280px; font-size: 14px; line-height: 1.4; color: var(--ink-2); max-width: 56ch; }
.emp-prog { max-width: 760px; }
@media (max-width: 1180px) {
  .emp-conf-per, .emp-conf-doc { grid-column: 1 / -1; }
  .emp-conf-doc { margin-top: 32px; }
}
@media (max-width: 860px) {
  .emp-conf { display: block; margin-bottom: 36px; }
  .emp-barra > .k-campo { flex: 1 1 100%; max-width: none; }
  .emp-barra-acc { margin-left: 0; }
  .emp-barra-acc > .k-ctl { flex: 1 1 100%; }
}
`;
