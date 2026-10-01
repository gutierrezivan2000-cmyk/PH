"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import {
  AccionesFila, Boton, BotonFila, CabeceraPieza, ErrorCarga, Esqueleto, Estado, Pagina, PestanasUnidas, PieTabla, Pieza,
  Tabla, Vacio, type ColumnaTabla,
} from "@/components/kit";
import { ErrorApi, listarReuniones } from "@/lib/meetings/cliente";
import type { ReunionResumen } from "@/lib/meetings/dto";
import { fechaCorta, horaCorta } from "@/lib/meetings/formato";
import { cortoTipoReunion, describirEstado, estaEnMarcha, formatearDuracion } from "@/lib/meetings/tipos";

type Propiedad = { id: string; name: string };

/** Mientras algo se sube, graba o procesa, la lista se refresca sola. */
const REFRESCO_MS = 15_000;

const CSS = `
.re-ctx { margin: 0 0 16px; }
.re-fecha { display: grid; gap: 2px; line-height: 1.2; }
.re-fecha b { font-size: 15px; font-weight: 600; white-space: nowrap; }
.re-fecha small { font-size: 13px; font-weight: 500; color: var(--ink-3); white-space: nowrap; }
`;

function enMarcha(r: ReunionResumen) {
  return estaEnMarcha(r.status) || r.status === "subiendo" || r.status === "grabando";
}

