/**
 * Lo que la pantalla sabe del acta de una reunión y cómo lo mantiene al día, sin React (así se prueba con un cliente y un reloj
 * falsos): carga la acta más reciente, la sigue mientras se redacta (consulta cada pocos segundos hasta que termina o falla),
 * trae el texto con sus marcadores cuando queda lista y pide o retoma el acta.
 *
 * Dos reglas para no mostrar algo viejo: una consulta que ya estaba en vuelo cuando se pidió o se retomó el acta se descarta
 * al llegar, y al pedir otra acta se olvida el texto de la anterior.
 */
import type { ActaDTO, RespuestaActa } from "./dto";

export type ClienteDeActa = {
  obtener(opciones: { texto: boolean }): Promise<RespuestaActa>;
  pedir(): Promise<{ acta: ActaDTO | null; yaEnCurso: boolean }>;
  reanudar(actaId: string): Promise<{ acta: ActaDTO | null; yaEnCurso: boolean }>;
};

export type EstadoDelControlador = {
  /** Todavía no llegó la primera respuesta. */
  cargando: boolean;
  /** La primera carga falló (mensaje listo para mostrar). */
  errorDeCarga: string | null;
  acta: ActaDTO | null;
  /** El acta con sus marcadores; solo cuando está lista. */
  texto: string | null;
  /** Se está pidiendo o retomando el acta. */
  enviando: boolean;
  /** Por qué falló el último intento de pedir o retomar; se limpia al volver a intentar. */
  errorDeAccion: string | null;
};

export type ResultadoDeAccion = { ok: true; yaEnCurso: boolean } | { ok: false; mensaje: string };

export type OpcionesDelControlador = {
  cliente: ClienteDeActa;
  /** Cada cuánto se consulta mientras se redacta. */
  intervaloMs?: number;
  /** Para pruebas: un reloj falso. */
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
};

export const INTERVALO_DE_ACTA_MS = 2_500;

const mensajeDe = (e: unknown, porDefecto: string): string => (e instanceof Error && e.message ? e.message : porDefecto);

export function crearControladorDeActa({ cliente, intervaloMs = INTERVALO_DE_ACTA_MS, programar, cancelar }: OpcionesDelControlador) {
  const poner = programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const quitar = cancelar ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let estado: EstadoDelControlador = { cargando: true, errorDeCarga: null, acta: null, texto: null, enviando: false, errorDeAccion: null };
  const oyentes = new Set<() => void>();
  let temporizador: unknown = null;
  let iniciado = false;
  let detenido = false;
  /** Sube con cada cambio de acta hecho por el usuario: lo que se pidió antes y llega después ya no vale. */
  let version = 0;

  const cambiar = (parcial: Partial<EstadoDelControlador>) => {
    estado = { ...estado, ...parcial };
    for (const o of [...oyentes]) o();
  };

  const programarSiguiente = () => {
    if (detenido || temporizador !== null || estado.acta?.estado !== "procesando") return;
    temporizador = poner(() => {
      temporizador = null;
      void refrescar();
    }, intervaloMs);
  };

  /** Una consulta: el acta y, si está lista y todavía no se tiene, su texto. */
  async function consultar(conTexto: boolean): Promise<void> {
    const mia = version;
    const r = await cliente.obtener({ texto: conTexto });
    if (detenido || mia !== version) return;
    // Un texto ya cargado se conserva mientras la misma acta sigue lista; si cambió de acta o dejó de estar lista, se olvida.
    const mismaActa = r.acta !== null && r.acta.id === estado.acta?.id && r.acta.estado === "lista";
    cambiar({ acta: r.acta, texto: r.acta?.estado === "lista" ? (r.texto ?? (mismaActa ? estado.texto : null)) : null, cargando: false, errorDeCarga: null });
    // Terminó mientras se seguía: ahora sí se trae el texto.
    if (r.acta?.estado === "lista" && r.texto === null && estado.texto === null) {
      try {
        await consultar(true);
      } catch {
        /* sin texto no se muestra el acta; el botón «Reintentar» la vuelve a pedir */
      }
    }
    programarSiguiente();
  }

  async function refrescar(): Promise<void> {
    if (detenido) return;
    try {
      await consultar(false);
    } catch {
      programarSiguiente(); // un tropiezo de la red no detiene el seguimiento
    }
  }

  async function cargarPrimeraVez(): Promise<void> {
    cambiar({ cargando: true, errorDeCarga: null });
    try {
      await consultar(true);
    } catch (e) {
      if (!detenido) cambiar({ cargando: false, errorDeCarga: mensajeDe(e, "No pudimos cargar el acta. Inténtalo de nuevo.") });
    }
  }

  async function accion(hacer: () => Promise<{ acta: ActaDTO | null; yaEnCurso: boolean }>, porDefecto: string): Promise<ResultadoDeAccion> {
    if (estado.enviando) return { ok: false, mensaje: "Ya lo estamos haciendo." };
    cambiar({ enviando: true, errorDeAccion: null });
    try {
      const r = await hacer();
      if (detenido) return { ok: true, yaEnCurso: r.yaEnCurso };
      version++;
      // Otra acta empieza de cero: el texto de la anterior ya no es de esta.
      cambiar({ acta: r.acta, texto: r.acta?.estado === "lista" && r.acta.id === estado.acta?.id ? estado.texto : null, enviando: false, cargando: false, errorDeCarga: null });
      programarSiguiente();
      return { ok: true, yaEnCurso: r.yaEnCurso };
    } catch (e) {
      const mensaje = mensajeDe(e, porDefecto);
      if (!detenido) cambiar({ enviando: false, errorDeAccion: mensaje });
      return { ok: false, mensaje };
    }
  }

  return {
    /** Para `useSyncExternalStore`. */
    suscribir(oyente: () => void): () => void {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    leer: (): EstadoDelControlador => estado,

    /** Empieza (una sola vez): carga el acta y, si se está redactando, la sigue. */
    iniciar(): void {
      if (iniciado) return;
      iniciado = true;
      detenido = false;
      void cargarPrimeraVez();
    },
    /** Deja de consultar y de avisar (la pantalla se cerró). */
    detener(): void {
      detenido = true;
      iniciado = false;
      if (temporizador !== null) quitar(temporizador);
      temporizador = null;
    },
    /** «Reintentar» después de una primera carga fallida. */
    recargar(): void {
      if (!detenido) void cargarPrimeraVez();
    },
    pedir: (): Promise<ResultadoDeAccion> => accion(() => cliente.pedir(), "No pudimos empezar el acta. Inténtalo de nuevo."),
    /** «Intentar de nuevo» de un acta con error. */
    reanudar: (): Promise<ResultadoDeAccion> => {
      const id = estado.acta?.estado === "error" ? estado.acta.id : null;
      if (!id) return Promise.resolve({ ok: false, mensaje: "Esta acta no está en error." });
      return accion(() => cliente.reanudar(id), "No pudimos retomar el acta. Inténtalo de nuevo.");
    },
  };
}

export type ControladorDeActa = ReturnType<typeof crearControladorDeActa>;
