"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { pedirJSON, URL_GENERACIONES } from "@/components/dashboard/datosIndice";
import {
  AccionesFila,
  Aviso,
  Boton,
  BotonFila,
  CabeceraPieza,
  Campo,
  Entrada,
  ErrorCarga,
  Esqueleto,
  Estado,
  FilaArchivo,
  GrupoCampos,
  ListaArchivos,
  MenuMas,
  Modal,
  Pagina,
  Pieza,
  Seccion,
  Tabla,
  Vacio,
  ZonaSubida,
  avisar,
  nombreCorto,
  pesoLegible,
  type ColumnaTabla,
} from "@/components/kit";
import { upload as blobUpload } from "@vercel/blob/client";

interface PropertyDocument {
  id: string;
  type: string;
  name: string;
  url: string;
  size: number;
  mimeType: string | null;
  createdAt: string;
}

interface Property {
  id: string;
  name: string;
  address?: string;
  city?: string;
  units?: number;
  createdAt: string;
}

/** GET /api/generations (máx. 100, las más recientes primero). Solo se lee lo necesario para «Último informe». */
interface Generacion {
  id: string;
  status: string;
  month: number;
  year: number;
  createdAt: string;
  outputFiles?: Record<string, string> | null;
  /** La API lo devuelve (lo usa Generar); el nombre solo sirve de respaldo. */
  propertyId?: string | null;
  property?: { name: string } | null;
}

/** Los dos documentos base que admite la API (`type` de /api/properties/[id]/documents). */
const DOCUMENTOS_BASE = [
  { tipo: "manual_convivencia", nombre: "Manual de convivencia", corto: "el manual" },
  { tipo: "reglamento_interno", nombre: "Reglamento interno", corto: "el reglamento" },
] as const;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NB = " "; // espacio duro entre número y unidad o mes

/** «29 ago», o «29 ago de 2025» si no es de este año. */
function fechaCorta(f: Date): string {
  const base = `${f.getDate()}${NB}${MESES_CORTOS[f.getMonth()]}`;
  return f.getFullYear() === new Date().getFullYear() ? base : `${base} de ${f.getFullYear()}`;
}

/* Ajustes locales de la tabla y los paneles (lo que el kit no trae hecho). */
const estilos = (
  <style>{`
    .prop-nom { display: block; font-size: 18px; font-weight: 800; line-height: 1.2; letter-spacing: -.005em; overflow-wrap: anywhere; }
    .prop-nom + .k-apoyo { display: block; margin-top: 4px; }
    .prop-u { display: grid; gap: 4px; justify-items: start; }
    .prop-u .k-cifra { line-height: .85; }
    .prop-docs { display: grid; gap: 6px; justify-items: start; min-width: 0; }
    .prop-docs .k-estado { max-width: 100%; white-space: normal; }
    .prop-inf { display: grid; gap: 3px; }
    .prop-inf b { font-size: 15px; font-weight: 800; color: var(--ink); }
    .prop-ficha { scroll-margin-top: calc(var(--cab-h) + 16px); }
    .prop-ficha:focus { outline: none; }
    .prop-dos { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 16px; }
    .prop-ayuda { margin: 0; font-size: 15px; line-height: 1.45; color: var(--ink-2); max-width: 52ch; text-wrap: pretty; }
    .prop-ayuda + .prop-ayuda { margin-top: 12px; }
    .prop-doc + .prop-doc { margin-top: 28px; }
    .prop-doc-h { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; margin: 0 0 12px; }
    .prop-doc-h h3, .prop-doc-h h4 { margin: 0; }
    /* Documento ya guardado: sin barra de progreso ni «Listo» (el estado va en su título: «Subido»). */
    .prop-doc .k-arch { grid-template-columns: 52px minmax(0, 1fr) 44px; grid-template-areas: "tipo nom x"; }
    .prop-doc .k-arch > .k-barra, .prop-doc .k-arch > .est { display: none; }
    .prop-nota { margin: 16px 0 0; font-size: 14px; color: var(--ink-3); max-width: 68ch; }
    .prop-doc-falla { display: grid; justify-items: start; gap: 10px; padding-top: 12px; border-top: 1px solid var(--line-strong); }
    .prop-doc-falla p { margin: 0; }
    @media (max-width: 860px) { .prop-col-docs { margin-top: 36px; } .prop-col-docs + .prop-col-docs { margin-top: 28px; } }
    @media (max-width: 600px) { .prop-dos { grid-template-columns: minmax(0, 1fr); } }
    @layer components {
      @media (max-width: 860px) {
        /* En ficha, las unidades van a la columna izquierda aunque no sean la primera celda. */
        .prop-tabla .k-tr > .prop-u.k-td-principal { grid-row: 1 / span 6 !important; }
      }
    }
  `}</style>
);

