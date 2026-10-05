"use client";

import { FileSignature, FileText, Files, Presentation, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { pedirJSON, URL_CALENDARIO, URL_GENERACIONES } from "@/components/dashboard/datosIndice";
import {
  AccionesFila,
  Boton,
  BotonFila,
  Buscador,
  CabeceraPieza,
  Cornisa,
  ErrorCarga,
  Esqueleto,
  Estado,
  MenuMas,
  Pagina,
  PieTabla,
  Pieza,
  Segmentos,
  Selector,
  SinResultados,
  Tabla,
  TipoArchivo,
  Vacio,
  nombreCorto,
  type ColumnaTabla,
  type ItemMenu,
  type Tono,
  type TipoEstado,
} from "@/components/kit";

interface Generation {
  id: string;
  type: string;
  status: string;
  month: number;
  year: number;
  // En producción la API solo selecciona `name`; en modo demo llega también `id`.
  property: { id?: string; name: string } | null;
  tokensUsed: number;
  costUsd: number;
  createdAt: string;
  outputFiles?: Record<string, string> | null;
  /** Si el documento se redactó desde una reunión grabada (Reuniones). */
  meetingId?: string | null;
}

type ItemCalendario = { status?: string; dueDate?: string; propertyId?: string };
type PropiedadCalendario = { id: string; name: string };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Nombre de la generación cuando aún no hay documentos de salida (en proceso, error).
const TYPE_LABELS: Record<string, string> = {
  custom: "Generación de documentos",
  full: "Generación completa",
  informe: "Informe de gestión",
  acta: "Acta de reunión",
  presentacion: "Presentación",
};

// Estado = icono + color + palabra. Los valores salen de Generation.status.
const STATUS_CONFIG: Record<string, { label: string; tipo: TipoEstado }> = {
  completed: { label: "Listo", tipo: "ok" },
  processing: { label: "Procesando", tipo: "enCurso" },
  pending: { label: "En espera", tipo: "pendiente" },
  failed: { label: "Error", tipo: "vencido" },
};

type FiltroTipo = "all" | "informe" | "acta" | "presentacion";
const FILTROS_TIPO: Array<{ id: FiltroTipo; etiqueta: string; icono: LucideIcon; tono: Tono }> = [
  { id: "all", etiqueta: "Todos", icono: Files, tono: "slate" },
  { id: "informe", etiqueta: "Con informe", icono: FileText, tono: "blue" },
  { id: "acta", etiqueta: "Con acta", icono: FileSignature, tono: "indigo" },
  { id: "presentacion", etiqueta: "Con presentación", icono: Presentation, tono: "amber" },
];
const ETIQUETA_ESTADO: Record<string, string> = {
  all: "Todos los estados",
  completed: "Listo",
  processing: "Procesando",
  failed: "Error",
};

/** Documentos que la generación produjo de verdad (outputFiles de /api/generations). */
function documentos(g: Generation) {
  const out = g.outputFiles ?? {};
  const docs: Array<{ sigla: string; nombre: string; url: string; accion: string }> = [];
  if (out.informeHtml) docs.push({ sigla: "INF", nombre: "informe de gestión", url: out.informeHtml, accion: "Abrir el informe de gestión" });
  if (out.actaHtml) docs.push({ sigla: "ACTA", nombre: "acta", url: out.actaHtml, accion: "Abrir el acta" });
  if (out.presentacionPptx) docs.push({ sigla: "PRES", nombre: "presentación", url: out.presentacionPptx, accion: "Descargar la presentación" });
  return docs;
}

function tituloDe(g: Generation) {
  const docs = documentos(g);
  if (docs.length === 0) return TYPE_LABELS[g.type] ?? "Generación de documentos";
  const nombres = docs.map((d) => d.nombre);
  const texto = nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : nombres[0];
  return may(texto);
}

const periodoDe = (g: Generation) => `${may(MESES[g.month - 1] ?? "")} ${g.year}`;

function fechaCorta(iso: string) {
  const d = new Date(iso);
  return (
    <>
      <span className="dia">{may(DIAS_CORTOS[d.getDay()])}</span>{" "}
      <span>{`${d.getDate()}\u00a0${MESES_CORTOS[d.getMonth()]}`}</span>
    </>
  );
}

/** Clave de agrupación: mes en que se generó («2026-08»). */
function mesDe(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function diasHasta(fecha: string, hoy: Date) {
  const [y, m, d] = fecha.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - hoy.getTime()) / 86_400_000);
}

