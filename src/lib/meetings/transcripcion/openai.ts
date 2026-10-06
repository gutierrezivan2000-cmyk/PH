/**
 * Proveedor de transcripción por defecto: OpenAI `gpt-4o-transcribe-diarize`, que separa a los hablantes.
 *
 * Una llamada por tramo (~11 min de audio, ~2,6 MB). Con `diarized_json` devuelve segmentos `{ start, end, speaker,
 * text }` (segundos); sin voces conocidas etiqueta «A», «B»…, y con `known_speaker_names` + `known_speaker_references`
 * pone el nombre conocido a quien reconoce. Este modelo NO admite `prompt`, `temperature`, `timestamp_granularities`
 * ni `include`, y exige `chunking_strategy` en audios de más de 30 s.
 *
 * Los reintentos los hace la cola (con espera creciente), no el SDK: `maxRetries: 0`.
 */
import { MP3_BYTES_POR_MS, SOLAPE_MS, TRAMO_MS } from "../tipos";
import { ErrorTranscripcion, type OpcionesDeTramo, type ProveedorDeTranscripcion, type Segmento, type VozDeReferencia } from "./tipos";

export const MODELO_TRANSCRIPCION = "gpt-4o-transcribe-diarize";
/** Precio aproximado por minuto de audio (verificar en la página de precios de OpenAI). Solo alimenta el registro de costos. */
export const COSTO_USD_POR_MINUTO = 0.006;
/** Menos de esto no se manda: el servicio rechaza audios de menos de 0,1 s y un recorte tan corto no tiene palabras. */
export const DURACION_MINIMA_MS = 1_000;

type Cuerpo = Record<string, unknown>;
type OpcionesDeLlamada = { timeout: number; signal?: AbortSignal; maxRetries: number };
export type CrearTranscripcion = (cuerpo: Cuerpo, opciones: OpcionesDeLlamada) => Promise<unknown>;

const comoObjeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** `data:audio/mpeg;base64,…`: así se mandan las muestras de las voces conocidas. */
export function aDataUrl(audio: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength).toString("base64")}`;
}

/** El cuerpo de la petición. Exportado para probar que se manda exactamente lo que el servicio pide. */
export function armarCuerpo(audio: Uint8Array, referencias: readonly VozDeReferencia[]): Cuerpo {
  const cuerpo: Cuerpo = {
    model: MODELO_TRANSCRIPCION,
    file: new File([audio as BlobPart], "tramo.mp3", { type: "audio/mpeg" }),
    response_format: "diarized_json",
    chunking_strategy: "auto",
    language: "es",
  };
  if (referencias.length > 0) {
    cuerpo.known_speaker_names = referencias.map((r) => r.nombre);
    cuerpo.known_speaker_references = referencias.map((r) => aDataUrl(r.audio, r.mime));
  }
  return cuerpo;
}

/**
 * Lee la respuesta `diarized_json`. Sin segmentos y sin texto es un tramo en silencio (válido); si trae texto pero no
 * segmentos, no sirve (no hay a quién ni cuándo atribuirlo).
 */
export function leerRespuesta(json: unknown): Segmento[] {
  const r = comoObjeto(json);
  if (!Array.isArray(r.segments)) {
    if (typeof r.text === "string" && r.text.trim() === "") return [];
    throw new ErrorTranscripcion("El servicio de transcripción respondió sin la separación por hablantes. Se vuelve a intentar.", { reintentable: true });
  }
  return r.segments.flatMap((s): Segmento[] => {
    const x = comoObjeto(s);
    if (typeof x.start !== "number" || typeof x.end !== "number" || !Number.isFinite(x.start) || !Number.isFinite(x.end)) return [];
    const texto = typeof x.text === "string" ? x.text.trim() : "";
    if (!texto) return [];
    const hablante = typeof x.speaker === "string" && x.speaker.trim() ? x.speaker.trim() : "?";
    return [{ inicioMs: Math.round(x.start * 1000), finMs: Math.round(Math.max(x.end, x.start) * 1000), hablante, texto }];
  });
}

/** El servicio rechazó lo que se le mandó (no la cuenta ni el modelo): un 400, 413, 415 o 422. */
const esRechazoDeLoEnviado = (e: unknown): boolean => {
  const status = (e as { status?: unknown } | null)?.status;
  return status === 400 || status === 413 || status === 415 || status === 422;
};

/** Qué hacer con un fallo de la llamada: reintentar (red, saturación, caída) o no (audio, clave o cuenta). */
export function aErrorTranscripcion(e: unknown): ErrorTranscripcion {
  if (e instanceof ErrorTranscripcion) return e;
  const x = comoObjeto(e);
  const status = typeof x.status === "number" ? x.status : null;
  const code = typeof x.code === "string" ? x.code : "";
  const detalle = typeof x.message === "string" ? x.message.slice(0, 200) : "";

  if (status === 429 && code === "insufficient_quota") {
    return new ErrorTranscripcion("No pudimos transcribir: el servicio de transcripción no tiene saldo disponible. Avisa a soporte.", { reintentable: false });
  }
  if (status === 401 || status === 403) {
    return new ErrorTranscripcion("No pudimos transcribir: el servicio de transcripción no aceptó las credenciales. Avisa a soporte.", { reintentable: false });
  }
  if (status === 404) {
    return new ErrorTranscripcion("No pudimos transcribir: el modelo de transcripción no está disponible para esta cuenta. Avisa a soporte.", { reintentable: false });
  }
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429) {
    return new ErrorTranscripcion(`El servicio de transcripción rechazó este tramo de audio${detalle ? ` (${detalle})` : ""}.`, { reintentable: false });
  }
  // Sin respuesta (red, tiempo agotado), 408, 409, 429 por límite de uso, 5xx y lo que no se reconoce: se reintenta.
  return new ErrorTranscripcion(
    status === 429 ? "El servicio de transcripción está saturado. Se vuelve a intentar." : `El servicio de transcripción no respondió${detalle ? `: ${detalle}` : ""}.`,
    { reintentable: true },
  );
}

/** La llamada de verdad, con el SDK. El cliente se crea la primera vez y se reutiliza. */
function crearConSdk(apiKey: string): CrearTranscripcion {
  let cliente: Promise<{ audio: { transcriptions: { create: (cuerpo: never, opciones: never) => Promise<unknown> } } }> | null = null;
  return async (cuerpo, opciones) => {
    cliente ??= import("openai").then(({ default: OpenAI }) => new OpenAI({ apiKey }) as never);
    return (await cliente).audio.transcriptions.create(cuerpo as never, opciones as never);
  };
}

export type OpcionesProveedorOpenAI = {
  apiKey?: string;
  /** Para pruebas: reemplaza la llamada de red. */
  crear?: CrearTranscripcion;
};

export function crearProveedorOpenAI({ apiKey, crear }: OpcionesProveedorOpenAI = {}): ProveedorDeTranscripcion {
  return {
    nombre: "openai",
    modo: "tramos",
    tramoMs: TRAMO_MS,
    solapeMs: SOLAPE_MS,
    costoUsdPorMinuto: COSTO_USD_POR_MINUTO,
    async transcribirTramo(audio: Uint8Array, { referencias, timeoutMs, senal }: OpcionesDeTramo): Promise<Segmento[]> {
      if (audio.byteLength < DURACION_MINIMA_MS * MP3_BYTES_POR_MS) return []; // menos de 1 s de audio: no hay nada que transcribir
      const llamar = crear ?? (apiKey ? crearConSdk(apiKey) : null);
      if (!llamar) throw new ErrorTranscripcion("No pudimos transcribir: el servicio de transcripción no está configurado. Avisa a soporte.", { reintentable: false });
      const opcionesDeLlamada = { timeout: timeoutMs, signal: senal, maxRetries: 0 };
      const voces = referencias.slice(0, 4);
      try {
        return leerRespuesta(await llamar(armarCuerpo(audio, voces), opcionesDeLlamada));
      } catch (e) {
        // Si lo que rechazó el servicio pudo ser una muestra de voz (formato, duración), se transcribe igual SIN voces
        // conocidas: la unión empareja a los hablantes por el solape y, en el peor caso, una voz recibe otra etiqueta
        // (el usuario puede fusionarlas). Mejor eso que dejar la reunión en error por una muestra.
        if (voces.length > 0 && esRechazoDeLoEnviado(e)) {
          console.warn("[meetings/transcripcion] el servicio rechazó las voces de referencia; se transcribe el tramo sin ellas:", (e as Error).message?.slice(0, 200));
          try {
            return leerRespuesta(await llamar(armarCuerpo(audio, []), opcionesDeLlamada));
          } catch (e2) {
            throw aErrorTranscripcion(e2);
          }
        }
        throw aErrorTranscripcion(e);
      }
    },
  };
}