export function ListaReuniones() {
  const [propiedades, setPropiedades] = useState<Propiedad[]>([]);
  const [items, setItems] = useState<ReunionResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todas");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/properties").then((r) => (r.ok ? r.json() : Promise.reject(new Error("propiedades")))),
      listarReuniones(),
    ])
      .then(([props, reuniones]) => {
        if (!vivo) return;
        setPropiedades(Array.isArray(props) ? props.map((p: Propiedad) => ({ id: p.id, name: p.name })) : []);
        setItems(reuniones);
        setError(null);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof ErrorApi ? e.message : "Revisa tu conexión e inténtalo de nuevo.");
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  const hayEnMarcha = items?.some(enMarcha) ?? false;
  useEffect(() => {
    if (!hayEnMarcha) return;
    const t = setInterval(() => {
      listarReuniones()
        .then(setItems)
        .catch(() => {});
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [hayEnMarcha]);

  const cargando = items === null && error === null;
  const visibles = useMemo(
    () => (items ?? []).filter((r) => filtro === "todas" || r.propertyId === filtro),
    [items, filtro],
  );
  const propiedadElegida = propiedades.find((p) => p.id === filtro);
  const variasPropiedades = propiedades.length > 1;
  const query = filtro === "todas" ? "" : `&p=${encodeURIComponent(filtro)}`;

  const reintentar = () => {
    setError(null);
    setItems(null);
    setIntento((n) => n + 1);
  };

  const columnas: ColumnaTabla<ReunionResumen>[] = [
    {
      id: "fecha",
      titulo: "Fecha",
      ancho: "minmax(0, 1fr)",
      principal: true,
      celda: (r) => (
        <span className="re-fecha">
          <b>{fechaCorta(r.date)}</b>
          <small>{horaCorta(r.date)}</small>
        </span>
      ),
    },
    {
      id: "reunion",
      titulo: "Reunión",
      ancho: "minmax(0, 3fr)",
      claseCelda: "k-c-nom",
      celda: (r) => (
        <>
          {r.title}
          <span>
            {cortoTipoReunion(r.type)}
            {filtro === "todas" && variasPropiedades ? ` · ${r.propertyName}` : ""}
          </span>
        </>
      ),
    },
    { id: "duracion", titulo: "Duración", ancho: "minmax(0, 1fr)", celda: (r) => formatearDuracion(r.durationMs) },
    {
      id: "estado",
      titulo: "Estado",
      ancho: "minmax(0, 1.7fr)",
      celda: (r) => {
        const e = describirEstado(r);
        return <Estado tipo={e.tipo}>{e.texto}</Estado>;
      },
    },
    {
      id: "acciones",
      titulo: "Acciones",
      tituloOculto: true,
      alinear: "fin",
      ancho: "auto",
      celda: (r) => {
        const verbo = r.status === "borrador" ? "Continuar" : "Abrir";
        return (
          <AccionesFila>
            <BotonFila href={`/dashboard/reuniones/${r.id}`} icono={ArrowRight} tono="violet" aria-label={`${verbo}: ${r.title}`}>
              {verbo}
            </BotonFila>
          </AccionesFila>
        );
      },
    },
  ];

  return (
    <div className="re">
      <style href="k-reuniones-local" precedence="default">
        {CSS}
      </style>
      <Header title="Reuniones" />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            titulo="Reuniones"
            subtitulo="Graba o sube tus reuniones: las transcribimos completas, con quién habla y en qué minuto."
            acciones={
              propiedades.length > 0 ? (
                <>
                  <Boton variante="secundario" href={`/dashboard/reuniones/nueva?modo=subir${query}`}>
                    Subir grabación
                  </Boton>
                  <Boton href={`/dashboard/reuniones/nueva?modo=grabar${query}`}>Grabar reunión</Boton>
                </>
              ) : undefined
            }
          />

          {cargando && <Esqueleto variante="completo" filas={5} etiquetaAccesible="Cargando tus reuniones…" />}

          {error !== null && (
            <ErrorCarga
              titulo="No pudimos cargar tus reuniones."
              texto={error}
              acciones={
                <Boton variante="secundario" onClick={reintentar}>
                  Reintentar
                </Boton>
              }
            />
          )}

          {!cargando && error === null && propiedades.length === 0 && (
            <Vacio
              titulo="Aún no tienes copropiedades."
              texto="Las reuniones se guardan por copropiedad. Crea la primera para empezar."
              acciones={
                <Boton href="/dashboard/propiedades" flecha="crea">
                  Agregar copropiedad
                </Boton>
              }
            />
          )}

          {!cargando && error === null && propiedades.length > 0 && (
            <>
              {variasPropiedades && (
                <div className="re-ctx">
                  <PestanasUnidas
                    etiquetaAccesible="Copropiedad"
                    valor={filtro}
                    alCambiar={setFiltro}
                    items={[
                      { id: "todas", etiqueta: "Todas", conteo: items?.length ?? 0 },
                      ...propiedades.map((p) => ({
                        id: p.id,
                        etiqueta: p.name,
                        titulo: p.name,
                        conteo: (items ?? []).filter((r) => r.propertyId === p.id).length,
                      })),
                    ]}
                  />
                </div>
              )}

              {visibles.length === 0 ? (
                <Vacio
                  titulo={propiedadElegida ? `Aún no hay reuniones en ${propiedadElegida.name}.` : "Aún no tienes reuniones."}
                  texto="Graba la próxima reunión desde aquí o sube la grabación que ya tienes, de cualquier duración."
                  acciones={
                    <>
                      <Boton href={`/dashboard/reuniones/nueva?modo=grabar${query}`}>Grabar reunión</Boton>
                      <Boton variante="secundario" href={`/dashboard/reuniones/nueva?modo=subir${query}`}>
                        Subir grabación
                      </Boton>
                    </>
                  }
                />
              ) : (
                <>
                  <Tabla
                    etiquetaAccesible={propiedadElegida ? `Reuniones de ${propiedadElegida.name}` : "Reuniones"}
                    filas={visibles}
                    claveFila={(r) => r.id}
                    columnas={columnas}
                  />
                  <PieTabla texto={`${visibles.length} ${visibles.length === 1 ? "reunión" : "reuniones"}`} />
                </>
              )}
            </>
          )}
        </Pieza>
      </Pagina>
    </div>
  );
}
