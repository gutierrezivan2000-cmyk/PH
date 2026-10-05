/**
 * El motor del audio de una reunión: UN reproductor para toda la página (el de la transcripción, el «Escuchar» de cada voz
 * y los saltos desde el resumen usan el mismo). Es un almacén pequeño sin React: la pantalla lo lee con
 * `useSyncExternalStore`, así lo que cambia cuatro veces por segundo (el minuto) solo vuelve a pintar lo que lo necesita.
 *
 * El `<audio>` se crea la primera vez que se necesita reproducir, no al abrir la página: mover el reproductor a un minuto
 * (por ejemplo desde una decisión del resumen) solo anota la posición y no pide nada al servidor. El archivo se sirve por
 * rangos (ver `audio-http.ts`), así saltar al minuto 5:12:40 no baja lo anterior.
 *
 * Todo lo que toca el navegador entra por `AudioLike`: las pruebas usan uno falso.
 */

export const VELOCIDADES = [1, 1.25, 1.5, 2] as const;
export type Velocidad = (typeof VELOCIDADES)[number];
export const SALTO_MS = 15_000;

export type TramoSonando = { clave: string; desdeMs: number; hastaMs: number };

export type EstadoMotor = {
  /** Dónde está el reproductor, en ms desde el inicio de la reunión. */
  tiempoMs: number;
  reproduciendo: boolean;
  /** Esperando datos (acaba de pedir un salto, o se cortó la red). */
  cargando: boolean;
  /** Lo que se le dice a la persona si el audio no carga. */
  error: string | null;
  velocidad: Velocidad;
  /** Una muestra (la voz de alguien) está sonando: se corta sola al llegar al final. */
  tramo: TramoSonando | null;
};

/** Lo que el motor necesita de un `<audio>` (así se prueba sin navegador). */
export interface AudioLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  preload: string;
  readonly error: { code: number } | null;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
  removeAttribute(nombre: string): void;
  addEventListener(tipo: string, fn: () => void): void;
  removeEventListener(tipo: string, fn: () => void): void;
}

export interface Motor {
  /** La misma referencia mientras nada cambie (lo que pide `useSyncExternalStore`). */
  estado(): EstadoMotor;
  suscribir(fn: () => void): () => void;
  /** Reproducir o pausar; al final de la reunión, volver a empezar. */
  alternar(): void;
  reproducirDesde(ms: number): void;
  /** Reproduce una muestra (a velocidad normal) y se detiene al llegar a `hastaMs`. */
  reproducirTramo(clave: string, desdeMs: number, hastaMs: number): void;
  /** Pausa y cierra la muestra, si hay una. */
  detener(): void;
  saltar(deltaMs: number): void;
  /** Mueve el reproductor a un minuto sin empezar a sonar (si ya sonaba, sigue desde ahí). */
  buscar(ms: number): void;
  fijarVelocidad(v: Velocidad): void;
  /** Vuelve a cargar el audio desde donde iba, tras un error. */
  reintentar(): void;
  /** Suelta el `<audio>` y la red; el motor se puede volver a usar después. */
  destruir(): void;
}

export const esVelocidad = (v: unknown): v is Velocidad => (VELOCIDADES as readonly unknown[]).includes(v);

/** «1×», «1,25×», «1,5×», «2×». */
export const textoDeVelocidad = (v: Velocidad): string => `${String(v).replace(".", ",")}×`;

/** El mensaje para `MediaError.code` (1 es «lo cancelaron nosotros»: no es un error para la persona). */
export function mensajeDeErrorDeAudio(code: number | null | undefined): string | null {
  if (code === 1) return null;
  if (code === 2) return "Se cortó la conexión mientras cargaba el audio.";
  if (code === 3) return "El audio no se pudo reproducir en este navegador.";
  if (code === 4) return "No pudimos cargar el audio de esta reunión.";
  return "No pudimos reproducir el audio.";
}

