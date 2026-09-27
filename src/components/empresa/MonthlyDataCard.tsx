"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  limiteBytesPara,
  mensajeDeTamano,
  tipoDeArchivo,
  ACCEPT_ARCHIVOS,
  MAX_AUDIO_MB,
} from "@/lib/upload-limits";
import {
  AreaTexto,
  Aviso,
  Campo,
  Esqueleto,
  Estado,
  FilaArchivo,
  ListaArchivos,
  Panel,
  Selector,
  ZonaSubida,
  pesoLegible,
} from "@/components/kit";

type FileRef = { name: string; url: string; type: string; size: number };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function MonthlyDataCard({ propertyId }: { propertyId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [files, setFiles] = useState<FileRef[]>([]);
  const [additionalText, setAdditionalText] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const years = [now.getFullYear(), now.getFullYear() - 1];

  // Load staged data whenever the period changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSaved(false);
    fetch(`/api/empresa/properties/${propertyId}/monthly?month=${month}&year=${year}`)
      .then((r) => (r.ok ? r.json() : { files: [], additionalText: "" }))
      .then((d) => {
        if (!active) return;
        setFiles(Array.isArray(d.files) ? d.files : []);
        setAdditionalText(d.additionalText || "");
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [propertyId, month, year]);

  const persist = useCallback(
    async (nextFiles: FileRef[], nextText: string) => {
      setError("");
      try {
        const res = await fetch(`/api/empresa/properties/${propertyId}/monthly`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, year, files: nextFiles, additionalText: nextText }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || "No se pudo guardar.");
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        setError("Error de conexión al guardar.");
      }
    },
    [propertyId, month, year]
  );

  const handleFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const added: FileRef[] = [];
      const seleccionados = Array.from(list).slice(0, 20);

      // Se comprueba ANTES de subir: el tope depende del tipo (una grabación de
      // asamblea necesita mucho más que un PDF) y avisar después de esperar la
      // subida entera era parte de lo que los usuarios reportaban como error.
      const grande = seleccionados.find((f) => f.size > limiteBytesPara(f.name));
      if (grande) {
        setError(mensajeDeTamano(grande));
        setUploading(false);
        return;
      }

      for (const file of seleccionados) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const result = await blobUpload(
          `monthly/${propertyId}/${year}-${month}/${Date.now()}-${safeName}`,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/upload/token",
            // El navegador deja el tipo vacío en muchas grabaciones; mandar
            // "application/octet-stream" garantizaba el rechazo del servidor.
            contentType: tipoDeArchivo(file),
            multipart: file.size > 10 * 1024 * 1024,
          }
        );
        added.push({ name: file.name, url: result.url, type: tipoDeArchivo(file), size: file.size });
      }
      const next = [...files, ...added].slice(0, 20);
      setFiles(next);
      await persist(next, additionalText);
    } catch {
      setError(
        `No se pudo subir el archivo. Revisa que sea un formato admitido y que la grabación no supere ${MAX_AUDIO_MB} MB.`
      );
    } finally {
      // La zona de subida del kit limpia su propio <input type="file">.
      setUploading(false);
    }
  };

  const removeFile = async (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    await persist(next, additionalText);
  };

  const onNoteChange = (v: string) => {
    setAdditionalText(v);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => persist(files, v), 700);
  };

  const lleno = files.length >= 20;

  return (
    <Panel titulo="Datos del mes" nota="para la generación en lote" className="emp-mes">
      <style href="k-empresa-mes" precedence="default">{CSS_MES}</style>
      <div className="emp-mes-per">
        <Campo id={`mes-${propertyId}`} etiqueta="Mes">
          <Selector id={`mes-${propertyId}`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </Selector>
        </Campo>
        <Campo id={`anio-${propertyId}`} etiqueta="Año">
          <Selector id={`anio-${propertyId}`} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Selector>
        </Campo>
        <span className="emp-mes-ok" role="status">
          {saved && <Estado tipo="ok" tamLetra={14}>Guardado</Estado>}
        </span>
      </div>

      <p className="emp-mes-txt">
        Sube aquí los archivos de <strong>{MONTHS[month - 1].toLowerCase()} {year}</strong> de esta copropiedad
        (cartera, estados financieros, PQRS, actas previas…). Se usarán cuando generes en lote.
      </p>

      {error && <Aviso enLinea tipo="error" titulo={error} className="emp-mes-err" />}

      {loading ? (
        <Esqueleto variante="bloque" etiquetaAccesible="Cargando los datos del mes…" />
      ) : (
        <>
          <ZonaSubida
            compacta
            multiple
            accept={ACCEPT_ARCHIVOS}
            deshabilitado={uploading || lleno}
            alElegir={(lista) => handleFiles(lista)}
            titulo={uploading ? "Subiendo…" : lleno ? "Máximo 20 archivos" : "Suelta aquí los archivos del mes"}
            texto={uploading || lleno ? undefined : "o haz clic para elegirlos."}
            formatos="PDF, Excel, Word, imágenes y audio · hasta 20 archivos"
            etiquetaAccesible={`Subir archivos de ${MONTHS[month - 1].toLowerCase()} ${year}`}
          />

          {files.length > 0 && (
            <ListaArchivos etiquetaAccesible={`Archivos de ${MONTHS[month - 1].toLowerCase()} ${year}`}>
              {files.map((f, i) => (
                <FilaArchivo
                  key={i}
                  nombre={f.name}
                  detalle={pesoLegible(f.size)}
                  estado="listo"
                  alQuitar={() => removeFile(i)}
                  etiquetaQuitar={`Quitar ${f.name}`}
                />
              ))}
            </ListaArchivos>
          )}

          <Campo
            id={`notas-${propertyId}`}
            etiqueta="Notas del mes"
            opcional
            ayuda="Se guardan solas mientras escribes."
            className="emp-mes-notas"
          >
            <AreaTexto
              id={`notas-${propertyId}`}
              value={additionalText}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={3}
              placeholder="Ej.: aprobada cuota extraordinaria de $X; pendiente cambio de bomba…"
            />
          </Campo>
        </>
      )}
    </Panel>
  );
}

const CSS_MES = `
.emp-mes-per { display: flex; align-items: flex-end; gap: 0 12px; flex-wrap: wrap; }
.emp-mes-per > .k-fld { width: 180px; margin-bottom: 0; }
.emp-mes-per > .k-fld:nth-child(2) { width: 120px; }
.emp-mes-ok { align-self: center; min-height: 1.3em; margin-left: auto; }
.emp-mes-txt { margin: 18px 0; font-size: 15px; line-height: 1.45; color: var(--ink-2); max-width: 62ch; }
.emp-mes-txt strong { color: var(--ink); font-weight: 700; }
.emp-mes-err { margin-bottom: 16px; }
.emp-mes-notas { margin: 24px 0 0; }
@media (max-width: 860px) {
  .emp-mes-per { gap: 12px; }
  .emp-mes-per > .k-fld { flex: 1 1 120px; width: auto; }
  .emp-mes-per > .k-fld:nth-child(2) { width: auto; }
  .emp-mes-ok { flex: 1 1 100%; margin-left: 0; }
  .emp-mes-ok:empty { display: none; }
}
`;
