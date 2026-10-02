"use client";

import { ArrowDown, ArrowUp, AudioLines, Pause, Play, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Aviso, Boton, BotonIcono, FilaArchivo, ListaArchivos, Modal, Panel, TipoArchivo, ZonaSubida, tipoDeArchivo,
} from "@/components/kit";
import { ErrorApi, quitarFuente } from "@/lib/meetings/cliente";
import type { FuenteDTO } from "@/lib/meetings/dto";
import { formatearRestante, formatearVelocidad } from "@/lib/meetings/formato";
import type { Gestor, ItemSubida } from "@/lib/meetings/gestor-subidas";
import { ACCEPT_REUNION, formatoTamano } from "@/lib/upload-limits";
import { useSubidas } from "./useSubidas";

const CSS = `
.re-sub-avisos { display: grid; gap: 10px; margin: 14px 0 0; }
.re-fila { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto auto; column-gap: 14px; align-items: center; padding: 12px 14px;
  background: var(--surface-1); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--sh-1); }
:root[data-paleta="calma"] .re-fila { border-radius: 12px; }
.re-fila > .nom { min-width: 0; }
.re-fila > .nom b { display: block; font-size: 15.5px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.re-fila > .nom span { display: block; font-size: 13.5px; color: var(--ink-3); }
.re-orden { display: inline-flex; gap: 2px; }
.re-sub-barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; margin-top: 18px; }
.re-sub-txt { min-width: 0; font-size: 14.5px; font-weight: 600; color: var(--ink-2); font-feature-settings: "tnum" 1; }
.re-sub-acc { display: flex; flex-wrap: wrap; gap: 10px; }
.re-sub-nota { margin: 14px 0 0; max-width: 64ch; font-size: 14.5px; line-height: 1.5; color: var(--ink-3); }
@media (max-width: 860px) {
  .re-fila { grid-template-columns: 48px minmax(0, 1fr) auto; row-gap: 4px; }
  .re-fila > .re-orden { grid-column: 2 / 4; grid-row: 2; justify-self: start; }
  /* El botón de un aviso baja bajo su texto: en tres columnas el texto se quedaba en ~130 px. */
  .re-sub-avisos .k-aviso { grid-template-columns: auto minmax(0, 1fr); align-items: start; }
  .re-sub-avisos .k-aviso > .acc { grid-column: 2; justify-self: start; }
  .re-sub-barra { align-items: stretch; }
  .re-sub-acc { width: 100%; }
  .re-sub-acc > .k-btn { flex: 1 1 auto; }
}
`;

const FRASE_ZONA =
  "o haz clic para elegirla. Audio o video de cualquier duración y tamaño. Si está partida en varios archivos, súbelos todos: se unen en orden.";

/** Una fila de la lista según en qué va cada archivo. */
function FilaItem({ it, gestor, puedeSubir, puedeBajar }: { it: ItemSubida; gestor: Gestor; puedeSubir: boolean; puedeBajar: boolean }) {
  const peso = formatoTamano(it.tamano);

  if (it.fase === "porSubir") {
    return (
      <li className="re-fila">
        <TipoArchivo>{tipoDeArchivo(it.nombre)}</TipoArchivo>
        <span className="nom">
          <b>{it.nombre}</b>
          <span>{peso} · Por subir</span>
        </span>
        <span className="re-orden">
          <BotonIcono etiquetaAccesible={`Subir antes: ${it.nombre}`} tam={40} sinBorde disabled={!puedeSubir} onClick={() => gestor.mover(it.id, -1)}>
            <ArrowUp aria-hidden="true" focusable="false" />
          </BotonIcono>
          <BotonIcono etiquetaAccesible={`Subir después: ${it.nombre}`} tam={40} sinBorde disabled={!puedeBajar} onClick={() => gestor.mover(it.id, 1)}>
            <ArrowDown aria-hidden="true" focusable="false" />
          </BotonIcono>
        </span>
        <BotonIcono etiquetaAccesible={`Quitar ${it.nombre}`} tam={40} sinBorde onClick={() => gestor.quitar(it.id)}>
          <X aria-hidden="true" focusable="false" />
        </BotonIcono>
      </li>
    );
  }

  if (it.fase === "espera") {
    return <FilaArchivo nombre={it.nombre} detalle={peso} estado="espera" alQuitar={() => gestor.quitar(it.id)} etiquetaQuitar={`Quitar ${it.nombre} de la cola`} />;
  }
  if (it.fase === "subiendo" || it.fase === "pausada") {
    const pct = it.progreso?.porcentaje ?? 0;
    const extra = it.fase === "pausada" ? "En pausa" : it.progreso?.reanudada ? "Continuamos donde ibas" : null;
    return (
      <FilaArchivo
        nombre={it.nombre}
        detalle={extra ? `${peso} · ${extra}` : peso}
        estado={it.fase === "pausada" ? "espera" : "subiendo"}
        progreso={pct}
        alQuitar={() => gestor.quitar(it.id)}
        etiquetaQuitar={`Cancelar la subida de ${it.nombre}`}
      />
    );
  }
  if (it.fase === "lista") return <FilaArchivo nombre={it.nombre} detalle={peso} estado="listo" />;
  if (it.fase === "error") {
    return (
      <FilaArchivo
        nombre={it.nombre}
        estado="error"
        mensaje={it.mensaje ?? "No pudimos subir este archivo."}
        alQuitar={() => gestor.quitar(it.id)}
        etiquetaQuitar={`Descartar ${it.nombre}`}
      />
    );
  }
  // interrumpida: quedó a medias en una visita anterior; se retoma al volver a elegir el mismo archivo.
  return (
    <FilaArchivo
      nombre={it.nombre}
      detalle={`${peso} · Interrumpida al ${it.subidoPrevio ?? 0} %. Vuelve a elegir este archivo para continuar donde iba.`}
      estado="espera"
      progreso={it.subidoPrevio ?? 0}
      alQuitar={() => gestor.quitar(it.id)}
      etiquetaQuitar={`Descartar la subida de ${it.nombre}`}
    />
  );
}