const igual = (a: EstadoMotor, b: EstadoMotor): boolean =>
  a.tiempoMs === b.tiempoMs && a.reproduciendo === b.reproduciendo && a.cargando === b.cargando && a.error === b.error && a.velocidad === b.velocidad && a.tramo === b.tramo;

export function crearMotor({ url, duracionMs, crearAudio }: { url: string; duracionMs: number; crearAudio?: () => AudioLike }): Motor {
  let estado: EstadoMotor = { tiempoMs: 0, reproduciendo: false, cargando: false, error: null, velocidad: 1, tramo: null };
  const oyentes = new Set<() => void>();
  let audio: AudioLike | null = null;
  let quitarOyentes: Array<() => void> = [];

  const limitar = (ms: number) => Math.max(0, Math.min(Number.isFinite(ms) ? ms : 0, Math.max(0, duracionMs)));

  function poner(parcial: Partial<EstadoMotor>): void {
    const nuevo = { ...estado, ...parcial };
    if (igual(estado, nuevo)) return;
    estado = nuevo;
    for (const f of [...oyentes]) f();
  }

  /** Cierra la muestra (si hay una) y devuelve el audio a la velocidad de la persona. */
  function cerrarTramo(): void {
    if (!estado.tramo) return;
    if (audio) audio.playbackRate = estado.velocidad;
    poner({ tramo: null });
  }

  function alTiempo(): void {
    if (!audio) return;
    const t = Math.round(audio.currentTime * 1000);
    poner({ tiempoMs: t });
    if (estado.tramo && t >= estado.tramo.hastaMs) {
      audio.pause();
      cerrarTramo();
    }
  }

  function conectar(a: AudioLike): void {
    const oir = (tipo: string, fn: () => void) => {
      a.addEventListener(tipo, fn);
      quitarOyentes.push(() => a.removeEventListener(tipo, fn));
    };
    oir("timeupdate", alTiempo);
    oir("play", () => poner({ reproduciendo: true }));
    oir("playing", () => poner({ reproduciendo: true, cargando: false }));
    oir("pause", () => poner({ reproduciendo: false, cargando: false }));
    oir("waiting", () => poner({ cargando: true }));
    oir("canplay", () => poner({ cargando: false }));
    oir("seeked", () => poner({ cargando: false }));
    oir("ended", () => poner({ reproduciendo: false, cargando: false, tiempoMs: limitar(duracionMs) }));
    oir("error", () => {
      const mensaje = mensajeDeErrorDeAudio(a.error?.code);
      if (mensaje === null) return;
      cerrarTramo();
      poner({ error: mensaje, reproduciendo: false, cargando: false });
    });
  }

  /** Crea el `<audio>` la primera vez, ya puesto en la posición y la velocidad actuales. */
  function asegurarAudio(): AudioLike {
    if (audio) return audio;
    const a = (crearAudio ?? (() => new Audio() as unknown as AudioLike))();
    a.preload = "metadata";
    a.src = url;
    a.playbackRate = estado.tramo ? 1 : estado.velocidad;
    a.currentTime = estado.tiempoMs / 1000;
    audio = a;
    conectar(a);
    return a;
  }

  function soltarAudio(): void {
    for (const quitar of quitarOyentes) quitar();
    quitarOyentes = [];
    if (!audio) return;
    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch {
      /* ya estaba suelto */
    }
    audio = null;
  }

  function sonar(a: AudioLike): void {
    poner({ error: null, cargando: true });
    let promesa: Promise<void> | void;
    try {
      promesa = a.play();
    } catch {
      poner({ error: mensajeDeErrorDeAudio(0), cargando: false, reproduciendo: false });
      return;
    }
    if (promesa && typeof promesa.catch === "function") {
      promesa.catch((e: unknown) => {
        const nombre = (e as { name?: string } | null)?.name;
        if (nombre === "AbortError") return; // otra orden (pausa o salto) interrumpió esta
        // Sin permiso para sonar (el navegador lo bloqueó): no es un fallo del audio.
        if (nombre === "NotAllowedError") return poner({ reproduciendo: false, cargando: false });
        poner({ error: mensajeDeErrorDeAudio(a.error?.code ?? 0) ?? mensajeDeErrorDeAudio(0), reproduciendo: false, cargando: false });
      });
    }
  }

  const motor: Motor = {
    estado: () => estado,
    suscribir(fn) {
      oyentes.add(fn);
      return () => {
        oyentes.delete(fn);
      };
    },

    alternar() {
      if (estado.reproduciendo && audio) {
        audio.pause();
        return;
      }
      const a = asegurarAudio();
      cerrarTramo();
      if (estado.tiempoMs >= limitar(duracionMs) - 500) {
        a.currentTime = 0;
        poner({ tiempoMs: 0 });
      }
      sonar(a);
    },

    reproducirDesde(ms) {
      const t = limitar(ms);
      const a = asegurarAudio();
      cerrarTramo();
      a.currentTime = t / 1000;
      poner({ tiempoMs: t });
      sonar(a);
    },

    reproducirTramo(clave, desdeMs, hastaMs) {
      const desde = limitar(desdeMs);
      const hasta = Math.max(desde + 1, Math.min(hastaMs, duracionMs));
      const a = asegurarAudio();
      a.playbackRate = 1;
      a.currentTime = desde / 1000;
      poner({ tramo: { clave, desdeMs: desde, hastaMs: hasta }, tiempoMs: desde });
      sonar(a);
    },

    detener() {
      if (audio) audio.pause();
      cerrarTramo();
    },

    saltar(deltaMs) {
      const base = audio ? audio.currentTime * 1000 : estado.tiempoMs;
      motor.buscar(base + deltaMs);
    },

    buscar(ms) {
      const t = limitar(ms);
      cerrarTramo();
      if (audio) audio.currentTime = t / 1000;
      poner({ tiempoMs: t });
    },

    fijarVelocidad(v) {
      if (!esVelocidad(v)) return;
      if (audio && !estado.tramo) audio.playbackRate = v;
      poner({ velocidad: v });
    },

    reintentar() {
      const donde = estado.tiempoMs;
      soltarAudio();
      poner({ error: null, reproduciendo: false, cargando: false });
      motor.reproducirDesde(donde);
    },

    destruir() {
      soltarAudio();
      poner({ reproduciendo: false, cargando: false, tramo: null });
    },
  };
  return motor;
}

