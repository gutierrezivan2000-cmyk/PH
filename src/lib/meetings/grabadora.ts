/**
 * Motor de la grabadora de reuniones.
 *
 * Una reunión de consejo dura horas y sale en una sola toma: perder la grabación por un corte de internet,
 * una pestaña cerrada o un teléfono que se bloquea no es aceptable. Las reglas del motor:
 *
 *  1. GRABAR NUNCA DEPENDE DE INTERNET. Cada trozo de 5 s se guarda primero en el dispositivo (IndexedDB);
 *     recién después se piensa en el servidor.
 *  2. Al servidor suben PARTES de ~30 s (6 trozos), en orden, con reintentos sin límite mientras haya
 *     grabación: sin conexión espera a que vuelva, con un error pasajero reintenta con espera creciente.
 *  3. Una SESIÓN es una pasada del grabador (un archivo válido al unir sus trozos). Si se cierra el
 *     navegador o el micrófono se corta, lo guardado se sube igual y «continuar» abre una sesión nueva.
 *  4. Al terminar, el servidor comprueba que no falta ninguna parte; si faltan, se vuelven a subir desde lo
 *     guardado y se reintenta el cierre.
 *
 * Es lógica pura: el micrófono, el almacén local, la API, el reloj y la red entran por parámetros, así que
 * se prueba entera con un grabador simulado. Las implementaciones reales: grabadora-navegador.ts (micrófono
 * y MediaRecorder), almacen-navegador.ts (IndexedDB) y grabadora-api.ts (servidor).
 */
import {
  TROZOS_POR_PARTE, parteCabe, partesCompletas, partesPendientes, trozosDeParte, unirTrozos,
} from "./grabadora-partes";
import { VIVO_SILENCIO_AVISO_MS, VIVO_TROZO_MS } from "./tipos";

/* ════════════════════════════════════════════════════════════════════
   Lo que se guarda en el dispositivo
   ════════════════════════════════════════════════════════════════════ */

export type TrozoGuardado = { meetingId: string; session: number; idx: number; datos: ArrayBuffer; durMs: number };

export type SesionGuardada = {
  meetingId: string;
  session: number;
  mime: string;
  iniciada: number;
  /** El grabador se detuvo (terminó o se interrumpió): ya no llegarán más trozos. */
  cerrada: boolean;
  /** Último trozo guardado (−1 = ninguno). */
  ultimoIdx: number;
  /** Partes que el servidor ya confirmó. */
  enviadas: number[];
  /** Duración grabada de verdad (sin pausas). */
  durMs: number;
  bytes: number;
  /** Cuánto duraban las sesiones anteriores de esta reunión en este dispositivo (ubica las marcas en la línea de tiempo). */
  offsetMs: number;
};

export type MarcaGuardada = { id: string; meetingId: string; atMs: number; kind: string; note: string | null; enviada: boolean };

export interface AlmacenGrabaciones {
  guardarSesion(s: SesionGuardada): Promise<void>;
  listarSesiones(meetingId: string): Promise<SesionGuardada[]>;
  /** Todas las sesiones guardadas en el dispositivo, de cualquier reunión (para avisar en la lista de reuniones). */
  listarPendientes(): Promise<SesionGuardada[]>;
  guardarTrozo(t: TrozoGuardado): Promise<void>;
  leerTrozos(meetingId: string, session: number, desdeIdx: number, hastaIdx: number): Promise<TrozoGuardado[]>;
  /** Índice del último trozo guardado de una sesión (−1 si no hay). Es la verdad tras un cierre brusco. */
  ultimoTrozo(meetingId: string, session: number): Promise<number>;
  guardarMarca(m: MarcaGuardada): Promise<void>;
  listarMarcas(meetingId: string): Promise<MarcaGuardada[]>;
  /** Borra una sesión y sus trozos (una sesión que no llegó a grabar nada). */
  borrarSesion(meetingId: string, session: number): Promise<void>;
  /** Borra todo lo de una reunión (sesiones, trozos y marcas). */
  borrarReunion(meetingId: string): Promise<void>;
}

/** Almacén en memoria: pruebas, y el respaldo cuando IndexedDB no está disponible. */
export class AlmacenGrabacionesEnMemoria implements AlmacenGrabaciones {
  private readonly sesiones = new Map<string, SesionGuardada>();
  private readonly trozos = new Map<string, TrozoGuardado>();
  private readonly marcas = new Map<string, MarcaGuardada>();
  private static clave = (m: string, s: number, i?: number) => (i === undefined ? `${m}|${s}` : `${m}|${s}|${i}`);

