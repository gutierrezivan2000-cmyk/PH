"use client";

import { ChevronsDown, ChevronsUp, Download, Eye, Flag, Play } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReproductorReunion } from "@/components/reuniones/ReproductorReunion";
import { useEstadoDeAudio } from "@/components/reuniones/useMotorDeAudio";
import { Aviso, Boton, Buscador, ErrorCarga, Esqueleto, Vacio, avisar } from "@/components/kit";
import { ErrorApi, listarIntervenciones, urlDeTranscripcion } from "@/lib/meetings/cliente";
import type { IntervencionDTO, MarcadorDTO, PaginaDeIntervenciones, RangoMs } from "@/lib/meetings/dto";
import { crearMotor, intervencionEnCurso, intervencionMasCercana, type Motor } from "@/lib/meetings/motor-audio";
import { formatearReloj } from "@/lib/meetings/tipos";
import { PAGINA_MS, terminosDeBusqueda } from "@/lib/meetings/transcripcion/paginas";
import { construirLinea, nombreDeHablante, textoDeMarca, textoDeSilencio } from "@/lib/meetings/transcripcion/presentacion";
import { resaltarCoincidencias, textoDeCoincidencias } from "@/lib/meetings/transcripcion/resaltar";
import {
  agregarAntes, agregarDespues, anteriorDe, estaCargado, inicioDePagina, ventanaDePagina, type Ventana,
} from "@/lib/meetings/transcripcion/ventana";

const CSS = `
.re-visor { display: grid; gap: 4px; }
.re-visor-barra { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 0 0 6px; }
.re-visor-barra > .k-campo { flex: 1 1 260px; min-width: 0; }
.re-visor-estado { margin: 0 0 4px; min-height: 0; font-size: 14px; color: var(--ink-3); }
.re-visor-estado:empty { display: none; }
.re-hora { margin-top: 18px; }
.re-hora-t { display: flex; align-items: baseline; gap: 10px; margin: 0 0 4px; padding: 0 0 8px; border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 600; color: var(--ink); }
.re-hora-t span { font-size: 13px; font-weight: 500; color: var(--ink-3); font-feature-settings: "tnum" 1; }
.re-lista { list-style: none; margin: 0; padding: 0; }
.re-int { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 2px 14px; margin: 0 -10px; padding: 12px 10px; border-bottom: 1px solid var(--line); border-radius: 10px; scroll-margin-block: 170px; transition: background-color .18s; }
.re-int:last-child { border-bottom: 0; }
.re-int.activa { background: rgb(var(--accent-rgb) / .13); }
.re-int.destacada { animation: re-destello 2.4s ease-out 1; }
@keyframes re-destello { 0%, 45% { background-color: rgb(var(--accent-rgb) / .24); } 100% { background-color: transparent; } }
@media (prefers-reduced-motion: reduce) { .re-int.destacada { animation: none; background-color: rgb(var(--accent-rgb) / .16); } .re-int { transition: none; } }
.re-reloj { padding-top: 1px; font-size: 13px; color: var(--ink-3); font-feature-settings: "tnum" 1; }
.re-reloj-btn { display: inline-flex; align-items: center; justify-content: flex-start; gap: 5px; align-self: start; justify-self: start; min-height: 30px; margin: -5px 0 0 -6px; padding: 0 8px 0 6px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 13px; color: var(--ink-3); font-feature-settings: "tnum" 1; cursor: pointer; }
.re-reloj-btn > svg { width: 11px; height: 11px; flex: none; fill: currentColor; opacity: 0; transition: opacity .12s; }
.re-int:hover .re-reloj-btn > svg, .re-reloj-btn:focus-visible > svg, .re-int.activa .re-reloj-btn > svg { opacity: 1; }
.re-reloj-btn:hover { color: var(--ink); background: var(--hl); }
.re-reloj-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
@media (hover: none) { .re-reloj-btn > svg { opacity: .75; } }
.re-quien { margin: 0 0 2px; font-size: 14.5px; font-weight: 600; color: var(--ink); }
.re-sin-nombre { font-weight: 500; color: var(--ink-2); }
.re-texto { margin: 0; max-width: 72ch; font-size: 15.5px; line-height: 1.55; color: var(--ink-2); overflow-wrap: anywhere; }
.re-int.activa .re-texto { color: var(--ink); }
mark.re-marca-busqueda { padding: 0 1px; border-radius: 3px; background: rgb(var(--accent-rgb) / .24); color: inherit; }
.re-hit { grid-template-columns: 92px minmax(0, 1fr) auto; align-items: start; }
.re-hit-ver { align-self: center; }
.re-aparte { display: flex; align-items: center; gap: 10px; margin: 8px 0; font-size: 14px; color: var(--ink-3); }
.re-silencio { gap: 14px; justify-content: center; }
.re-silencio::before, .re-silencio::after { content: ""; flex: 1 1 24px; max-width: 120px; border-top: 1px dashed var(--line); }
.re-marca { padding: 8px 12px; border-radius: 10px; background: var(--surface-2); color: var(--ink-2); }
.re-marca svg { flex: none; width: 16px; height: 16px; color: var(--ink-3); }
.re-mas { display: flex; justify-content: center; padding: 20px 0 4px; }
.re-mas.re-antes { padding: 4px 0 8px; }
.re-fin { margin: 18px 0 0; text-align: center; font-size: 14px; color: var(--ink-3); }
@media (max-width: 560px) {
  .re-int, .re-hit { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .re-reloj { padding: 0 0 2px; }
  .re-reloj-btn { margin-bottom: 2px; }
  .re-hit-ver { justify-self: start; margin-top: 6px; }
}
`;

