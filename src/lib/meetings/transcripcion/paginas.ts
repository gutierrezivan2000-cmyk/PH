/**
 * Cómo se pide y se entrega la transcripción por páginas (puro: lo usan la ruta, el demo y las pruebas).
 *
 * Una reunión de 8 h tiene miles de intervenciones: la pantalla las pide por bloques de 30 minutos. Sin búsqueda, una
 * página son las intervenciones que EMPIEZAN en `[desde, hasta)`. Con búsqueda (`q`) se recorre toda la reunión desde
 * `desde` y se devuelven hasta 200 coincidencias; `siguienteMs` dice desde dónde seguir.
 */
import type { IntervencionDTO, PaginaDeIntervenciones } from "../dto";
import { MAX_MS_REUNION } from "../tipos";

export const PAGINA_MS = 30 * 60_000;
export const MAX_COINCIDENCIAS = 200;
export const MAX_LARGO_BUSQUEDA = 100;
const MAX_TERMINOS = 8;

export type ConsultaDeIntervenciones = {
  desdeMs: number;
  /** Sin búsqueda siempre hay un final (a lo sumo 30 min después de `desdeMs`); con búsqueda puede no haberlo. */
  hastaMs: number | null;
  q: string;
};

const entero = (v: string | null): number | null => (v !== null && /^\d{1,10}$/.test(v) ? Number(v) : null);

export function leerConsulta(params: URLSearchParams): { ok: true; valor: ConsultaDeIntervenciones } | { ok: false; error: string } {
  const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length > MAX_LARGO_BUSQUEDA) return { ok: false, error: `La búsqueda es demasiado larga (máximo ${MAX_LARGO_BUSQUEDA} caracteres).` };

  const brutoDesde = params.get("desde");
  const desdeMs = brutoDesde === null || brutoDesde === "" ? 0 : entero(brutoDesde);
  if (desdeMs === null || desdeMs > MAX_MS_REUNION) return { ok: false, error: "El minuto de inicio («desde») no es válido." };

  const brutoHasta = params.get("hasta");
  let hastaMs: number | null = null;
  if (brutoHasta !== null && brutoHasta !== "") {
    hastaMs = entero(brutoHasta);
    if (hastaMs === null || hastaMs <= desdeMs || hastaMs > MAX_MS_REUNION) return { ok: false, error: "El minuto final («hasta») no es válido." };
  }
  // Sin búsqueda, una página nunca pasa de 30 min.
  if (!q) hastaMs = Math.min(hastaMs ?? desdeMs + PAGINA_MS, desdeMs + PAGINA_MS);
  return { ok: true, valor: { desdeMs, hastaMs, q } };
}

/* ════════════════════════════════════════════════════════════════════
   Búsqueda
   ════════════════════════════════════════════════════════════════════ */

/** Sin tildes ni mayúsculas: «Reunión» y «reunion» se encuentran. */
export const normalizarBusqueda = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Las palabras que hay que encontrar (todas, en cualquier orden). */
export function terminosDeBusqueda(q: string): string[] {
  return [...new Set(normalizarBusqueda(q).split(/\s+/).filter(Boolean))].slice(0, MAX_TERMINOS);
}

export function coincideConBusqueda(texto: string, terminos: readonly string[]): boolean {
  if (terminos.length === 0) return true;
  const t = normalizarBusqueda(texto);
  return terminos.every((x) => t.includes(x));
}

/* ════════════════════════════════════════════════════════════════════
   Páginas
   ════════════════════════════════════════════════════════════════════ */

/**
 * Desde dónde pedir la siguiente página sin búsqueda: el principio del bloque de 30 min donde empieza la próxima
 * intervención (se saltan los bloques vacíos, como un receso largo), nunca antes de donde terminó esta página.
 */
export const siguienteTrasPagina = (hastaMs: number, proximoInicioMs: number | null): number | null =>
  proximoInicioMs === null ? null : Math.max(hastaMs, Math.floor(proximoInicioMs / PAGINA_MS) * PAGINA_MS);

const porInicio = (a: IntervencionDTO, b: IntervencionDTO) => a.startMs - b.startMs;

/** Lo mismo que hace la ruta con la base de datos, sobre una lista en memoria (el demo). */
export function paginarEnMemoria(
  todas: readonly IntervencionDTO[],
  { desdeMs, hastaMs, q }: ConsultaDeIntervenciones,
): { items: IntervencionDTO[]; siguienteMs: number | null } {
  const ordenadas = [...todas].sort(porInicio);
  const enRango = ordenadas.filter((u) => u.startMs >= desdeMs && (hastaMs === null || u.startMs < hastaMs));

  if (q) {
    const terminos = terminosDeBusqueda(q);
    const coincidencias = enRango.filter((u) => coincideConBusqueda(u.text, terminos));
    return {
      items: coincidencias.slice(0, MAX_COINCIDENCIAS),
      siguienteMs: coincidencias.length > MAX_COINCIDENCIAS ? coincidencias[MAX_COINCIDENCIAS].startMs : null,
    };
  }
  const limite = hastaMs ?? desdeMs + PAGINA_MS;
  const proxima = ordenadas.find((u) => u.startMs >= limite);
  return { items: enRango, siguienteMs: siguienteTrasPagina(limite, proxima ? proxima.startMs : null) };
}

export const paginaVacia = (): PaginaDeIntervenciones => ({ items: [], nombres: {}, siguienteMs: null });
