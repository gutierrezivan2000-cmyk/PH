"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  limiteMbPara,
  mensajeDeTamano,
  tipoDeArchivo,
  ACCEPT_ARCHIVOS,
  MAX_AUDIO_MB,
  MAX_DOC_MB,
} from "@/lib/upload-limits";
import { Header } from "@/components/dashboard/Header";
import { pedirJSON, URL_GENERACIONES } from "@/components/dashboard/datosIndice";
import { DOC_KIND_LABELS, type DocKind } from "@/lib/generation/doc-kind";
import {
  AreaTexto,
  Aviso,
  Boton,
  CabeceraPieza,
  Campo,
  Casilla,
  EnlaceVer,
  ErrorCarga,
  Esqueleto,
  Estado,
  FilaArchivo,
  ListaArchivos,
  Medidor,
  OpcionFila,
  OpcionesFila,
  Pagina,
  Panel,
  Pasos,
  Pieza,
  RejillaMeses,
  Resumen,
  Segmentos,
  Vacio,
  ZonaSubida,
  nombreCorto,
  pesoLegible,
  type PasoAsistente,
} from "@/components/kit";

// Topes por defecto hasta que /api/usage responda con los del plan. El 500 MB
// que se anunciaba antes era imposible: el token de subida corta en 25 MB, así
// que el archivo ni llegaba a Blob y el usuario veía un fallo de subida sin
// explicación tras esperar toda la carga.
const DEFAULT_FILE_LIMITS = { maxFiles: 20, maxFileSizeMb: MAX_DOC_MB };

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

interface Property {
  id: string;
  name: string;
  address?: string;
  city?: string | null;
  units?: number | null;
}

/** Lo que se lee de GET /api/usage (la misma respuesta que ya da los topes de archivos). */
interface UsoPlan {
  monthlyGenerations: number;
  dailyGenerations: number;
  limits?: { generationsPerDay?: number; generationsPerMonth?: number } | null;
  planStatus?: string;
}