/** «PT1H23M45S»: lo que espera el atributo `dateTime` de <time>. */
const duracionIso = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `PT${Math.floor(total / 3600)}H${Math.floor((total % 3600) / 60)}M${total % 60}S`;
};

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : "Revisa tu conexión e inténtalo de nuevo.");
export const idDeFila = (id: string): string => `re-int-${id}`;

/** Sin audio (o sin el reproductor todavía) el visor usa uno inerte: así los hooks no cambian de orden. Nunca crea un <audio>. */
const MOTOR_INACTIVO: Motor = crearMotor({ url: "", duracionMs: 0 });
const SIN_ITEMS: IntervencionDTO[] = [];

/** Máximo de páginas vacías que se atraviesan seguidas (un receso largo) antes de rendirse. */
const MAX_PAGINAS_VACIAS = 3;

/** Pide la página que empieza en `desdeMs`; si está vacía (un receso largo) sigue con la siguiente que tenga algo. */
async function cargarPaginaConContenido(meetingId: string, desdeMs: number): Promise<PaginaDeIntervenciones> {
  let pagina = await listarIntervenciones(meetingId, { desdeMs });
  for (let vueltas = 0; pagina.items.length === 0 && pagina.siguienteMs !== null && vueltas < MAX_PAGINAS_VACIAS; vueltas++) {
    pagina = await listarIntervenciones(meetingId, { desdeMs: pagina.siguienteMs });
  }
  return pagina;
}

const prefiereMenosMovimiento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ════════════════════════════════════════════════════════════════════
   Una intervención (memoizada: con miles de filas, solo se vuelven a pintar las dos que cambian al pasar el audio)
   ════════════════════════════════════════════════════════════════════ */