  async guardarSesion(s: SesionGuardada) {
    this.sesiones.set(AlmacenGrabacionesEnMemoria.clave(s.meetingId, s.session), structuredClone(s));
  }
  async listarSesiones(meetingId: string) {
    return [...this.sesiones.values()].filter((s) => s.meetingId === meetingId).sort((a, b) => a.session - b.session).map((s) => structuredClone(s));
  }
  async listarPendientes() {
    return [...this.sesiones.values()].sort((a, b) => a.iniciada - b.iniciada).map((s) => structuredClone(s));
  }
  async guardarTrozo(t: TrozoGuardado) {
    this.trozos.set(AlmacenGrabacionesEnMemoria.clave(t.meetingId, t.session, t.idx), { ...t, datos: t.datos.slice(0) });
  }
  async leerTrozos(meetingId: string, session: number, desdeIdx: number, hastaIdx: number) {
    const hallados: TrozoGuardado[] = [];
    for (let i = desdeIdx; i <= hastaIdx; i++) {
      const t = this.trozos.get(AlmacenGrabacionesEnMemoria.clave(meetingId, session, i));
      if (t) hallados.push({ ...t, datos: t.datos.slice(0) });
    }
    return hallados;
  }
  async ultimoTrozo(meetingId: string, session: number) {
    let max = -1;
    for (const t of this.trozos.values()) if (t.meetingId === meetingId && t.session === session && t.idx > max) max = t.idx;
    return max;
  }
  async guardarMarca(m: MarcaGuardada) {
    this.marcas.set(m.id, { ...m });
  }
  async listarMarcas(meetingId: string) {
    return [...this.marcas.values()].filter((m) => m.meetingId === meetingId).sort((a, b) => a.atMs - b.atMs).map((m) => ({ ...m }));
  }
  async borrarSesion(meetingId: string, session: number) {
    this.sesiones.delete(AlmacenGrabacionesEnMemoria.clave(meetingId, session));
    for (const [k, t] of this.trozos) if (t.meetingId === meetingId && t.session === session) this.trozos.delete(k);
  }
  async borrarReunion(meetingId: string) {
    for (const [k, s] of this.sesiones) if (s.meetingId === meetingId) this.sesiones.delete(k);
    for (const [k, t] of this.trozos) if (t.meetingId === meetingId) this.trozos.delete(k);
    for (const [k, m] of this.marcas) if (m.meetingId === meetingId) this.marcas.delete(k);
  }
}

/* ════════════════════════════════════════════════════════════════════
   Lo externo, por parámetros
   ════════════════════════════════════════════════════════════════════ */

export type TipoErrorGrabacion = "transitorio" | "fatal";

export class ErrorGrabacion extends Error {
  readonly tipo: TipoErrorGrabacion;
  constructor(mensaje: string, tipo: TipoErrorGrabacion) {
    super(mensaje);
    this.name = "ErrorGrabacion";
    this.tipo = tipo;
  }
}

export type CierreSesion = { session: number; ultimaSecuencia: number; mimeType: string; duracionMs: number };
export type RespuestaCierre = { ok: true; status: string } | { ok: false; faltan: Array<{ session: number; seq: number }> };

export interface ApiGrabacion {
  /**
   * Reserva el número de la próxima sesión y dice en qué punto de la reunión empieza (lo ya recibido de las
   * sesiones anteriores, aunque vengan de otro dispositivo). Puede fallar sin conexión: entonces se usan valores locales.
   */
  nuevaSesion(): Promise<{ session: number; offsetMs: number }>;
  subirParte(datos: { session: number; seq: number; durMs: number; mime: string; cuerpo: Blob }, senal: AbortSignal): Promise<void>;
  /** Un fallo `fatal` descarta la marca (el servidor la rechazó); cualquier otro se reintenta. */
  marcar(datos: { id: string; atMs: number; kind: string; note: string | null }, senal: AbortSignal): Promise<void>;
  cerrar(datos: { sesiones: CierreSesion[] }, senal: AbortSignal): Promise<RespuestaCierre>;
}