const CSS = `
  .hist-filtros { display: flex; flex-wrap: wrap; align-items: stretch; gap: 12px 16px; margin: 0 0 22px; }
  .hist-filtros > .k-seg { flex: none; }
  .hist-filtros > .k-select { flex: 0 0 220px; }
  .hist-filtros > .k-select > select { min-height: 44px; }
  .hist-filtros > .k-campo { flex: 1 1 240px; }
  .hist-fecha { font-size: 15px; font-weight: 600; line-height: 1.3; color: var(--ink-2); }
  .hist-doc { display: grid; gap: 7px; min-width: 0; padding: 12px 0; }
  .hist-doc .tipos { display: flex; flex-wrap: wrap; gap: 6px; }
  .hist-doc .t { font-size: 16px; font-weight: 800; line-height: 1.25; color: var(--ink); overflow-wrap: anywhere; }
  .hist-prop { font-size: 15px; font-weight: 500; line-height: 1.3; color: var(--ink); overflow-wrap: anywhere; }
  .hist-per { font-size: 15px; font-weight: 600; line-height: 1.3; color: var(--ink-2); }
  .hist-per .rot { display: none; }
  .hist-grupo { display: flex; align-items: baseline; gap: 10px; }
  .hist-grupo small { display: inline-grid; place-items: center; min-width: 28px; height: 26px; padding: 0 9px; border-radius: 999px; font-size: 13.5px; font-weight: 800; color: var(--ink); background: var(--surface-3); }
  .hist-nota { margin: 10px 0 0; font-size: 14px; color: var(--ink-3); }
  /* 861–1180 px: la acción de fila baja bajo el documento para que las columnas respiren (SPEC §e.1). */
  @media (min-width: 861px) and (max-width: 1180px) {
    .hist-tabla { grid-template-columns: 96px minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1.2fr) minmax(max-content, 1.3fr) !important; }
    .hist-tabla .k-tr > .k-td-acc { grid-column: 2 / -1; grid-row: 2; justify-self: start; padding: 0 0 12px; }
    .hist-tabla .k-td-acc .k-menu { right: auto; left: 0; }   /* la acción queda a la izquierda: el menú abre hacia el contenido */
  }
  @media (max-width: 860px) {
    .hist-filtros > .k-seg { flex: 1 1 100%; }
    .hist-filtros > .k-select, .hist-filtros > .k-campo { flex: 1 1 100%; }
    .hist-doc { padding: 0; }
    .hist-fecha .dia { display: block; }
    /* En ficha no hay cabecera de columna: el periodo lleva su rótulo para no confundirse con la fecha. */
    .hist-per .rot { display: inline; font-weight: 400; color: var(--ink-3); }
  }
`;

