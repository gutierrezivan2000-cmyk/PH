"use client";

import { CircleStop, Download, Mic, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Header } from "@/components/dashboard/Header";
import { SubidaReunion } from "@/components/reuniones/SubidaReunion";
import { TabHablantes } from "@/components/reuniones/TabHablantes";
import { VisorTranscripcion } from "@/components/reuniones/VisorTranscripcion";
import {
  Aviso, BarraProgreso, Boton, CabeceraPieza, Campo, Entrada, ErrorCarga, Esqueleto, Estado, MenuMas, Modal, Pagina, Panel,
  Pieza, Segmentos, Selector, Vacio, avisar, type ItemMenu,
} from "@/components/kit";
import {
  ErrorApi, actualizarReunion, eliminarReunion, obtenerEstado, obtenerReunion, procesarReunion, reintentarReunion, urlDeTranscripcion,
} from "@/lib/meetings/cliente";
import type { ReunionDetalle } from "@/lib/meetings/dto";
import { aValorLocal, deValorLocal, fechaLarga, haceCuanto } from "@/lib/meetings/formato";
import {
  CLAVES_TIPO_REUNION, TEXTO_ETAPA, TIPOS_DE_REUNION, cortoTipoReunion, describirEstado, esTipoReunion, estaEnMarcha, formatearDuracion,
  type EtapaReunion,
} from "@/lib/meetings/tipos";

type Pestana = "resumen" | "transcripcion" | "hablantes" | "acta" | "preguntar";

const PESTANAS: Array<{ id: Pestana; etiqueta: string; texto: string }> = [
  { id: "resumen", etiqueta: "Resumen", texto: "Aquí verás el resumen de la reunión: decisiones, compromisos y votaciones, cada uno con su minuto." },
  { id: "transcripcion", etiqueta: "Transcripción", texto: "Aquí verás la transcripción completa, con quién habla y en qué minuto, junto al audio." },
  { id: "hablantes", etiqueta: "Hablantes", texto: "Aquí le pones nombre a cada voz de la reunión." },
  { id: "acta", etiqueta: "Acta", texto: "Aquí redactas el acta a partir de la reunión completa." },
  { id: "preguntar", etiqueta: "Preguntar", texto: "Aquí le preguntas a la reunión: responde con la transcripción completa y te dice en qué minuto se habló." },
];

/** Descarga un archivo sin salir de la página (la ruta responde con `Content-Disposition: attachment`). */
function descargar(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}

/** Mientras algo se sube o graba, la página se refresca sola. */
const REFRESCO_MS = 8_000;
/** Mientras se procesa se consulta el estado liviano (y de paso el servidor empuja el trabajo). */
const REFRESCO_PROCESO_MS = 4_000;

const CSS = `
.re-estado { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0 0 20px; }
.re-estado .cob { font-size: 14.5px; font-weight: 600; color: var(--ink-2); }
.re-nota { margin: 0 0 16px; max-width: 64ch; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.re-proceso { display: grid; gap: 12px; max-width: 560px; }
.re-etapa { margin: 0; font-size: 15.5px; font-weight: 600; color: var(--ink); font-feature-settings: "tnum" 1; }
.re-acciones { display: flex; flex-wrap: wrap; gap: 10px; }
@media (max-width: 560px) { .re-acciones > .k-btn { flex: 1 1 auto; } }
.re-pestanas { margin: 0 0 16px; }
.re-modal-campos .k-fld { margin-bottom: 14px; }
.re-modal-texto { margin: 0 0 12px; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
`;