export function SubidaReunion({
  meetingId, fuentes, alCambiar,
}: {
  meetingId: string;
  /** Archivos ya registrados en la reunión. */
  fuentes: FuenteDTO[];
  /** Algo cambió en el servidor (se registró un archivo, se quitó uno, se envió a procesar): recargar la reunión. */
  alCambiar: () => void;
}) {
  const { gestor, estado } = useSubidas(meetingId, fuentes, { alRegistrar: alCambiar, alProcesar: alCambiar });

  // El servidor pasa la reunión a «Subiendo» al entregar el permiso de subida (no al pulsar el botón): se recarga
  // cuando la primera parte ya está en camino, para que la etiqueta de arriba lo diga.
  const subiendoDeVerdad = estado.items.some((i) => i.fase === "subiendo" && i.progreso?.estado === "subiendo");
  const estabaSubiendo = useRef(false);
  useEffect(() => {
    if (subiendoDeVerdad && !estabaSubiendo.current) alCambiar();
    estabaSubiendo.current = subiendoDeVerdad;
  }, [subiendoDeVerdad, alCambiar]);

  const [rechazos, setRechazos] = useState<string[]>([]);
  const [porQuitar, setPorQuitar] = useState<FuenteDTO | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [errorQuitar, setErrorQuitar] = useState("");

  // Un archivo recién subido se ve en la lista de registrados apenas la reunión se recarga: no se pinta dos veces.
  const items = estado.items.filter((i) => !(i.fase === "lista" && fuentes.some((f) => f.name === i.nombre && f.sizeBytes === i.tamano)));
  const interrumpida = items.find((i) => i.fase === "interrumpida");
  const hayLista = fuentes.length > 0 || items.length > 0;
  const nada = estado.porSubir + estado.enEspera + estado.conError + estado.interrumpidas === 0 && !estado.activa;

  const elegir = async (archivos: File[]) => {
    const r = await gestor.agregar(archivos);
    setRechazos(r.rechazos);
  };

  const confirmarQuitar = async () => {
    if (!porQuitar) return;
    setQuitando(true);
    setErrorQuitar("");
    try {
      await quitarFuente(meetingId, porQuitar.id);
      setPorQuitar(null);
      alCambiar();
    } catch (e) {
      setErrorQuitar(e instanceof ErrorApi ? e.message : "No pudimos quitar el archivo.");
    } finally {
      setQuitando(false);
    }
  };

  const texto = estado.activa
    ? [
        `${estado.pausada ? "En pausa" : "Subiendo"} · ${formatoTamano(estado.subidosLote)} de ${formatoTamano(estado.totalLote)}`,
        !estado.pausada && formatearVelocidad(estado.bytesPorSegundo),
        !estado.pausada && estado.restanteLoteS !== null && `faltan ${formatearRestante(estado.restanteLoteS)}`,
      ].filter(Boolean).join(" · ")
    : null;

  return (
    <Panel titulo="Sube la grabación" nota="audio o video, de cualquier duración y tamaño" nivel={2}>
      <style href="k-reuniones-subida-local" precedence="default">
        {CSS}
      </style>

      <ZonaSubida
        titulo="Suelta aquí la grabación"
        texto={FRASE_ZONA}
        formatos="MP3, M4A, WAV, MP4, MOV, WEBM, OGG, AMR…"
        multiple
        accept={ACCEPT_REUNION}
        compacta={hayLista}
        deshabilitado={estado.procesando}
        alElegir={elegir}
      />

      {rechazos.length > 0 && (
        <div className="re-sub-avisos">
          <Aviso
            enLinea
            tipo="aviso"
            titulo={rechazos.length === 1 ? "No pudimos agregar un archivo." : `No pudimos agregar ${rechazos.length} archivos.`}
            texto={rechazos.join(" ")}
            alCerrar={() => setRechazos([])}
          />
        </div>
      )}

      {hayLista && (
        <ListaArchivos etiquetaAccesible="Archivos de la reunión">
          {fuentes.map((f) => (
            <FilaArchivo
              key={f.id}
              nombre={f.name}
              detalle={formatoTamano(f.sizeBytes)}
              estado="listo"
              alQuitar={() => {
                setErrorQuitar("");
                setPorQuitar(f);
              }}
              etiquetaQuitar={`Quitar ${f.name}`}
            />
          ))}
          {items.map((it, i) => (
            <FilaItem
              key={it.id}
              it={it}
              gestor={gestor}
              puedeSubir={i > 0 && items[i - 1].fase === "porSubir"}
              puedeBajar={i < items.length - 1 && items[i + 1].fase === "porSubir"}
            />
          ))}
        </ListaArchivos>
      )}

      {(estado.mensajeActivo || estado.errorProceso || estado.conError > 0 || (interrumpida && !estado.activa)) && (
        <div className="re-sub-avisos">
          {estado.mensajeActivo && <Aviso enLinea rol={null} tipo="aviso" titulo={estado.mensajeActivo} />}
          {estado.conError > 0 && !estado.activa && (
            <Aviso
              enLinea
              rol={null}
              tipo="error"
              titulo="No pudimos subir algún archivo."
              texto="Lo que ya había subido está guardado: reintenta cuando tengas conexión y sigue donde iba."
              accion={{ etiqueta: "Reintentar", alElegir: () => gestor.reintentarFallidos() }}
            />
          )}
          {interrumpida && !estado.activa && (
            <Aviso
              enLinea
              rol={null}
              tipo="aviso"
              titulo={`Quedó una subida a medias: «${interrumpida.nombre}».`}
              texto="Vuelve a elegir ese mismo archivo para continuar donde iba, o descártalo con la ×. Mientras tanto no enviamos la reunión a transcribir, para no dejar fuera esa parte."
            />
          )}
          {estado.errorProceso && (
            <Aviso
              enLinea
              rol={null}
              tipo="error"
              titulo="No pudimos enviar la reunión a transcribir."
              texto={estado.errorProceso}
              accion={{ etiqueta: "Reintentar", alElegir: () => void gestor.procesarAhora() }}
            />
          )}
        </div>
      )}

      {hayLista && (
        <div className="re-sub-barra">
          <span className="re-sub-txt">{estado.procesando ? "Enviando a transcribir…" : texto}</span>
          <span className="k-sr" role="status" aria-live="polite">
            {estado.procesando ? "Enviando la reunión a transcribir" : estado.pausada ? "Subida en pausa" : estado.activa ? "Subiendo archivos" : ""}
          </span>
          <div className="re-sub-acc">
            {estado.activa &&
              (estado.pausada ? (
                <Boton variante="secundario" tam={40} icono={Play} tono="violet" onClick={() => gestor.reanudar()}>
                  Reanudar
                </Boton>
              ) : (
                <Boton variante="secundario" tam={40} icono={Pause} tono="slate" onClick={() => gestor.pausar()}>
                  Pausar
                </Boton>
              ))}
            {!estado.activa && !estado.procesando && estado.porSubir > 0 && (
              <Boton icono={Upload} onClick={() => gestor.empezar()}>
                {estado.porSubir > 1 ? `Subir y transcribir ${estado.porSubir} archivos` : "Subir y transcribir"}
              </Boton>
            )}
            {nada && fuentes.length > 0 && !estado.procesando && (
              <Boton icono={AudioLines} tono="blue" onClick={() => void gestor.procesarAhora()}>
                Transcribir la reunión
              </Boton>
            )}
          </div>
        </div>
      )}

      <p className="re-sub-nota">
        Puedes cerrar esta pestaña cuando todo llegue al 100 %. Si se corta la conexión, vuelve a elegir el mismo archivo y seguirá donde iba.
      </p>

      <Modal
        abierto={porQuitar !== null}
        alCerrar={() => !quitando && setPorQuitar(null)}
        titulo="¿Quitar este archivo?"
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setPorQuitar(null)} disabled={quitando}>
              Cancelar
            </Boton>
            <Boton variante="peligro" lleno cargando={quitando} textoCargando="Quitando…" onClick={() => void confirmarQuitar()}>
              Quitar archivo
            </Boton>
          </>
        }
      >
        <p className="re-modal-texto">
          Se borra «{porQuitar?.name}» de esta reunión y del almacenamiento. Si era una parte de la grabación, tendrás que subirla de nuevo.
        </p>
        {errorQuitar && <Aviso enLinea tipo="error" titulo={errorQuitar} />}
      </Modal>
    </Panel>
  );
}
