/**
 * Una reunión inventada y un «proveedor» que la transcribe como lo haría uno real, SOLO para pruebas.
 *
 * Hay un guion con la verdad (quién dijo qué y cuándo, con frases que cruzan cada borde de tramo) y un audio falso en
 * el que el byte de cada milisegundo dice quién habla. El proveedor sintético «oye» ese audio: corta lo que le piden,
 * recorta las frases que quedan a medias en los extremos, etiqueta a cada voz a su manera («A», «B»… distintas en cada
 * llamada) y reconoce por su nombre a las voces de referencia que le manden. Así se prueba todo el recorrido (tramos,
 * voces, unión) sin una sola llamada de red y sabiendo cuál debe ser el resultado exacto.
 */
import { MP3_BYTES_POR_MS, MP3_TRAMA_BYTES, MP3_TRAMA_MS, SOLAPE_MS, TRAMO_MS } from "../tipos";
import type { OpcionesDeTramo, ProveedorDeTranscripcion, Segmento } from "./tipos";

export type Intervencion = { inicioMs: number; finMs: number; quien: string; texto: string };

/** Un generador pseudoaleatorio con semilla: las pruebas son reproducibles. */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOCABULARIO = [
  "cartera", "recaudo", "ascensor", "contrato", "presupuesto", "vigilancia", "cámaras", "asamblea", "propietarios", "mantenimiento",
  "cuota", "administración", "consejo", "proveedor", "cotización", "garantía", "reglamento", "convocatoria", "votación", "aprobado",
  "informe", "revisor", "fiscal", "mora", "unidades", "parqueadero", "salón", "social", "tarifa", "seguro", "piscina", "gimnasio",
  "portería", "zonas", "comunes", "fachada", "pintura", "tanque", "bomba", "citófono", "acta", "orden", "día", "quórum", "pendiente",
];

export type OpcionesGuion = {
  duracionMs: number;
  personas: readonly string[];
  /** Cuánto habla cada una respecto de las demás (por omisión, las primeras hablan más). */
  pesos?: readonly number[];
  semilla?: number;
  /** Rangos donde nadie habla (un receso). */
  silencios?: ReadonlyArray<readonly [number, number]>;
  tramoMs?: number;
};

/**
 * Un guion de intervenciones seguidas (sin que dos personas se pisen), con una frase que cruza CADA borde de tramo y
 * huecos de más de un segundo entre una y otra (así ninguna se junta con la vecina al fusionar).
 */
export function generarGuion({ duracionMs, personas, pesos, semilla = 7, silencios = [], tramoMs = TRAMO_MS }: OpcionesGuion): Intervencion[] {
  const azar = mulberry32(semilla);
  const pesosEfectivos = personas.map((_, k) => pesos?.[k] ?? 1 / (k + 1));
  const sumaPesos = pesosEfectivos.reduce((s, p) => s + p, 0);
  const elegirPersona = () => {
    let x = azar() * sumaPesos;
    for (let k = 0; k < personas.length; k++) {
      x -= pesosEfectivos[k];
      if (x < 0) return personas[k];
    }
    return personas[personas.length - 1];
  };
  const guion: Intervencion[] = [];
  const bordes: number[] = [];
  for (let b = tramoMs; b < duracionMs - 15_000; b += tramoMs) bordes.push(b);
  const cruces = bordes.map((b, k) => ({ inicioMs: b - 8_000 - (k % 3) * 3_000, finMs: b + 9_000 + (k % 2) * 4_000 }));

  const frase = (n: number, quien: string, palabras: number) => {
    const p = Array.from({ length: palabras }, () => VOCABULARIO[Math.floor(azar() * VOCABULARIO.length)]);
    return `Frase ${n} de ${quien}: ${p.join(" ")}.`;
  };
  const enSilencio = (a: number, b: number) => silencios.find(([x, y]) => a < y && b > x);

  let t = 4_000;
  let n = 0;
  let cruce = 0;
  while (t < duracionMs - 6_000) {
    const hueco = 1_200 + Math.floor(azar() * 2_800);
    const proximo = cruces[cruce];
    const quien = elegirPersona();
    const dur = 3_000 + Math.floor(azar() * 14_000);

    if (proximo && t + dur + hueco > proximo.inicioMs) {
      // Toca la frase que cruza el borde.
      const q = personas[(cruce + 1) % personas.length];
      guion.push({ inicioMs: proximo.inicioMs, finMs: proximo.finMs, quien: q, texto: frase(++n, q, 22 + (cruce % 5)) });
      t = proximo.finMs + hueco;
      cruce++;
      continue;
    }
    if (t + dur > duracionMs - 500) break; // ninguna frase se pasa del final del audio
    const corte = enSilencio(t, t + dur);
    if (corte) {
      t = corte[1] + hueco;
      continue;
    }
    guion.push({ inicioMs: t, finMs: t + dur, quien, texto: frase(++n, quien, Math.max(3, Math.round(dur / 600))) });
    t += dur + hueco;
  }
  return guion;
}