/** Lo que se lee de GET /api/generations para el «último informe» de cada copropiedad. */
interface GeneracionPrevia {
  propertyId?: string;
  status?: string;
  month: number;
  year: number;
  outputFiles?: Record<string, unknown> | null;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Mismos años que admitía el campo numérico de antes (min 2020, max 2030); si
// algún día el año en curso pasa de 2030, se incluye para no dejarlo fuera.
const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = Array.from({ length: Math.max(2030, ANIO_ACTUAL) - 2020 + 1 }, (_, i) => 2020 + i);

const DOCUMENTOS: { kind: DocKind; desc: string }[] = [
  { kind: "informe", desc: "Resumen ejecutivo de la gestión mensual de la copropiedad." },
  { kind: "acta", desc: "Acta de reunión del Consejo de Administración con formato legal." },
];

// Solo se muestran las recomendaciones del documento elegido: mezclarlas era
// justo lo que hacía que se mezclaran los insumos.
const QUE_SUBIR: Record<DocKind, string[]> = {
  informe: [
    "Estados financieros del mes (Excel o PDF)",
    "Reporte de cartera y recaudos",
    "Registros de mantenimientos realizados",
    "Fotos de obras, mejoras o daños",
    "Novedades de seguridad, personal o proveedores",
  ],
  acta: [
    "Grabación de audio de la reunión (MP3, M4A, WAV)",
    "Orden del día o agenda de la reunión",
    "Lista de asistentes",
    "Actas anteriores como referencia de formato",
  ],
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/* ════════════════════════════════════════════════════════════════════
   Estilos locales (el kit no trae la cabecera de bloque del asistente)
   ════════════════════════════════════════════════════════════════════ */

const CSS_GENERAR = `
.gen-bloque { position: relative; padding-bottom: 56px; min-width: 0; scroll-margin-top: calc(var(--cab-h) + 12px); }
.gen-bloque-h { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--g); align-items: end;
  border-top: 4px solid var(--rule); padding-top: 16px; margin-bottom: 24px; }
.gen-bloque-h > b { grid-column: 1 / 2; font: 800 40px/.8 var(--f-sans); font-stretch: 62%; letter-spacing: -.03em;
  font-feature-settings: "tnum" 0, "lnum" 1; }
.gen-bloque-h.hecho > b { color: var(--ink-3); }
.gen-bloque-h.futuro > b { color: transparent; -webkit-text-stroke: 1.5px var(--ink-3); }
.gen-bloque-h > div { grid-column: 2 / 13; min-width: 0; }
.gen-bloque-h h2 { margin: 0; font-size: 26px; font-weight: 800; font-stretch: 75%; letter-spacing: -.02em; line-height: 1.05; }
.gen-bloque-h p { margin: 8px 0 0; font-size: 14px; line-height: 1.35; color: var(--ink-3); }
.gen-lb { display: block; margin: 0 0 8px; font-size: 14px; font-weight: 600; line-height: 1.3; color: var(--ink-2); }
.gen-lb.sep { margin-top: 24px; }
.gen-anios > button { padding: 0 11px; }
.gen-pptx { padding: 6px 14px; border-bottom: 1px solid var(--line); }
.gen-pptx .k-ctl { align-items: flex-start; padding: 6px 0; }
.gen-pptx .k-ctl > .k-chk { margin-top: 1px; flex: none; }
.gen-pptx .k-ctl > span { font-weight: 700; }
.gen-pptx .k-ctl small { font-weight: 400; margin-top: 3px; }
.gen-ayuda { margin: 0; font-size: 15px; line-height: 1.4; color: var(--ink-2); }
.gen-ayuda + .k-ver { margin-top: 4px; }
.gen-lado { min-width: 0; }
.gen-guia p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--ink-2); }
.gen-guia h4 { margin: 20px 0 0; padding-bottom: 10px; border-bottom: 2px solid var(--rule); font: 800 14px/1.1 var(--f-sans);
  font-stretch: 125%; text-transform: uppercase; letter-spacing: .03em; }
.gen-guia ul { list-style: none; margin: 0; padding: 0; }
.gen-guia li { display: grid; grid-template-columns: 22px minmax(0, 1fr); padding: 10px 0; border-bottom: 1px solid var(--line);
  font-size: 15px; line-height: 1.35; }
.gen-guia li::before { content: ""; width: 8px; height: 2px; margin-top: .6em; background: var(--ink-3); }
.gen-guia .mas { margin-top: 14px; font-size: 14px; color: var(--ink-3); }
.gen-aviso { margin-top: 16px; }
/* En 7 columnas junto al índice lateral, la barra y el estado de la fila de
   archivo ceden ancho al nombre (de 120/128 a 72/124 px). En ≤ 1180 manda el kit. */
@media (min-width: 1181px) {
  .gen-tray .k-arch { grid-template-columns: 52px minmax(0, 1fr) 72px 124px 44px; column-gap: 12px; }
}
.gen-envio { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.gen-envio .gen-lb { margin-bottom: 12px; }
.gen-estado { margin: -12px 0 0; font-size: 14px; line-height: 1.4; color: var(--ink-2); overflow-wrap: anywhere; }
.gen-estado:empty { display: none; }
/* En 5 columnas estrechas la cifra «N libres hoy» dejaba sin ancho las 15 celdas del mes: va debajo. */
@media (max-width: 1180px) {
  .gen-envio .k-medidor-c { grid-template-columns: minmax(0, 1fr); row-gap: 16px; }
}
@media (max-width: 860px) {
  .gen-bloque { padding-bottom: 40px; }
  .gen-bloque-h { display: flex; align-items: baseline; gap: 14px; margin-bottom: 20px; }
  .gen-bloque-h > b { font-size: 34px; flex: none; }
  .gen-bloque-h h2 { font-size: 22px; }
  .gen-lado { margin-top: 28px; }
  .gen-envio { margin-top: 8px; }
}
`;

/**
 * Bloque del asistente: filete de 4 px, numeral del paso con la misma gramática
 * que <Pasos> (hecho en --ink-3, actual en --ink, futuro hueco) y titular.
 * `id` es el ancla a la que saltan los pasos hechos.
 */
function Bloque({ id, n, estado, titulo, nota, children }: {
  id: string; n: number; estado: "hecho" | "actual" | "futuro"; titulo: ReactNode; nota?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} className="gen-bloque" aria-labelledby={`${id}-t`}>
      <div className={`gen-bloque-h k-ticks ${estado}`}>
        <b aria-hidden="true">{n}</b>
        <div>
          <h2 id={`${id}-t`}>
            <span className="k-sr">Paso {n}: </span>
            {titulo}
          </h2>
          {nota && <p>{nota}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function GenerarPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [cargandoProps, setCargandoProps] = useState(true);
  const [errorProps, setErrorProps] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  // Informe y acta son documentos distintos, con insumos distintos: la
  // selección es excluyente y cada uno tiene su propia bandeja de archivos,
  // para que la grabación de una reunión no acabe alimentando un informe.
  const [docKind, setDocKind] = useState<DocKind>("informe");
  const [includePptx, setIncludePptx] = useState(false);
  const [additionalText, setAdditionalText] = useState("");
  const [filesByKind, setFilesByKind] = useState<Record<DocKind, File[]>>({
    informe: [],
    acta: [],
  });
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  // Dónde se pinta el error: junto a la zona de subida (al elegir archivos) o
  // junto al botón (al enviar). Antes salía arriba del todo, fuera de la vista.
  const [errorEn, setErrorEn] = useState<"archivos" | "envio">("envio");
  // Archivo que se está subiendo y su porcentaje (el mismo dato que ya se
  // escribía en uploadStatus), para pintarlo en su fila.
  const [subida, setSubida] = useState<{ i: number; pct: number } | null>(null);
  const [fileLimits, setFileLimits] = useState(DEFAULT_FILE_LIMITS);
  const [uso, setUso] = useState<UsoPlan | null>(null);
  // «último informe: febrero 2026» de cada copropiedad (solo si existe).
  const [ultimos, setUltimos] = useState<Record<string, { month: number; year: number }>>({});

  const pedirPropiedades = useCallback(
    () =>
      fetch("/api/properties")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setProperties(data);
          else setErrorProps(true);
        })
        .catch((e) => {
          console.error(e);
          setErrorProps(true);
        })
        .finally(() => setCargandoProps(false)),
    []
  );

  const reintentarPropiedades = () => {
    setErrorProps(false);
    setCargandoProps(true);
    void pedirPropiedades();
  };

  useEffect(() => {
    void pedirPropiedades();

    fetch("/api/usage")
      .then((res) => res.json())
      .then((data) => {
        const l = data?.fileLimits;
        if (l && Number.isFinite(l.maxFiles) && Number.isFinite(l.maxFileSizeMb)) {
          setFileLimits({ maxFiles: l.maxFiles, maxFileSizeMb: l.maxFileSizeMb });
        }
        if (Number.isFinite(data?.monthlyGenerations) && Number.isFinite(data?.dailyGenerations)) setUso(data);
      })
      .catch(() => {});

    // Sale de /api/generations (ruta GET existente; caché de 2 s compartida con
    // el índice, que la pide en cada cambio de ruta). Se toma el periodo más
    // reciente con informe de gestión completado. Si no hay, no se dice nada:
    // la lista trae como máximo 100 generaciones.
    pedirJSON<GeneracionPrevia[]>(URL_GENERACIONES).then((gens) => {
      if (!Array.isArray(gens)) return;
      const porProp: Record<string, { month: number; year: number }> = {};
      for (const g of gens) {
        if (g.status !== "completed" || !g.propertyId || !g.outputFiles?.informeHtml) continue;
        const previo = porProp[g.propertyId];
        if (!previo || g.year * 12 + g.month > previo.year * 12 + previo.month) {
          porProp[g.propertyId] = { month: g.month, year: g.year };
        }
      }
      setUltimos(porProp);
    });
  }, [pedirPropiedades]);

  // En móvil la fila de años hace scroll: el año elegido se centra dentro de
  // su propia fila (sin mover la página) para que se vea al llegar.
  useEffect(() => {
    const fila = document.querySelector<HTMLElement>(".gen-anios");
    const activo = fila?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!fila || !activo || fila.scrollWidth <= fila.clientWidth) return;
    const f = fila.getBoundingClientRect();
    const a = activo.getBoundingClientRect();
    fila.scrollLeft += a.left - f.left - (f.width - a.width) / 2;
  }, []);