/* ════════════════════════════════════════════════════════════════════
   Qué intervención está sonando
   ════════════════════════════════════════════════════════════════════ */

/** El índice del último elemento que empieza en `ms` o antes (la lista va ordenada por `startMs`); -1 si ninguno. */
function ultimoQueEmpezo(items: ReadonlyArray<{ startMs: number }>, ms: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let hallado = -1;
  while (lo <= hi) {
    const medio = (lo + hi) >> 1;
    if (items[medio].startMs <= ms) {
      hallado = medio;
      lo = medio + 1;
    } else {
      hi = medio - 1;
    }
  }
  return hallado;
}

/**
 * La intervención que suena en `ms`: la última que empezó, mientras no haya pasado de largo. Entre dos intervenciones hay
 * un respiro de `graciaMs` en que sigue marcada la anterior (si no, la marca parpadearía en cada pausa).
 */
export function intervencionEnCurso<T extends { startMs: number; endMs: number }>(items: readonly T[], ms: number, graciaMs = 2_000): T | null {
  const i = ultimoQueEmpezo(items, ms);
  if (i < 0) return null;
  return ms <= items[i].endMs + graciaMs ? items[i] : null;
}

/** La intervención más cercana a `ms` (para llevar la pantalla a un minuto): la que suena o, si ninguna, la siguiente; si no hay siguiente, la última. */
export function intervencionMasCercana<T extends { startMs: number; endMs: number }>(items: readonly T[], ms: number): T | null {
  if (items.length === 0) return null;
  const i = ultimoQueEmpezo(items, ms);
  if (i < 0) return items[0];
  if (ms <= items[i].endMs) return items[i];
  return i + 1 < items.length ? items[i + 1] : items[i];
}
