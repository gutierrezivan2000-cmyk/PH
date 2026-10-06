/**
 * Subida directa y reanudable de archivos grandes (audio o video de una reunión).
 *
 * El archivo NO pasa por nuestro servidor: se parte en trozos de 16 MB que el navegador sube
 * directo a Vercel Blob (multipart), tres a la vez. Lo que tiene que sobrevivir a un corte de
 * internet, a cerrar la pestaña o a apagar el equipo es el ESTADO de la subida (qué trozos ya
 * llegaron y su etag), que se guarda en IndexedDB después de cada trozo. Al volver a elegir el
 * mismo archivo se reconoce por su huella y solo se suben los trozos que faltan.
 *
 * Este módulo es lógica pura: todo lo externo (la API de Blob, la base local, el reloj y la
 * red) entra por parámetros. Así se prueba entero —pausas, cortes, tokens vencidos, subidas
 * caducadas— sin navegador ni servicio real. Las implementaciones reales están en
 * subida-api.ts (Blob) y almacen-navegador.ts (IndexedDB).
 */
import { PARTE_SUBIDA_BYTES } from "./tipos";

/* ════════════════════════════════════════════════════════════════════
   Partir el archivo
   ════════════════════════════════════════════════════════════════════ */

export type Parte = { numero: number; inicio: number; fin: number; bytes: number };

/** Blob exige 5 MB como mínimo por parte (salvo la última). */
export const MIN_PARTE_BYTES = 5 * 1024 * 1024;
/** Tope de partes de una subida multipart. */
export const MAX_PARTES = 10_000;

/**
 * Tamaño real de las partes: el pedido, o más grande si el archivo no cabría en 10.000 partes.
 * Es una función pura de (tamaño, tamaño pedido): un archivo reanudado calcula lo mismo siempre.
 */
export function tamanoDeParte(tamano: number, pedido: number = PARTE_SUBIDA_BYTES): number {
  return Math.max(pedido, Math.ceil(tamano / MAX_PARTES));
}

/** Partes numeradas desde 1; todas del mismo tamaño salvo la última, que puede ser menor. */
export function planificarPartes(tamano: number, pedido: number = PARTE_SUBIDA_BYTES): Parte[] {
  if (!Number.isInteger(tamano) || tamano < 1) throw new RangeError("El archivo está vacío.");
  if (!Number.isInteger(pedido) || pedido < MIN_PARTE_BYTES) {
    throw new RangeError("Las partes de la subida deben pesar al menos 5 MB.");
  }
  const t = tamanoDeParte(tamano, pedido);
  const n = Math.ceil(tamano / t);
  return Array.from({ length: n }, (_, i) => {
    const inicio = i * t;
    const fin = Math.min(tamano, inicio + t);
    return { numero: i + 1, inicio, fin, bytes: fin - inicio };
  });
}

/* ════════════════════════════════════════════════════════════════════
   Reconocer el archivo: la huella
   ════════════════════════════════════════════════════════════════════ */

/** Lo mínimo que necesitamos de un `File` (así se prueba sin navegador). */
export type ArchivoSubible = {
  name: string;
  size: number;
  lastModified: number;
  slice(inicio?: number, fin?: number): Blob;
};

const MB = 1024 * 1024;

