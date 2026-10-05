/**
 * Lo que el visor tiene cargado de la transcripción (puro: se prueba sin React).
 *
 * La transcripción llega en páginas de 30 min que se pegan una tras otra sin huecos. Al abrir se carga desde el principio,
 * pero un salto a un minuto lejano (una decisión del resumen, un resultado de la búsqueda) carga SOLO la página donde cae:
 * lo cargado es siempre una tira continua `[inicioMs, siguienteMs)` y se puede ampliar hacia atrás o hacia adelante.
 */
import type { IntervencionDTO } from "../dto";
import { PAGINA_MS } from "./paginas";

export type Ventana = {
  /** Ordenadas por minuto (el orden del servidor). */
  items: IntervencionDTO[];
  /** Dónde empieza lo cargado (0: desde el principio de la reunión). */
  inicioMs: number;
  /** Desde dónde pedir lo que sigue; null: se cargó hasta el final. */
  siguienteMs: number | null;
};

/** El principio de la página de 30 min donde cae `ms`. */
export const inicioDePagina = (ms: number): number => Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / PAGINA_MS) * PAGINA_MS;

/** Una ventana nueva con una sola página (lo que se pidió desde `desdeMs`). */
export const ventanaDePagina = (pagina: { items: IntervencionDTO[]; siguienteMs: number | null }, desdeMs: number): Ventana => ({
  items: [...pagina.items],
  inicioMs: Math.max(0, desdeMs),
  siguienteMs: pagina.siguienteMs,
});

/** ¿Ya está cargado el minuto `ms`? (Con una ventana sin intervenciones, no: no hay nada que enseñar.) */
export function estaCargado(v: Ventana, ms: number): boolean {
  return v.items.length > 0 && ms >= v.inicioMs && (v.siguienteMs === null || ms < v.siguienteMs);
}

/** Lo que hay antes de lo cargado: desde dónde pedirlo (null: ya se cargó desde el principio). */
export const anteriorDe = (v: Ventana): number | null => (v.inicioMs > 0 ? Math.max(0, v.inicioMs - PAGINA_MS) : null);

/** Agrega la página que sigue (la que se pidió desde `v.siguienteMs`). No repite lo que ya estaba. */
export function agregarDespues(v: Ventana, pagina: { items: IntervencionDTO[]; siguienteMs: number | null }): Ventana {
  const vistos = new Set(v.items.map((i) => i.id));
  return { ...v, items: [...v.items, ...pagina.items.filter((i) => !vistos.has(i.id))], siguienteMs: pagina.siguienteMs };
}

/** Agrega la página anterior (la que empieza en `desdeMs`, que pasa a ser el nuevo principio). No repite lo que ya estaba. */
export function agregarAntes(v: Ventana, items: readonly IntervencionDTO[], desdeMs: number): Ventana {
  const vistos = new Set(v.items.map((i) => i.id));
  return { ...v, items: [...items.filter((i) => !vistos.has(i.id)), ...v.items], inicioMs: Math.max(0, Math.min(desdeMs, v.inicioMs)) };
}