export default function PropiedadesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  // Estado de la lista: sin él, la carga y un error se veían como «aún no tienes propiedades».
  const [estadoLista, setEstadoLista] = useState<"cargando" | "listo" | "error">("cargando");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [units, setUnits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editUnits, setEditUnits] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, PropertyDocument[]>>({});
  const [docsFallidos, setDocsFallidos] = useState<Record<string, boolean>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  // Confirmaciones (antes: confirm() del navegador; ahora el modal del kit).
  const [borrarPropiedad, setBorrarPropiedad] = useState<Property | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [borrarDoc, setBorrarDoc] = useState<{ propiedad: Property; doc: PropertyDocument; etiqueta: string } | null>(null);
  const [quitandoDoc, setQuitandoDoc] = useState(false);

  // «Último informe»: la misma respuesta de /api/generations que ya pide el armazón (caché compartida).
  // undefined = consultando; null = no se pudo consultar.
  const [generaciones, setGeneraciones] = useState<Generacion[] | null | undefined>(undefined);

  const refNueva = useRef<HTMLElement>(null);
  const refEditar = useRef<HTMLElement>(null);
  const refDocs = useRef<HTMLElement>(null);

  const fetchProperties = () => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProperties(data);
          setEstadoLista("listo");
          // Documentos base de cada copropiedad para la columna «Documentos base» (GET existente).
          (data as Property[]).forEach((p) => fetchDocs(p.id));
        } else {
          setEstadoLista("error");
        }
      })
      .catch((e) => {
        console.error(e);
        setEstadoLista("error");
      });
  };

  useEffect(() => {
    fetchProperties();
    pedirJSON<unknown>(URL_GENERACIONES).then((data) => {
      setGeneraciones(Array.isArray(data) ? (data as Generacion[]) : null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al abrir un panel, se lleva a la vista y el foco entra en él.
  useEffect(() => {
    if (!showForm) return;
    refNueva.current?.scrollIntoView({ block: "start" });
    refNueva.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
  }, [showForm]);
  useEffect(() => {
    if (!editingId) return;
    refEditar.current?.scrollIntoView({ block: "start" });
    refEditar.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
  }, [editingId]);
  useEffect(() => {
    if (!expandedId) return;
    refDocs.current?.scrollIntoView({ block: "start" });
    refDocs.current?.focus({ preventScroll: true });
  }, [expandedId]);

  const fetchDocs = async (propertyId: string) => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/documents`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocs((prev) => ({ ...prev, [propertyId]: data }));
        setDocsFallidos((prev) => ({ ...prev, [propertyId]: false }));
      } else {
        setDocsFallidos((prev) => ({ ...prev, [propertyId]: true }));
      }
    } catch {
      setDocsFallidos((prev) => ({ ...prev, [propertyId]: true }));
    }
  };

  const toggleExpand = (propertyId: string) => {
    if (expandedId === propertyId) {
      setExpandedId(null);
    } else {
      setExpandedId(propertyId);
      if (!docs[propertyId]) fetchDocs(propertyId);
    }
  };

  const handleDocUpload = async (propertyId: string, type: string, file: File) => {
    setUploadingDoc(`${propertyId}-${type}`);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const result = await blobUpload(`property-docs/${propertyId}/${Date.now()}-${safeName}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload/token",
        contentType: file.type || "application/octet-stream",
      });
      const res = await fetch(`/api/properties/${propertyId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: file.name,
          url: result.url,
          size: file.size,
          mimeType: file.type,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        avisar({ tipo: "error", titulo: "No se pudo guardar el documento.", texto: data?.error || undefined });
      }
      await fetchDocs(propertyId);
    } catch {
      // No se afirma la causa (red, permisos, límite del almacenamiento): solo lo que pasó.
      avisar({ tipo: "error", titulo: "No se pudo subir el documento.", texto: `«${file.name}» no se guardó. Inténtalo de nuevo en un momento.` });
    } finally {
      setUploadingDoc(null);
    }
  };

  // Solo se quita de la lista si la API lo borró: el demo (solo lectura) y cualquier error
  // responden sin borrar, y la pantalla marcaba «Falta» un documento que seguía guardado.
  const handleDocDelete = async (propertyId: string, docId: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/documents?docId=${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { ok: false, error: typeof data?.error === "string" ? data.error : undefined };
      }
      setDocs((prev) => ({
        ...prev,
        [propertyId]: (prev[propertyId] || []).filter((d) => d.id !== docId),
      }));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, city, units }),
      });

      if (res.ok) {
        setName("");
        setAddress("");
        setCity("");
        setUnits("");
        setShowForm(false);
        fetchProperties();
        avisar({ tipo: "ok", titulo: "Propiedad guardada.", texto: name.trim() });
      } else {
        const data = await res.json();
        setError(data.error || "Error al guardar la propiedad");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // La confirmación la hace el modal (antes, confirm() con el mismo texto).
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/properties?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchProperties();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  const startEditing = (property: Property) => {
    setEditingId(property.id);
    setEditName(property.name);
    setEditAddress(property.address || "");
    setEditCity(property.city || "");
    setEditUnits(property.units ? String(property.units) : "");
    setEditError("");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError("");
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editingId) return;

    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch("/api/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editName,
          address: editAddress,
          city: editCity,
          units: editUnits,
        }),
      });

      if (res.ok) {
        setEditingId(null);
        fetchProperties();
        avisar({ tipo: "ok", titulo: "Cambios guardados.", texto: editName.trim() });
      } else {
        const data = await res.json();
        setEditError(data.error || "Error al actualizar la propiedad");
      }
    } catch {
      setEditError("Error de conexión. Intenta de nuevo.");
    } finally {
      setEditLoading(false);
    }
  };

  const getDocByType = (propertyId: string, type: string) =>
    (docs[propertyId] || []).find((d) => d.type === type);

  const confirmarBorrado = async () => {
    if (!borrarPropiedad) return;
    setEliminando(true);
    const nombre = borrarPropiedad.name;
    const ok = await handleDelete(borrarPropiedad.id);
    setEliminando(false);
    setBorrarPropiedad(null);
    if (ok) avisar({ tipo: "ok", titulo: "Propiedad eliminada.", texto: nombre });
    else avisar({ tipo: "error", titulo: "No se pudo eliminar la propiedad.", texto: nombre });
  };

  const confirmarQuitarDoc = async () => {
    if (!borrarDoc) return;
    const { propiedad, doc } = borrarDoc;
    setQuitandoDoc(true);
    const r = await handleDocDelete(propiedad.id, doc.id);
    setQuitandoDoc(false);
    setBorrarDoc(null);
    if (r.ok) avisar({ tipo: "ok", titulo: "Documento quitado.", texto: `«${doc.name}» · ${nombreCorto(propiedad.name)}` });
    else avisar({ tipo: "error", titulo: "No se pudo quitar el documento.", texto: r.error ?? `«${doc.name}» sigue guardado. Inténtalo de nuevo en un momento.` });
  };

  /* ── último informe por copropiedad: /api/generations se cruza por propertyId (el nombre
        solo si la respuesta no lo trae: dos copropiedades pueden llamarse igual) ── */
  const ultimoInforme = (p: Property) =>
    (generaciones ?? []).find(
      (g) =>
        (g.propertyId ? g.propertyId === p.id : g.property?.name === p.name) &&
        g.status === "completed" &&
        g.outputFiles?.informeHtml,
    );
  // La API devuelve como mucho 100: si llegan 100 y no aparece, puede haber uno más antiguo.
  const topeGeneraciones = (generaciones?.length ?? 0) >= 100;

  const editando = properties.find((p) => p.id === editingId) ?? null;
  const conDocs = properties.find((p) => p.id === expandedId) ?? null;
  const n = properties.length;

  const columnas: ColumnaTabla<Property>[] = [
    {
      id: "nombre",
      titulo: "Copropiedad",
      ancho: "minmax(0, 3.2fr)",
      celda: (p) => {
        const donde = [p.address, p.city].filter(Boolean).join(" · ");
        return (
          <span>
            <span className="prop-nom">{p.name}</span>
            {donde && <span className="k-apoyo">{donde}</span>}
          </span>
        );
      },
    },
    {
      id: "unidades",
      titulo: "Unidades",
      ancho: "minmax(0, 1fr)",
      principal: true,
      claseCelda: "prop-u",
      celda: (p) =>
        p.units ? (
          <>
            <span className="k-cifra k-32">{p.units}</span>
            <span className="k-meta">{p.units === 1 ? "unidad" : "unidades"}</span>
          </>
        ) : (
          <span className="k-meta">Sin dato</span>
        ),
    },
    {
      id: "docs",
      titulo: "Documentos base",
      ancho: "minmax(0, 2.6fr)",
      celda: (p) => {
        if (!docs[p.id]) {
          return <span className="k-meta">{docsFallidos[p.id] ? "No se pudieron consultar" : "Consultando…"}</span>;
        }
        return (
          <span className="prop-docs">
            {DOCUMENTOS_BASE.map((d) =>
              getDocByType(p.id, d.tipo) ? (
                <Estado key={d.tipo} tipo="ok" tamLetra={14}>{d.nombre}</Estado>
              ) : (
                <Estado key={d.tipo} tipo="pendiente" tamLetra={14}>{d.nombre} · Falta</Estado>
              ),
            )}
          </span>
        );
      },
    },
    {
      id: "informe",
      titulo: "Último informe",
      ancho: "minmax(0, 1.5fr)",
      celda: (p) => {
        if (generaciones === undefined) return <span className="k-meta">Consultando…</span>;
        if (generaciones === null) return <span className="k-meta">Sin dato</span>;
        const g = ultimoInforme(p);
        if (!g) {
          return <span className="k-meta">{topeGeneraciones ? "Ninguno reciente" : "Aún sin informes"}</span>;
        }
        // «Informe generado el…»: en la ficha móvil no se ve la cabecera «Último informe».
        return (
          <span className="prop-inf">
            <b>{MESES[g.month - 1]?.replace(/^./, (c) => c.toUpperCase())}{NB}{g.year}</b>
            <span className="k-meta">Informe generado el {fechaCorta(new Date(g.createdAt))}</span>
          </span>
        );
      },
    },
    {
      id: "acciones",
      titulo: "Acciones",
      tituloOculto: true,
      alinear: "fin",
      ancho: "auto",
      claseCelda: "k-td-acc",
      celda: (p) => (
        <AccionesFila>
          <BotonFila
            aria-label={`Editar ${p.name}`}
            onClick={() => {
              startEditing(p);
              if (!docs[p.id]) fetchDocs(p.id);
            }}
          >
            Editar
          </BotonFila>
          <MenuMas
            etiquetaAccesible={`Más acciones · ${p.name}`}
            items={[
              {
                etiqueta: expandedId === p.id ? "Cerrar documentos base" : "Documentos base",
                alElegir: () => toggleExpand(p.id),
              },
              {
                etiqueta: "Eliminar propiedad…",
                nota: "pide confirmación",
                peligro: true,
                alElegir: () => setBorrarPropiedad(p),
              },
            ]}
          />
        </AccionesFila>
      ),
    },
  ];

  /** Documentos base de una copropiedad (manual y reglamento), con subida y quitar. */
  const bloqueDocumentos = (p: Property, nivel: 3 | 4) =>
    DOCUMENTOS_BASE.map((d) => (
      <DocumentSlot
        key={d.tipo}
        label={d.nombre}
        corto={d.corto}
        nivel={nivel}
        cargando={!docs[p.id] && !docsFallidos[p.id]}
        fallido={!docs[p.id] && Boolean(docsFallidos[p.id])}
        alReintentar={() => fetchDocs(p.id)}
        doc={getDocByType(p.id, d.tipo)}
        uploading={uploadingDoc === `${p.id}-${d.tipo}`}
        onUpload={(file) => handleDocUpload(p.id, d.tipo, file)}
        onDelete={(doc) => setBorrarDoc({ propiedad: p, doc, etiqueta: d.nombre })}
      />
    ));

  return (
    <div>
      {estilos}
      <Header title="Propiedades" />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="12"
            titulo="Propiedades"
            subtitulo={
              estadoLista === "listo" && n > 0
                ? `${n}${NB}${n === 1 ? "copropiedad" : "copropiedades"} · sus datos y documentos base`
                : "Administra las propiedades horizontales que gestionas"
            }
            acciones={
              // Sin copropiedades, el único primario es «Agregar la primera» del vacío.
              showForm || (estadoLista === "listo" && n === 0) ? undefined : (
                <Boton flecha="crea" onClick={() => setShowForm(!showForm)}>
                  Nueva propiedad
                </Boton>
              )
            }
          />

          {/* ── Nueva propiedad: panel en la misma pantalla (SPEC §g 12) ── */}
          {showForm && (
            <section ref={refNueva} className="prop-ficha">
              <Seccion id="prop-nueva-t" titulo="Nueva propiedad">
                <div className="k-r12">
                  <form onSubmit={handleSubmit} style={{ gridColumn: "1 / 8" }}>
                    {error && (
                      <Aviso enLinea tipo="error" titulo="No se pudo guardar la propiedad." texto={error} className="mb-6" />
                    )}
                    <GrupoCampos titulo="Datos de la copropiedad">
                      <Campo id="prop-nombre" etiqueta="Nombre del conjunto o edificio">
                        <Entrada
                          id="prop-nombre"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ej.: Conjunto Residencial Los Pinos"
                          required
                        />
                      </Campo>
                      <Campo id="prop-direccion" etiqueta="Dirección" opcional>
                        <Entrada
                          id="prop-direccion"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Ej.: Calle 123 # 45-67"
                        />
                      </Campo>
                      <div className="prop-dos">
                        <Campo id="prop-ciudad" etiqueta="Ciudad" opcional>
                          <Entrada
                            id="prop-ciudad"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Ej.: Bogotá"
                          />
                        </Campo>
                        <Campo id="prop-unidades" etiqueta="Unidades" opcional>
                          <Entrada
                            id="prop-unidades"
                            type="number"
                            inputMode="numeric"
                            value={units}
                            onChange={(e) => setUnits(e.target.value)}
                            placeholder="Ej.: 120"
                          />
                        </Campo>
                      </div>
                    </GrupoCampos>
                    <div className="k-btns">
                      <Boton variante="secundario" onClick={() => setShowForm(false)}>
                        Cancelar
                      </Boton>
                      <Boton type="submit" cargando={loading} textoCargando="Guardando…">
                        Guardar propiedad
                      </Boton>
                    </div>
                  </form>
                  <aside className="prop-col-docs" style={{ gridColumn: "8 / 13" }} aria-label="Sobre los documentos base">
                    <GrupoCampos titulo="Documentos base">
                      <p className="prop-ayuda">
                        El manual de convivencia y el reglamento interno se suben después de guardar: usa «Editar»
                        o «Documentos base» en la fila de la copropiedad.
                      </p>
                      <p className="prop-ayuda">
                        Los agentes de IA usan estos documentos como contexto para darte respuestas más precisas.
                      </p>
                    </GrupoCampos>
                  </aside>
                </div>
              </Seccion>
            </section>
          )}

          {/* ── Editar: datos + documentos base ── */}
          {editando && (
            <section ref={refEditar} className="prop-ficha">
              <Seccion id="prop-editar-t" titulo={`Editar · ${nombreCorto(editando.name)}`}>
                <div className="k-r12">
                  <form onSubmit={handleEditSubmit} style={{ gridColumn: "1 / 7" }}>
                    {editError && (
                      <Aviso enLinea tipo="error" titulo="No se pudieron guardar los cambios." texto={editError} className="mb-6" />
                    )}
                    <GrupoCampos titulo="Datos de la copropiedad">
                      <Campo id="prop-e-nombre" etiqueta="Nombre del conjunto o edificio">
                        <Entrada
                          id="prop-e-nombre"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Nombre del conjunto o edificio"
                          required
                        />
                      </Campo>
                      <Campo id="prop-e-direccion" etiqueta="Dirección" opcional>
                        <Entrada
                          id="prop-e-direccion"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          placeholder="Dirección"
                        />
                      </Campo>
                      <div className="prop-dos">
                        <Campo id="prop-e-ciudad" etiqueta="Ciudad" opcional>
                          <Entrada
                            id="prop-e-ciudad"
                            value={editCity}
                            onChange={(e) => setEditCity(e.target.value)}
                            placeholder="Ciudad"
                          />
                        </Campo>
                        <Campo id="prop-e-unidades" etiqueta="Unidades" opcional>
                          <Entrada
                            id="prop-e-unidades"
                            type="number"
                            inputMode="numeric"
                            value={editUnits}
                            onChange={(e) => setEditUnits(e.target.value)}
                            placeholder="Unidades"
                          />
                        </Campo>
                      </div>
                    </GrupoCampos>
                    <div className="k-btns">
                      <Boton variante="secundario" onClick={cancelEditing}>
                        Cancelar
                      </Boton>
                      <Boton type="submit" cargando={editLoading} textoCargando="Guardando…">
                        Guardar cambios
                      </Boton>
                    </div>
                  </form>
                  <div className="prop-col-docs" style={{ gridColumn: "7 / 13" }}>
                    <GrupoCampos
                      titulo="Documentos base"
                      nota="Se guardan al subirlos. Los agentes de IA los usan como contexto."
                    >
                      {bloqueDocumentos(editando, 3)}
                    </GrupoCampos>
                  </div>
                </div>
              </Seccion>
            </section>
          )}

          {/* ── Documentos base de una copropiedad (desde «Más») ── */}
          {conDocs && conDocs.id !== editingId && (
            <section ref={refDocs} className="prop-ficha" tabIndex={-1} aria-labelledby="prop-docs-t">
              <Seccion
                id="prop-docs-t"
                titulo={`Documentos base · ${nombreCorto(conDocs.name)}`}
                acciones={
                  <Boton variante="secundario" tam={40} onClick={() => toggleExpand(conDocs.id)}>
                    Cerrar
                  </Boton>
                }
              >
                <p className="prop-ayuda" style={{ marginBottom: 20 }}>
                  Los agentes de IA usarán estos documentos como contexto para darte respuestas más precisas.
                </p>
                <div className="k-r12">
                  {bloqueDocumentos(conDocs, 3).map((b, i) => (
                    <div key={i} className={i === 0 ? undefined : "prop-col-docs"} style={{ gridColumn: i === 0 ? "1 / 7" : "7 / 13" }}>{b}</div>
                  ))}
                </div>
              </Seccion>
            </section>
          )}

          {/* ── Tabla-índice de copropiedades ── */}
          {estadoLista === "cargando" ? (
            <Esqueleto variante="tabla" filas={3} etiquetaAccesible="Cargando tus copropiedades…" />
          ) : estadoLista === "error" ? (
            <ErrorCarga
              titulo="No pudimos cargar tus copropiedades."
              texto="Revisa tu conexión e inténtalo de nuevo."
              acciones={
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setEstadoLista("cargando");
                    fetchProperties();
                  }}
                >
                  Reintentar
                </Boton>
              }
            />
          ) : properties.length === 0 ? (
            !showForm && (
              <Vacio
                titulo="Aún no tienes copropiedades."
                texto="Agrega tu primera copropiedad para empezar a generar informes y actas con IA."
                acciones={
                  <Boton flecha="avanza" onClick={() => setShowForm(true)}>
                    Agregar la primera
                  </Boton>
                }
              />
            )
          ) : (
            <>
              <Tabla
                className="prop-tabla"
                etiquetaAccesible="Mis copropiedades"
                filas={properties}
                claveFila={(p) => p.id}
                columnas={columnas}
                alta
              />
              <p className="prop-nota">
                Los documentos base (manual de convivencia y reglamento interno) le dan contexto a los agentes de IA.
              </p>
            </>
          )}
        </Pieza>
      </Pagina>

      {/* Eliminar propiedad: nombra la copropiedad y lo que se borra. */}
      <Modal
        abierto={Boolean(borrarPropiedad)}
        alCerrar={() => { if (!eliminando) setBorrarPropiedad(null); }}
        titulo={`¿Eliminar ${borrarPropiedad?.name ?? "esta propiedad"}?`}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setBorrarPropiedad(null)} disabled={eliminando}>
              Cancelar
            </Boton>
            <Boton variante="peligro" lleno onClick={confirmarBorrado} cargando={eliminando} textoCargando="Eliminando…">
              Eliminar propiedad
            </Boton>
          </>
        }
      >
        <p>
          Se borrará también todo su historial de documentos generados (informes, actas y presentaciones). Esta
          acción no se puede deshacer.
        </p>
      </Modal>

      {/* Quitar un documento base. */}
      <Modal
        abierto={Boolean(borrarDoc)}
        alCerrar={() => { if (!quitandoDoc) setBorrarDoc(null); }}
        titulo={`¿Quitar el ${borrarDoc?.etiqueta.toLowerCase() ?? "documento"} de ${borrarDoc ? nombreCorto(borrarDoc.propiedad.name) : ""}?`}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setBorrarDoc(null)} disabled={quitandoDoc}>
              Cancelar
            </Boton>
            <Boton variante="peligro" lleno onClick={confirmarQuitarDoc} cargando={quitandoDoc} textoCargando="Quitando…">
              Quitar documento
            </Boton>
          </>
        }
      >
        <p>
          Se borra «{borrarDoc?.doc.name}» y los agentes de IA dejarán de usarlo como contexto. Puedes subirlo de
          nuevo cuando quieras.
        </p>
      </Modal>
    </div>
  );
}

function DocumentSlot({
  label,
  corto,
  nivel,
  cargando,
  fallido,
  alReintentar,
  doc,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  corto: string;
  nivel: 3 | 4;
  cargando: boolean;
  /** No se pudo consultar la lista: no se sabe si falta (antes decía «Falta»). */
  fallido: boolean;
  alReintentar: () => void;
  doc?: PropertyDocument;
  uploading: boolean;
  onUpload: (file: File) => void;
  onDelete: (doc: PropertyDocument) => void;
}) {
  const H = nivel === 3 ? "h3" : "h4";
  return (
    <div className="prop-doc">
      <div className="prop-doc-h">
        <H className="k-fila-t">{label}</H>
        {uploading ? (
          <Estado tipo="enCurso" tamLetra={14}>Subiendo</Estado>
        ) : doc ? (
          <Estado tipo="ok" tamLetra={14}>Subido</Estado>
        ) : cargando ? null : fallido ? (
          <Estado tipo="falta" tamLetra={14}>Sin dato</Estado>
        ) : (
          <Estado tipo="pendiente" tamLetra={14}>Falta</Estado>
        )}
      </div>
      {uploading ? (
        <div role="status">
          <ZonaSubida
            compacta
            deshabilitado
            titulo={`Subiendo ${corto}…`}
            texto="Espera a que termine antes de salir de esta pantalla."
            alElegir={() => {}}
          />
        </div>
      ) : doc ? (
        <ListaArchivos etiquetaAccesible={label}>
          <FilaArchivo
            nombre={doc.name}
            detalle={pesoLegible(doc.size)}
            estado="listo"
            alQuitar={() => onDelete(doc)}
            etiquetaQuitar={`Quitar ${label.toLowerCase()}: ${doc.name}`}
          />
        </ListaArchivos>
      ) : cargando ? (
        <span className="k-meta">Consultando…</span>
      ) : fallido ? (
        <div className="prop-doc-falla">
          <p className="k-apoyo">No pudimos consultar si ya está subido.</p>
          <Boton variante="secundario" tam={40} onClick={alReintentar}>
            Reintentar
          </Boton>
        </div>
      ) : (
        <ZonaSubida
          compacta
          titulo={`Suelta aquí ${corto}`}
          texto="o haz clic para elegirlo."
          formatos="PDF o Word"
          accept=".pdf,.docx,.doc"
          etiquetaAccesible={`Subir ${label.toLowerCase()}`}
          alElegir={(files) => {
            if (files[0]) onUpload(files[0]);
          }}
        />
      )}
    </div>
  );
}
