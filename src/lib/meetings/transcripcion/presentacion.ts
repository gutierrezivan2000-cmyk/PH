/**
 * Cómo se muestra la transcripción en pantalla (puro: la línea de tiempo del visor se arma aquí y se prueba sin React).
 *
 * Las intervenciones llegan por páginas; las marcas de la grabación y los silencios largos se intercalan en su minuto, y
 * todo se agrupa por hora de la reunión. Solo se muestra lo que ya está dentro de lo cargado: un silencio que empieza
 * en un bloque que todavía no se pidió aparece cuando se pide ese bloque (o cuando el servidor dice que se saltó).
 */
import type { IntervencionDTO, MarcadorDTO, RangoMs } from "../dto";
import { formatearRelojCorto, type TipoMarcador } from "../tipos";

const HORA_MS = 3_600_000;

export const NOMBRE_DE_MARCA: Record<TipoMarcador, string> = { tema: "Nuevo tema", votacion: "Votación", compromiso: "Compromiso", nota: "Nota" };

/** El nombre de una voz: el que le pusieron o, mientras no tenga, «Voz 1», «Voz 5»… (V1…V4 y H5… nunca repiten número). */
export function nombreDeHablante(etiqueta: string, nombres: Readonly<Record<string, string>>): string {
  const nombre = nombres[etiqueta]?.trim();
  if (nombre) return nombre;
  const numero = /^[VH](\d+)$/.exec(etiqueta);
  return numero ? `Voz ${numero[1]}` : etiqueta;
}

export const textoDeSilencio = (d: RangoMs): string => `Sin voz entre ${formatearRelojCorto(d.desdeMs)} y ${formatearRelojCorto(d.hastaMs)}`;

export const textoDeMarca = (m: Pick<MarcadorDTO, "kind" | "note">): string => {
  const nombre = NOMBRE_DE_MARCA[m.kind] ?? "Nota";
  return m.note ? `${nombre} · ${m.note}` : nombre;
};

export type EntradaDeLinea =
  | { tipo: "intervencion"; ms: number; clave: string; intervencion: IntervencionDTO }
  | { tipo: "silencio"; ms: number; clave: string; rango: RangoMs }
  | { tipo: "marca"; ms: number; clave: string; marca: MarcadorDTO };

export type GrupoDeHora = {
  /** 0 para la primera hora de la reunión. */
  hora: number;
  /** «0:00 – 1:00». */
  rango: string;
  entradas: EntradaDeLinea[];
};

/** Al mismo minuto: primero la marca, luego el silencio y al final la intervención. */
const ORDEN: Record<EntradaDeLinea["tipo"], number> = { marca: 0, silencio: 1, intervencion: 2 };

export function construirLinea({
  intervenciones, silencios, marcas, cargadoHastaMs, cargadoDesdeMs = 0,
}: {
  intervenciones: readonly IntervencionDTO[];
  silencios: readonly RangoMs[];
  marcas: readonly MarcadorDTO[];
  /** Hasta dónde se ha cargado la transcripción (null: toda). Lo que empieza después no se muestra todavía. */
  cargadoHastaMs: number | null;
  /** Desde dónde se ha cargado (0: desde el principio). Al saltar a un minuto lejano, lo anterior todavía no está. */
  cargadoDesdeMs?: number;
}): GrupoDeHora[] {
  const limite = cargadoHastaMs ?? Number.POSITIVE_INFINITY;
  const entradas: EntradaDeLinea[] = [
    ...intervenciones.map((i): EntradaDeLinea => ({ tipo: "intervencion", ms: i.startMs, clave: `i-${i.id}`, intervencion: i })),
    ...silencios.filter((s) => s.desdeMs >= cargadoDesdeMs && s.desdeMs < limite).map((s): EntradaDeLinea => ({ tipo: "silencio", ms: s.desdeMs, clave: `s-${s.desdeMs}`, rango: s })),
    ...marcas.filter((m) => m.atMs >= cargadoDesdeMs && m.atMs < limite).map((m): EntradaDeLinea => ({ tipo: "marca", ms: m.atMs, clave: `m-${m.id}`, marca: m })),
  ].sort((a, b) => a.ms - b.ms || ORDEN[a.tipo] - ORDEN[b.tipo]);

  const grupos: GrupoDeHora[] = [];
  for (const e of entradas) {
    const hora = Math.floor(e.ms / HORA_MS);
    let g = grupos[grupos.length - 1];
    if (!g || g.hora !== hora) {
      g = { hora, rango: `${hora}:00 – ${hora + 1}:00`, entradas: [] };
      grupos.push(g);
    }
    g.entradas.push(e);
  }
  return grupos;
}
