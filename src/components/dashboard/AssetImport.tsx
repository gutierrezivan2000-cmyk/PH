"use client";

import { useState } from "react";
import { ASSET_KIND_LABELS, recurrenceLabel, type AssetKind } from "@/lib/common-assets";
import {
  Boton,
  BotonFila,
  Entrada,
  Estado,
  FilaArchivo,
  ListaArchivos,
  Selector,
  TipoArchivo,
  ZonaSubida,
  tipoDeArchivo,
} from "@/components/kit";

interface ExtractedAsset {
  kind: AssetKind;
  name: string;
  provider: string | null;
  reference: string | null;
  dueDate: string | null; // "YYYY-MM-DD"
  recurrenceMonths: number | null;
}

/** Ver la misma nota en units/import: Vercel corta el cuerpo en 4,5 MB. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function errorForStatus(status: number): string {
  if (status === 413) return "El archivo es demasiado grande. Guárdalo como CSV e inténtalo de nuevo.";
  if (status === 429) return "Alcanzaste el límite de importaciones por hora. Intenta más tarde.";
  if (status === 504 || status === 408)
    return "El archivo tardó demasiado en procesarse. Prueba con menos filas o guárdalo como CSV.";
  if (status >= 500) return "El servidor falló al procesar el archivo. Inténtalo de nuevo en un momento.";
  return "No se pudo procesar el archivo.";
}

/* Estilos locales (el kit no trae la revisión de filas importadas). Solo tokens. */
const CSS_IMPORT = `
.ai-leyendo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 14px 0 0; padding: 12px 0; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line); }
.ai-leyendo b { font-size: 15px; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; min-width: 0; }
.ai-err { margin: 12px 0 0; }
.ai-prev { border-top: 1px solid var(--line-strong); padding-top: 12px; }
.ai-prev-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; }
.ai-prev-h h3 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.01em; line-height: 1.05; }
.ai-prev-h p { margin: 0; font-size: 14px; line-height: 1.35; color: var(--ink-2); }
.ai-cab, .ai-fila { display: grid; grid-template-columns: minmax(0, 1fr) 176px 188px auto; column-gap: 16px; }
.ai-cab { margin-top: 14px; padding: 9px 8px 8px; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); font: 500 12px/1.2 var(--f-mono); letter-spacing: .05em; color: var(--ink-2); }
.ai-cab > span:last-child { min-width: 72px; }
.ai-filas { list-style: none; margin: 0; padding: 0; max-height: 480px; overflow-y: auto; }
.ai-fila { align-items: center; padding: 10px 8px; border-bottom: 1px solid var(--line); }
.ai-fila.sin-fecha { background: var(--danger-pale); }
.ai-fila > * { min-width: 0; }
.ai-fila .nom b { display: block; font-size: 15px; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.ai-fila .nom span { display: block; margin-top: 2px; font-size: 14px; line-height: 1.3; color: var(--ink-3); overflow-wrap: anywhere; }
.ai-fila.sin-fecha .nom span { color: var(--ink-2); }
.ai-fila.sin-fecha .nom span.falta { color: var(--danger-text); font-weight: 600; }
.ai-lb { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.ai-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding-top: 16px; }
.ai-pie .k-err { flex-basis: 100%; }
@media (min-width: 861px) {
  .ai-zona .k-zona.k-compacta { padding-right: 84px; }
  /* La zona vive en una columna estrecha: la fila de archivo usa la disposición apilada del kit (≤ 1180). */
  .ai-zona .k-arch { grid-template-columns: 52px minmax(0, 1fr) 44px; grid-template-areas: "tipo nom x" ". barra x" ". est x"; row-gap: 6px; }
  .ai-zona .k-arch > .est { justify-content: flex-start; }
}
@media (max-width: 860px) {
  .ai-cab { display: none; }
  .ai-filas { max-height: none; overflow: visible; }
  .ai-fila { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); row-gap: 10px; column-gap: 12px; padding: 14px 0; }
  .ai-fila.sin-fecha { box-shadow: -8px 0 0 var(--danger-pale), 8px 0 0 var(--danger-pale); }
  .ai-fila .nom, .ai-fila .x { grid-column: 1 / -1; }
  .ai-fila .x .k-bt { min-height: 44px; }
  .ai-lb { position: static; width: auto; height: auto; margin: 0 0 6px; overflow: visible; clip: auto; white-space: normal; display: block; font-size: 14px; font-weight: 600; color: var(--ink-2); }
  .ai-pie .k-btn { flex: 1 1 100%; }
}
`;

/**
 * Importación de la bitácora asistida por IA: sube un Excel/PDF/Word con la
 * lista de zonas comunes y pólizas, Claude la organiza, el admin revisa y
 * corrige (sobre todo las fechas, lo más propenso a errores) antes de crear.
 */
