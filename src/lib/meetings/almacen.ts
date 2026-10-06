/**
 * Archivos de Reuniones en Vercel Blob (privado).
 *
 * Todo cuelga de `meetings/{id}/`: originales, partes en vivo, audio normalizado
 * y transcripción. Borrar una reunión es borrar ese prefijo. (M4 amplía este
 * módulo con lectura por rango y subida en flujo.)
 */

export const PREFIJO_REUNIONES = "meetings/";

/** Las ids de reunión son cuid (o `reunion-demo-001`): letras, números, guion y guion bajo. */
const ID_REUNION = /^[A-Za-z0-9_-]{8,64}$/;
/** Un prefijo borrable es EXACTAMENTE `meetings/<id>/`. */
const PREFIJO_BORRABLE = /^meetings\/[A-Za-z0-9_-]{8,64}\/$/;

export function prefijoDeReunion(meetingId: string): string {
  if (!ID_REUNION.test(meetingId)) throw new Error("Identificador de reunión no válido.");
  return `${PREFIJO_REUNIONES}${meetingId}/`;
}

/**
 * Borra todos los blobs bajo un prefijo y devuelve cuántos. Solo acepta
 * `meetings/<id>/`: un prefijo vacío o demasiado corto vaciaría el almacenamiento
 * entero (incluidos los documentos de otros módulos).
 */
export async function borrarPrefijo(prefijo: string): Promise<number> {
  if (!PREFIJO_BORRABLE.test(prefijo)) {
    throw new Error(`Prefijo de borrado no permitido: «${prefijo.slice(0, 40)}».`);
  }
  const { list, del } = await import("@vercel/blob");
  let borrados = 0;
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix: prefijo, cursor, limit: 1000 });
    if (pagina.blobs.length > 0) {
      await del(pagina.blobs.map((b) => b.url));
      borrados += pagina.blobs.length;
    }
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);
  return borrados;
}

/** Borra los archivos de una reunión (originales, partes en vivo, audio y transcripción). */
export function borrarArchivosDeReunion(meetingId: string): Promise<number> {
  return borrarPrefijo(prefijoDeReunion(meetingId));
}

/* ════════════════════════════════════════════════════════════════════
   Rutas de los originales subidos
   ════════════════════════════════════════════════════════════════════ */

/**
 * Nombre apto para una ruta de Blob: sin tildes, sin espacios ni símbolos, con su
 * extensión, de hasta 120 caracteres. «Reunión consejo (1).m4a» → «Reunion-consejo-1.m4a».
 */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+\./g, ".") // «1-.m4a» → «1.m4a»
    .replace(/\.-+/g, ".")
    .replace(/\.{2,}/g, ".") // sin «..»: esRutaDeFuente lo rechaza
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!limpio) return "grabacion";
  if (limpio.length <= 120) return limpio;
  // Recorta el cuerpo, no la extensión.
  const punto = limpio.lastIndexOf(".");
  const ext = punto > 0 && limpio.length - punto <= 10 ? limpio.slice(punto) : "";
  return limpio.slice(0, 120 - ext.length) + ext;
}

/** `meetings/<id>/fuentes/<aleatorio de 8>-<nombre seguro>` */
export function rutaDeFuente(meetingId: string, nombre: string, aleatorio: string): string {
  if (!/^[a-z0-9]{8}$/.test(aleatorio)) throw new Error("Sufijo de ruta no válido.");
  return `${prefijoDeReunion(meetingId)}fuentes/${aleatorio}-${nombreSeguro(nombre)}`;
}

/**
 * ¿Es esta ruta un original de ESTA reunión? El cliente puede mandar una ruta al
 * reanudar una subida: solo se acepta con la forma exacta que genera `rutaDeFuente`
 * (nunca otra carpeta, ni otra reunión, ni `..`).
 */
export function esRutaDeFuente(meetingId: string, pathname: unknown): pathname is string {
  if (typeof pathname !== "string" || !ID_REUNION.test(meetingId)) return false;
  const base = `${PREFIJO_REUNIONES}${meetingId}/fuentes/`;
  if (!pathname.startsWith(base)) return false;
  return /^[a-z0-9]{8}-[A-Za-z0-9._-]{1,120}$/.test(pathname.slice(base.length)) && !pathname.includes("..");
}

/**
 * `meetings/<id>/vivo/<sesión>/<seq>.<ext>`: una parte de la grabadora. La ruta es SIEMPRE la misma para la
 * misma parte, así reenviarla (la respuesta se perdió) la sobrescribe en vez de duplicarla.
 */
export function rutaDeParteViva(meetingId: string, session: number, seq: number, ext: "webm" | "mp4" | "ogg"): string {
  if (!Number.isInteger(session) || session < 1 || !Number.isInteger(seq) || seq < 0) throw new Error("Parte no válida.");
  return `${prefijoDeReunion(meetingId)}vivo/${session}/${seq}.${ext}`;
}

