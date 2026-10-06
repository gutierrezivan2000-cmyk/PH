/**
 * El micrófono, el reloj y la red REALES del navegador para la grabadora (grabadora.ts es lógica pura y se
 * prueba con un micrófono simulado; aquí está lo que no se puede probar sin navegador).
 */
import type { EntornoGrabadora, GrabadorLike, MicrofonoAbierto } from "./grabadora";
import { elegirMime } from "./grabadora-partes";
import { VIVO_BITS_POR_SEGUNDO } from "./tipos";

const errorDeAborto = () => new DOMException("Aborted", "AbortError");

/* ════════════════════════════════════════════════════════════════════
   Reloj y red
   ════════════════════════════════════════════════════════════════════ */

export function entornoDelNavegador(): EntornoGrabadora {
  const hayConexion = () => typeof navigator === "undefined" || navigator.onLine !== false;
  return {
    // `performance.now()` no salta con los cambios de hora del sistema y no avanza mientras el equipo duerme: mide lo grabado.
    ahora: () => performance.now(),
    epoca: () => Date.now(),
    dormir: (ms, senal) =>
      new Promise<void>((resolver, rechazar) => {
        if (senal.aborted) return rechazar(errorDeAborto());
        const alAbortar = () => {
          clearTimeout(t);
          rechazar(errorDeAborto());
        };
        const t = setTimeout(() => {
          senal.removeEventListener("abort", alAbortar);
          resolver();
        }, ms);
        senal.addEventListener("abort", alAbortar, { once: true });
      }),
    hayConexion,
    esperarConexion: (senal) =>
      new Promise<void>((resolver, rechazar) => {
        if (hayConexion()) return resolver();
        if (senal.aborted) return rechazar(errorDeAborto());
        const limpiar = () => {
          window.removeEventListener("online", alVolver);
          senal.removeEventListener("abort", alAbortar);
        };
        const alVolver = () => {
          limpiar();
          resolver();
        };
        const alAbortar = () => {
          limpiar();
          rechazar(errorDeAborto());
        };
        window.addEventListener("online", alVolver);
        senal.addEventListener("abort", alAbortar, { once: true });
      }),
    cada: (ms, fn) => {
      const t = setInterval(fn, ms);
      return () => clearInterval(t);
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   Nivel de sonido
   ════════════════════════════════════════════════════════════════════ */

/** Nivel RMS (0..1) de un bloque de muestras de audio. */
export function nivelRms(muestras: ArrayLike<number>): number {
  if (muestras.length === 0) return 0;
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
  return Math.sqrt(suma / muestras.length);
}

/** Del RMS a lo que se ve en el medidor (0..1): de −60 dB a −10 dB, que es donde vive la voz. */
export function nivelParaMedidor(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 50));
}

/* ════════════════════════════════════════════════════════════════════
   Soporte y errores
   ════════════════════════════════════════════════════════════════════ */

export type Soporte = { ok: true } | { ok: false; motivo: string };

/** ¿Puede este navegador grabar? (el micrófono y MediaRecorder exigen una página segura). */
export function soportaGrabacion(): Soporte {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { ok: false, motivo: "La grabadora solo funciona en el navegador." };
  if (window.isSecureContext === false) return { ok: false, motivo: "La grabadora solo funciona en una página segura (https)." };
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, motivo: "Este navegador no puede usar el micrófono. Prueba con Chrome, Edge, Firefox o Safari al día." };
  }
  if (typeof MediaRecorder === "undefined" || !elegirMime((m) => MediaRecorder.isTypeSupported(m))) {
    return { ok: false, motivo: "Este navegador no puede grabar audio. Prueba con Chrome, Edge, Firefox o Safari al día." };
  }
  return { ok: true };
}

/** El motivo, en español, de que no se abra el micrófono. */
export function mensajeDeErrorMicrofono(e: unknown): string {
  const nombre = (e as { name?: unknown } | null)?.name;
  switch (nombre) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "No tenemos permiso para usar el micrófono. Permítelo desde el candado de la barra de direcciones y vuelve a intentarlo.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "No encontramos un micrófono. Conecta uno o elige otro en la lista.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "El micrófono está en uso por otra aplicación o no responde. Ciérrala y vuelve a intentarlo.";
    case "SecurityError":
      return "El navegador bloqueó el micrófono. La página debe abrirse con https.";
    default:
      return "No pudimos abrir el micrófono. Revisa que esté conectado y vuelve a intentarlo.";
  }
}

export type OpcionMicrofono = { id: string; etiqueta: string };

/** Los micrófonos disponibles (los nombres solo se ven después de dar permiso). */
export async function listarMicrofonos(): Promise<OpcionMicrofono[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    return dispositivos
      .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
      .map((d, i) => ({ id: d.deviceId, etiqueta: d.label || `Micrófono ${i + 1}` }));
  } catch {
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════════
   El micrófono abierto
   ════════════════════════════════════════════════════════════════════ */

/** Las mismas condiciones que usan las videollamadas: una sola voz clara, sin eco ni ruido de fondo, a volumen parejo. */
const CONDICIONES_AUDIO = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } as const;

/**
 * El medidor no salta con cada instante: cada lectura baja un 15 % lo anterior, como el medidor de una consola. Así un
 * golpe de voz se ve un momento y la silueta de una conversación se lee de un vistazo.
 */
export const CAIDA_DEL_NIVEL = 0.85;

