"use client";

import { CircleDot, CircleStop, Flag, Handshake, LoaderCircle, Mic, MicOff, NotebookPen, Pause, Play, Vote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Header } from "@/components/dashboard/Header";
import {
  AreaTexto, Aviso, Boton, CabeceraPieza, Campo, Casilla, ErrorCarga, Esqueleto, Etiqueta, MenuMas, Modal, Pagina, Panel, Pieza,
  Selector, Vacio, avisar, type ItemMenu,
} from "@/components/kit";
import { AVISO_SILENCIO_MS, type MicrofonoAbierto } from "@/lib/meetings/grabadora";
import {
  abrirMicrofono, listarMicrofonos, nivelParaMedidor, pedirAlmacenamientoPersistente, soportaGrabacion, type OpcionMicrofono, type Soporte,
} from "@/lib/meetings/grabadora-navegador";
import { ErrorApi, actualizarReunion, obtenerReunion } from "@/lib/meetings/cliente";
import type { ReunionDetalle } from "@/lib/meetings/dto";
import { fechaLarga } from "@/lib/meetings/formato";
import { cortoTipoReunion, formatearDuracion, formatearReloj, puedeAgregarFuentes, type TipoMarcador } from "@/lib/meetings/tipos";
import { olvidarGrabadora, useGrabadora } from "./useGrabadora";

const TEXTO_LEGAL =
  "Esta reunión será grabada con el único fin de elaborar el acta. La grabación se guardará de forma privada y se tratará conforme a la política de protección de datos de la copropiedad.";

const NOMBRE_MARCA: Record<TipoMarcador, string> = { tema: "Nuevo tema", votacion: "Votación", compromiso: "Compromiso", nota: "Nota" };

const CSS = `
.re-gr { display: grid; gap: 16px; max-width: 760px; }
.re-gr[hidden] { display: none; }
.re-gr-campos { display: grid; gap: 14px; }
.re-gr-prueba { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px 12px; align-items: end; }
.re-gr-medidor { display: grid; gap: 6px; margin-top: 14px; }
.re-gr-medidor small { font-size: 14px; line-height: 1.4; color: var(--ink-3); }
.re-nivel > i { transition: width .12s linear; }
.re-gr-lista { margin: 0; padding: 0 0 0 20px; display: grid; gap: 8px; list-style: disc; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.re-gr-lista li::marker { color: var(--ink-4); }
.re-gr-prueba .k-fld { margin-bottom: 0; }
.re-gr-legal { margin: 0 0 14px; padding: 14px 16px; border-left: 3px solid var(--accent); background: var(--surface-2); border-radius: 0 8px 8px 0; font-size: 16px; line-height: 1.55; color: var(--ink); }
.re-gr-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 14px; }
.re-gr-avisos { display: grid; gap: 10px; }
.re-gr-avisos .k-aviso { grid-template-columns: auto minmax(0, 1fr) auto; }
.re-gr-vivo { display: grid; gap: 18px; justify-items: center; text-align: center; padding: 22px 16px 24px; background: var(--surface-1); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--sh-1); outline: none; }
:root[data-paleta="calma"] .re-gr-vivo { border-radius: 12px; }
.re-gr-reloj { font-size: clamp(52px, 13vw, 92px); font-weight: 700; line-height: 1; letter-spacing: -0.02em; font-feature-settings: "tnum" 1; color: var(--ink); }
.re-gr-linea { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink-3); font-feature-settings: "tnum" 1; }
.re-gr-vivo .re-nivel { width: min(420px, 100%); }
.re-gr-acciones { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.re-gr-nota { margin: 0 0 14px; max-width: 64ch; font-size: 15.5px; line-height: 1.55; color: var(--ink-2); }
.re-gr-cierre { display: flex; align-items: center; gap: 12px; margin: 0 0 14px; font-size: 16px; font-weight: 600; color: var(--ink); }
.re-gr-cierre svg { width: 22px; height: 22px; flex: none; color: var(--accent-ink, var(--ink-2)); }
@media (prefers-reduced-motion: no-preference) {
  .re-rec svg { animation: re-pulso 1.6s ease-in-out infinite; }
  @keyframes re-pulso { 50% { opacity: .35; } }
}
@media (max-width: 560px) {
  .re-gr-prueba { grid-template-columns: minmax(0, 1fr); }
  .re-gr-prueba > .k-btn { width: 100%; }
  .re-gr-acciones { width: 100%; }
  .re-gr-acciones > .k-btn { flex: 1 1 auto; }
  .re-gr-pie > .k-btn { width: 100%; }
  .re-gr-avisos .k-aviso { grid-template-columns: auto minmax(0, 1fr); align-items: start; }
  .re-gr-avisos .k-aviso > .acc { grid-column: 2; justify-self: start; }
}
`;

