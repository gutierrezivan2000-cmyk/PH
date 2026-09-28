"use client";

import { useRef, useState } from "react";
import {
  AccionesFila,
  Aviso,
  Boton,
  BotonFila,
  Esqueleto,
  Estado,
  Tabla,
  ZonaSubida,
  type ColumnaTabla,
} from "@/components/kit";

interface ExtractedUnit {
  label: string;
  residentName?: string | null;
  email?: string | null;
  phone?: string | null;
  coeficiente?: number | null;
  monthlyFee?: number | null;
}

/**
 * Vercel corta el cuerpo de una petición serverless en 4,5 MB. La ruta decía
 * aceptar 8 MB, así que un archivo de 5 MB nunca llegaba al handler: la
 * plataforma cerraba la conexión y el navegador lo reportaba como fallo de red.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const ACCEPT = ".xlsx,.xls,.csv,.pdf,.docx,.txt";

function errorForStatus(status: number): string {
  if (status === 413) return "El archivo es demasiado grande. Guárdalo como CSV e inténtalo de nuevo.";
  if (status === 429) return "Alcanzaste el límite de importaciones por hora. Intenta más tarde.";
  if (status === 504 || status === 408)
    return "El archivo tardó demasiado en procesarse. Prueba con menos filas o guárdalo como CSV.";
  if (status >= 500) return "El servidor falló al procesar el archivo. Inténtalo de nuevo en un momento.";
  return "No se pudo procesar el archivo.";
}

type FilaVista = { u: ExtractedUnit; i: number };

/**
 * AI-assisted unit import: attach Excel/CSV/PDF/Word, Claude organizes it into
 * a unit list, admin reviews (and removes) rows, then creates them. Reusable
 * across Comunicados / Residentes / Cartera.
 *
 * `modo`:
 *  - "boton" (por defecto): un botón secundario abre el selector de archivo
 *    (Comunicados, dentro de su propio bloque).
 *  - "zona": zona de subida del kit con arrastrar y soltar (Residentes, en el
 *    panel «Importar Excel con IA»).
 * En ambos, la vista previa es una tabla del kit con las filas detectadas.
 */