  // Elegir acta descarta la presentación: un acta no tiene diapositivas.
  const selectDocKind = useCallback((kind: DocKind) => {
    setDocKind(kind);
    if (kind === "acta") setIncludePptx(false);
  }, []);

  // Los archivos entran SIEMPRE en la bandeja del documento seleccionado.
  const addFiles = useCallback(
    (incoming: File[]) => {
      setFilesByKind((prev) => {
        const merged = [...prev[docKind], ...incoming];
        // Recortar en silencio hacía desaparecer archivos sin que el usuario
        // se enterara; ahora se dice cuántos quedaron fuera.
        if (merged.length > fileLimits.maxFiles) {
          const sobran = merged.length - fileLimits.maxFiles;
          setError(
            `Tu plan permite hasta ${fileLimits.maxFiles} archivos por generación: ` +
              (sobran === 1 ? "no se agregó el último." : `no se agregaron los últimos ${sobran}.`)
          );
        }
        return { ...prev, [docKind]: merged.slice(0, fileLimits.maxFiles) };
      });
    },
    [docKind, fileLimits.maxFiles]
  );

  // Elegidos con el selector o soltados en la zona: la misma validación de
  // tamaño que antes tenían el input y el drop por separado.
  const elegirArchivos = useCallback(
    (newFiles: File[]) => {
      setErrorEn("archivos");
      const oversized = newFiles.find((f) => f.size > limiteMbPara(f.name) * 1024 * 1024);
      if (oversized) {
        setError(mensajeDeTamano(oversized));
        return;
      }
      setError("");
      addFiles(newFiles);
    },
    [addFiles]
  );