export function DetalleReunion({ id }: { id: string }) {
  const router = useRouter();
  const [datos, setDatos] = useState<ReunionDetalle | null>(null);
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  const [elegida, setPestana] = useState<Pestana | null>(null);

  const [modal, setModal] = useState<"editar" | "eliminar" | "terminar" | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const [edit, setEdit] = useState({ title: "", type: "consejo", fecha: "" });

  useEffect(() => {
    let vivo = true;
    obtenerReunion(id)
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => {
        if (vivo) setError({ mensaje: e instanceof ErrorApi ? e.message : "Revisa tu conexión e inténtalo de nuevo.", noExiste: e instanceof ErrorApi && e.status === 404 });
      });
    return () => {
      vivo = false;
    };
  }, [id, version]);

  const estado = datos?.meeting.status ?? "";
  const hayEnMarcha = estado === "subiendo" || estado === "grabando";
  useEffect(() => {
    if (!hayEnMarcha) return;
    const t = setInterval(() => {
      obtenerReunion(id)
        .then(setDatos)
        .catch(() => {});
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [hayEnMarcha, id]);

  // Procesando: se consulta el estado liviano. Cuando termina (lista, error, sin horas) se vuelve a cargar la reunión entera.
  const procesando = estaEnMarcha(estado);
  useEffect(() => {
    if (!procesando) return;
    const t = setInterval(() => {
      obtenerEstado(id)
        .then((e) => {
          if (!estaEnMarcha(e.status)) {
            setVersion((v) => v + 1);
            return;
          }
          setDatos((prev) =>
            prev
              ? { ...prev, meeting: { ...prev.meeting, status: e.status, stage: e.stage, progress: e.progress, errorMessage: e.errorMessage, hechas: e.tareas.hechas, total: e.tareas.total } }
              : prev,
          );
        })
        .catch(() => {});
    }, REFRESCO_PROCESO_MS);
    return () => clearInterval(t);
  }, [procesando, id]);

  const [reintentando, setReintentando] = useState(false);
  const reintentar = async () => {
    setReintentando(true);
    try {
      await reintentarReunion(id);
      setVersion((v) => v + 1);
    } catch (err) {
      avisar({ tipo: "error", titulo: err instanceof ErrorApi ? err.message : "No pudimos reintentar. Inténtalo de nuevo." });
    } finally {
      setReintentando(false);
    }
  };

  const m = datos?.meeting ?? null;
  // Se abre en lo que ya funciona del todo: la transcripción. (Cuando «Resumen» esté completo, será la pestaña de entrada.)
  const pestana: Pestana = elegida ?? "transcripcion";

  const abrirEditar = () => {
    if (!m) return;
    setEdit({ title: m.title, type: m.type, fecha: aValorLocal(new Date(m.date)) });
    setErrorModal("");
    setModal("editar");
  };
  const abrirEliminar = () => {
    setErrorModal("");
    setModal("eliminar");
  };
  const cerrarModal = () => {
    if (!trabajando) setModal(null);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const fecha = deValorLocal(edit.fecha);
    if (!fecha) {
      setErrorModal("Escribe una fecha y una hora válidas.");
      return;
    }
    setTrabajando(true);
    setErrorModal("");
    try {
      const nueva = await actualizarReunion(id, { title: edit.title, type: edit.type, date: fecha.toISOString() });
      setDatos((prev) => (prev ? { ...prev, meeting: { ...prev.meeting, ...nueva } } : prev));
      setModal(null);
      avisar({ tipo: "ok", titulo: "Cambios guardados." });
    } catch (err) {
      setErrorModal(err instanceof ErrorApi ? err.message : "No pudimos guardar los cambios.");
    } finally {
      setTrabajando(false);
    }
  };

  const terminarLoRecibido = async () => {
    setTrabajando(true);
    setErrorModal("");
    try {
      await procesarReunion(id);
      setModal(null);
      setVersion((v) => v + 1);
      avisar({ tipo: "ok", titulo: "Enviamos la reunión a transcribir." });
    } catch (err) {
      setErrorModal(err instanceof ErrorApi ? err.message : "No pudimos enviar la reunión a transcribir.");
    } finally {
      setTrabajando(false);
    }
  };

  const eliminar = async () => {
    setTrabajando(true);
    setErrorModal("");
    try {
      await eliminarReunion(id);
      avisar({ tipo: "ok", titulo: "Reunión eliminada." });
      router.push("/dashboard/reuniones");
    } catch (err) {
      setErrorModal(err instanceof ErrorApi ? err.message : "No pudimos eliminar la reunión.");
      setTrabajando(false);
    }
  };

  const menu: ItemMenu[] = [
    ...(m?.status === "lista" ? [{ etiqueta: "Descargar transcripción", icono: Download, tono: "blue" as const, alElegir: () => descargar(urlDeTranscripcion(id)) }] : []),
    { etiqueta: "Editar datos", icono: Pencil, tono: "amber", alElegir: abrirEditar },
    { etiqueta: "Eliminar reunión…", peligro: true, nota: "pide confirmación", alElegir: abrirEliminar },
  ];

  const descripcion = m ? describirEstado(m) : null;
  const subtitulo = m
    ? [m.propertyName, cortoTipoReunion(m.type), fechaLarga(m.date), m.durationMs ? formatearDuracion(m.durationMs) : null]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <div className="re">
      <style href="k-reuniones-detalle-local" precedence="default">
        {CSS}
      </style>
      <Header title={m?.title ?? "Reunión"} breadcrumbs={[{ label: "Reuniones", href: "/dashboard/reuniones" }]} />
      <Pagina>
        <Pieza>
          {datos === null && error === null && <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando la reunión…" />}

          {error !== null &&
            (error.noExiste ? (
              <Vacio
                titulo="No encontramos esa reunión."
                texto="Puede que ya se haya eliminado."
                acciones={
                  <Boton href="/dashboard/reuniones" flecha="vuelve">
                    Volver a Reuniones
                  </Boton>
                }
              />
            ) : (
              <ErrorCarga
                titulo="No pudimos cargar la reunión."
                texto={error.mensaje}
                acciones={
                  <Boton
                    variante="secundario"
                    onClick={() => {
                      setError(null);
                      setVersion((v) => v + 1);
                    }}
                  >
                    Reintentar
                  </Boton>
                }
              />
            ))}

          {m && descripcion && (
            <>
              <CabeceraPieza
                titulo={m.title}
                subtitulo={subtitulo}
                acciones={
                  <>
                    {m.status === "borrador" && (
                      <Boton variante="secundario" icono={Mic} tono="violet" href={`/dashboard/reuniones/${id}/grabar`}>
                        Grabar la reunión
                      </Boton>
                    )}
                    <MenuMas etiquetaAccesible="Más acciones de la reunión" items={menu} />
                  </>
                }
              />

              <div className="re-estado">
                <Estado tipo={descripcion.tipo}>{descripcion.texto}</Estado>
                {m.status === "lista" && m.coverage !== null && (
                  <span className="cob">
                    Cobertura {Math.round(m.coverage * 100)} %{m.durationMs ? ` · ${formatearDuracion(m.durationMs)}` : ""}
                  </span>
                )}
              </div>

              {(m.status === "borrador" || m.status === "subiendo") && (
                <SubidaReunion
                  meetingId={id}
                  fuentes={datos?.sources ?? []}
                  alCambiar={() => setVersion((v) => v + 1)}
                />
              )}

              {m.status === "grabando" && (
                <Panel titulo="Hay una grabación sin terminar" nivel={2} icono={Mic} tono="red">
                  <div className="re-proceso">
                    <p className="re-nota">
                      {datos?.live
                        ? `Ya recibimos ${formatearDuracion(datos.live.durMs)} de audio${datos.live.ultimaParteEn ? `; la última parte llegó ${haceCuanto(datos.live.ultimaParteEn)}` : ""}. `
                        : "Todavía no llegó audio al servidor. "}
                      Puedes seguir grabando o enviar a transcribir lo que ya llegó.
                    </p>
                    <div className="re-acciones">
                      <Boton icono={Mic} href={`/dashboard/reuniones/${id}/grabar`}>
                        Continuar en la grabadora
                      </Boton>
                      <Boton
                        variante="secundario"
                        icono={CircleStop}
                        onClick={() => {
                          setErrorModal("");
                          setModal("terminar");
                        }}
                      >
                        Terminar y procesar lo recibido
                      </Boton>
                    </div>
                    <p className="re-nota">Si grabaste desde otro dispositivo, ábrelo y pulsa «Terminar» allí.</p>
                  </div>
                </Panel>
              )}

              {(m.status === "en_cola" || m.status === "procesando") && (
                <Panel titulo="Estamos trabajando en esta reunión" nivel={2}>
                  <div className="re-proceso">
                    <p className="re-etapa">
                      {m.status === "en_cola" || !m.stage
                        ? "Esperando turno…"
                        : `${TEXTO_ETAPA[m.stage as EtapaReunion] ?? "Procesando"} · ${m.total ? `${m.hechas ?? 0} de ${m.total}` : `${m.progress} %`}`}
                    </p>
                    <BarraProgreso valor={m.progress} etiquetaAccesible={`Avance: ${descripcion.texto}`} />
                    <p className="re-nota">Puedes cerrar esta página: te avisamos por correo cuando esté lista.</p>
                  </div>
                </Panel>
              )}

              {m.status === "error" && (
                <Aviso
                  enLinea
                  rol={null}
                  tipo="error"
                  titulo="No pudimos terminar de procesar esta reunión."
                  texto={m.errorMessage ?? "Inténtalo de nuevo en unos minutos."}
                  accion={reintentando ? undefined : { etiqueta: "Reintentar", alElegir: () => void reintentar() }}
                />
              )}

              {m.status === "sin_cupo" && (
                <Aviso
                  enLinea
                  rol={null}
                  tipo="aviso"
                  titulo="No te alcanzan las horas de este mes."
                  texto={m.errorMessage ?? "El audio está guardado: se procesa cuando tengas horas disponibles."}
                  accion={{ etiqueta: "Ver planes", href: "/dashboard/suscripcion" }}
                />
              )}

              {m.status === "lista" && (
                <>
                  {m.errorMessage && (
                    <Aviso
                      enLinea
                      rol={null}
                      tipo="aviso"
                      titulo="Falta el resumen de la reunión."
                      texto={`${m.errorMessage} La transcripción está completa y puedes leerla.`}
                    />
                  )}
                  <div className="re-pestanas">
                    <Segmentos
                      modo="pestanas"
                      etiquetaAccesible="Secciones de la reunión"
                      valor={pestana}
                      alCambiar={(v) => setPestana(v as Pestana)}
                      panelId={(p) => `re-panel-${p}`}
                      items={PESTANAS.map((p) => ({ id: p.id, etiqueta: p.etiqueta }))}
                    />
                  </div>
                  <div id={`re-panel-${pestana}`} role="tabpanel">
                    <Panel titulo={PESTANAS.find((p) => p.id === pestana)?.etiqueta} nivel={2}>
                      {pestana === "transcripcion" ? (
                        <VisorTranscripcion key={id} meetingId={id} marcas={datos?.markers ?? []} silencios={datos?.silences ?? []} />
                      ) : pestana === "hablantes" ? (
                        <TabHablantes
                          key={id}
                          meetingId={id}
                          propertyId={m.propertyId}
                          hablantes={datos?.speakers ?? []}
                          alGuardar={(speakers) => setDatos((prev) => (prev ? { ...prev, speakers } : prev))}
                        />
                      ) : (
                        <p className="re-nota">{PESTANAS.find((p) => p.id === pestana)?.texto}</p>
                      )}
                    </Panel>
                  </div>
                </>
              )}

              <Modal
                abierto={modal === "editar"}
                alCerrar={cerrarModal}
                titulo="Editar datos de la reunión"
                cerrarConVelo={false}
                acciones={
                  <>
                    <Boton variante="secundario" onClick={cerrarModal} disabled={trabajando}>
                      Cancelar
                    </Boton>
                    <Boton type="submit" form="re-form-editar" cargando={trabajando} textoCargando="Guardando…">
                      Guardar cambios
                    </Boton>
                  </>
                }
              >
                <form id="re-form-editar" onSubmit={guardar} noValidate className="re-modal-campos">
                  <Campo id="re-e-titulo" etiqueta="Título">
                    <Entrada id="re-e-titulo" value={edit.title} maxLength={140} onChange={(e) => setEdit((s) => ({ ...s, title: e.target.value }))} data-autofocus />
                  </Campo>
                  <Campo id="re-e-tipo" etiqueta="Tipo de reunión">
                    <Selector
                      id="re-e-tipo"
                      value={edit.type}
                      onChange={(e) => {
                        if (esTipoReunion(e.target.value)) setEdit((s) => ({ ...s, type: e.target.value }));
                      }}
                    >
                      {CLAVES_TIPO_REUNION.map((t) => (
                        <option key={t} value={t}>
                          {TIPOS_DE_REUNION[t].nombre}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo id="re-e-fecha" etiqueta="Fecha y hora">
                    <Entrada id="re-e-fecha" type="datetime-local" value={edit.fecha} onChange={(e) => setEdit((s) => ({ ...s, fecha: e.target.value }))} />
                  </Campo>
                  {errorModal && <Aviso enLinea tipo="error" titulo={errorModal} />}
                </form>
              </Modal>

              <Modal
                abierto={modal === "terminar"}
                alCerrar={cerrarModal}
                titulo="¿Terminar y procesar lo recibido?"
                icono={CircleStop}
                tono="violet"
                acciones={
                  <>
                    <Boton variante="secundario" onClick={cerrarModal} disabled={trabajando}>
                      Cancelar
                    </Boton>
                    <Boton icono={CircleStop} cargando={trabajando} textoCargando="Enviando…" onClick={() => void terminarLoRecibido()}>
                      Terminar y procesar
                    </Boton>
                  </>
                }
              >
                <p className="re-modal-texto">
                  Enviamos a transcribir lo que ya llegó al servidor{datos?.live ? ` (${formatearDuracion(datos.live.durMs)})` : ""}. Si otro dispositivo sigue
                  grabando, lo que grabe después ya no se incluirá.
                </p>
                {errorModal && <Aviso enLinea tipo="error" titulo={errorModal} />}
              </Modal>

              <Modal
                abierto={modal === "eliminar"}
                alCerrar={cerrarModal}
                titulo="¿Eliminar esta reunión?"
                acciones={
                  <>
                    <Boton variante="secundario" onClick={cerrarModal} disabled={trabajando}>
                      Cancelar
                    </Boton>
                    <Boton variante="peligro" lleno cargando={trabajando} textoCargando="Eliminando…" onClick={eliminar}>
                      Eliminar reunión
                    </Boton>
                  </>
                }
              >
                <p className="re-modal-texto">
                  Se borran la grabación, la transcripción y los datos de «{m.title}». Las actas que ya redactaste se
                  conservan en el Historial. No se puede deshacer.
                </p>
                {estaEnMarcha(m.status) && (
                  <p className="re-modal-texto">Esta reunión se está procesando: al eliminarla, el proceso se detiene.</p>
                )}
                {errorModal && <Aviso enLinea tipo="error" titulo={errorModal} />}
              </Modal>
            </>
          )}
        </Pieza>
      </Pagina>
    </div>
  );
}