export function AssetImport({
  propertyId,
  onImported,
}: {
  propertyId: string;
  onImported: (created: number) => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ExtractedAsset[] | null>(null);
  const [fileName, setFileName] = useState("");

  // La zona de subida del kit entrega los archivos elegidos o soltados y limpia
  // su propio <input> (antes lo hacía inputRef): la lógica de envío es la misma.
  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setPreview(null);
    setFileName(file.name);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB y el máximo es 4 MB. ` +
          `Si es un Excel, guárdalo como CSV: pesa muchísimo menos.`
      );
      return;
    }

    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/properties/${propertyId}/common-assets/import`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      const assets = data?.assets || [];
      if (assets.length === 0) {
        setError("No se reconoció ninguna zona común ni póliza en el archivo.");
        return;
      }
      setPreview(assets);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setParsing(false);
    }
  }

  function updateRow(i: number, patch: Partial<ExtractedAsset>) {
    setPreview((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, ...patch } : r)) : prev));
  }

  async function confirm() {
    if (!preview || preview.length === 0) return;
    if (preview.some((a) => !a.dueDate)) {
      setError("Completa la fecha de todas las filas antes de crear los registros.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/common-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, assets: preview }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      setPreview(null);
      setFileName("");
      onImported(data.created || 0);
    } catch {
      setError("Error de red. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setCreating(false);
    }
  }

  const descartar = () => {
    setPreview(null);
    setFileName("");
  };

  const estilos = (
    <style href="k-assetimport-local" precedence="default">
      {CSS_IMPORT}
    </style>
  );

  if (!preview) {
    return (
      <div className="ai-zona">
        {estilos}
        <ZonaSubida
          compacta
          titulo="Suelta aquí el listado"
          texto="o haz clic para elegir el archivo."
          formatos="Excel, CSV, PDF, Word o texto · hasta 4 MB"
          accept=".xlsx,.xls,.csv,.pdf,.docx,.txt"
          deshabilitado={parsing}
          etiquetaAccesible="Elegir el archivo con el listado de zonas comunes y pólizas"
          alElegir={(archivos) => onFile(archivos[0])}
        />

        {parsing && (
          <p className="ai-leyendo" role="status">
            <TipoArchivo>{tipoDeArchivo(fileName)}</TipoArchivo>
            <b>{fileName}</b>
            <Estado tipo="enCurso" tamLetra={14}>Leyendo el archivo con IA…</Estado>
          </p>
        )}

        {!parsing && error && fileName && (
          <ListaArchivos etiquetaAccesible="Archivo elegido">
            <FilaArchivo
              nombre={fileName}
              estado="error"
              mensaje={error}
              alQuitar={() => {
                setError("");
                setFileName("");
              }}
              etiquetaQuitar={`Descartar ${fileName}`}
            />
          </ListaArchivos>
        )}
        {!parsing && error && !fileName && (
          <p className="k-err ai-err" role="alert">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="ai-prev">
      {estilos}
      <div className="ai-prev-h">
        <h3>
          {preview.length} {preview.length === 1 ? "registro detectado" : "registros detectados"}
        </h3>
        <p>
          {fileName && <>De {fileName}. </>}Revisa sobre todo las fechas: son lo más fácil de leer mal desde un
          documento escaneado.
        </p>
      </div>

      <div className="ai-cab" aria-hidden="true">
        <span>Nombre</span>
        <span>Tipo</span>
        <span>Fecha</span>
        <span />
      </div>
      <ul className="ai-filas" aria-label="Registros detectados en el archivo">
        {preview.map((a, i) => {
          const detalle = [
            a.provider,
            a.reference ? `Ref. ${a.reference}` : null,
            a.recurrenceMonths ? recurrenceLabel(a.recurrenceMonths) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const nombre = a.name || `Fila ${i + 1}`;
          return (
            <li key={i} className={a.dueDate ? "ai-fila" : "ai-fila sin-fecha"}>
              <div className="nom">
                <b>{nombre}</b>
                {detalle && <span>{detalle}</span>}
                {!a.dueDate && <span className="falta">Falta la fecha</span>}
              </div>
              <div>
                <label className="ai-lb" htmlFor={`ai-tipo-${i}`}>Tipo<span className="k-sr"> de {nombre}</span></label>
                <Selector
                  id={`ai-tipo-${i}`}
                  value={a.kind}
                  onChange={(e) => updateRow(i, { kind: e.target.value === "poliza" ? "poliza" : "zona_comun" })}
                >
                  <option value="zona_comun">{ASSET_KIND_LABELS.zona_comun}</option>
                  <option value="poliza">{ASSET_KIND_LABELS.poliza}</option>
                </Selector>
              </div>
              <div>
                <label className="ai-lb" htmlFor={`ai-fecha-${i}`}>Fecha<span className="k-sr"> de {nombre}</span></label>
                <Entrada
                  id={`ai-fecha-${i}`}
                  type="date"
                  value={a.dueDate || ""}
                  invalido={!a.dueDate}
                  onChange={(e) => updateRow(i, { dueDate: e.target.value || null })}
                />
              </div>
              <div className="x">
                <BotonFila
                  onClick={() => setPreview((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))}
                  aria-label={`Quitar ${nombre} de la lista`}
                >
                  Quitar
                </BotonFila>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="ai-pie">
        {error && <p className="k-err" role="alert">{error}</p>}
        <Boton
          onClick={confirm}
          disabled={preview.length === 0}
          cargando={creating}
          textoCargando="Creando los registros…"
          flecha="crea"
        >
          Crear {preview.length} {preview.length === 1 ? "registro" : "registros"}
        </Boton>
        <Boton variante="fantasma" onClick={descartar} disabled={creating}>
          Descartar
        </Boton>
      </div>
    </div>
  );
}