const FilaIntervencion = memo(function FilaIntervencion({
  i, nombre, conNombre, activa, destacada, alReproducir,
}: {
  i: IntervencionDTO;
  nombre: string;
  conNombre: boolean;
  activa: boolean;
  destacada: boolean;
  /** Sin audio no hay a qué reproducir: la hora es solo un texto. */
  alReproducir: ((ms: number) => void) | null;
}) {
  const reloj = formatearReloj(i.startMs);
  return (
    <li id={idDeFila(i.id)} className={`re-int${activa ? " activa" : ""}${destacada ? " destacada" : ""}`} aria-current={activa ? "true" : undefined}>
      {alReproducir ? (
        <button type="button" className="re-reloj-btn" aria-label={`Reproducir desde ${reloj}`} onClick={() => alReproducir(i.startMs)}>
          <Play aria-hidden="true" focusable="false" />
          {reloj}
        </button>
      ) : (
        <time className="re-reloj" dateTime={duracionIso(i.startMs)}>
          {reloj}
        </time>
      )}
      <div>
        <p className={conNombre ? "re-quien" : "re-quien re-sin-nombre"}>{nombre}</p>
        <p className="re-texto">{i.text}</p>
      </div>
    </li>
  );
});

function TextoMarcado({ texto, terminos }: { texto: string; terminos: readonly string[] }) {
  return (
    <>
      {resaltarCoincidencias(texto, terminos).map((t, k) =>
        t.marca ? (
          <mark key={k} className="re-marca-busqueda">
            {t.texto}
          </mark>
        ) : (
          <span key={k}>{t.texto}</span>
        ),
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   El visor
   ════════════════════════════════════════════════════════════════════ */

type EstadoBusqueda = {
  q: string;
  items: IntervencionDTO[];
  nombres: Record<string, string>;
  siguienteMs: number | null;
  fase: "cargando" | "listo" | "error";
  error: string;
  cargandoMas: boolean;
};

/**
 * La transcripción completa de una reunión lista, junto al audio: las intervenciones por hora, con el nombre de quien
 * habla, las marcas de la grabación y los silencios largos en su minuto.
 *
 *  - La hora de cada intervención es un botón que reproduce desde ahí; la que suena queda marcada y la lectura la sigue.
 *  - El buscador recorre TODA la reunión (sin distinguir tildes ni mayúsculas) y cada resultado lleva a su minuto.
 *  - Se carga por páginas de 30 min: una reunión de 8 h abre al instante. Un salto a un minuto lejano carga solo la página
 *    donde cae, y se puede ampliar hacia atrás y hacia adelante.
 */
export function VisorTranscripcion({
  meetingId, marcas, silencios, duracionMs, motor, saltoA,
}: {
  meetingId: string;
  marcas: MarcadorDTO[];
  silencios: RangoMs[];
  duracionMs: number;
  /** El reproductor compartido de la página; null si la reunión ya no tiene audio. */
  motor: Motor | null;
  /** Una orden de afuera (un minuto del resumen) para llevar la lectura a ese minuto; `n` cambia con cada orden. */
  saltoA: { ms: number; n: number } | null;
}) {
  const m = motor ?? MOTOR_INACTIVO;

  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState("");
  const [cargandoMas, setCargandoMas] = useState(false);
  const [cargandoAntes, setCargandoAntes] = useState(false);
  const [errorMas, setErrorMas] = useState("");
  const [saltando, setSaltando] = useState(false);
  const [destacadaId, setDestacadaId] = useState<string | null>(null);
  const [seguir, setSeguir] = useState(true);
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState<EstadoBusqueda | null>(null);
  const [intento, setIntento] = useState(0);
  const [solicitudDeScroll, setSolicitudDeScroll] = useState(0);

  /** Cambia cada vez que se vuelve a empezar o se salta: así se ignora lo que responda una petición vieja. */
  const generacion = useRef(0);
  const generacionBusqueda = useRef(0);
  const minutoPendiente = useRef<number | null>(null);
  const ancla = useRef<{ altura: number; y: number } | null>(null);
  const inicial = useRef(saltoA);
  const ventanaActual = useRef<Ventana | null>(null);
  useEffect(() => {
    ventanaActual.current = ventana;
  }, [ventana]);

  const items = ventana?.items ?? SIN_ITEMS;
  const siguiente = ventana?.siguienteMs ?? null;
  const inicio = ventana?.inicioMs ?? 0;

  /* ── Carga inicial: desde el principio, o directo a la página del minuto pedido ────────────────────────────── */
  useEffect(() => {
    const mia = ++generacion.current;
    let vivo = true;
    const ms = inicial.current?.ms ?? 0;
    const desde = inicioDePagina(ms);
    cargarPaginaConContenido(meetingId, desde)
      .then((p) => {
        if (!vivo || generacion.current !== mia) return;
        setVentana(ventanaDePagina(p, desde));
        setNombres(p.nombres);
        setError("");
        setFase("listo");
        if (inicial.current) {
          minutoPendiente.current = inicial.current.ms;
          setSolicitudDeScroll((n) => n + 1);
        }
      })
      .catch((e) => {
        if (!vivo || generacion.current !== mia) return;
        setError(mensajeDe(e));
        setFase("error");
      });
    return () => {
      vivo = false;
    };
  }, [meetingId, intento]);

  /* ── Ampliar lo cargado ─────────────────────────────────────────────────────────────────────────────────────── */
  const cargarMas = useCallback(async () => {
    const v = ventanaActual.current;
    if (!v || v.siguienteMs === null || cargandoMas) return;
    const mia = generacion.current;
    setCargandoMas(true);
    setErrorMas("");
    try {
      const p = await listarIntervenciones(meetingId, { desdeMs: v.siguienteMs });
      if (generacion.current !== mia) return;
      setVentana((actual) => (actual ? agregarDespues(actual, p) : actual));
      setNombres(p.nombres);
    } catch (e) {
      if (generacion.current === mia) setErrorMas(mensajeDe(e));
    } finally {
      if (generacion.current === mia) setCargandoMas(false);
    }
  }, [meetingId, cargandoMas]);

  const cargarAntes = useCallback(async () => {
    const v = ventanaActual.current;
    if (!v || cargandoAntes) return;
    const mia = generacion.current;
    let desde = anteriorDe(v);
    if (desde === null) return;
    setCargandoAntes(true);
    setErrorMas("");
    try {
      let hasta = v.inicioMs;
      let pagina: PaginaDeIntervenciones = { items: [], nombres: {}, siguienteMs: null };
      // Si esa media hora no tiene a nadie hablando (un receso), se sigue hacia atrás hasta encontrar algo o llegar al principio.
      for (let vueltas = 0; vueltas <= MAX_PAGINAS_VACIAS; vueltas++) {
        pagina = await listarIntervenciones(meetingId, { desdeMs: desde, hastaMs: hasta });
        if (pagina.items.length > 0 || desde === 0) break;
        hasta = desde;
        desde = Math.max(0, desde - PAGINA_MS);
      }
      if (generacion.current !== mia) return;
      // Al poner contenido ARRIBA lo que se está leyendo se correría: se recuerda la altura para dejarlo donde estaba.
      ancla.current = { altura: document.documentElement.scrollHeight, y: window.scrollY };
      const nuevoInicio = desde;
      setVentana((actual) => (actual ? agregarAntes(actual, pagina.items, nuevoInicio) : actual));
      setNombres((previos) => ({ ...previos, ...pagina.nombres }));
    } catch (e) {
      if (generacion.current === mia) setErrorMas(mensajeDe(e));
    } finally {
      if (generacion.current === mia) setCargandoAntes(false);
    }
  }, [meetingId, cargandoAntes]);

  useLayoutEffect(() => {
    if (!ancla.current) return;
    const { altura, y } = ancla.current;
    ancla.current = null;
    // «instant»: la página tiene `scroll-behavior: smooth` y esto NO debe verse como un deslizamiento, sino como nada.
    window.scrollTo({ top: y + (document.documentElement.scrollHeight - altura), behavior: "instant" });
  }, [ventana]);

  /* ── Llevar la lectura a un minuto ─────────────────────────────────────────────────────────────────────────── */
  const irA = useCallback(
    async (ms: number, moverElAudio = true) => {
      if (moverElAudio) motor?.buscar(ms); // el reproductor queda en ese minuto, sin sonar
      setQ("");
      const v = ventanaActual.current;
      if (v && estaCargado(v, ms)) {
        minutoPendiente.current = ms;
        setSolicitudDeScroll((n) => n + 1);
        return;
      }
      const mia = ++generacion.current; // lo que estaba pidiéndose hacia el otro lado ya no sirve
      setCargandoMas(false);
      setCargandoAntes(false);
      setSaltando(true);
      try {
        const desde = inicioDePagina(ms);
        const p = await cargarPaginaConContenido(meetingId, desde);
        if (generacion.current !== mia) return;
        setVentana(ventanaDePagina(p, desde));
        setNombres(p.nombres);
        setError("");
        setFase("listo"); // por si el salto llegó mientras todavía se hacía la carga inicial
        minutoPendiente.current = ms;
        setSolicitudDeScroll((n) => n + 1);
      } catch (e) {
        if (generacion.current === mia) avisar({ tipo: "error", titulo: "No pudimos ir a ese minuto.", texto: mensajeDe(e) });
      } finally {
        if (generacion.current === mia) setSaltando(false);
      }
    },
    [meetingId, motor],
  );
  const irARef = useRef(irA);
  useEffect(() => {
    irARef.current = irA;
  }, [irA]);

  // Una orden de afuera. La primera ya la atendió la carga inicial.
  const ultimoSalto = useRef(saltoA?.n ?? null);
  useEffect(() => {
    if (!saltoA || saltoA.n === ultimoSalto.current) return;
    ultimoSalto.current = saltoA.n;
    void irARef.current(saltoA.ms);
  }, [saltoA]);

  // Cuando lo cargado ya incluye el minuto pedido: se lleva la pantalla a la intervención y se destaca un momento.
  useEffect(() => {
    const ms = minutoPendiente.current;
    if (ms === null || !ventana) return;
    minutoPendiente.current = null;
    const destino = intervencionMasCercana(ventana.items, ms);
    if (!destino) return;
    setDestacadaId(destino.id);
    const cuadro = requestAnimationFrame(() => {
      document.getElementById(idDeFila(destino.id))?.scrollIntoView({ block: "center", behavior: prefiereMenosMovimiento() ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(cuadro);
  }, [solicitudDeScroll, ventana]);

  useEffect(() => {
    if (!destacadaId) return;
    const t = setTimeout(() => setDestacadaId(null), 2_600);
    return () => clearTimeout(t);
  }, [destacadaId]);

  /* ── Lo que suena ──────────────────────────────────────────────────────────────────────────────────────────── */
  const activaId = useEstadoDeAudio(m, (e) => intervencionEnCurso(items, e.tiempoMs)?.id ?? null);
  const reproduciendo = useEstadoDeAudio(m, (e) => e.reproduciendo);
  const cercaDelFinalCargado = useEstadoDeAudio(
    m,
    (e) => siguiente !== null && e.reproduciendo && e.tiempoMs >= inicio && e.tiempoMs >= siguiente - 120_000,
  );

  // Si el audio salta a un minuto que no está cargado (el deslizador, «adelantar», un resultado), la lectura va con él: se carga
  // la página de ese minuto. Solo si «Seguir la lectura» está activo; si no, cada quien mueve la suya.
  const fueraDeLoCargado = useEstadoDeAudio(
    m,
    (e) => items.length > 0 && (e.tiempoMs < inicio - 3_000 || (siguiente !== null && e.tiempoMs >= siguiente + 3_000)),
  );
  useEffect(() => {
    if (fueraDeLoCargado && seguir && motor && !saltando && !busqueda) void irARef.current(motor.estado().tiempoMs, false);
  }, [fueraDeLoCargado, seguir, motor, saltando, busqueda]);

  // La lectura sigue al audio: si la intervención que suena no se ve, se lleva al centro.
  useEffect(() => {
    if (!seguir || !motor || !reproduciendo || !activaId) return;
    const fila = document.getElementById(idDeFila(activaId));
    if (!fila) return;
    const r = fila.getBoundingClientRect();
    const arriba = (document.querySelector(".re-rep")?.getBoundingClientRect().bottom ?? 120) + 8;
    if (r.top >= arriba && r.bottom <= window.innerHeight - 90) return;
    fila.scrollIntoView({ block: "center", behavior: prefiereMenosMovimiento() ? "auto" : "smooth" });
  }, [activaId, seguir, reproduciendo, motor]);

  // Quien se acerca al final de lo cargado mientras escucha, no debería toparse con un muro: se pide lo que sigue.
  useEffect(() => {
    if (cercaDelFinalCargado && !cargandoMas && !errorMas) void cargarMas();
  }, [cercaDelFinalCargado, cargandoMas, errorMas, cargarMas]);

  // Mover la página a mano (rueda, dedo, teclas) es decir «ya no me sigas»: se apaga el seguimiento.
  useEffect(() => {
    if (!seguir || !motor) return;
    const dentroDelReproductor = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest(".re-rep"));
    const pausar = (e: Event) => {
      if (!dentroDelReproductor(e.target)) setSeguir(false);
    };
    const teclas = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) return;
      const t = e.target;
      if (t instanceof Element && (t.closest("input, select, textarea, [role='slider']") || dentroDelReproductor(t))) return;
      setSeguir(false);
    };
    window.addEventListener("wheel", pausar, { passive: true });
    window.addEventListener("touchmove", pausar, { passive: true });
    window.addEventListener("keydown", teclas);
    return () => {
      window.removeEventListener("wheel", pausar);
      window.removeEventListener("touchmove", pausar);
      window.removeEventListener("keydown", teclas);
    };
  }, [seguir, motor]);

  /* ── Búsqueda ──────────────────────────────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const consulta = q.trim().replace(/\s+/g, " ");
    const mia = ++generacionBusqueda.current;
    if (consulta.length < 2) {
      setBusqueda(null);
      return;
    }
    const t = setTimeout(() => {
      setBusqueda({ q: consulta, items: [], nombres: {}, siguienteMs: null, fase: "cargando", error: "", cargandoMas: false });
      listarIntervenciones(meetingId, { q: consulta })
        .then((p) => {
          if (generacionBusqueda.current !== mia) return;
          setBusqueda({ q: consulta, items: p.items, nombres: p.nombres, siguienteMs: p.siguienteMs, fase: "listo", error: "", cargandoMas: false });
        })
        .catch((e) => {
          if (generacionBusqueda.current !== mia) return;
          setBusqueda({ q: consulta, items: [], nombres: {}, siguienteMs: null, fase: "error", error: mensajeDe(e), cargandoMas: false });
        });
    }, 350);
    return () => clearTimeout(t);
  }, [q, meetingId]);

  const masResultados = async () => {
    if (!busqueda || busqueda.siguienteMs === null || busqueda.cargandoMas) return;
    const mia = generacionBusqueda.current;
    const { q: consulta, siguienteMs } = busqueda;
    setBusqueda((b) => (b ? { ...b, cargandoMas: true, error: "" } : b));
    try {
      const p = await listarIntervenciones(meetingId, { q: consulta, desdeMs: siguienteMs });
      if (generacionBusqueda.current !== mia) return;
      setBusqueda((b) => (b && b.q === consulta ? { ...b, items: [...b.items, ...p.items], nombres: { ...b.nombres, ...p.nombres }, siguienteMs: p.siguienteMs, cargandoMas: false } : b));
    } catch (e) {
      if (generacionBusqueda.current === mia) setBusqueda((b) => (b ? { ...b, cargandoMas: false, error: mensajeDe(e) } : b));
    }
  };

  const terminos = useMemo(() => (busqueda ? terminosDeBusqueda(busqueda.q) : []), [busqueda]);

  /* ── Lo que se ve ──────────────────────────────────────────────────────────────────────────────────────────── */
  const grupos = useMemo(
    () => construirLinea({ intervenciones: items, silencios, marcas, cargadoHastaMs: siguiente, cargadoDesdeMs: inicio }),
    [items, silencios, marcas, siguiente, inicio],
  );

  const reproducirDesde = useCallback((ms: number) => motor?.reproducirDesde(ms), [motor]);
  const alReproducir = motor ? reproducirDesde : null;
  const hayAnteriores = ventana ? anteriorDe(ventana) !== null : false;

  const nombreDe = (etiqueta: string, mapa: Record<string, string>) => ({ nombre: nombreDeHablante(etiqueta, mapa), conNombre: Boolean(mapa[etiqueta]?.trim()) });

  return (
    <div className="re-visor">
      <style href="k-reuniones-visor-local" precedence="default">
        {CSS}
      </style>

      {motor ? (
        <ReproductorReunion motor={motor} duracionMs={duracionMs} seguir={seguir} alCambiarSeguir={setSeguir} />
      ) : (
        <Aviso enLinea rol={null} tipo="info" titulo="El audio de esta reunión ya no está disponible." texto="La transcripción completa sí se conserva." />
      )}

      {fase === "cargando" && <Esqueleto variante="bloque" etiquetaAccesible="Cargando la transcripción…" />}

      {fase === "error" && (
        <ErrorCarga
          titulo="No pudimos cargar la transcripción."
          texto={error}
          acciones={
            <Boton
              variante="secundario"
              onClick={() => {
                setFase("cargando");
                setIntento((n) => n + 1);
              }}
            >
              Reintentar
            </Boton>
          }
        />
      )}

      {fase === "listo" && (
        <>
          <div className="re-visor-barra">
            <Buscador
              etiquetaAccesible="Buscar en la transcripción"
              placeholder="Buscar en la transcripción"
              value={q}
              autoComplete="off"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQ("");
              }}
            />
            <Boton variante="secundario" icono={Download} href={urlDeTranscripcion(meetingId)} descargar>
              Descargar transcripción
            </Boton>
          </div>

          <p className="re-visor-estado" role="status">
            {saltando
              ? "Buscando ese minuto…"
              : busqueda?.fase === "cargando"
                ? "Buscando…"
                : busqueda?.fase === "listo"
                  ? `${textoDeCoincidencias(busqueda.items.length, busqueda.siguienteMs !== null)} para «${busqueda.q}»`
                  : ""}
          </p>

          {busqueda ? (
            busqueda.fase === "error" ? (
              <Aviso enLinea tipo="error" titulo="No pudimos buscar en la transcripción." texto={busqueda.error} />
            ) : busqueda.fase === "listo" && busqueda.items.length === 0 ? (
              <Vacio titulo="No encontramos eso en la reunión." texto="Prueba con otra palabra: la búsqueda no distingue mayúsculas ni tildes." />
            ) : (
              <>
                <ol className="re-lista">
                  {busqueda.items.map((i) => {
                    const { nombre, conNombre } = nombreDe(i.speaker, busqueda.nombres);
                    return (
                      <li key={i.id} className="re-int re-hit">
                        {motor ? (
                          <button type="button" className="re-reloj-btn" aria-label={`Reproducir desde ${formatearReloj(i.startMs)}`} onClick={() => motor.reproducirDesde(i.startMs)}>
                            <Play aria-hidden="true" focusable="false" />
                            {formatearReloj(i.startMs)}
                          </button>
                        ) : (
                          <time className="re-reloj" dateTime={duracionIso(i.startMs)}>
                            {formatearReloj(i.startMs)}
                          </time>
                        )}
                        <div>
                          <p className={conNombre ? "re-quien" : "re-quien re-sin-nombre"}>{nombre}</p>
                          <p className="re-texto">
                            <TextoMarcado texto={i.text} terminos={terminos} />
                          </p>
                        </div>
                        <Boton variante="fantasma" tam={40} icono={Eye} tono="slate" className="re-hit-ver" onClick={() => void irA(i.startMs)}>
                          Ver en la transcripción
                        </Boton>
                      </li>
                    );
                  })}
                </ol>
                {busqueda.error && <Aviso enLinea tipo="error" titulo="No pudimos cargar más resultados." texto={busqueda.error} />}
                {busqueda.siguienteMs !== null && (
                  <div className="re-mas">
                    <Boton variante="secundario" icono={ChevronsDown} tono="slate" cargando={busqueda.cargandoMas} textoCargando="Cargando…" onClick={() => void masResultados()}>
                      Ver más resultados
                    </Boton>
                  </div>
                )}
              </>
            )
          ) : (
            <>
              {hayAnteriores && (
                <div className="re-mas re-antes">
                  <Boton variante="secundario" icono={ChevronsUp} tono="slate" cargando={cargandoAntes} textoCargando="Cargando…" onClick={() => void cargarAntes()}>
                    Cargar los 30 min anteriores
                  </Boton>
                </div>
              )}

              {grupos.length === 0 ? (
                siguiente !== null || hayAnteriores ? (
                  <p className="re-visor-estado">No hay intervenciones en este tramo.</p>
                ) : (
                  <Vacio titulo="No se detectó voz en esta grabación." texto="Si esperabas escuchar a alguien, revisa que el micrófono estuviera encendido y vuelve a subir el audio." />
                )
              ) : (
                grupos.map((g) => (
                  <section key={g.hora} className="re-hora" aria-labelledby={`re-hora-${g.hora}`}>
                    <h3 id={`re-hora-${g.hora}`} className="re-hora-t">
                      Hora {g.hora + 1}
                      <span>{g.rango} h</span>
                    </h3>
                    <ol className="re-lista">
                      {g.entradas.map((e) => {
                        if (e.tipo === "silencio") {
                          return (
                            <li key={e.clave} className="re-aparte re-silencio">
                              {textoDeSilencio(e.rango)}
                            </li>
                          );
                        }
                        if (e.tipo === "marca") {
                          return (
                            <li key={e.clave} className="re-aparte re-marca">
                              <Flag aria-hidden="true" focusable="false" />
                              <span>
                                <span className="k-sr">Marca de la grabación: </span>
                                {textoDeMarca(e.marca)}
                              </span>
                            </li>
                          );
                        }
                        const i = e.intervencion;
                        const { nombre, conNombre } = nombreDe(i.speaker, nombres);
                        return (
                          <FilaIntervencion
                            key={e.clave}
                            i={i}
                            nombre={nombre}
                            conNombre={conNombre}
                            activa={i.id === activaId}
                            destacada={i.id === destacadaId}
                            alReproducir={alReproducir}
                          />
                        );
                      })}
                    </ol>
                  </section>
                ))
              )}

              {errorMas && <Aviso enLinea tipo="error" titulo="No pudimos cargar más de la transcripción." texto={errorMas} />}

              {siguiente !== null ? (
                <div className="re-mas">
                  <Boton variante="secundario" icono={ChevronsDown} tono="slate" cargando={cargandoMas} textoCargando="Cargando…" onClick={() => void cargarMas()}>
                    Cargar los siguientes 30 min
                  </Boton>
                </div>
              ) : (
                grupos.length > 0 && <p className="re-fin">Aquí termina la transcripción.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