export function UnitImport({
  propertyId,
  onImported,
  modo = "boton",
}: {
  propertyId: string;
  onImported: (created: number) => void;
  modo?: "boton" | "zona";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ExtractedUnit[] | null>(null);
  const [fileName, setFileName] = useState("");
  // Aviso del servidor cuando el archivo no cupo en una sola lectura.
  const [note, setNote] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function processFile(file: File) {
    setError("");
    setPreview(null);
    setNote("");
    setFileName(file.name);

    // Se comprueba ANTES de subir: la plataforma corta la petición por encima
    // de su límite de cuerpo, y el usuario esperaba toda la subida para recibir
    // un "error de red" sin explicación.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB y el máximo es 4 MB. ` +
          `Si es un Excel, guárdalo como CSV: pesa muchísimo menos.`
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/properties/${propertyId}/units/import`, { method: "POST", body: fd });

      // El cuerpo de error de la plataforma (413, 504) es texto plano o HTML,
      // no JSON. Al hacer res.json() antes de mirar res.ok, el SyntaxError caía
      // en el catch y TODO fallo se mostraba como "Error de red al subir el
      // archivo", ocultando la causa real.
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      const units = data?.units || [];
      if (units.length === 0) {
        setError(
          "No se reconoció ninguna unidad en el archivo. Revisa que tenga una fila por unidad " +
            "con al menos el número de apartamento."
        );
        return;
      }
      setNote(data?.truncated ? data?.note || "" : "");
      setPreview(units);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirm() {
    if (!preview || preview.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/properties/${propertyId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units: preview }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || errorForStatus(res.status));
        return;
      }
      setPreview(null);
      setFileName("");
      setNote("");
      onImported(data.created || 0);
    } catch {
      setError("Error de red.");
    } finally {
      setCreating(false);
    }
  }

  function discard() {
    setPreview(null);
    setFileName("");
    setNote("");
  }

  const withEmail = preview?.filter((u) => u.email).length ?? 0;

  const columnas: ColumnaTabla<FilaVista>[] = [
    { id: "u", titulo: "Unidad", ancho: "minmax(0, 1.3fr)", principal: true, claseCelda: "k-c-id", celda: ({ u }) => {
      // En la ficha móvil el prefijo («Apto») va en una línea pequeña encima del número.
      const m = u.label.trim().match(/^(apto\.?|apartamento|ap\.?|casa|local|oficina)\s+(\S+)$/i);
      return m ? <><span className="ui-pre">{m[1]}{"\u00a0"}</span>{m[2]}</> : u.label;
    } },
    {
      id: "r", titulo: "Residente", ancho: "minmax(0, 2.4fr)", claseCelda: "k-c-nom",
      celda: ({ u }) => (
        <>
          {u.residentName || <span className="ui-sin">Sin nombre</span>}
          {u.phone && <span>{u.phone}</span>}
        </>
      ),
    },
    {
      id: "c", titulo: "Correo", ancho: "minmax(0, 2.6fr)", claseCelda: "k-c-correo",
      celda: ({ u }) => (u.email ? u.email : <Estado tipo="falta" tamLetra={14}>Sin correo</Estado>),
    },
    {
      // Coeficiente y cuota solo si el archivo los trae (dato real de la IA).
      id: "d", titulo: "Coef. · cuota", ancho: "minmax(0, 1.6fr)", alinear: "fin", claseCelda: "k-td-cifra",
      celda: ({ u }) => {
        const partes = [
          u.coeficiente ? `${String(u.coeficiente).replace(".", ",")} %` : null,
          u.monthlyFee ? `$ ${u.monthlyFee.toLocaleString("es-CO")}` : null,
        ].filter(Boolean);
        return partes.length ? partes.join(" · ") : <span className="ui-sin">Sin dato</span>;
      },
    },
    {
      id: "a", titulo: "Acciones", tituloOculto: true, alinear: "fin", ancho: "auto", claseCelda: "k-td-acc",
      celda: ({ u, i }) => (
        <AccionesFila>
          <BotonFila
            onClick={() => setPreview((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))}
            aria-label={`Quitar ${u.label} de la lista`}
            disabled={creating}
          >
            Quitar
          </BotonFila>
        </AccionesFila>
      ),
    },
  ];

  return (
    <div className="ui-import">
      <style>{estilos}</style>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onFile}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {!preview && modo === "boton" && (
        // Sin textoCargando: «Leyendo «archivo» con IA…» ya lo dice la línea de estado de abajo.
        <Boton
          variante="secundario"
          tam={40}
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          cargando={parsing}
        >
          Importar de archivo (Excel o PDF) con IA
        </Boton>
      )}

      {!preview && modo === "zona" && !parsing && (
        <ZonaSubida
          titulo="Suelta aquí el listado de unidades"
          texto="o haz clic para elegirlo. La IA lo ordena en una lista que revisas antes de crear nada."
          formatos="Excel, CSV, PDF, Word o texto · un archivo de hasta 4&nbsp;MB"
          accept={ACCEPT}
          alElegir={(files) => { if (files[0]) processFile(files[0]); }}
          deshabilitado={parsing}
          etiquetaAccesible="Elegir el archivo con el listado de unidades"
        />
      )}

      {parsing && (
        <div className="ui-leyendo">
          <p className="k-fecha" role="status">
            Leyendo <b>«{fileName}»</b> con IA…
          </p>
          {modo === "zona" && <Esqueleto variante="tabla" filas={4} etiquetaAccesible="Leyendo el archivo…" />}
        </div>
      )}

      {error && (
        <div className="ui-error">
          <Aviso
            enLinea
            tipo="error"
            titulo={fileName ? `No se pudo importar «${fileName}».` : "No se pudo importar el archivo."}
            texto={error}
            alCerrar={() => setError("")}
          />
        </div>
      )}

      {preview && (
        <section className="ui-vista" aria-label="Vista previa de la importación">
          <div className="ui-vista-h">
            <div>
              <h3 className="k-t26">
                {preview.length} {preview.length === 1 ? "unidad detectada" : "unidades detectadas"}
              </h3>
              <p className="k-apoyo">
                {withEmail} con correo{fileName ? <> · de «{fileName}»</> : null}. Revisa la lista y quita lo que no
                aplique. Podrás editar cada unidad después.
              </p>
            </div>
            <div className="k-btns">
              <Boton variante="fantasma" tam={40} onClick={discard} disabled={creating}>
                Descartar
              </Boton>
              <Boton
                tam={40}
                flecha="avanza"
                onClick={confirm}
                disabled={creating || preview.length === 0}
                cargando={creating}
                textoCargando="Creando…"
              >
                Crear {preview.length} {preview.length === 1 ? "unidad" : "unidades"}
              </Boton>
            </div>
          </div>

          {note && (
            <div className="ui-nota">
              <Aviso enLinea tipo="info" titulo="Importación parcial." texto={note} rol={null} />
            </div>
          )}

          <Tabla
            etiquetaAccesible="Unidades detectadas en el archivo"
            filas={preview.map((u, i) => ({ u, i }))}
            claveFila={(f) => String(f.i)}
            columnas={columnas}
          />
        </section>
      )}
    </div>
  );
}

const estilos = `
  .ui-import .ui-leyendo { display: grid; gap: 14px; margin-top: 4px; }
  .ui-import .ui-leyendo .k-fecha { margin: 0; }
  .ui-import .ui-leyendo .k-fecha b { color: var(--ink); font-weight: 700; }
  .ui-import .ui-error { margin-top: 14px; }
  .ui-import .ui-error + .ui-vista { margin-top: 24px; }
  .ui-import .ui-sin { color: var(--ink-3); font-weight: 400; }
  .ui-import .ui-vista { margin-top: 4px; }
  .ui-import .ui-vista-h { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px 24px; margin-bottom: 18px; }
  .ui-import .ui-vista-h h3 { margin: 0 0 6px; }
  .ui-import .ui-vista-h p { margin: 0; max-width: 62ch; }
  .ui-import .ui-nota { margin-bottom: 18px; }
  @media (max-width: 860px) {
    .ui-import .ui-pre { display: block; margin-bottom: 4px; font: 500 12px/1 var(--f-mono); color: var(--ink-3); }
  }
`;