/** Sufijo aleatorio de 8 caracteres [a-z0-9] para una ruta nueva. */
export function sufijoAleatorio(): string {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/** ¿Esta URL de Blob corresponde a esta ruta? (la URL lleva la ruta tras el dominio) */
export function urlCorrespondeARuta(url: string, pathname: string): boolean {
  try {
    return decodeURIComponent(new URL(url).pathname) === `/${pathname}`;
  } catch {
    return false;
  }
}

/* ════════════════════════════════════════════════════════════════════
   La interfaz que usa el procesamiento
   ════════════════════════════════════════════════════════════════════ */

/** Un rango de bytes; `hasta` es inclusive y, si falta, llega al final. */
export type RangoBytes = { desde: number; hasta?: number };

export type LecturaAlmacen = {
  flujo: ReadableStream<Uint8Array>;
  /** Primer y último byte que trae este flujo (inclusive) dentro del archivo. */
  desde: number;
  hasta: number;
  /** Tamaño total del archivo. */
  total: number;
};

export type ObjetoAlmacen = { url: string; pathname: string; size: number };

export class ErrorAlmacen extends Error {
  readonly tipo: "no_encontrado" | "transitorio" | "fatal";
  constructor(mensaje: string, tipo: "no_encontrado" | "transitorio" | "fatal") {
    super(mensaje);
    this.name = "ErrorAlmacen";
    this.tipo = tipo;
  }
}

/**
 * Dónde viven los archivos del procesamiento. En producción es Vercel Blob privado (`almacen-blob.ts`); en las
 * pruebas, una carpeta (`almacen-local.ts`): el resto del código no sabe la diferencia.
 */
export interface Almacen {
  /** Sube un cuerpo en memoria. Sobrescribe si ya existe (así un reintento no duplica nada). */
  subir(pathname: string, cuerpo: Uint8Array, contentType: string): Promise<{ url: string; pathname: string }>;
  /** Sube un flujo sin tenerlo entero en memoria (multipart en el servidor). Sobrescribe. */
  subirFlujo(pathname: string, flujo: ReadableStream<Uint8Array>, contentType: string): Promise<{ url: string; pathname: string }>;
  /** Lee un archivo, entero o por rango de bytes. */
  leer(url: string, opciones?: { rango?: RangoBytes; senal?: AbortSignal }): Promise<LecturaAlmacen>;
  tamano(url: string): Promise<number>;
  listar(prefijo: string): Promise<ObjetoAlmacen[]>;
  borrar(urls: string[]): Promise<void>;
}

/** Lee un archivo del almacén entero en memoria (solo para cosas chicas: un tramo de audio, una muestra). */
export async function leerTodo(almacen: Almacen, url: string, rango?: RangoBytes): Promise<Uint8Array> {
  const { flujo } = await almacen.leer(url, rango ? { rango } : undefined);
  const lector = flujo.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    total += value.byteLength;
  }
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) {
    salida.set(t, pos);
    pos += t.byteLength;
  }
  return salida;
}

/** Un flujo que entrega, una tras otra, lo que dan varias lecturas (concatenar archivos sin pasarlos a memoria). */
export function concatenarFlujos(
  fuentes: Array<() => Promise<ReadableStream<Uint8Array>>>,
  senal?: AbortSignal,
  /** Cuántas fuentes se piden por adelantado mientras se consume la actual (la espera de cada lectura se solapa). */
  adelantar = 1,
): ReadableStream<Uint8Array> {
  let siguiente = 0; // la próxima fuente que se va a pedir
  const pedidas: Array<Promise<ReadableStream<Uint8Array>>> = [];
  let consumida = 0; // cuántas se han empezado a consumir
  let lector: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const pedirHasta = (tope: number) => {
    while (siguiente < fuentes.length && siguiente < tope) {
      const p = fuentes[siguiente++]();
      p.catch(() => {}); // el error se ve cuando le toque su turno, no como rechazo suelto
      pedidas.push(p);
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(control) {
      for (;;) {
        if (senal?.aborted) {
          control.error(new Error("Cancelado"));
          return;
        }
        if (!lector) {
          if (consumida >= fuentes.length) {
            control.close();
            return;
          }
          pedirHasta(consumida + Math.max(1, adelantar));
          lector = (await pedidas[consumida++]).getReader();
        }
        const { done, value } = await lector.read();
        if (done) {
          lector = null;
          continue;
        }
        control.enqueue(value);
        return;
      }
    },
    async cancel(motivo) {
      await lector?.cancel(motivo).catch(() => {});
      // Las que se pidieron por adelantado y no se usaron se cancelan.
      for (const p of pedidas.slice(consumida)) void p.then((f) => f.cancel(motivo)).catch(() => {});
    },
  });
}

/** Un flujo (web) que cuenta cuántos bytes pasaron: para comprobar que lo subido es lo esperado. */
export function contarBytes(flujo: ReadableStream<Uint8Array>): { flujo: ReadableStream<Uint8Array>; bytes: () => number } {
  let n = 0;
  const lector = flujo.getReader();
  return {
    bytes: () => n,
    flujo: new ReadableStream<Uint8Array>({
      async pull(control) {
        const { done, value } = await lector.read();
        if (done) return control.close();
        n += value.byteLength;
        control.enqueue(value);
      },
      cancel: (motivo) => lector.cancel(motivo),
    }),
  };
}