/** Lo que usamos de `MediaRecorder` (así se prueba sin navegador). */
export interface GrabadorLike {
  readonly state: "inactive" | "recording" | "paused";
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(timesliceMs: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export type MicrofonoAbierto = {
  grabador: GrabadorLike;
  /** Tipo MIME con el que graba. */
  mime: string;
  /** Nivel de sonido actual, 0..1 (RMS). */
  nivel: () => number;
  /** Suelta el micrófono. */
  cerrar: () => void;
  /** Avisa si el micrófono se desconecta o el sistema lo quita. */
  alPerderse: (f: () => void) => void;
};

export type EntornoGrabadora = {
  ahora(): number;
  /** Espera `ms`; rechaza con un AbortError si la señal se activa. */
  dormir(ms: number, senal: AbortSignal): Promise<void>;
  /** ¿Hay conexión ahora mismo? */
  hayConexion(): boolean;
  /** Resuelve en cuanto vuelve la conexión; rechaza con un AbortError si la señal se activa. */
  esperarConexion(senal: AbortSignal): Promise<void>;
  /** Temporizador repetitivo; devuelve la función que lo cancela. */
  cada(ms: number, fn: () => void): () => void;
};

export type DependenciasGrabadora = {
  meetingId: string;
  almacen: AlmacenGrabaciones;
  api: ApiGrabacion;
  entorno: EntornoGrabadora;
  abrir: (opciones: { deviceId?: string }) => Promise<MicrofonoAbierto>;
};

/* ════════════════════════════════════════════════════════════════════
   Estado visible
   ════════════════════════════════════════════════════════════════════ */

export type FaseGrabadora =
  | "inactiva" | "iniciando" | "grabando" | "pausada" | "interrumpida" | "cerrando" | "terminada" | "error";

export type EstadoGrabadora = {
  fase: FaseGrabadora;
  session: number | null;
  /** Línea de tiempo de la reunión: sesiones anteriores + la actual (sin pausas). */
  transcurridoMs: number;
  /** Hasta dónde llegó lo que el servidor ya confirmó. */
  subidoHastaMs: number;
  partesPendientes: number;
  sinConexion: boolean;
  /** Un rechazo definitivo del servidor (el audio sigue a salvo en el dispositivo). */
  errorEnvio: string | null;
  nivel: number;
  silencioMs: number;
  /** El micrófono dejó de entregar sonido: el grabador está vivo pero no llegan trozos. */
  sinDatos: boolean;
  /** Lo que quedó en este dispositivo de visitas anteriores (cierre brusco) y se está rescatando. */
  recuperadas: { sesiones: number; durMs: number; bytes: number } | null;
  mensaje: string | null;
  marcas: number;
};

export type ResultadoCierreGrabacion = { ok: true; status: string } | { ok: false; motivo: string; abandonada?: boolean };

/* ════════════════════════════════════════════════════════════════════
   Constantes
   ════════════════════════════════════════════════════════════════════ */

/** Por debajo de este nivel (RMS) se considera silencio. */
export const UMBRAL_SILENCIO = 0.004;
/** Sin trozos por tanto tiempo (3 trozos) con el grabador «grabando»: algo falló. */
export const SIN_DATOS_MS = 3 * VIVO_TROZO_MS;
/** Cuánto silencio seguido avisa la grabadora (2 min). */
export const AVISO_SILENCIO_MS = VIVO_SILENCIO_AVISO_MS;

const INTERVALO_TICK_MS = 250;
const MAX_VUELTAS_FALTANTES = 3;
const ESPERA_STOP_MS = 4000;
const ESPERA_SESION_MS = 3000;

export const esperaDeReintentoVivo = (n: number): number => Math.min(30_000, 1000 * 2 ** (n - 1));

const AVISO_DATOS_PERDIDOS =
  "Se perdió parte de la grabación guardada en este dispositivo (¿se borraron los datos del sitio?). Se conserva lo que ya llegó al servidor.";
const AVISO_SIN_DATOS =
  "No llegan datos del micrófono. Revisa que el teléfono no esté bloqueado ni el micrófono en uso por otra app.";

/* ════════════════════════════════════════════════════════════════════
   El motor
   ════════════════════════════════════════════════════════════════════ */

export function crearGrabadora(dep: DependenciasGrabadora) {
  const { meetingId, almacen, api, entorno } = dep;

  let estado: EstadoGrabadora = {
    fase: "inactiva", session: null, transcurridoMs: 0, subidoHastaMs: 0, partesPendientes: 0, sinConexion: false, errorEnvio: null,
    nivel: 0, silencioMs: 0, sinDatos: false, recuperadas: null, mensaje: null, marcas: 0,
  };
  const oyentes = new Set<() => void>();
  const emitir = (cambios: Partial<EstadoGrabadora> = {}) => {
    estado = { ...estado, ...cambios };
    oyentes.forEach((f) => f());
  };

  /** Todas las sesiones de esta reunión conocidas en este dispositivo (anteriores y la actual). */
  const sesiones = new Map<number, SesionGuardada>();
  let actual: SesionGuardada | null = null;

  let mic: MicrofonoAbierto | null = null;
  let cancelarTick: (() => void) | null = null;
  let global = new AbortController();
  let abandonada = false;

  // Reloj ACTIVO de la sesión actual: solo cuenta el tiempo que se está grabando de verdad.
  let activoMs = 0;
  let desde: number | null = null;
  let ultimoCorte = 0;
  let ultimoTick = 0;
  let ultimoDato = 0;
  let marcasHechas = 0;

  const activoAhora = () => activoMs + (desde !== null ? entorno.ahora() - desde : 0);

  /** Tras «salir sin esperar», una nueva acción de la persona vuelve a habilitar los envíos. */
  function rearmar() {
    if (!abandonada) return;
    abandonada = false;
    global = new AbortController();
  }

  /**
   * Las operaciones que cambian el ciclo de la sesión (iniciar, terminar, interrumpir, descartar) se hacen de a
   * una: si el micrófono se desconecta justo cuando se pulsa «Terminar», no se pisan.
   */
  let serie: Promise<unknown> = Promise.resolve();
  function enSerie<T>(fn: () => Promise<T>): Promise<T> {
    const p = serie.then(fn, fn);
    serie = p.catch(() => {});
    return p;
  }

  /* ── guardar trozos (en orden, uno tras otro) ─────────────────────── */

  let cadena: Promise<void> = Promise.resolve();

  function encolarTrozo(blob: Blob) {
    // El instante se toma AHORA (cuando llegó), no cuando termine de leerse el blob.
    const total = activoAhora();
    cadena = cadena.then(() => guardarTrozo(blob, total)).catch(() => {});
  }

  async function guardarTrozo(blob: Blob, totalActivo: number) {
    const ses = actual;
    if (!ses || blob.size === 0) return;
    const durMs = Math.max(1, totalActivo - ultimoCorte);
    ultimoCorte = totalActivo;
    const datos = await blob.arrayBuffer();
    const idx = ses.ultimoIdx + 1;
    await almacen.guardarTrozo({ meetingId, session: ses.session, idx, datos, durMs });
    ses.ultimoIdx = idx;
    ses.bytes += datos.byteLength;
    ses.durMs = totalActivo;
    await almacen.guardarSesion(ses);
    ultimoDato = entorno.ahora();
    emitirProgreso({ sinDatos: false });
    void bombearEnvios();
  }

  /* ── envío de partes ──────────────────────────────────────────────── */

  let bucle: Promise<void> | null = null;
  let repetir = false;

  /** Cuánto del audio ya confirmó el servidor (aproximado: partes contiguas desde la 0 de cada sesión). */
  function subidoHasta(): number {
    let ms = 0;
    for (const s of sesiones.values()) {
      const hechas = new Set(s.enviadas);
      let contiguas = 0;
      while (hechas.has(contiguas)) contiguas++;
      ms += Math.min(contiguas * TROZOS_POR_PARTE * VIVO_TROZO_MS, s.durMs);
    }
    return ms;
  }

  function contarPendientes(): number {
    let n = 0;
    for (const s of sesiones.values()) n += partesPendientes(s.ultimoIdx, s.cerrada, s.enviadas).length;
    return n;
  }

  function emitirProgreso(extra: Partial<EstadoGrabadora> = {}) {
    const previas = [...sesiones.values()].filter((s) => s !== actual).reduce((suma, s) => suma + s.durMs, 0);
    emitir({
      transcurridoMs: previas + (actual ? activoAhora() : 0),
      subidoHastaMs: subidoHasta(),
      partesPendientes: contarPendientes(),
      ...extra,
    });
  }

  async function dormirOEsperar(ms: number) {
    try {
      await entorno.dormir(ms, global.signal);
    } catch {
      /* cancelado: el bucle lo notará */
    }
  }

  /** Sube UNA parte: espera la red sin gastar intentos y reintenta sin límite los fallos pasajeros. */
  async function enviarParte(s: SesionGuardada, seq: number): Promise<"ok" | "fatal" | "abandonada"> {
    let intento = 0;
    for (;;) {
      if (abandonada) return "abandonada";
      if (!entorno.hayConexion()) {
        emitir({ sinConexion: true });
        try {
          await entorno.esperarConexion(global.signal);
        } catch {
          return "abandonada";
        }
        emitir({ sinConexion: false });
        continue;
      }
      const { desde: a, hasta: b } = trozosDeParte(seq);
      const hasta = Math.min(b, s.ultimoIdx);
      const trozos = await almacen.leerTrozos(meetingId, s.session, a, hasta);
      if (trozos.length < hasta - a + 1) {
        // Faltan trozos en el dispositivo (se borraron los datos del sitio): la sesión llega hasta donde hay audio seguido.
        let hueco = a;
        while (trozos[hueco - a]?.idx === hueco) hueco++;
        s.ultimoIdx = hueco - 1;
        s.cerrada = true;
        await almacen.guardarSesion(s);
        emitirProgreso({ mensaje: AVISO_DATOS_PERDIDOS });
        return "ok";
      }
      const cuerpo = unirTrozos(trozos.map((t) => t.datos), s.mime);
      if (!parteCabe(cuerpo.size)) {
        emitir({ errorEnvio: "Una parte de la grabación es demasiado grande para enviarla." });
        return "fatal";
      }
      try {
        await api.subirParte({ session: s.session, seq, durMs: trozos.reduce((suma, t) => suma + t.durMs, 0), mime: s.mime, cuerpo }, global.signal);
        if (!s.enviadas.includes(seq)) s.enviadas.push(seq);
        await almacen.guardarSesion(s);
        emitirProgreso({ errorEnvio: null, sinConexion: false });
        return "ok";
      } catch (e) {
        if (abandonada) return "abandonada";
        if (e instanceof ErrorGrabacion && e.tipo === "fatal") {
          emitir({ errorEnvio: e.message });
          return "fatal";
        }
        intento++;
        await dormirOEsperar(esperaDeReintentoVivo(intento));
      }
    }
  }

  /**
   * Sube, de la más antigua a la más nueva, todo lo que esté listo. Hay UN solo bucle a la vez: quien llama
   * mientras otro corre recibe la promesa del que ya corre (y este repasa lo nuevo antes de terminar), así
   * esperar a que «no quede nada» es esperar esa promesa, sin sondeos.
   */
  function bombearEnvios(): Promise<void> {
    if (bucle) {
      repetir = true;
      return bucle;
    }
    bucle = (async () => {
      await Promise.resolve(); // así `bucle` queda asignado ANTES de que el cuerpo pueda terminar (y limpiarlo)
      try {
        do {
          repetir = false;
          for (const s of [...sesiones.values()].sort((a, b) => a.session - b.session)) {
            for (;;) {
              if (estado.errorEnvio !== null) return; // un rechazo definitivo: se espera a «reintentarEnvios»
              // Se recalcula tras cada parte: una sesión con datos perdidos se acorta y esto lo recoge solo.
              const [seq] = partesPendientes(s.ultimoIdx, s.cerrada, s.enviadas);
              if (seq === undefined) break;
              if ((await enviarParte(s, seq)) !== "ok") return;
            }
          }
          await enviarMarcasPendientes();
        } while (repetir && !abandonada);
      } finally {
        bucle = null;
        emitirProgreso();
      }
    })();
    return bucle;
  }

  /** ¿Se subió todo lo que había? (espera a que el bucle termine). */
  async function vaciarEnvios(): Promise<boolean> {
    await bombearEnvios();
    return !abandonada && estado.errorEnvio === null && contarPendientes() === 0;
  }

  /* ── marcas ───────────────────────────────────────────────────────── */

  /** Envía las marcas que faltan. true = no queda ninguna por enviar. */
  async function enviarMarcasPendientes(): Promise<boolean> {
    let todas = true;
    for (const m of await almacen.listarMarcas(meetingId).catch(() => [] as MarcaGuardada[])) {
      if (m.enviada) continue;
      try {
        await api.marcar({ id: m.id, atMs: m.atMs, kind: m.kind, note: m.note }, global.signal);
        await almacen.guardarMarca({ ...m, enviada: true });
      } catch (e) {
        if (e instanceof ErrorGrabacion && e.tipo === "fatal") {
          await almacen.guardarMarca({ ...m, enviada: true }).catch(() => {}); // el servidor la rechazó: reintentar no sirve
        } else {
          todas = false; // se reintenta en la próxima vuelta
        }
      }
    }
    return todas;
  }

  /* ── reloj, nivel, silencio ───────────────────────────────────────── */

  function tick() {
    const ahora = entorno.ahora();
    const dt = Math.max(0, ahora - ultimoTick);
    ultimoTick = ahora;
    if (!actual || !mic) return;
    const grabando = estado.fase === "grabando";
    const nivel = mic.nivel();
    const silencio = grabando && nivel < UMBRAL_SILENCIO ? estado.silencioMs + dt : 0;
    const sinDatos = grabando && mic.grabador.state === "recording" && ahora - ultimoDato > SIN_DATOS_MS;
    emitirProgreso({
      nivel, silencioMs: silencio, sinDatos, sinConexion: !entorno.hayConexion(),
      mensaje: sinDatos ? AVISO_SIN_DATOS : estado.mensaje === AVISO_SIN_DATOS ? null : estado.mensaje,
    });
  }

  function empezarReloj() {
    ultimoTick = entorno.ahora();
    ultimoDato = ultimoTick;
    cancelarTick?.();
    cancelarTick = entorno.cada(INTERVALO_TICK_MS, tick);
  }

  function pararReloj() {
    cancelarTick?.();
    cancelarTick = null;
  }

  /* ── ciclo de la sesión ───────────────────────────────────────────── */

  /** Espera al `stop` del grabador (con tope: si nunca llega, seguimos con lo que haya). */
  function detenerGrabador(g: GrabadorLike): Promise<void> {
    if (g.state === "inactive") return Promise.resolve();
    return new Promise<void>((resolver) => {
      const tope = new AbortController();
      entorno.dormir(ESPERA_STOP_MS, tope.signal).then(resolver, () => {});
      g.onstop = () => {
        tope.abort();
        resolver();
      };
      try {
        g.stop();
      } catch {
        tope.abort();
        resolver();
      }
    });
  }

  /** Cierra la sesión actual: ya no llegarán trozos. Sus partes pendientes se subirán. */
  async function cerrarSesionActual() {
    const ses = actual;
    if (!ses) return;
    if (desde !== null) {
      activoMs += entorno.ahora() - desde;
      desde = null;
    }
    if (mic) await detenerGrabador(mic.grabador);
    await cadena; // el último trozo ya está guardado
    ses.cerrada = true;
    ses.durMs = Math.max(ses.durMs, activoMs);
    await almacen.guardarSesion(ses);
    pararReloj();
    mic?.cerrar();
    mic = null;
    actual = null;
  }

  function interrumpir(motivo: string): Promise<void> {
    return enSerie(async () => {
      if (estado.fase !== "grabando" && estado.fase !== "pausada") return;
      await cerrarSesionActual();
      emitirProgreso({ fase: "interrumpida", mensaje: motivo, nivel: 0, silencioMs: 0, sinDatos: false });
      void bombearEnvios(); // lo grabado hasta aquí se sube igual
    });
  }

  /** Carga lo que quedó de visitas anteriores (cierre brusco) y empieza a subirlo. */
  async function inicializar(): Promise<void> {
    const guardadas = await almacen.listarSesiones(meetingId).catch(() => [] as SesionGuardada[]);
    let durMs = 0;
    let bytes = 0;
    let n = 0;
    for (const s of guardadas) {
      const real = await almacen.ultimoTrozo(meetingId, s.session).catch(() => s.ultimoIdx);
      if (real < 0 && s.ultimoIdx < 0) {
        // Una sesión vacía: el navegador se cerró en los primeros segundos. No hay nada que rescatar.
        await almacen.borrarSesion(meetingId, s.session).catch(() => {});
        continue;
      }
      if (!s.cerrada) {
        // Tras un cierre brusco, lo que manda es lo realmente guardado.
        if (real > s.ultimoIdx) {
          s.durMs += (real - s.ultimoIdx) * VIVO_TROZO_MS; // estimación: el último trozo no alcanzó a quedar anotado
          s.ultimoIdx = real;
        }
        s.cerrada = true;
        await almacen.guardarSesion(s);
      }
      sesiones.set(s.session, s);
      durMs += s.durMs;
      bytes += s.bytes;
      n++;
    }
    if (n > 0) {
      marcasHechas = (await almacen.listarMarcas(meetingId).catch(() => [])).length;
      emitirProgreso({ recuperadas: { sesiones: n, durMs, bytes }, marcas: marcasHechas });
      void bombearEnvios();
    }
  }

  /**
   * Número de sesión y punto de la reunión donde empieza: lo que diga el servidor, o lo local si no contesta
   * pronto (grabar no puede esperar a internet). Nunca se pisa una sesión que ya tenemos.
   */
  async function pedirSesion(minimo: number, offsetLocal: number): Promise<{ session: number; offsetMs: number }> {
    const control = new AbortController();
    const dada = await Promise.race([
      api.nuevaSesion().catch(() => null),
      entorno.dormir(ESPERA_SESION_MS, control.signal).then(() => null, () => null),
    ]);
    control.abort();
    return { session: Math.max(dada?.session ?? 0, minimo), offsetMs: Math.max(dada?.offsetMs ?? 0, offsetLocal) };
  }

  function iniciar(opciones: { deviceId?: string } = {}): Promise<void> {
    return enSerie(async () => {
      if (!["inactiva", "interrumpida", "error"].includes(estado.fase)) return;
      rearmar();
      emitir({ fase: "iniciando", mensaje: null, errorEnvio: null, nivel: 0, silencioMs: 0, sinDatos: false });
      try {
        const minimo = Math.max(0, ...sesiones.keys()) + 1;
        const offsetLocal = [...sesiones.values()].reduce((suma, s) => suma + s.durMs, 0);
        const { session, offsetMs } = await pedirSesion(minimo, offsetLocal);
        const abierto = await dep.abrir(opciones);
        mic = abierto; // desde aquí, cualquier fallo debe soltar el micrófono

        const ses: SesionGuardada = {
          meetingId, session, mime: abierto.mime, iniciada: entorno.ahora(), cerrada: false, ultimoIdx: -1, enviadas: [], durMs: 0, bytes: 0, offsetMs,
        };
        sesiones.set(session, ses);
        actual = ses;
        activoMs = 0;
        ultimoCorte = 0;
        await almacen.guardarSesion(ses);

        abierto.grabador.ondataavailable = (e) => encolarTrozo(e.data);
        abierto.grabador.onerror = () => void interrumpir("La grabación se detuvo por un error del micrófono.");
        abierto.alPerderse(() => void interrumpir("El micrófono se desconectó."));

        abierto.grabador.start(VIVO_TROZO_MS);
        desde = entorno.ahora();
        empezarReloj();
        emitirProgreso({ fase: "grabando", session });
      } catch (e) {
        mic?.cerrar();
        mic = null;
        if (actual) {
          sesiones.delete(actual.session); // no llegó a grabar: que no quede como una sesión «a medias»
          await almacen.borrarSesion(meetingId, actual.session).catch(() => {});
        }
        actual = null;
        const texto = e instanceof Error && e.message ? e.message : "No pudimos abrir el micrófono.";
        emitir({ fase: "error", mensaje: texto });
      }
    });
  }

  function pausar() {
    if (estado.fase !== "grabando" || !mic || !actual) return;
    if (desde !== null) activoMs += entorno.ahora() - desde;
    desde = null;
    try {
      mic.grabador.pause();
    } catch {
      /* ya estaba en pausa */
    }
    emitirProgreso({ fase: "pausada", silencioMs: 0 });
  }

  function reanudar() {
    if (estado.fase !== "pausada" || !mic) return;
    try {
      mic.grabador.resume();
    } catch {
      /* ya estaba grabando */
    }
    desde = entorno.ahora();
    ultimoDato = entorno.ahora();
    emitirProgreso({ fase: "grabando" });
  }

  /** Pone una marca en el minuto que se está grabando (nuevo tema, votación, compromiso, nota). */
  async function marcar(kind: string, note: string | null = null) {
    if (!actual || (estado.fase !== "grabando" && estado.fase !== "pausada")) return;
    const atMs = actual.offsetMs + activoAhora();
    const marca: MarcaGuardada = { id: `marca-${entorno.ahora()}-${++marcasHechas}`, meetingId, atMs, kind, note, enviada: false };
    await almacen.guardarMarca(marca).catch(() => {});
    emitir({ marcas: marcasHechas });
    void bombearEnvios();
  }

  /* ── terminar ─────────────────────────────────────────────────────── */

  async function cerrarEnServidor(): Promise<ResultadoCierreGrabacion> {
    const cierres: CierreSesion[] = [...sesiones.values()]
      .filter((s) => s.ultimoIdx >= 0)
      .sort((a, b) => a.session - b.session)
      .map((s) => ({ session: s.session, ultimaSecuencia: partesCompletas(s.ultimoIdx, true).length - 1, mimeType: s.mime, duracionMs: s.durMs }));
    if (cierres.length === 0) return { ok: false, motivo: "No se grabó nada. Empieza de nuevo cuando quieras." };

    let vueltasConFaltantes = 0;
    let fallosDeRed = 0;
    for (;;) {
      let respuesta: RespuestaCierre;
      try {
        respuesta = await api.cerrar({ sesiones: cierres }, global.signal);
      } catch (e) {
        if (abandonada) return { ok: false, motivo: "Quedó pendiente de enviar.", abandonada: true };
        if (e instanceof ErrorGrabacion && e.tipo === "fatal") return { ok: false, motivo: e.message };
        // Un fallo de red o del servidor no gasta una «vuelta de faltantes»: se espera (con espera creciente) y se repite.
        if (!entorno.hayConexion()) {
          emitir({ sinConexion: true });
          try {
            await entorno.esperarConexion(global.signal);
          } catch {
            return { ok: false, motivo: "Quedó pendiente de enviar.", abandonada: true };
          }
          emitir({ sinConexion: false });
        } else {
          await dormirOEsperar(esperaDeReintentoVivo(++fallosDeRed));
        }
        continue;
      }

      if (respuesta.ok) {
        // Las marcas son lo último que se manda: pocas y pequeñas, pero no deben perderse con el borrado local.
        for (let i = 1; i <= 3 && !(await enviarMarcasPendientes()); i++) await dormirOEsperar(esperaDeReintentoVivo(i));
        await almacen.borrarReunion(meetingId).catch(() => {});
        sesiones.clear();
        emitirProgreso({ fase: "terminada", mensaje: null, recuperadas: null });
        return { ok: true, status: respuesta.status };
      }

      if (++vueltasConFaltantes > MAX_VUELTAS_FALTANTES) {
        return { ok: false, motivo: "El servidor sigue sin recibir algunas partes de la grabación. Lo grabado está a salvo en este dispositivo: vuelve a intentarlo." };
      }
      // El servidor dice que le faltan partes: se marcan como no enviadas y se vuelven a subir desde lo guardado.
      for (const f of respuesta.faltan) {
        const s = sesiones.get(f.session);
        if (!s) continue;
        s.enviadas = s.enviadas.filter((n) => n !== f.seq);
        await almacen.guardarSesion(s);
      }
      emitir({ errorEnvio: null });
      await vaciarEnvios();
      if (abandonada) return { ok: false, motivo: "Quedó pendiente de enviar.", abandonada: true };
    }
  }

  function terminar(): Promise<ResultadoCierreGrabacion> {
    return enSerie(async (): Promise<ResultadoCierreGrabacion> => {
      if (!["grabando", "pausada", "interrumpida", "inactiva", "error"].includes(estado.fase)) return { ok: false, motivo: "No hay una grabación en curso." };
      rearmar();
      emitir({ fase: "cerrando", mensaje: null });
      await cerrarSesionActual();
      emitirProgreso({ nivel: 0, silencioMs: 0, sinDatos: false });
      const subido = await vaciarEnvios();
      if (!subido) {
        emitir({ fase: "interrumpida" });
        if (abandonada) return { ok: false, motivo: "Quedó pendiente de enviar.", abandonada: true };
        return { ok: false, motivo: estado.errorEnvio ?? "No pudimos subir toda la grabación." };
      }
      const r = await cerrarEnServidor();
      if (!r.ok) emitir({ fase: "interrumpida" });
      return r;
    });
  }

  /** Salir sin esperar a internet: lo grabado queda en el dispositivo y se sube la próxima vez. */
  function abandonar() {
    abandonada = true;
    global.abort();
  }

  /** Vuelve a intentar los envíos tras un rechazo definitivo (o tras «salir sin esperar»). */
  function reintentarEnvios() {
    rearmar();
    emitir({ errorEnvio: null });
    void bombearEnvios();
  }

  /** Tira lo grabado en este dispositivo (no toca lo que el servidor ya recibió). */
  function descartar(): Promise<void> {
    return enSerie(async () => {
      abandonar();
      await cerrarSesionActual().catch(() => {});
      await bucle?.catch(() => {});
      await almacen.borrarReunion(meetingId).catch(() => {});
      sesiones.clear();
      rearmar();
      emitir({
        fase: "inactiva", session: null, transcurridoMs: 0, subidoHastaMs: 0, partesPendientes: 0, recuperadas: null, mensaje: null, marcas: 0,
        nivel: 0, silencioMs: 0, sinDatos: false, errorEnvio: null, sinConexion: false,
      });
    });
  }

  return {
    estado: () => estado,
    suscribir(f: () => void) {
      oyentes.add(f);
      return () => {
        oyentes.delete(f);
      };
    },
    inicializar,
    iniciar,
    pausar,
    reanudar,
    marcar,
    terminar,
    abandonar,
    reintentarEnvios,
    descartar,
    /** Hay algo de lo que ocuparse (grabando, o partes sin subir). */
    ocupada: () => estado.fase === "grabando" || estado.fase === "pausada" || estado.fase === "cerrando" || estado.partesPendientes > 0,
  };
}

export type Grabadora = ReturnType<typeof crearGrabadora>;