/* ════════════════════════════════════════════════════════════════════
   Pequeñas piezas
   ════════════════════════════════════════════════════════════════════ */

/** Medidor de nivel: una barra con su valor para lectores (0 a 100). */
function Nivel({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, valor)) * 100);
  return (
    <span className="k-barra k-10 re-nivel" role="meter" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

const sinSuscripcion = () => () => {};
let soporteEnCache: Soporte | null = null;
/** El soporte del navegador, calculado una vez (useSyncExternalStore exige el mismo objeto en cada lectura). */
const soporteDelNavegador = (): Soporte => (soporteEnCache ??= soportaGrabacion());
const SOPORTE_EN_SERVIDOR: Soporte = { ok: true };

/**
 * La prueba del micrófono antes de empezar: abre el micrófono SOLO para mostrar el nivel (no graba nada) y lo
 * suelta al detenerla o al empezar a grabar de verdad.
 */
function usePruebaDeMicrofono() {
  const [activa, setActiva] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [error, setError] = useState("");
  const [microfonos, setMicrofonos] = useState<OpcionMicrofono[]>([]);
  const mic = useRef<MicrofonoAbierto | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  const liberar = useCallback(() => {
    if (reloj.current) clearInterval(reloj.current);
    reloj.current = null;
    mic.current?.cerrar();
    mic.current = null;
  }, []);

  const detener = useCallback(() => {
    liberar();
    setActiva(false);
    setNivel(0);
  }, [liberar]);

  const probar = useCallback(
    async (deviceId?: string) => {
      liberar();
      setError("");
      try {
        const abierto = await abrirMicrofono(deviceId ? { deviceId } : {});
        mic.current = abierto;
        setActiva(true);
        void listarMicrofonos().then(setMicrofonos); // con permiso, ya se ven los nombres
        reloj.current = setInterval(() => setNivel(nivelParaMedidor(abierto.nivel())), 100);
      } catch (e) {
        setActiva(false);
        setNivel(0);
        setError(e instanceof Error ? e.message : "No pudimos abrir el micrófono.");
      }
    },
    [liberar],
  );

  useEffect(() => liberar, [liberar]);
  return { activa, nivel, error, microfonos, probar, detener };
}

/* ════════════════════════════════════════════════════════════════════
   La grabadora
   ════════════════════════════════════════════════════════════════════ */

export function Grabadora({ id }: { id: string }) {
  const router = useRouter();
  const { gr, estado, preparada, candado, espacioBajo, sinBloqueoDePantalla, guardadoSoloEnMemoria } = useGrabadora(id);
  const soporte = useSyncExternalStore(sinSuscripcion, soporteDelNavegador, () => SOPORTE_EN_SERVIDOR);
  const prueba = usePruebaDeMicrofono();

  const [datos, setDatos] = useState<ReunionDetalle | null>(null);
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null);
  const [version, setVersion] = useState(0);

  const [deviceId, setDeviceId] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [avisoConstancia, setAvisoConstancia] = useState("");
  const [errorCierre, setErrorCierre] = useState("");
  const [modal, setModal] = useState<null | "terminar" | "descartar" | "nota">(null);
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const vivo = useRef<HTMLElement>(null);

  useEffect(() => {
    let activo = true;
    obtenerReunion(id)
      .then((d) => {
        if (!activo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => {
        if (activo) setError({ mensaje: e instanceof ErrorApi ? e.message : "Revisa tu conexión e inténtalo de nuevo.", noExiste: e instanceof ErrorApi && e.status === 404 });
      });
    return () => {
      activo = false;
    };
  }, [id, version]);

  const m = datos?.meeting ?? null;
  const constanciaGuardada = Boolean(m?.consentAt);
  const fase = estado.fase;
  const grabando = fase === "grabando" || fase === "pausada";
  const cerrando = fase === "cerrando";
  const interrumpida = fase === "interrumpida";
  const terminada = fase === "terminada";
  const antes = !grabando && !cerrando && !interrumpida && !terminada;
  const hayRecuperada = estado.recuperadas !== null && antes;
  const abiertaALaCaptura = m !== null && puedeAgregarFuentes(m.status);

  // Al empezar a grabar, el foco pasa a la grabación (el botón «Empezar» ya no está).
  useEffect(() => {
    if (grabando) vivo.current?.focus();
  }, [grabando]);

  // Si la constancia del aviso no llegó al servidor (sin conexión al empezar), se guarda en cuanto el servidor la pida.
  const intentosConstancia = useRef(0);
  useEffect(() => {
    if (!estado.errorEnvio || !/avisaste a los asistentes/.test(estado.errorEnvio) || intentosConstancia.current >= 3) return;
    intentosConstancia.current += 1;
    actualizarReunion(id, { consentAt: "now" })
      .then(() => {
        setAvisoConstancia("");
        gr.reintentarEnvios();
      })
      .catch(() => {});
  }, [estado.errorEnvio, id, gr]);

  const empezar = () => {
    prueba.detener();
    pedirAlmacenamientoPersistente(); // que el navegador no borre lo guardado si falta espacio
    setAvisoConstancia("");
    setErrorCierre("");
    // Se guarda la constancia del aviso sin esperarla: abrir el micrófono tiene que pasar mientras el toque de la persona es reciente.
    if (!constanciaGuardada) {
      actualizarReunion(id, { consentAt: "now" })
        .then(() => setDatos((d) => (d ? { ...d, meeting: { ...d.meeting, consentAt: new Date().toISOString() } } : d)))
        .catch(() =>
          setAvisoConstancia("No pudimos guardar la constancia del aviso a los asistentes por falta de conexión. Grabamos igual y la guardamos al volver."),
        );
    }
    void gr.iniciar(deviceId ? { deviceId } : {});
  };

  const terminar = async () => {
    setModal(null);
    setErrorCierre("");
    const r = await gr.terminar();
    if (r.ok) {
      olvidarGrabadora(id);
      avisar({ tipo: "ok", titulo: "Enviamos la reunión a transcribir." });
      router.push(`/dashboard/reuniones/${id}`);
    } else if (!r.abandonada) {
      setErrorCierre(r.motivo);
    }
  };

  const descartar = async () => {
    setTrabajando(true);
    await gr.descartar();
    setTrabajando(false);
    setModal(null);
    setConfirmado(false);
    avisar({ tipo: "info", titulo: "Descartamos lo grabado en este dispositivo." });
  };

  const poner = async (tipo: TipoMarcador, texto: string | null = null) => {
    const cuando = formatearReloj(gr.estado().transcurridoMs);
    await gr.marcar(tipo, texto);
    avisar({ tipo: "ok", titulo: `${NOMBRE_MARCA[tipo]}: marca puesta en ${cuando}.` });
  };

  const guardarNota = async () => {
    const texto = nota.trim();
    setModal(null);
    setNota("");
    await poner("nota", texto || null);
  };

  const itemsMarcar: ItemMenu[] = [
    { etiqueta: NOMBRE_MARCA.tema, icono: Flag, tono: "blue", alElegir: () => void poner("tema") },
    { etiqueta: NOMBRE_MARCA.votacion, icono: Vote, tono: "violet", alElegir: () => void poner("votacion") },
    { etiqueta: NOMBRE_MARCA.compromiso, icono: Handshake, tono: "green", alElegir: () => void poner("compromiso") },
    { etiqueta: "Nota…", icono: NotebookPen, tono: "amber", alElegir: () => setModal("nota") },
  ];

  const minutosSinSonido = Math.floor(estado.silencioMs / 60_000);
  const silencio = grabando && estado.silencioMs >= AVISO_SILENCIO_MS;
  const anuncio =
    fase === "pausada" ? "Grabación en pausa."
    : grabando && estado.sinConexion ? "Sin internet: seguimos grabando en este dispositivo."
    : silencio ? `No estamos captando sonido desde hace ${minutosSinSonido} minutos.`
    : grabando ? "Grabando."
    : interrumpida ? "La grabación se interrumpió."
    : "";

  const puedeEmpezar = soporte.ok && (confirmado || constanciaGuardada) && fase !== "iniciando";
  const textoEmpezar = hayRecuperada ? "Continuar grabando" : "Empezar a grabar";
  const botonEmpezar = (
    <Boton
      tam={hayRecuperada ? 44 : 56}
      icono={Mic}
      disabled={!puedeEmpezar}
      cargando={fase === "iniciando"}
      textoCargando="Abriendo el micrófono…"
      onClick={empezar}
    >
      {textoEmpezar}
    </Boton>
  );

  /* ── Los avisos que acompañan a la grabación ─────────────────────── */
  const avisos = (
    <div className="re-gr-avisos">
      {estado.errorEnvio && (
        <Aviso
          enLinea
          rol={null}
          tipo="error"
          titulo="No pudimos enviar la grabación al servidor."
          texto={`${estado.errorEnvio} Lo grabado sigue a salvo en este dispositivo.`}
          accion={{ etiqueta: "Reintentar", alElegir: () => gr.reintentarEnvios() }}
        />
      )}
      {(grabando || interrumpida) && estado.sinConexion && !estado.errorEnvio && (
        <Aviso enLinea rol={null} tipo="aviso" titulo="Sin internet: seguimos grabando en este dispositivo y subimos al volver." />
      )}
      {silencio && <Aviso enLinea rol={null} tipo="aviso" titulo={`No estamos captando sonido desde hace ${minutosSinSonido} minutos.`} texto="Revisa el micrófono." />}
      {estado.mensaje && (grabando || interrumpida) && !interrumpida && <Aviso enLinea rol={null} tipo="aviso" titulo={estado.mensaje} />}
      {sinBloqueoDePantalla && <Aviso enLinea rol={null} tipo="info" titulo="Mantén la pantalla encendida." texto="Este navegador no puede evitar que se apague." />}
      {guardadoSoloEnMemoria && (grabando || interrumpida) && (
        <Aviso
          enLinea
          rol={null}
          tipo="aviso"
          titulo="Este navegador no deja guardar la grabación en el dispositivo."
          texto="La subimos cada 30 segundos, pero si cierras la pestaña perderás lo que aún no haya subido."
        />
      )}
      {espacioBajo && (
        <Aviso
          enLinea
          rol={null}
          tipo="aviso"
          titulo="Queda poco espacio en este dispositivo."
          texto="Libera espacio: lo necesitamos para guardar la grabación si se corta el internet."
        />
      )}
      {avisoConstancia && <Aviso enLinea rol={null} tipo="aviso" titulo={avisoConstancia} alCerrar={() => setAvisoConstancia("")} />}
    </div>
  );

  return (
    <div className="re">
      <style href="k-reuniones-grabadora-local" precedence="default">
        {CSS}
      </style>
      <Header
        title="Grabar la reunión"
        breadcrumbs={[{ label: "Reuniones", href: "/dashboard/reuniones" }, ...(m ? [{ label: m.title, href: `/dashboard/reuniones/${id}` }] : [])]}
      />
      <Pagina>
        <Pieza>
          {datos === null && error === null && <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando la reunión…" />}

          {error !== null &&
            (error.noExiste ? (
              <Vacio
                titulo="No encontramos esa reunión."
                texto="Puede que ya se haya eliminado."
                acciones={<Boton href="/dashboard/reuniones" flecha="vuelve">Volver a Reuniones</Boton>}
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

          {m && (
            <>
              <CabeceraPieza titulo="Grabar la reunión" subtitulo={[m.propertyName, cortoTipoReunion(m.type), fechaLarga(m.date)].join(" · ")} />

              <span className="k-sr" role="status" aria-live="polite">
                {anuncio}
              </span>

              {/* La reunión ya no admite audio (y aquí no hay nada que rescatar). */}
              {candado === "mio" && !abiertaALaCaptura && antes && !hayRecuperada && (
                <Vacio
                  titulo="Esta reunión ya no admite grabación."
                  texto="Se está procesando o ya está lista."
                  acciones={<Boton href={`/dashboard/reuniones/${id}`} flecha="avanza">Abrir la reunión</Boton>}
                />
              )}

              {candado === "mio" && !soporte.ok && abiertaALaCaptura && (
                <Vacio
                  titulo="Este navegador no puede grabar."
                  texto={soporte.motivo}
                  acciones={<Boton href={`/dashboard/reuniones/${id}`} variante="secundario">Subir una grabación</Boton>}
                />
              )}

              {candado === "ocupado" && (
                <Vacio
                  titulo="Esta reunión ya está abierta en otra pestaña."
                  texto="Solo una pestaña puede grabarla: si no, se pisarían las grabaciones guardadas en este dispositivo. Sigue allí, o cierra esa pestaña y recarga esta."
                  acciones={<Boton href={`/dashboard/reuniones/${id}`} variante="secundario">Abrir la reunión</Boton>}
                />
              )}

              <div className="re-gr" hidden={candado !== "mio"}>
                {/* ── Terminada ── */}
                {terminada && (
                  <Panel titulo="Listo: enviamos la reunión a transcribir." nivel={2}>
                    <p className="re-gr-nota">Puedes cerrar esta página: te avisamos por correo cuando esté lista.</p>
                    <Boton href={`/dashboard/reuniones/${id}`} flecha="avanza">Abrir la reunión</Boton>
                  </Panel>
                )}

                {/* ── Cerrando ── */}
                {cerrando && (
                  <Panel titulo="Terminando la grabación" nivel={2}>
                    <p className="re-gr-cierre">
                      <LoaderCircle className="k-spin" aria-hidden="true" focusable="false" />
                      <span>
                        Subiendo lo último de la grabación
                        {estado.partesPendientes > 0 ? `… faltan ${estado.partesPendientes} ${estado.partesPendientes === 1 ? "parte" : "partes"}` : "…"}
                      </span>
                    </p>
                    {avisos}
                    <div className="re-gr-pie">
                      <Boton variante="secundario" onClick={() => gr.abandonar()}>Salir sin esperar</Boton>
                    </div>
                    <p className="re-gr-nota" style={{ marginTop: 12 }}>
                      Si sales, lo que falte por subir queda guardado en este dispositivo: vuelve a abrir esta reunión para terminar.
                    </p>
                  </Panel>
                )}

                {/* ── Grabando o en pausa ── */}
                {grabando && (
                  <>
                    <section ref={vivo} className="re-gr-vivo" tabIndex={-1} aria-label="Grabación en curso">
                      <Etiqueta
                        icono={fase === "pausada" ? Pause : CircleDot}
                        tono={fase === "pausada" ? "amber" : "red"}
                        className={fase === "pausada" ? undefined : "re-rec"}
                      >
                        {fase === "pausada" ? "En pausa" : "Grabando"}
                      </Etiqueta>
                      <div className="re-gr-reloj" role="timer" aria-label="Tiempo grabado">
                        {formatearReloj(estado.transcurridoMs)}
                      </div>
                      <Nivel valor={fase === "pausada" ? 0 : nivelParaMedidor(estado.nivel)} etiqueta="Nivel del micrófono" />
                      <p className="re-gr-linea">
                        {guardadoSoloEnMemoria ? "Se sube cada 30 s" : "Guardado en este dispositivo"} · Subido hasta {formatearReloj(estado.subidoHastaMs)}
                        {estado.marcas > 0 ? ` · ${estado.marcas} ${estado.marcas === 1 ? "marca" : "marcas"}` : ""}
                      </p>
                      <div className="re-gr-acciones">
                        {fase === "pausada" ? (
                          <Boton variante="secundario" icono={Play} tono="violet" onClick={() => gr.reanudar()}>Reanudar</Boton>
                        ) : (
                          <Boton variante="secundario" icono={Pause} tono="slate" onClick={() => gr.pausar()}>Pausar</Boton>
                        )}
                        <MenuMas etiqueta="Marcar" etiquetaAccesible="Marcar este minuto de la reunión" items={itemsMarcar} />
                        <Boton icono={CircleStop} onClick={() => setModal("terminar")}>Terminar</Boton>
                      </div>
                    </section>
                    {avisos}
                  </>
                )}

                {/* ── Interrumpida ── */}
                {interrumpida && (
                  <Panel titulo="La grabación se interrumpió" nivel={2} icono={MicOff} tono="amber">
                    <p className="re-gr-nota">
                      {estado.mensaje ? `${estado.mensaje} ` : ""}
                      Lo grabado hasta aquí ({formatearDuracion(estado.transcurridoMs)}) está a salvo en este dispositivo y se sube solo. Puedes continuar:
                      se guarda como una parte nueva y se une en orden.
                    </p>
                    {errorCierre && <Aviso enLinea rol={null} tipo="error" titulo="No pudimos terminar la grabación." texto={errorCierre} />}
                    {avisos}
                    <p className="re-gr-linea" style={{ textAlign: "left", margin: "0 0 12px" }}>
                      Subido hasta {formatearReloj(estado.subidoHastaMs)}
                      {estado.partesPendientes > 0 ? ` · ${estado.partesPendientes} ${estado.partesPendientes === 1 ? "parte" : "partes"} por subir` : ""}
                    </p>
                    <div className="re-gr-pie" style={{ marginTop: 0 }}>
                      <Boton icono={Mic} onClick={empezar}>Continuar grabando</Boton>
                      <Boton variante="secundario" icono={CircleStop} onClick={() => setModal("terminar")}>Terminar y procesar</Boton>
                    </div>
                  </Panel>
                )}

                {/* ── Antes de empezar ── */}
                {antes && abiertaALaCaptura && soporte.ok && (
                  <>
                    {fase === "error" && estado.mensaje && <Aviso enLinea rol={null} tipo="error" titulo="No pudimos empezar a grabar." texto={estado.mensaje} />}
                    {preparada && guardadoSoloEnMemoria && (
                      <Aviso
                        enLinea
                        rol={null}
                        tipo="aviso"
                        titulo="Este navegador no deja guardar la grabación en el dispositivo."
                        texto="¿Estás en una ventana privada? Grabamos igual y la subimos cada 30 segundos, pero si cierras la pestaña perderás lo que aún no haya subido."
                      />
                    )}

                    {hayRecuperada && estado.recuperadas && (
                      <Panel titulo="Hay una grabación sin terminar en este dispositivo" nivel={2} icono={MicOff} tono="amber">
                        <p className="re-gr-nota">
                          Encontramos {estado.recuperadas.sesiones === 1 ? "una grabación" : `${estado.recuperadas.sesiones} grabaciones`} de{" "}
                          {formatearDuracion(estado.recuperadas.durMs)}. La estamos subiendo (hasta ahora, {formatearReloj(estado.subidoHastaMs)}
                          {estado.partesPendientes > 0 ? `; faltan ${estado.partesPendientes} ${estado.partesPendientes === 1 ? "parte" : "partes"}` : ""}). Puedes seguir
                          grabando donde se quedó, enviarla a transcribir tal como está o descartarla.
                        </p>
                        {errorCierre && <Aviso enLinea rol={null} tipo="error" titulo="No pudimos terminar la grabación." texto={errorCierre} />}
                        <div className="re-gr-pie" style={{ marginTop: 0 }}>
                          {constanciaGuardada && botonEmpezar}
                          <Boton variante="secundario" icono={CircleStop} onClick={() => setModal("terminar")}>Terminar y procesar lo grabado</Boton>
                          <Boton variante="fantasma" tono="red" onClick={() => setModal("descartar")}>Descartar</Boton>
                        </div>
                      </Panel>
                    )}

                    <Panel titulo={hayRecuperada ? "Micrófono para continuar" : "Antes de empezar"} nivel={2} icono={Mic} tono="violet">
                      <div className="re-gr-campos">
                        <div className="re-gr-prueba">
                          <Campo id="re-gr-mic" etiqueta="Micrófono">
                            <Selector
                              id="re-gr-mic"
                              value={deviceId}
                              onChange={(e) => {
                                setDeviceId(e.target.value);
                                if (prueba.activa) void prueba.probar(e.target.value || undefined);
                              }}
                            >
                              <option value="">Micrófono predeterminado</option>
                              {prueba.microfonos.map((o) => (
                                <option key={o.id} value={o.id}>{o.etiqueta}</option>
                              ))}
                            </Selector>
                          </Campo>
                          {prueba.activa ? (
                            <Boton variante="secundario" icono={MicOff} tono="slate" onClick={() => prueba.detener()}>Detener prueba</Boton>
                          ) : (
                            <Boton variante="secundario" icono={Mic} tono="violet" onClick={() => void prueba.probar(deviceId || undefined)}>Probar micrófono</Boton>
                          )}
                        </div>
                        {prueba.error && <Aviso enLinea rol={null} tipo="error" titulo={prueba.error} />}
                        {prueba.activa && (
                          <div className="re-gr-medidor">
                            <Nivel valor={prueba.nivel} etiqueta="Nivel del micrófono" />
                            <small role="status">{prueba.nivel > 0.25 ? "Te escuchamos bien." : "Habla para probar."}</small>
                          </div>
                        )}
                      </div>
                    </Panel>

                    {!hayRecuperada && (
                      <Panel titulo="Consejos para una buena grabación" nivel={2}>
                        <ul className="re-gr-lista">
                          <li>Conecta el cargador: una reunión larga gasta batería.</li>
                          <li>Deja la pantalla encendida. En iPhone, si se bloquea, la grabación se pausa.</li>
                          <li>Pon el dispositivo en el centro de la mesa, lejos de ventiladores y de pantallas con sonido.</li>
                          <li>Si se corta el internet no pasa nada: seguimos grabando en este dispositivo y subimos al volver.</li>
                        </ul>
                      </Panel>
                    )}

                    {/* Al continuar una grabación cuyo aviso ya quedó constatado, no se repite. */}
                    {(!hayRecuperada || !constanciaGuardada) && (
                      <Panel titulo="Aviso a los asistentes" nota="léelo en voz alta antes de empezar" nivel={2}>
                        <blockquote className="re-gr-legal">{TEXTO_LEGAL}</blockquote>
                        <Casilla
                          etiqueta="Ya lo informé a los asistentes"
                          checked={confirmado || constanciaGuardada}
                          disabled={constanciaGuardada}
                          onChange={(e) => setConfirmado(e.target.checked)}
                        />
                        <div className="re-gr-pie">
                          {botonEmpezar}
                          {!puedeEmpezar && fase !== "iniciando" && <small className="re-gr-linea">Confirma que avisaste a los asistentes para empezar.</small>}
                        </div>
                      </Panel>
                    )}
                  </>
                )}
              </div>

              <Modal
                abierto={modal === "terminar"}
                alCerrar={() => setModal(null)}
                titulo="¿Terminar la grabación?"
                icono={CircleStop}
                tono="violet"
                acciones={
                  <>
                    <Boton variante="secundario" icono={grabando ? Mic : undefined} onClick={() => setModal(null)}>{grabando ? "Seguir grabando" : "Cancelar"}</Boton>
                    <Boton icono={CircleStop} onClick={() => void terminar()}>Terminar y procesar</Boton>
                  </>
                }
              >
                <p className="re-modal-texto">
                  {estado.transcurridoMs > 0 ? `Llevas ${formatearDuracion(estado.transcurridoMs)}. ` : ""}
                  Al terminar la enviamos a transcribir y te avisamos por correo cuando esté lista.
                </p>
              </Modal>

              <Modal
                abierto={modal === "descartar"}
                alCerrar={() => !trabajando && setModal(null)}
                titulo="¿Descartar lo grabado en este dispositivo?"
                acciones={
                  <>
                    <Boton variante="secundario" onClick={() => setModal(null)} disabled={trabajando}>Cancelar</Boton>
                    <Boton variante="peligro" lleno cargando={trabajando} textoCargando="Descartando…" onClick={() => void descartar()}>
                      Descartar grabación
                    </Boton>
                  </>
                }
              >
                <p className="re-modal-texto">
                  Se borra de este dispositivo lo que no se haya subido todavía. Lo que ya llegó al servidor se conserva. No se puede deshacer.
                </p>
              </Modal>

              <Modal
                abierto={modal === "nota"}
                alCerrar={() => setModal(null)}
                titulo="Nota en este minuto"
                cerrarConVelo={false}
                acciones={
                  <>
                    <Boton variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton>
                    <Boton icono={NotebookPen} onClick={() => void guardarNota()}>Poner nota</Boton>
                  </>
                }
              >
                <Campo id="re-gr-nota" etiqueta="Nota" opcional ayuda="Se guarda con el minuto de la reunión.">
                  <AreaTexto id="re-gr-nota" value={nota} maxLength={300} rows={3} onChange={(e) => setNota(e.target.value)} data-autofocus />
                </Campo>
              </Modal>
            </>
          )}
        </Pieza>
      </Pagina>
    </div>
  );
}