/** Cuántos bytes mide el audio falso (múltiplo de trama, como un MP3 normalizado de verdad). */
export const bytesDeAudio = (duracionMs: number): number => Math.ceil(duracionMs / MP3_TRAMA_MS) * MP3_TRAMA_BYTES;

/**
 * El audio falso: cada milisegundo ocupa 4 bytes, como en el MP3 normalizado. Los dos primeros dicen quién habla (1
 * para la primera persona…; 0 si nadie) y los otros dos, qué intervención del guion es. Cortarlo con las mismas cuentas
 * que el audio de verdad da un trozo del que se puede reconstruir qué se oye, sin saber en qué minuto de la reunión cae.
 */
export function audioSintetico(guion: readonly Intervencion[], personas: readonly string[], duracionMs: number): Uint8Array {
  const audio = new Uint8Array(bytesDeAudio(duracionMs));
  guion.forEach((g, k) => {
    const marca = personas.indexOf(g.quien) + 1;
    const numero = k + 1;
    for (let ms = Math.max(0, g.inicioMs); ms < Math.min(duracionMs, g.finMs); ms++) {
      const b = ms * MP3_BYTES_POR_MS;
      audio[b] = marca;
      audio[b + 1] = numero >> 8;
      audio[b + 2] = numero & 255;
    }
  });
  return audio;
}

/** De quién es la voz de un trozo del audio falso: el valor que más se repite (ignorando el silencio). */
export function personaDeAudio(audio: Uint8Array, personas: readonly string[]): string | null {
  const cuenta = new Map<number, number>();
  for (let i = 0; i < audio.length; i += 16) if (audio[i] > 0) cuenta.set(audio[i], (cuenta.get(audio[i]) ?? 0) + 1);
  let mejor = 0;
  let veces = 0;
  for (const [valor, n] of cuenta) {
    if (n > veces) {
      mejor = valor;
      veces = n;
    }
  }
  return mejor > 0 ? (personas[mejor - 1] ?? null) : null;
}

const letra = (k: number) => String.fromCharCode(65 + (k % 26)) + (k >= 26 ? String(Math.floor(k / 26)) : "");

export type LlamadaRegistrada = { desdeMs: number; duracionMs: number; referencias: string[] };

export type ProveedorSintetico = ProveedorDeTranscripcion & { llamadas: LlamadaRegistrada[] };

export type OpcionesProveedorSintetico = {
  guion: readonly Intervencion[];
  personas: readonly string[];
  tramoMs?: number;
  solapeMs?: number;
  /** Parte las frases largas en dos, y distinto en cada tramo (como haría un proveedor real). */
  partirFrases?: boolean;
  /** Para probar fallos: se llama antes de transcribir y puede lanzar. */
  alLlamar?: (llamada: LlamadaRegistrada) => void | Promise<void>;
};

/**
 * Las palabras de una frase que caen entre dos fracciones (0..1) de su duración: lo que se oye de ella cuando el audio
 * la corta o cuando el proveedor la parte. Dos trozos seguidos se reparten las palabras sin repetir ninguna.
 */
function recortarTexto(texto: string, desde: number, hasta: number): string {
  const palabras = texto.split(" ");
  const a = Math.min(palabras.length - 1, Math.round(desde * palabras.length));
  const b = Math.round(hasta * palabras.length);
  return palabras.slice(a, Math.max(a + 1, b)).join(" ");
}