export default function HistorialPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [intento, setIntento] = useState(0);
  const [typeFilter, setTypeFilter] = useState<FiltroTipo>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [consulta, setConsulta] = useState("");
  // Alcance de la cornisa: filtra en el cliente lo ya cargado (SPEC §f.1).
  const [alcance, setAlcance] = useState("todas");
  const [calendario, setCalendario] = useState<{ items: ItemCalendario[]; propiedades: PropiedadCalendario[] } | null>(null);

  // El mismo GET de siempre, por la caché de 2 s que comparte el índice (datosIndice).
  useEffect(() => {
    let vivo = true;
    pedirJSON<unknown>(URL_GENERACIONES, { fresco: intento > 0 })
      .then((data) => {
        if (!vivo) return;
        if (Array.isArray(data)) setGenerations(data as Generation[]);
        else setErrorCarga(true);
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  // Copropiedades y vencidas de la cornisa: /api/calendar, que el armazón ya pide
  // en cada ruta (misma caché: no es un pedido nuevo). Si falla, no hay cornisa.
  useEffect(() => {
    let vivo = true;
    pedirJSON<{ items?: unknown; properties?: unknown }>(URL_CALENDARIO).then((data) => {
      if (!vivo || !data || !Array.isArray(data.items) || !Array.isArray(data.properties)) return;
      setCalendario({
        items: data.items as ItemCalendario[],
        propiedades: (data.properties as PropiedadCalendario[]).map((p) => ({ id: p.id, name: p.name })),
      });
    });
    return () => {
      vivo = false;
    };
  }, []);

  const reintentar = () => {
    setErrorCarga(false);
    setLoading(true);
    setIntento((n) => n + 1);
  };

  /* ── alcance (cornisa) ─────────────────────────────────────────────── */
  const propiedades = calendario?.propiedades ?? [];
  const hoy = (() => {
    const a = new Date();
    return new Date(a.getFullYear(), a.getMonth(), a.getDate());
  })();
  // Vencidas por copropiedad: obligaciones pendientes con fecha pasada (mismo criterio que Inicio).
  const cornisa = propiedades.map((p) => ({
    id: p.id,
    nombre: p.name,
    vencidas: (calendario?.items ?? []).filter(
      (it) => it.status === "pending" && typeof it.dueDate === "string" && it.propertyId === p.id && diasHasta(it.dueDate, hoy) < 0,
    ).length,
  }));
  const elegida = propiedades.find((p) => p.id === alcance) ?? null;
  // La API de generaciones solo trae el nombre de la copropiedad (y el id en demo).
  const enAlcance = (g: Generation) =>
    !elegida || g.property?.id === elegida.id || (!g.property?.id && g.property?.name === elegida.name);

  /* ── filtros ───────────────────────────────────────────────────────── */
  const q = consulta.trim().toLowerCase();
  const pasaTipo = (g: Generation, t: FiltroTipo) => {
    // Generations are stored as type "custom" and can contain several docs, so
    // filter by which documents the generation actually produced, not by type.
    const out = g.outputFiles ?? {};
    if (t === "informe") return !!out.informeHtml;
    if (t === "acta") return !!out.actaHtml;
    if (t === "presentacion") return !!out.presentacionPptx;
    return true;
  };
  const pasaEstado = (g: Generation) => statusFilter === "all" || g.status === statusFilter;
  const pasaConsulta = (g: Generation) =>
    !q ||
    [g.property?.name ?? "", tituloDe(g), periodoDe(g), STATUS_CONFIG[g.status]?.label ?? g.status]
      .join(" ")
      .toLowerCase()
      .includes(q);

  const delAlcance = generations.filter(enAlcance);
  const baseTipo = delAlcance.filter((g) => pasaEstado(g) && pasaConsulta(g));
  const filtered = baseTipo.filter((g) => pasaTipo(g, typeFilter));

  const anio = new Date().getFullYear();
  // Mismo conteo que Inicio: generaciones completadas este año (la API devuelve como mucho 100).
  const delAnio = generations.filter((g) => g.status === "completed" && new Date(g.createdAt).getFullYear() === anio);
  const tope = generations.length >= 100;
  // Con una copropiedad elegida en la cornisa, el subtítulo cuenta solo las suyas (mismo criterio).
  const delAnioAlcance = delAnio.filter(enAlcance);

  const hayFiltros = typeFilter !== "all" || statusFilter !== "all" || q !== "";
  const quitarFiltros = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setConsulta("");
  };

  /* ── tabla ─────────────────────────────────────────────────────────── */
  const columnas: ColumnaTabla<Generation>[] = [
    {
      id: "fecha",
      titulo: "Fecha",
      ancho: "96px",
      principal: true,
      celda: (g) => (
        <time className="hist-fecha" dateTime={g.createdAt}>
          {fechaCorta(g.createdAt)}
        </time>
      ),
    },
    {
      id: "doc",
      titulo: "Documento",
      ancho: "minmax(0, 3fr)",
      celda: (g) => {
        const docs = documentos(g);
        return (
          <span className="hist-doc">
            {docs.length > 0 && (
              <span className="tipos">
                {docs.map((d) => (
                  <TipoArchivo key={d.sigla}>{d.sigla}</TipoArchivo>
                ))}
              </span>
            )}
            <span className="t">{tituloDe(g)}</span>
          </span>
        );
      },
    },
    {
      id: "prop",
      titulo: "Copropiedad",
      ancho: "minmax(0, 2fr)",
      celda: (g) => <span className="hist-prop">{g.property?.name ?? "Propiedad eliminada"}</span>,
    },
    {
      id: "per",
      titulo: "Periodo",
      ancho: "minmax(0, 1.2fr)",
      celda: (g) => (
        <span className="hist-per">
          <span className="rot">Periodo </span>
          {periodoDe(g)}
        </span>
      ),
    },
    {
      id: "estado",
      titulo: "Estado",
      // Nunca más estrecha que su palabra («Procesando»): si no, se monta sobre la acción.
      ancho: "minmax(max-content, 1.3fr)",
      celda: (g) => {
        const cfg = STATUS_CONFIG[g.status];
        return (
          <Estado tipo={cfg?.tipo ?? "sin"} tamLetra={15}>
            {cfg?.label ?? g.status}
          </Estado>
        );
      },
    },
    {
      id: "acc",
      titulo: "Acciones",
      tituloOculto: true,
      alinear: "fin",
      ancho: "auto",
      claseCelda: "k-td-acc",
      celda: (g) => {
        const nombre = `${tituloDe(g)} · ${g.property?.name ?? "Propiedad eliminada"} · ${periodoDe(g)}`;
        const verbo = g.status === "failed" ? "Ver el error" : g.status === "completed" ? "Abrir" : "Ver el progreso";
        const docs = g.status === "completed" ? documentos(g) : [];
        const items: ItemMenu[] = docs.map((d) => ({ etiqueta: d.accion, href: d.url, nuevaPestana: true }));
        // Un acta redactada desde una reunión grabada vuelve a ella (la transcripción, el audio y el resumen).
        if (g.meetingId) items.push({ etiqueta: "Ver la reunión", href: `/dashboard/reuniones/${g.meetingId}` });
        return (
          <AccionesFila>
            <BotonFila href={`/dashboard/generar/${g.id}`} aria-label={`${verbo}: ${nombre}`}>
              {verbo}
            </BotonFila>
            {items.length > 0 && <MenuMas etiquetaAccesible={`Más acciones · ${nombre}`} items={items} />}
          </AccionesFila>
        );
      },
    },
  ];

  const nombreAlcance = elegida ? nombreCorto(elegida.name) : null;

  const vacio =
    generations.length === 0 ? (
      <Vacio
        titulo="Aún no has generado documentos."
        texto="Tus informes de gestión, actas y presentaciones aparecerán aquí en cuanto generes el primero."
        acciones={
          <Boton href="/dashboard/generar" flecha="avanza">
            Generar el primero
          </Boton>
        }
      />
    ) : delAlcance.length === 0 && elegida ? (
      <Vacio
        titulo={`${elegida.name} aún no tiene documentos generados.`}
        texto="Genera su informe de gestión o su acta y aparecerán en este historial."
        acciones={
          <>
            <Boton href="/dashboard/generar" flecha="avanza">
              Generar documentos
            </Boton>
            <Boton variante="secundario" onClick={() => setAlcance("todas")}>
              Ver todas las copropiedades
            </Boton>
          </>
        }
      />
    ) : (
      <SinResultados
        consulta={
          q
            ? consulta.trim()
            : [
                FILTROS_TIPO.find((f) => f.id === typeFilter)?.etiqueta ?? "",
                statusFilter !== "all" ? ETIQUETA_ESTADO[statusFilter] : "",
              ]
                .filter((x) => x && x !== "Todos")
                .join(" · ")
        }
        titulo={
          q
            ? `No encontramos «${consulta.trim()}»${nombreAlcance ? ` en ${nombreAlcance}` : " en tu historial"}.`
            : `Ningún documento coincide con estos filtros${nombreAlcance ? ` en ${nombreAlcance}` : ""}.`
        }
        texto={
          q
            ? "Busca por copropiedad, documento, periodo o estado, o quita los filtros para ver todo."
            : "Prueba con otro tipo de documento u otro estado."
        }
        acciones={
          q ? (
            <>
              <Boton variante="secundario" onClick={() => setConsulta("")}>
                Limpiar búsqueda
              </Boton>
              {(typeFilter !== "all" || statusFilter !== "all") && (
                <Boton variante="fantasma" onClick={quitarFiltros}>
                  Quitar todos los filtros
                </Boton>
              )}
            </>
          ) : (
            <Boton variante="secundario" onClick={quitarFiltros}>
              Quitar filtros
            </Boton>
          )
        }
      />
    );

  const subtitulo =
    loading || errorCarga || generations.length === 0
      ? "Todos los documentos que has generado"
      : `${delAnioAlcance.length}${tope ? "+" : ""} ${delAnioAlcance.length === 1 ? "documento generado" : "documentos generados"} en ${anio}${elegida ? ` · ${nombreCorto(elegida.name)}` : ""}`;

  return (
    <div>
      <style href="k-historial-local" precedence="default">
        {CSS}
      </style>
      <Header title="Historial" />
      {cornisa.length > 0 && <Cornisa copropiedades={cornisa} valor={elegida ? alcance : "todas"} alCambiar={setAlcance} />}
      <Pagina>
        <Pieza>
          <CabeceraPieza titulo="Historial" subtitulo={subtitulo} />

          {loading ? (
            <Esqueleto variante="tabla" filas={6} etiquetaAccesible="Cargando el historial…" />
          ) : errorCarga ? (
            <ErrorCarga
              titulo="No pudimos cargar el historial."
              texto="Revisa tu conexión e inténtalo de nuevo."
              acciones={
                <Boton variante="secundario" onClick={reintentar}>
                  Reintentar
                </Boton>
              }
            />
          ) : (
            <>
              {delAlcance.length > 0 && (
                <div className="hist-filtros">
                  <Segmentos
                    etiquetaAccesible="Filtrar por documento"
                    valor={typeFilter}
                    alCambiar={(v) => setTypeFilter(v as FiltroTipo)}
                    items={FILTROS_TIPO.map((f) => ({
                      id: f.id,
                      etiqueta: f.etiqueta,
                      icono: f.icono,
                      tono: f.tono,
                      conteo: baseTipo.filter((g) => pasaTipo(g, f.id)).length,
                    }))}
                  />
                  <Selector
                    aria-label="Filtrar por estado"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    {Object.entries(ETIQUETA_ESTADO).map(([id, et]) => (
                      <option key={id} value={id}>
                        {et}
                      </option>
                    ))}
                  </Selector>
                  <Buscador
                    etiquetaAccesible="Buscar copropiedad, documento o periodo"
                    placeholder="Copropiedad, documento o periodo"
                    value={consulta}
                    onChange={(e) => setConsulta(e.target.value)}
                  />
                </div>
              )}

              <Tabla
                className="hist-tabla"
                etiquetaAccesible={nombreAlcance ? `Documentos generados de ${elegida?.name}` : "Documentos generados"}
                filas={filtered}
                claveFila={(g) => g.id}
                columnas={columnas}
                filaConError={(g) => g.status === "failed"}
                agrupar={{
                  estilo: "fila",
                  clave: (g) => mesDe(g.createdAt),
                  titulo: (clave, filas) => {
                    const [y, m] = clave.split("-").map(Number);
                    return (
                      <span className="hist-grupo">
                        {may(MESES[m - 1])} {y}
                        <small>
                          {filas.length}
                          <span className="k-sr"> {filas.length === 1 ? "generación" : "generaciones"}</span>
                        </small>
                      </span>
                    );
                  },
                }}
                vacio={vacio}
              />

              {filtered.length > 0 && (
                <PieTabla
                  texto={
                    hayFiltros || elegida
                      ? `Mostrando ${filtered.length} de ${generations.length} ${generations.length === 1 ? "generación" : "generaciones"}`
                      : `${filtered.length} ${filtered.length === 1 ? "generación" : "generaciones"}, de la más reciente a la más antigua`
                  }
                />
              )}
              {tope && <p className="hist-nota">Se muestran las 100 generaciones más recientes.</p>}
            </>
          )}
        </Pieza>
      </Pagina>
    </div>
  );
}