/** FNV-1a de 2 × 32 bits: solo para contextos sin `crypto.subtle` (páginas http), donde no hay otra cosa. */
function hashSencillo(bytes: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0;
    b = Math.imul(b ^ bytes[bytes.length - 1 - i], 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const aHex = (bytes: Uint8Array) => Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * Huella del archivo: nombre, tamaño, fecha de modificación y el primer y el último megabyte.
 * Dos archivos distintos con el mismo nombre y tamaño casi nunca coinciden en todo eso, y leer
 * 2 MB es instantáneo incluso en un archivo de 8 GB.
 */
export async function huella(archivo: ArchivoSubible): Promise<string> {
  const cabeza = new Uint8Array(await archivo.slice(0, Math.min(MB, archivo.size)).arrayBuffer());
  const cola = new Uint8Array(await archivo.slice(Math.max(0, archivo.size - MB), archivo.size).arrayBuffer());
  const meta = new TextEncoder().encode(`${archivo.name}|${archivo.size}|${archivo.lastModified}|`);
  const todo = new Uint8Array(meta.length + cabeza.length + cola.length);
  todo.set(meta, 0);
  todo.set(cabeza, meta.length);
  todo.set(cola, meta.length + cabeza.length);

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return hashSencillo(todo);
  return aHex(new Uint8Array(await subtle.digest("SHA-256", todo))).slice(0, 32);
}

/* ════════════════════════════════════════════════════════════════════
   Estado que sobrevive al cierre de la pestaña
   ════════════════════════════════════════════════════════════════════ */

export type EstadoGuardado = {
  /** `${meetingId}:${huella}` */
  clave: string;
  meetingId: string;
  huella: string;
  nombre: string;
  tamano: number;
  tipo: string;
  ultimaModif: number;
  /** El tamaño de parte con que EMPEZÓ la subida (si la constante cambia en un despliegue, esta sigue valiendo). */
  tamParte: number;
  pathname: string;
  key: string;
  uploadId: string;
  partes: Array<{ partNumber: number; etag: string }>;
  /** Ya se completó en Blob y falta (o falló) avisar a nuestro servidor. */
  completado: { url: string; pathname: string } | null;
  creado: number;
  actualizado: number;
};

export interface AlmacenEstados {
  leer(clave: string): Promise<EstadoGuardado | undefined>;
  guardar(estado: EstadoGuardado): Promise<void>;
  borrar(clave: string): Promise<void>;
  /** Las subidas sin terminar de una reunión (para decir «interrumpida» al volver). */
  listar(meetingId: string): Promise<EstadoGuardado[]>;
}

/** Almacén en memoria: pruebas, y el respaldo cuando IndexedDB no está disponible. */
export class AlmacenEnMemoria implements AlmacenEstados {
  private readonly datos = new Map<string, EstadoGuardado>();
  async leer(clave: string) {
    const e = this.datos.get(clave);
    return e ? structuredClone(e) : undefined;
  }
  async guardar(estado: EstadoGuardado) {
    this.datos.set(estado.clave, structuredClone(estado));
  }
  async borrar(clave: string) {
    this.datos.delete(clave);
  }
  async listar(meetingId: string) {
    return [...this.datos.values()].filter((e) => e.meetingId === meetingId).map((e) => structuredClone(e));
  }
}

/* ════════════════════════════════════════════════════════════════════
   Lo externo, por parámetros
   ════════════════════════════════════════════════════════════════════ */

export type TipoErrorSubida =
  /** El permiso de subida venció: se pide uno nuevo y se sigue. */
  | "token"
  /** La subida ya no existe en el servicio: se empieza de nuevo. */
  | "caducada"
  /** Red, saturación, error pasajero: se reintenta con espera creciente. */
  | "transitorio"
  /** No hay nada que reintentar (tipo no admitido, archivo demasiado grande…). */
  | "fatal";

export class ErrorSubida extends Error {
  readonly tipo: TipoErrorSubida;
  constructor(mensaje: string, tipo: TipoErrorSubida) {
    super(mensaje);
    this.name = "ErrorSubida";
    this.tipo = tipo;
  }
}

export type PermisoSubida = { token: string; pathname: string; contentType: string; partSize: number };

export interface ApiSubida {
  pedirToken(datos: { nombre: string; tamano: number; tipo: string; pathname?: string }, senal: AbortSignal): Promise<PermisoSubida>;
  crearMultipart(datos: { pathname: string; token: string; contentType: string }, senal: AbortSignal): Promise<{ key: string; uploadId: string }>;
  subirParte(
    datos: {
      pathname: string; token: string; key: string; uploadId: string; numero: number; cuerpo: Blob; contentType: string;
      /** Bytes de ESTA parte ya enviados. */
      alProgreso: (bytes: number) => void;
    },
    senal: AbortSignal,
  ): Promise<{ etag: string; partNumber: number }>;
  completar(
    datos: { pathname: string; token: string; key: string; uploadId: string; partes: Array<{ etag: string; partNumber: number }>; contentType: string },
    senal: AbortSignal,
  ): Promise<{ url: string; pathname: string }>;
  registrar(datos: { url: string; pathname: string; nombre: string; tamano: number; tipo: string }, senal: AbortSignal): Promise<void>;
}

export type Entorno = {
  ahora(): number;
  /** Espera `ms`; rechaza con un AbortError si la señal se activa. */
  dormir(ms: number, senal: AbortSignal): Promise<void>;
  /** ¿Hay conexión ahora mismo? */
  hayConexion(): boolean;
  /** Resuelve en cuanto vuelve la conexión; rechaza con un AbortError si la señal se activa. */
  esperarConexion(senal: AbortSignal): Promise<void>;
};

export function errorDeAborto(): Error {
  const e = new Error("Operación cancelada.");
  e.name = "AbortError";
  return e;
}

/** Un aborto nuestro (pausa o cancelación): el AbortError estándar, o «The request was aborted.» del SDK de Blob. */
export const esAborto = (e: unknown): boolean =>
  e instanceof Error && (e.name === "AbortError" || /^(vercel blob: )?the (request|operation) was aborted\.?$/i.test(e.message));

/** Entorno del navegador (el único que usa el reloj, los temporizadores y la red de verdad). */
export function entornoDelNavegador(): Entorno {
  return {
    ahora: () => Date.now(),
    dormir: (ms, senal) =>
      new Promise<void>((resolver, rechazar) => {
        if (senal.aborted) return rechazar(errorDeAborto());
        const t = setTimeout(() => {
          senal.removeEventListener("abort", alAbortar);
          resolver();
        }, ms);
        const alAbortar = () => {
          clearTimeout(t);
          rechazar(errorDeAborto());
        };
        senal.addEventListener("abort", alAbortar, { once: true });
      }),
    hayConexion: () => typeof navigator === "undefined" || navigator.onLine !== false,
    esperarConexion: (senal) =>
      new Promise<void>((resolver, rechazar) => {
        if (senal.aborted) return rechazar(errorDeAborto());
        if (typeof navigator === "undefined" || navigator.onLine !== false) return resolver();
        const alVolver = () => {
          window.removeEventListener("online", alVolver);
          senal.removeEventListener("abort", alAbortar);
          resolver();
        };
        const alAbortar = () => {
          window.removeEventListener("online", alVolver);
          rechazar(errorDeAborto());
        };
        window.addEventListener("online", alVolver, { once: true });
        senal.addEventListener("abort", alAbortar, { once: true });
      }),
  };
}

/* ════════════════════════════════════════════════════════════════════
   El motor
   ════════════════════════════════════════════════════════════════════ */

export type EstadoMotor =
  | "preparando" | "subiendo" | "pausada" | "completando" | "registrando" | "lista" | "error" | "cancelada";

export type Progreso = {
  estado: EstadoMotor;
  subidos: number;
  total: number;
  /** 0-100. Solo llega a 100 cuando el archivo ya está completo y registrado. */
  porcentaje: number;
  bytesPorSegundo: number;
  /** null mientras no hay una velocidad fiable. */
  restanteS: number | null;
  partesHechas: number;
  partesTotal: number;
  /** Continúa una subida anterior (cerrada, cortada o pausada de otra visita). */
  reanudada: boolean;
  /** Algo que la persona debe saber ahora mismo («Sin conexión…», «La subida anterior caducó…»). */
  mensaje: string | null;
};

export type ResultadoSubida =
  | { ok: true; url: string; pathname: string }
  | { ok: false; error: string; cancelada?: boolean };

export type OpcionesSubida = {
  meetingId: string;
  archivo: ArchivoSubible;
  tipo: string;
  api: ApiSubida;
  almacen: AlmacenEstados;
  entorno?: Entorno;
  /** Partes a la vez (3 por defecto). */
  concurrencia?: number;
  /** Fallos pasajeros tolerados por llamada antes de rendirse (6 por defecto). */
  reintentos?: number;
  alProgreso: (p: Progreso) => void;
};

export type ControlSubida = {
  pausar(): void;
  reanudar(): void;
  cancelar(): void;
  /** Resuelve siempre (nunca rechaza): con el resultado o con el motivo por el que no terminó. */
  terminada: Promise<ResultadoSubida>;
};

/** Espera antes del reintento n (1, 2, 3…): 1, 2, 4, 8, 16 y 30 s como tope. */
export const esperaDeReintento = (n: number): number => Math.min(30_000, 1000 * 2 ** (n - 1));

/** Cuántos permisos nuevos se piden por llamada, y cuántas veces se empieza de cero por una subida caducada. */
const MAX_RENOVACIONES = 3;
const MAX_REINICIOS = 2;
/** Ventana de la velocidad: lo subido en los últimos 10 s. */
const VENTANA_VELOCIDAD_MS = 10_000;
/** No se avisa a la pantalla más de 4 veces por segundo (salvo cambios de estado). */
const INTERVALO_AVISO_MS = 250;

export const MENSAJE_CADUCADA = "La subida anterior caducó; empezamos de nuevo.";
export const MENSAJE_SIN_CONEXION = "Sin conexión: seguimos en cuanto vuelva internet.";
export const MENSAJE_AGOTADO = "Se cortó la conexión y no pudimos continuar. Tu avance está guardado: vuelve a intentarlo.";

export function iniciarSubida(op: OpcionesSubida): ControlSubida {
  const { meetingId, archivo, tipo, api, almacen, alProgreso } = op;
  const entorno = op.entorno ?? entornoDelNavegador();
  const concurrencia = Math.max(1, op.concurrencia ?? 3);
  const reintentos = op.reintentos ?? 6;
  const total = archivo.size;

  const global = new AbortController();
  const enVuelo = new Set<AbortController>();
  const bytesEnVuelo = new Map<number, number>();
  let pausada = false;
  let cancelada = false;
  /** Trabajadores esperando a que termine la pausa: reanudar o cancelar los despierta a TODOS. */
  const dormidos: Array<() => void> = [];
  const despertarATodos = () => dormidos.splice(0).forEach((despertar) => despertar());

  let estado: EstadoMotor = "preparando";
  let mensaje: string | null = null;
  let reanudada = false;
  let partesTotal = 0;
  let partesHechas = 0;
  let bytesCompletos = 0;
  const muestras: Array<{ t: number; bytes: number }> = [];
  let velocidad = 0;
  let ultimoAviso = -Infinity;

  let clave = "";
  let guardado: EstadoGuardado | undefined;
  let permiso: PermisoSubida | null = null;
  let renovacion: Promise<void> | null = null;

  /* ── progreso ─────────────────────────────────────────────────────── */

  const subidos = () => {
    let enCurso = 0;
    for (const b of bytesEnVuelo.values()) enCurso += b;
    return Math.min(total, bytesCompletos + enCurso);
  };

  function emitir(forzar = false) {
    const ahora = entorno.ahora();
    if (!forzar && ahora - ultimoAviso < INTERVALO_AVISO_MS) return;
    ultimoAviso = ahora;

    const hechos = subidos();
    muestras.push({ t: ahora, bytes: hechos });
    while (muestras.length > 2 && ahora - muestras[0].t > VENTANA_VELOCIDAD_MS) muestras.shift();
    const primera = muestras[0];
    const lapso = (ahora - primera.t) / 1000;
    if (estado !== "subiendo") velocidad = 0;
    else if (lapso >= 1 && hechos > primera.bytes) velocidad = (hechos - primera.bytes) / lapso;

    const pct = estado === "lista" ? 100 : Math.min(99, Math.floor((hechos / total) * 100));
    alProgreso({
      estado,
      subidos: hechos,
      total,
      porcentaje: pct,
      bytesPorSegundo: Math.round(velocidad),
      restanteS: estado === "subiendo" && velocidad > 0 ? Math.ceil((total - hechos) / velocidad) : null,
      partesHechas,
      partesTotal,
      reanudada,
      mensaje,
    });
  }

  function poner(nuevo: EstadoMotor, texto: string | null = mensaje) {
    estado = nuevo;
    mensaje = texto;
    emitir(true);
  }

  /* ── pausa, cancelación y conexión ────────────────────────────────── */

  const noCancelada = () => {
    if (cancelada) throw errorDeAborto();
  };

  /** Bloquea mientras esté en pausa; lanza si se cancela. */
  async function esperarSiPausada(): Promise<void> {
    while (pausada && !cancelada) await new Promise<void>((resolver) => dormidos.push(resolver));
    noCancelada();
  }

  /** Sin red no se gastan intentos: se avisa y se espera a que vuelva. */
  async function esperarRed(): Promise<void> {
    if (!entorno.hayConexion()) {
      poner(estado, MENSAJE_SIN_CONEXION);
      await entorno.esperarConexion(global.signal);
      noCancelada();
    }
    if (mensaje === MENSAJE_SIN_CONEXION) poner(estado, null);
  }

  /* ── una llamada con todas sus defensas ───────────────────────────── */

  const tipoDe = (e: unknown): TipoErrorSubida => (e instanceof ErrorSubida ? e.tipo : "transitorio");

  /**
   * Ejecuta `trabajo` repitiéndolo cuando conviene:
   *  - pausa: la llamada abortada se retoma al reanudar, sin gastar intento;
   *  - permiso vencido: se renueva y se repite al instante (hasta 3 veces), sin gastar intento;
   *  - fallo pasajero: espera creciente (1, 2, 4… hasta 30 s) y hasta `reintentos` intentos;
   *  - cualquier otro error (fatal, subida caducada) o un aborto propio: sube tal cual.
   */
  async function conReintentos<T>(trabajo: (senal: AbortSignal) => Promise<T>): Promise<T> {
    let intento = 0;
    let renovaciones = 0;
    for (;;) {
      await esperarSiPausada();
      await esperarRed();
      const c = new AbortController();
      const alAbortarGlobal = () => c.abort();
      global.signal.addEventListener("abort", alAbortarGlobal, { once: true });
      enVuelo.add(c);
      try {
        return await trabajo(c.signal);
      } catch (e) {
        if (cancelada) throw errorDeAborto();
        // Solo la pausa o la cancelación activan la señal de un intento: si se activó, lo cortó la pausa
        // (aunque ya se haya reanudado) y se repite sin gastar intento. Se mira la señal y no `pausada`:
        // pausar y reanudar enseguida deja `pausada` en falso antes de que llegue el error de aborto.
        if (c.signal.aborted) continue;
        if (esAborto(e)) throw e;
        const t = tipoDe(e);
        if (t === "token") {
          if (++renovaciones > MAX_RENOVACIONES) throw new ErrorSubida("No pudimos renovar el permiso de subida. Inténtalo de nuevo.", "fatal");
          await renovarPermiso();
          continue;
        }
        if (t !== "transitorio") throw e;
        if (++intento > reintentos) throw new ErrorSubida(MENSAJE_AGOTADO, "transitorio");
        try {
          await entorno.dormir(esperaDeReintento(intento), global.signal);
        } catch {
          noCancelada();
        }
      } finally {
        enVuelo.delete(c);
        global.signal.removeEventListener("abort", alAbortarGlobal);
      }
    }
  }

  /** Pide un permiso (nuevo, o renueva el de la ruta actual). Varias partes que fallan a la vez comparten UNA petición. */
  function renovarPermiso(): Promise<void> {
    renovacion ??= conReintentos(async (senal) => {
      permiso = await api.pedirToken({ nombre: archivo.name, tamano: total, tipo, pathname: guardado?.pathname }, senal);
    }).finally(() => {
      renovacion = null;
    });
    return renovacion;
  }

  /* ── pasos ────────────────────────────────────────────────────────── */

  const leerSeguro = (k: string) => almacen.leer(k).catch(() => undefined);
  const borrarSeguro = (k: string) => almacen.borrar(k).catch(() => undefined);
  const guardarSeguro = (e: EstadoGuardado) => {
    e.actualizado = entorno.ahora();
    return almacen.guardar(e).catch(() => undefined);
  };

  async function empezarSubida(hue: string): Promise<EstadoGuardado> {
    await renovarPermiso();
    const p = permiso as PermisoSubida;
    const { key, uploadId } = await conReintentos((senal) =>
      api.crearMultipart({ pathname: p.pathname, token: p.token, contentType: p.contentType }, senal),
    );
    const ahora = entorno.ahora();
    const nuevo: EstadoGuardado = {
      clave, meetingId, huella: hue, nombre: archivo.name, tamano: total, tipo, ultimaModif: archivo.lastModified,
      tamParte: tamanoDeParte(total, p.partSize >= MIN_PARTE_BYTES ? p.partSize : PARTE_SUBIDA_BYTES),
      pathname: p.pathname, key, uploadId, partes: [], completado: null, creado: ahora, actualizado: ahora,
    };
    await guardarSeguro(nuevo);
    return nuevo;
  }

  async function subirPartes(g: EstadoGuardado): Promise<void> {
    const todas = planificarPartes(total, g.tamParte);
    partesTotal = todas.length;
    const hechas = new Set(g.partes.map((p) => p.partNumber));
    const pendientes = todas.filter((p) => !hechas.has(p.numero));
    bytesCompletos = todas.filter((p) => hechas.has(p.numero)).reduce((suma, p) => suma + p.bytes, 0);
    partesHechas = hechas.size;
    bytesEnVuelo.clear();
    poner("subiendo");

    let siguiente = 0;
    let fallo = false;
    const trabajador = async () => {
      for (;;) {
        await esperarSiPausada();
        if (fallo) return;
        const parte = pendientes[siguiente++];
        if (!parte) return;
        const r = await conReintentos(async (senal) => {
          const p = permiso as PermisoSubida;
          try {
            const hecha = await api.subirParte(
              {
                pathname: g.pathname, token: p.token, key: g.key, uploadId: g.uploadId, numero: parte.numero,
                cuerpo: archivo.slice(parte.inicio, parte.fin), contentType: p.contentType,
                alProgreso: (b) => {
                  bytesEnVuelo.set(parte.numero, Math.min(b, parte.bytes));
                  emitir();
                },
              },
              senal,
            );
            // Mismo instante: la parte pasa de «en vuelo» a «completa» sin que el avance retroceda.
            bytesCompletos += parte.bytes;
            partesHechas++;
            return hecha;
          } finally {
            bytesEnVuelo.delete(parte.numero);
          }
        });
        g.partes.push({ partNumber: r.partNumber, etag: r.etag });
        await guardarSeguro(g);
        emitir(true);
      }
    };

    const resultados = await Promise.allSettled(
      Array.from({ length: Math.min(concurrencia, pendientes.length) }, () =>
        trabajador().catch((e) => {
          // Si una parte se rinde, las demás dejan de empezar trabajo nuevo y se cortan las que van a medias.
          fallo = true;
          for (const c of enVuelo) c.abort();
          throw e;
        }),
      ),
    );
    const rechazo = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rechazo) throw rechazo.reason;

    const unicas = new Set(g.partes.map((p) => p.partNumber));
    if (unicas.size !== todas.length) {
      throw new ErrorSubida("La subida quedó incompleta. Vuelve a intentarlo.", "caducada");
    }
  }

  async function completarSubida(g: EstadoGuardado): Promise<void> {
    poner("completando");
    const p = permiso as PermisoSubida;
    const partes = [...g.partes].sort((a, b) => a.partNumber - b.partNumber).map((x) => ({ etag: x.etag, partNumber: x.partNumber }));
    const r = await conReintentos((senal) =>
      api.completar({ pathname: g.pathname, token: p.token, key: g.key, uploadId: g.uploadId, partes, contentType: p.contentType }, senal),
    );
    g.completado = { url: r.url, pathname: r.pathname };
    await guardarSeguro(g);
  }

  async function ejecutar(): Promise<ResultadoSubida> {
    try {
      emitir(true);
      const hue = await huella(archivo);
      noCancelada();
      clave = `${meetingId}:${hue}`;

      guardado = await leerSeguro(clave);
      if (guardado && (guardado.tamano !== total || guardado.nombre !== archivo.name || guardado.ultimaModif !== archivo.lastModified)) {
        await borrarSeguro(clave);
        guardado = undefined;
      }
      reanudada = Boolean(guardado && (guardado.partes.length > 0 || guardado.completado));

      for (let reinicios = 0; ; reinicios++) {
        try {
          if (!guardado) guardado = await empezarSubida(hue);
          if (!guardado.completado) {
            if (!permiso) await renovarPermiso(); // al reanudar, el permiso de la visita anterior ya venció
            await subirPartes(guardado);
            await completarSubida(guardado);
          } else {
            partesTotal = partesHechas = guardado.partes.length;
            bytesCompletos = total;
          }
          const hecho = guardado.completado as { url: string; pathname: string };
          poner("registrando");
          await conReintentos((senal) =>
            api.registrar({ url: hecho.url, pathname: hecho.pathname, nombre: archivo.name, tamano: total, tipo }, senal),
          );
          await borrarSeguro(clave);
          poner("lista", null);
          return { ok: true, url: hecho.url, pathname: hecho.pathname };
        } catch (e) {
          if (tipoDe(e) === "caducada" && !cancelada && reinicios < MAX_REINICIOS) {
            // La subida ya no existe (o el archivo no llegó completo): se empieza de cero, avisando.
            await borrarSeguro(clave);
            guardado = undefined;
            permiso = null;
            reanudada = false;
            bytesCompletos = 0;
            partesHechas = 0;
            bytesEnVuelo.clear();
            poner("preparando", MENSAJE_CADUCADA);
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      if (cancelada) {
        // Todos los trabajadores ya terminaron: ahora sí se puede borrar el estado sin que nadie lo reescriba.
        if (clave) await borrarSeguro(clave);
        poner("cancelada", null);
        return { ok: false, cancelada: true, error: "Subida cancelada." };
      }
      const texto = e instanceof Error && e.message && !esAborto(e) ? e.message : "No pudimos subir el archivo. Inténtalo de nuevo.";
      poner("error", texto);
      return { ok: false, error: texto };
    }
  }

  const terminada = ejecutar();

  return {
    pausar() {
      if (pausada || cancelada) return;
      pausada = true;
      for (const c of enVuelo) c.abort();
      poner("pausada");
    },
    reanudar() {
      if (!pausada || cancelada) return;
      pausada = false;
      despertarATodos();
      poner("subiendo");
    },
    cancelar() {
      if (cancelada) return;
      cancelada = true;
      pausada = false;
      global.abort();
      despertarATodos();
    },
    terminada,
  };
}