export function crearProveedorSintetico(o: OpcionesProveedorSintetico): ProveedorSintetico {
  const llamadas: LlamadaRegistrada[] = [];
  return {
    nombre: "demo",
    modo: "tramos",
    tramoMs: o.tramoMs ?? TRAMO_MS,
    solapeMs: o.solapeMs ?? SOLAPE_MS,
    costoUsdPorMinuto: 0.006,
    llamadas,
    async transcribirTramo(_audio: Uint8Array, { referencias, desdeMs, duracionMs }: OpcionesDeTramo): Promise<Segmento[]> {
      const registro = { desdeMs, duracionMs, referencias: referencias.map((r) => r.nombre) };
      llamadas.push(registro);
      await o.alLlamar?.(registro);

      const hasta = desdeMs + duracionMs;
      // A quién corresponde cada nombre conocido: el proveedor «oye» la muestra y la reconoce.
      const etiquetas = new Map<string, string>();
      for (const r of referencias) {
        const p = personaDeAudio(r.audio, o.personas);
        if (p) etiquetas.set(p, r.nombre);
      }
      let locales = 0;
      const etiquetaDe = (p: string) => {
        let e = etiquetas.get(p);
        if (!e) {
          e = letra(locales++);
          etiquetas.set(p, e);
        }
        return e;
      };

      const salida: Segmento[] = [];
      for (const g of o.guion) {
        if (g.finMs <= desdeMs || g.inicioMs >= hasta) continue;
        const a = Math.max(g.inicioMs, desdeMs);
        const b = Math.min(g.finMs, hasta);
        if (b - a < 400) continue; // un resto tan corto no se oye
        const total = g.finMs - g.inicioMs;
        const trozos: Array<[number, number]> = [[a, b]];
        if (o.partirFrases && total >= 8_000 && b - a >= 6_000) {
          const corte = a + (b - a) * (0.35 + 0.1 * (Math.floor(desdeMs / 60_000) % 4));
          trozos.splice(0, 1, [a, corte], [corte, b]);
        }
        const etiqueta = etiquetaDe(g.quien);
        for (const [x, y] of trozos) {
          salida.push({
            inicioMs: Math.round(x - desdeMs),
            finMs: Math.round(y - desdeMs),
            hablante: etiqueta,
            texto: recortarTexto(g.texto, (x - g.inicioMs) / total, (y - g.inicioMs) / total),
          });
        }
      }
      return salida;
    },
  };
}

export type LlamadaSimulada = { referencias: string[]; bytes: number };

/**
 * Imita a OpenAI `gpt-4o-transcribe-diarize` usando SOLO lo que recibe, como el servicio de verdad: el audio del
 * archivo y las muestras de las voces conocidas. Recorre el audio falso, reconstruye cada intervención (recortada si el
 * audio la corta en un extremo), reconoce por su nombre a quien coincide con una muestra y etiqueta al resto «A», «B»…
 * Devuelve la respuesta en el formato `diarized_json`. Sirve para probar `crearProveedorOpenAI` y los manejadores sin red.
 */
export function crearSimuladorDeOpenAI(guion: readonly Intervencion[], personas: readonly string[]) {
  const llamadas: LlamadaSimulada[] = [];
  const crear = async (cuerpo: Record<string, unknown>): Promise<unknown> => {
    const audio = new Uint8Array(await (cuerpo.file as File).arrayBuffer());
    const nombres = (cuerpo.known_speaker_names as string[] | undefined) ?? [];
    const muestras = (cuerpo.known_speaker_references as string[] | undefined) ?? [];
    llamadas.push({ referencias: nombres, bytes: audio.length });

    const etiquetas = new Map<string, string>();
    muestras.forEach((url, k) => {
      const persona = personaDeAudio(new Uint8Array(Buffer.from(url.slice(url.indexOf(",") + 1), "base64")), personas);
      if (persona) etiquetas.set(persona, nombres[k]);
    });
    let locales = 0;
    const etiquetaDe = (persona: string) => {
      let e = etiquetas.get(persona);
      if (!e) {
        e = letra(locales++);
        etiquetas.set(persona, e);
      }
      return e;
    };

    const total = Math.floor(audio.length / MP3_BYTES_POR_MS);
    const numeroEn = (ms: number) => (audio[ms * MP3_BYTES_POR_MS + 1] << 8) | audio[ms * MP3_BYTES_POR_MS + 2];
    const segments: Array<{ id: string; start: number; end: number; speaker: string; text: string }> = [];
    let ms = 0;
    while (ms < total) {
      const numero = numeroEn(ms);
      if (audio[ms * MP3_BYTES_POR_MS] === 0) {
        ms++;
        continue;
      }
      let fin = ms + 1;
      while (fin < total && audio[fin * MP3_BYTES_POR_MS] > 0 && numeroEn(fin) === numero) fin++;
      const g = guion[numero - 1];
      const completa = g.finMs - g.inicioMs;
      const oido = fin - ms;
      const alPrincipio = ms === 0 && oido < completa;
      const alFinal = fin === total && oido < completa;
      const desde = alPrincipio && !alFinal ? 1 - oido / completa : 0;
      const hasta = alFinal && !alPrincipio ? oido / completa : 1;
      segments.push({ id: `seg_${segments.length}`, start: ms / 1000, end: fin / 1000, speaker: etiquetaDe(g.quien), text: recortarTexto(g.texto, desde, hasta) });
      ms = fin;
    }
    return { duration: total / 1000, task: "transcribe", text: segments.map((x) => x.text).join(" "), segments };
  };
  return { crear, llamadas };
}
