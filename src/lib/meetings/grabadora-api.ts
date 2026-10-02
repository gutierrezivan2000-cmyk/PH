/**
 * Las llamadas reales de la grabadora a nuestro servidor, y — lo importante — CLASIFICAR cada fallo para que el
 * motor (grabadora.ts) sepa qué hacer: un corte de red o un error del servidor se reintenta sin límite; un
 * rechazo definitivo (sesión terminada, reunión cerrada, falta la constancia del aviso) se muestra sin
 * insistir. El audio nunca se pierde por eso: sigue en el dispositivo.
 */
import { ErrorGrabacion, type ApiGrabacion, type RespuestaCierre } from "./grabadora";

type Respuesta = { status: number; json: Record<string, unknown> | null };

const esAborto = (e: unknown) => (e as { name?: unknown } | null)?.name === "AbortError";
const errorDeAborto = () => new DOMException("Aborted", "AbortError");

/** Una parte de ~30 s (≤ 2 MB) debería subir en segundos; pasado esto, la conexión no sirve y se reintenta. */
const TIEMPO_MAXIMO_MS = 90_000;

const mensajeDe = (json: Record<string, unknown> | null, porDefecto: string) =>
  typeof json?.error === "string" && json.error ? json.error : porDefecto;

/** Un 5xx, un 429 y un 408 son del momento; cualquier otro error es una respuesta definitiva. */
const pasajero = (status: number) => status >= 500 || status === 429 || status === 408;

const MENSAJE_SESION = "Tu sesión terminó. Vuelve a iniciar sesión en otra pestaña y pulsa «Reintentar»: lo grabado sigue en este dispositivo.";

/** Un fallo que no es un éxito, ya como el error que entiende el motor. */
export function errorDeRespuesta(r: Respuesta, porDefecto: string): ErrorGrabacion {
  if (r.status === 401) return new ErrorGrabacion(MENSAJE_SESION, "fatal");
  return new ErrorGrabacion(mensajeDe(r.json, porDefecto), pasajero(r.status) ? "transitorio" : "fatal");
}

type Fetch = typeof fetch;

export function crearApiGrabacion(meetingId: string, fetchFn: Fetch = (...a) => fetch(...a)): ApiGrabacion {
  const base = `/api/meetings/${encodeURIComponent(meetingId)}`;

  async function llamar(url: string, init: RequestInit, senal: AbortSignal): Promise<Respuesta> {
    const control = new AbortController();
    let vencio = false;
    const alAbortar = () => control.abort();
    if (senal.aborted) throw errorDeAborto();
    senal.addEventListener("abort", alAbortar, { once: true });
    const temporizador = setTimeout(() => {
      vencio = true;
      control.abort();
    }, TIEMPO_MAXIMO_MS);
    try {
      const res = await fetchFn(url, { ...init, signal: control.signal });
      let json: Record<string, unknown> | null = null;
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        /* sin cuerpo JSON */
      }
      return { status: res.status, json };
    } catch (e) {
      if (senal.aborted) throw errorDeAborto();
      if (vencio) throw new ErrorGrabacion("La conexión es demasiado lenta.", "transitorio");
      if (esAborto(e)) throw errorDeAborto();
      throw new ErrorGrabacion("No hay conexión con el servidor.", "transitorio");
    } finally {
      clearTimeout(temporizador);
      senal.removeEventListener("abort", alAbortar);
    }
  }

  const json = (cuerpo: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

  return {
    async nuevaSesion() {
      // Sin tope de espera propio: el motor ya lo acota (si tarda, empieza con un número local).
      const r = await llamar(`${base}/live/sesion`, { method: "POST" }, new AbortController().signal);
      const session = r.json?.session;
      const offsetMs = r.json?.offsetMs;
      if (r.status === 200 && typeof session === "number" && typeof offsetMs === "number") return { session, offsetMs };
      throw errorDeRespuesta(r, "No pudimos preparar la grabación.");
    },

    async subirParte({ session, seq, durMs, mime, cuerpo }, senal) {
      const r = await llamar(
        `${base}/live`,
        {
          method: "POST",
          headers: { "Content-Type": mime, "X-Sesion": String(session), "X-Secuencia": String(seq), "X-Duracion-Ms": String(Math.max(1, Math.round(durMs))) },
          body: cuerpo,
        },
        senal,
      );
      if (r.status === 200) return;
      throw errorDeRespuesta(r, "No pudimos guardar la grabación en el servidor.");
    },

    async marcar(datos, senal) {
      const r = await llamar(`${base}/markers`, json(datos), senal);
      if (r.status === 200 || r.status === 201) return;
      throw errorDeRespuesta(r, "No pudimos guardar la marca.");
    },

    async cerrar({ sesiones }, senal): Promise<RespuestaCierre> {
      const r = await llamar(`${base}/process`, json({ sesiones }), senal);
      if (r.status === 200 && typeof r.json?.status === "string") return { ok: true, status: r.json.status };
      if (r.status === 409 && Array.isArray(r.json?.faltan)) {
        const faltan = (r.json.faltan as unknown[]).flatMap((f) => {
          const x = f as { session?: unknown; seq?: unknown } | null;
          return x && typeof x.session === "number" && typeof x.seq === "number" ? [{ session: x.session, seq: x.seq }] : [];
        });
        if (faltan.length > 0) return { ok: false, faltan };
      }
      throw errorDeRespuesta(r, "No pudimos enviar la reunión a transcribir.");
    },
  };
}