  const removeFile = useCallback(
    (index: number) => {
      setFilesByKind((prev) => ({
        ...prev,
        [docKind]: prev[docKind].filter((_, i) => i !== index),
      }));
    },
    [docKind]
  );

  // La bandeja activa es la del documento seleccionado.
  const files = filesByKind[docKind];
  const otherKind: DocKind = docKind === "informe" ? "acta" : "informe";
  const otherCount = filesByKind[otherKind].length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorEn("envio");
    setError("");
    setUploadStatus("");

    if (!selectedProperty) {
      setError("Selecciona una propiedad.");
      return;
    }

    const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    if (!isDemo && files.length === 0 && !additionalText.trim()) {
      setError("Debes subir al menos un archivo o escribir información.");
      return;
    }

    // Validar ANTES de subir. Antes se subía todo a Blob y solo después
    // /api/generate/full rechazaba por plan: los archivos quedaban huérfanos
    // en el store (facturados) y el usuario había esperado la subida entera
    // para recibir un 400.
    if (files.length > fileLimits.maxFiles) {
      setError(`Tu plan permite hasta ${fileLimits.maxFiles} archivos por generación. Quita ${files.length - fileLimits.maxFiles}.`);
      return;
    }
    const tooBig = files.find((f) => f.size > limiteMbPara(f.name) * 1024 * 1024);
    if (tooBig) {
      setError(mensajeDeTamano(tooBig));
      return;
    }

    setLoading(true);

    try {
      const blobFiles: { url: string; name: string; type: string; size: number }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const mb = (file.size / 1024 / 1024).toFixed(0);
        setUploadStatus(`Subiendo ${i + 1} de ${files.length}: ${file.name} (${mb} MB)`);
        setSubida({ i, pct: 0 });
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const result = await upload(`uploads/${Date.now()}-${safeName}`, file, {
          access: "private",
          handleUploadUrl: "/api/upload/token",
          contentType: tipoDeArchivo(file),
          multipart: file.size > 10 * 1024 * 1024,
          // Sin esto, subir una grabación de 200 MB son varios minutos de
          // pantalla quieta y el usuario no sabe si va o se colgó.
          onUploadProgress: ({ percentage }) => {
            setUploadStatus(
              `Subiendo ${i + 1} de ${files.length}: ${file.name} (${mb} MB) — ${Math.round(percentage)} %`
            );
            setSubida({ i, pct: Math.round(percentage) });
          },
        });
        blobFiles.push({
          url: result.url,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
        });
      }