type ConAudioContext = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export async function abrirMicrofono(opciones: { deviceId?: string } = {}): Promise<MicrofonoAbierto> {
  const soporte = soportaGrabacion();
  if (!soporte.ok) throw new Error(soporte.motivo);
  const mime = elegirMime((m) => MediaRecorder.isTypeSupported(m)) as string;

  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      audio: { ...CONDICIONES_AUDIO, ...(opciones.deviceId ? { deviceId: { exact: opciones.deviceId } } : {}) },
    });
  } catch (e) {
    // El micrófono que se había elegido ya no está (se desconectó): se prueba con el predeterminado.
    if (opciones.deviceId && (e as { name?: unknown } | null)?.name === "OverconstrainedError") return abrirMicrofono({});
    throw new Error(mensajeDeErrorMicrofono(e));
  }
  const pistas = flujo.getTracks();
  const soltar = () => pistas.forEach((p) => p.stop());

  let grabador: MediaRecorder;
  try {
    grabador = new MediaRecorder(flujo, { mimeType: mime, audioBitsPerSecond: VIVO_BITS_POR_SEGUNDO });
  } catch {
    soltar();
    throw new Error("Este navegador no pudo preparar la grabación de audio.");
  }

  // El medidor de nivel: si el navegador no deja crear el analizador, se graba igual (el nivel queda «sin medir»).
  let contexto: AudioContext | null = null;
  let analizador: AnalyserNode | null = null;
  try {
    const Constructor = globalThis.AudioContext ?? (globalThis as ConAudioContext).webkitAudioContext;
    contexto = new Constructor();
    analizador = contexto.createAnalyser();
    analizador.fftSize = 2048;
    contexto.createMediaStreamSource(flujo).connect(analizador);
    void contexto.resume().catch(() => {});
  } catch {
    void contexto?.close().catch(() => {});
    contexto = null;
    analizador = null;
  }
  const muestras = new Float32Array(analizador?.fftSize ?? 2048);
  let suavizado = 0;

  return {
    grabador: grabador as unknown as GrabadorLike,
    mime,
    nivel: () => {
      if (!analizador || !contexto) return Number.NaN;
      if (contexto.state !== "running") {
        void contexto.resume().catch(() => {});
        return Number.NaN; // sin arrancar no hay medida: no se confunde con silencio
      }
      analizador.getFloatTimeDomainData(muestras);
      suavizado = Math.max(nivelRms(muestras), suavizado * CAIDA_DEL_NIVEL);
      return suavizado;
    },
    cerrar: () => {
      soltar();
      void contexto?.close().catch(() => {});
    },
    alPerderse: (f) => pistas.forEach((p) => p.addEventListener("ended", f)),
  };
}

/* ════════════════════════════════════════════════════════════════════
   Pantalla encendida
   ════════════════════════════════════════════════════════════════════ */

/** ¿Puede este navegador mantener la pantalla encendida? */
export const soportaBloqueoDePantalla = (): boolean => typeof navigator !== "undefined" && "wakeLock" in navigator;

/**
 * Pide que la pantalla no se apague y lo vuelve a pedir cuando la pestaña regresa a primer plano (el navegador
 * suelta el bloqueo al ocultarla). `soportado = false` si el navegador no tiene la API.
 */
export function mantenerPantallaEncendida(): { soportado: boolean; soltar: () => void } {
  if (!soportaBloqueoDePantalla()) return { soportado: false, soltar: () => {} };
  let bloqueo: WakeLockSentinel | null = null;
  let activo = true;
  const pedir = () => {
    if (!activo || document.visibilityState !== "visible") return;
    navigator.wakeLock
      .request("screen")
      .then((b) => {
        if (activo) bloqueo = b;
        else void b.release().catch(() => {});
      })
      .catch(() => {});
  };
  const alCambiar = () => {
    if (document.visibilityState === "visible") pedir();
  };
  pedir();
  document.addEventListener("visibilitychange", alCambiar);
  return {
    soportado: true,
    soltar: () => {
      activo = false;
      document.removeEventListener("visibilitychange", alCambiar);
      void bloqueo?.release().catch(() => {});
      bloqueo = null;
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   Una sola pestaña por reunión, y espacio en el dispositivo
   ════════════════════════════════════════════════════════════════════ */

/**
 * Toma el candado de una reunión: solo UNA pestaña de este navegador puede tener su grabadora abierta (dos
 * pestañas pisarían lo guardado en el dispositivo). Devuelve cómo soltarlo, o null si otra pestaña lo tiene.
 * Sin la API de candados (navegadores muy viejos) no hay con quién coordinar: siempre se concede.
 */
export function tomarCandado(nombre: string): Promise<(() => void) | null> {
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(() => {});
  return new Promise((resolver) => {
    void navigator.locks.request(nombre, { ifAvailable: true }, (candado) => {
      if (!candado) {
        resolver(null);
        return undefined;
      }
      // El candado se conserva mientras esta promesa esté pendiente: se suelta al llamar a `soltar` o al cerrar la pestaña.
      return new Promise<void>((soltar) => resolver(() => soltar()));
    });
  });
}

/** Cuánto espacio queda para guardar la grabación en este dispositivo (null si el navegador no lo dice). */
export async function espacioLibreEnDispositivo(): Promise<number | null> {
  try {
    const { quota, usage } = (await navigator.storage?.estimate?.()) ?? {};
    return typeof quota === "number" && typeof usage === "number" ? Math.max(0, quota - usage) : null;
  } catch {
    return null;
  }
}

/** Por debajo de esto se avisa: una hora de reunión pesa unos 15 MB, pero el navegador también guarda otras cosas. */
export const ESPACIO_BAJO_BYTES = 300 * 1024 * 1024;

/** Pide que el navegador no borre lo guardado cuando falte espacio (no siempre lo concede). */
export function pedirAlmacenamientoPersistente(): void {
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* sin API */
  }
}