      setSubida({ i: files.length, pct: 100 });
      setUploadStatus("Iniciando generación…");

      const res = await fetch("/api/generate/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedProperty,
          month,
          year,
          type: "custom",
          docKind,
          includePptx,
          additionalText: additionalText.trim() || undefined,
          blobFiles,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError(`Error del servidor (${res.status}). Intenta de nuevo.`);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Error al generar documentos.");
        return;
      }

      if (data.status === "completed") {
        try {
          sessionStorage.setItem(`gen-${data.id}`, JSON.stringify(data));
        } catch {
          // sessionStorage unavailable
        }
      }

      router.push(`/dashboard/generar/${data.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Los errores del almacenamiento vienen en inglés y sin contexto («Vercel
      // Blob: Content type mismatch…»). Se traducen a algo accionable, que era
      // buena parte de lo que los usuarios reportaban como «error al subir».
      if (/No autorizado/i.test(msg)) {
        setError("Sesión expirada. Recarga la página e inicia sesión de nuevo.");
      } else if (/aborted/i.test(msg)) {
        setError("La subida fue cancelada. Intenta de nuevo.");
      } else if (/content type|not allowed|mismatch/i.test(msg)) {
        setError(
          "Uno de los archivos tiene un formato que no reconocemos. Convierte la grabación a MP3 o M4A " +
            "y vuelve a intentarlo."
        );
      } else if (/too large|maximum size|exceeded/i.test(msg)) {
        setError(
          `Un archivo supera el tamaño permitido (${MAX_AUDIO_MB} MB para audio, ${MAX_DOC_MB} MB para documentos).`
        );
      } else if (/token|expired|unauthorized|403/i.test(msg)) {
        setError("El permiso de subida caducó, seguramente por una conexión lenta. Vuelve a intentarlo.");
      } else if (/network|fetch|failed to fetch|econn/i.test(msg)) {
        setError("Se perdió la conexión durante la subida. Revisa tu internet e inténtalo de nuevo.");
      } else {
        setError(`No se pudo subir el archivo: ${msg}`);
      }
    } finally {
      setLoading(false);
      setUploadStatus("");
      setSubida(null);
    }
  };

  /* ── Derivados para la vista (solo del estado que ya existe) ── */

  const prop = properties.find((p) => p.id === selectedProperty);
  const periodo = `${MONTHS[month - 1]} ${year}`;
  const docLabel = DOC_KIND_LABELS[docKind];
  const docLabelMin = docLabel.toLowerCase();

  // Paso actual = el primer bloque incompleto (KIT §4.10). Periodo y
  // documentos siempre tienen valor; archivos y notas son opcionales.
  const completos = [Boolean(selectedProperty), Boolean(month && year), Boolean(docKind)];
  const actual = completos.indexOf(false) + 1 || 5;
  const estadoDe = (n: number) => (n < actual ? "hecho" : n === actual ? "actual" : "futuro");

  const pasos: PasoAsistente[] = [
    { nombre: "Propiedad", valor: prop ? nombreCorto(prop.name) : "Sin elegir", href: "#g-propiedad" },
    { nombre: "Periodo", valor: `${MESES_CORTOS[month - 1]} ${year}`, href: "#g-periodo" },
    {
      nombre: "Documentos",
      valor: docKind === "acta" ? "Acta" : includePptx ? "Informe y PPTX" : "Informe",
      href: "#g-documentos",
    },
    { nombre: "Archivos", valor: files.length ? plural(files.length, "archivo", "archivos") : "Opcional", href: "#g-archivos" },
    { nombre: "Notas", valor: additionalText.trim() ? "Con notas" : "Opcional", href: "#g-notas" },
  ];

  const pesoTotal = files.reduce((s, f) => s + f.size, 0);

  // Uso del plan con la misma respuesta de /api/usage. Solo con plan activo (o
  // en el demo): en la prueba gratis el tope es TOTAL, no mensual, y los
  // probadores beta no tienen topes, así que el medidor diría algo falso.
  const lim = uso?.limits;
  const usoVisible =
    uso &&
    lim &&
    Number.isFinite(lim.generationsPerDay) &&
    Number.isFinite(lim.generationsPerMonth) &&
    (!uso.planStatus || uso.planStatus === "active" || uso.planStatus === "grace");
  const porDia = lim?.generationsPerDay ?? 0;
  const porMes = lim?.generationsPerMonth ?? 0;
  const libresHoy = uso ? Math.max(0, Math.min(porDia - uso.dailyGenerations, porMes - uso.monthlyGenerations)) : 0;

  const estadoArchivo = (i: number): { estado: "listo" | "subiendo" | "espera"; progreso?: number } => {
    if (!loading || !subida || i < subida.i) return { estado: "listo" };
    if (i === subida.i) return { estado: "subiendo", progreso: subida.pct };
    return { estado: "espera" };
  };

  const avisoError = error ? <Aviso tipo="error" enLinea titulo={error} className="gen-aviso" /> : null;

  return (
    <div>
      <style href="k-generar-local" precedence="default">
        {CSS_GENERAR}
      </style>
      <Header title="Generar documentos" />

      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="02"
            titulo="Generar documentos"
            subtitulo={`Paso ${actual} de 5 · ${prop ? prop.name : "elige la copropiedad"} · ${periodo.toLowerCase()}`}
          />

          <Pasos actual={actual} pasos={pasos} etiquetaAccesible="Pasos para generar documentos" />

          <form onSubmit={handleSubmit}>
            {/* ── 1 · Propiedad ── */}
            <Bloque id="g-propiedad" n={1} estado={estadoDe(1)} titulo="Selecciona tu propiedad">
              <div className="k-r12">
                <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                  {cargandoProps ? (
                    <Esqueleto variante="tabla" filas={2} etiquetaAccesible="Cargando tus propiedades…" />
                  ) : errorProps ? (
                    <ErrorCarga
                      nivel={3}
                      titulo="No pudimos cargar tus propiedades."
                      texto="Revisa tu conexión e inténtalo de nuevo."
                      acciones={
                        <Boton variante="secundario" onClick={reintentarPropiedades}>
                          Reintentar
                        </Boton>
                      }
                    />
                  ) : properties.length === 0 ? (
                    <Vacio
                      nivel={3}
                      titulo="No tienes propiedades registradas."
                      texto="Agrega una primero: los documentos se generan para una copropiedad."
                      acciones={
                        <Boton href="/dashboard/propiedades" flecha="avanza">
                          Agregar una propiedad
                        </Boton>
                      }
                    />
                  ) : (
                    <OpcionesFila etiquetaAccesible="Propiedad">
                      {properties.map((p) => {
                        const ultimo = ultimos[p.id];
                        const detalle = [
                          p.units ? plural(p.units, "unidad", "unidades") : null,
                          p.address,
                          p.city,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <OpcionFila
                            key={p.id}
                            name="g-propiedad"
                            value={p.id}
                            etiqueta={p.name}
                            detalle={detalle || undefined}
                            extra={
                              ultimo
                                ? `último informe: ${MONTHS[ultimo.month - 1].toLowerCase()} ${ultimo.year}`
                                : undefined
                            }
                            checked={selectedProperty === p.id}
                            onChange={() => setSelectedProperty(p.id)}
                          />
                        );
                      })}
                    </OpcionesFila>
                  )}
                </div>
                {!cargandoProps && !errorProps && properties.length > 0 && (
                  <div className="gen-lado" style={{ gridColumn: "8 / 13" }}>
                    <p className="gen-ayuda">¿Falta una copropiedad?</p>
                    <EnlaceVer href="/dashboard/propiedades" refIndice="12">
                      Agregarla en Propiedades
                    </EnlaceVer>
                  </div>
                )}
              </div>
            </Bloque>

            {/* ── 2 · Periodo ── */}
            <Bloque id="g-periodo" n={2} estado={estadoDe(2)} titulo="Periodo del documento">
              <div className="k-r12">
                <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                  <span className="gen-lb" aria-hidden="true">
                    Año
                  </span>
                  <Segmentos
                    etiquetaAccesible="Año del documento"
                    className="gen-anios"
                    valor={String(year)}
                    alCambiar={(v) => setYear(parseInt(v))}
                    items={ANIOS.map((a) => ({ id: String(a), etiqueta: String(a) }))}
                  />
                  <span className="gen-lb sep" aria-hidden="true">
                    Mes
                  </span>
                  <RejillaMeses
                    nombre="g-mes"
                    etiquetaAccesible={`Mes del documento · ${year}`}
                    valor={month}
                    alCambiar={setMonth}
                  />
                </div>
              </div>
            </Bloque>

            {/* ── 3 · Documentos ── */}
            <Bloque id="g-documentos" n={3} estado={estadoDe(3)} titulo="¿Qué documentos necesitas?">
              <div className="k-r12">
                <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                  <OpcionesFila etiquetaAccesible="Documento que se genera">
                    {DOCUMENTOS.map(({ kind, desc }) => {
                      const count = filesByKind[kind].length;
                      return (
                        <OpcionFila
                          key={kind}
                          name="docKind"
                          value={kind}
                          etiqueta={DOC_KIND_LABELS[kind]}
                          detalle={desc}
                          extra={count > 0 ? `${plural(count, "archivo", "archivos")} en su bandeja` : undefined}
                          checked={docKind === kind}
                          onChange={() => selectDocKind(kind)}
                        />
                      );
                    })}
                  </OpcionesFila>
                  {/* La presentación no es un tercer documento: son las diapositivas
                      del informe, así que solo acompaña al informe. */}
                  <div className="gen-pptx">
                    <Casilla
                      etiqueta="Añadir presentación PPTX"
                      detalle={
                        docKind === "informe"
                          ? "Diapositivas construidas a partir del mismo informe. Opcional."
                          : "Solo disponible con el informe de gestión: un acta no tiene diapositivas."
                      }
                      checked={includePptx}
                      disabled={docKind !== "informe"}
                      onChange={(e) => setIncludePptx(e.target.checked)}
                    />
                  </div>
                </div>
                <div className="gen-lado" style={{ gridColumn: "8 / 13" }}>
                  {/* Así funciona hoy: la selección es excluyente y cada documento
                      tiene su bandeja (lib/generation/doc-kind.ts). */}
                  <p className="gen-ayuda">
                    Se genera un documento a la vez: cada uno usa sus propios archivos, para que la grabación de
                    una reunión no acabe en el informe.
                  </p>
                </div>
              </div>
            </Bloque>

            {/* ── 4 · Archivos ── */}
            <Bloque
              id="g-archivos"
              n={4}
              estado={estadoDe(4)}
              titulo={`Archivos para el ${docLabelMin}`}
              nota={
                // Cada documento tiene su propia bandeja: los archivos del otro no
                // se mezclan ni se pierden al cambiar de tipo.
                otherCount > 0
                  ? `Bandeja independiente: el ${DOC_KIND_LABELS[otherKind].toLowerCase()} conserva sus ${plural(otherCount, "archivo", "archivos")} aparte.`
                  : "Bandeja independiente: lo que subas aquí solo alimenta este documento."
              }
            >
              <div className="k-r12">
                <div className="gen-tray" style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                  <ZonaSubida
                    titulo="Suelta aquí los archivos"
                    texto="o haz clic para elegirlos."
                    formatos={
                      <>
                        PDF, Word, Excel e imágenes · hasta {fileLimits.maxFiles} archivos · audio hasta{" "}
                        {MAX_AUDIO_MB}&nbsp;MB
                      </>
                    }
                    etiquetaAccesible={`Elegir archivos para el ${docLabelMin}`}
                    multiple
                    accept={ACCEPT_ARCHIVOS}
                    alElegir={elegirArchivos}
                  />
                  {errorEn === "archivos" && avisoError}
                  {files.length > 0 && (
                    <ListaArchivos etiquetaAccesible={`Archivos para el ${docLabelMin}`}>
                      {files.map((file, i) => {
                        const est = estadoArchivo(i);
                        return (
                          <FilaArchivo
                            key={`${file.name}-${i}`}
                            nombre={file.name}
                            detalle={pesoLegible(file.size)}
                            estado={est.estado}
                            progreso={est.progreso}
                            alQuitar={() => removeFile(i)}
                          />
                        );
                      })}
                    </ListaArchivos>
                  )}
                </div>

                <div className="gen-lado" style={{ gridColumn: "8 / 13" }}>
                  <Panel titular titulo="¿Qué debería subir para obtener buenos resultados?" className="gen-guia" as="aside">
                    <p>
                      No es obligatorio subir todo, pero entre más información le des a la IA, mejores serán los
                      documentos.
                    </p>
                    <h4>Para el {docLabelMin}</h4>
                    <ul>
                      {QUE_SUBIR[docKind].map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p className="mas">
                      {`También puedes subir: PDF, documentos Word, archivos de texto, hojas de cálculo e imágenes de hasta ${MAX_DOC_MB} MB, y grabaciones de audio de hasta ${MAX_AUDIO_MB} MB.`}
                    </p>
                  </Panel>
                </div>
              </div>
            </Bloque>

            {/* ── 5 · Notas y envío ── */}
            <Bloque id="g-notas" n={5} estado={estadoDe(5)} titulo="Información adicional">
              <div className="k-r12">
                <div style={{ gridColumn: "1 / 8", minWidth: 0 }}>
                  <Campo
                    id="g-texto"
                    etiqueta="Notas para la IA"
                    // La misma regla que valida el envío: sin archivos, hace falta texto.
                    ayuda={
                      !IS_DEMO && files.length === 0
                        ? "Si no subes archivos, escribe aquí lo que pasó en el periodo."
                        : undefined
                    }
                  >
                    <AreaTexto
                      id="g-texto"
                      value={additionalText}
                      onChange={(e) => setAdditionalText(e.target.value)}
                      rows={7}
                      placeholder="Ejemplo: este mes se realizó el cambio de bombas del cuarto de máquinas. Hubo un corte de agua del 3 al 5 de marzo por obras de la empresa de acueducto…"
                    />
                  </Campo>
                </div>

                <div className="gen-lado gen-envio" style={{ gridColumn: "8 / 13" }}>
                  <Resumen
                    etiquetaAccesible="Resumen de lo que se va a generar"
                    filas={[
                      {
                        etiqueta: "Propiedad",
                        valor: prop ? prop.name : <Estado tipo="pendiente" tamLetra={14}>Sin elegir</Estado>,
                      },
                      { etiqueta: "Periodo", valor: periodo },
                      {
                        etiqueta: "Documentos",
                        valor: docKind === "informe" && includePptx ? `${docLabel} y presentación PPTX` : docLabel,
                      },
                      {
                        etiqueta: "Archivos",
                        valor: files.length
                          ? `${plural(files.length, "archivo", "archivos")} · ${pesoLegible(pesoTotal)}`
                          : "Ninguno",
                      },
                      { etiqueta: "Notas", valor: additionalText.trim() ? "Con notas" : "Sin notas" },
                    ]}
                  />

                  {usoVisible && (
                    <div>
                      <span className="gen-lb">Uso de tu plan</span>
                      <Medidor
                        filas={[
                          { etiqueta: "Este mes", usado: uso.monthlyGenerations, total: porMes },
                          { etiqueta: "Hoy", usado: uso.dailyGenerations, total: porDia },
                        ]}
                        libres={libresHoy}
                        unidadLibres="libres hoy"
                      />
                    </div>
                  )}

                  {errorEn === "envio" && avisoError}

                  <Boton
                    type="submit"
                    tam={56}
                    flecha="avanza"
                    ancho
                    cargando={loading}
                    textoCargando="Enviando…"
                  >
                    Generar documentos
                  </Boton>
                  <p className="gen-estado" role="status">
                    {loading ? uploadStatus : ""}
                  </p>
                </div>
              </div>
            </Bloque>
          </form>
        </Pieza>
      </Pagina>
    </div>
  );
}
