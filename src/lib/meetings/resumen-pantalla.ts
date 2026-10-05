/**
 * Lo que la pestaña «Resumen» decide con la ficha (puro: se prueba sin React). La ficha la arma la IA (`ficha.ts`); aquí se
 * decide qué se le enseña a la persona: en qué estado está el resumen, las cifras de arriba, los párrafos, el minuto de
 * cada hallazgo y cómo se lee una votación.
 */
import type { Ficha, FichaVotacion, HablanteDTO } from "./dto";
import { formatearDuracion, formatearRelojCorto } from "./tipos";

/**
 * En qué estado está el resumen:
 *  - `completo`: la ficha tiene su resumen y se analizó toda la reunión.
 *  - `parcial`: tiene su resumen pero quedaron fragmentos sin analizar (la IA falló en ellos): se pueden volver a analizar solo esos.
 *  - `fallo`: la IA no estuvo disponible (o falló): la transcripción está completa, falta el resumen y se puede volver a intentar.
 *  - `sin_contenido`: la IA leyó la reunión y no encontró temas, decisiones ni compromisos que resumir (no hay nada que reintentar).
 *  - `corta`: la grabación es demasiado corta para analizarla (menos de unas 40 palabras): no hay ficha.
 */
export type EstadoDelResumen = "completo" | "parcial" | "fallo" | "sin_contenido" | "corta";

export function estadoDelResumen(meeting: { errorMessage: string | null }, digest: Pick<Ficha, "resumen" | "fragmentosOmitidos"> | null): EstadoDelResumen {
  if (digest && typeof digest.resumen === "string" && digest.resumen.trim()) return (digest.fragmentosOmitidos ?? 0) > 0 ? "parcial" : "completo";
  if (meeting.errorMessage) return "fallo";
  return digest ? "sin_contenido" : "corta";
}

/**
 * Se puede volver a pedir el análisis solo cuando algo falló (todo el resumen, o algunos fragmentos): con el resumen
 * completo, o sin nada que resumir, no tiene sentido gastarlo otra vez.
 */
export const sePuedeReintentarElResumen = (estado: EstadoDelResumen): boolean => estado === "fallo" || estado === "parcial";

/** Los párrafos del resumen (la IA los separa con una línea en blanco). */
export const parrafosDeResumen = (resumen: string): string[] =>
  resumen
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** «0:08:10»: el minuto de un hallazgo (la ficha lo guarda en segundos). */
export const minutoDeHallazgo = (segundos: number): string => formatearRelojCorto(Math.max(0, segundos) * 1000);

export type CifraDeResumen = { clave: "duracion" | "participantes" | "decisiones" | "compromisos"; etiqueta: string; cifra: string };

/**
 * Las cuatro cifras de arriba. «Participantes» son los que la IA reconoció en la ficha; si no hay ficha, las voces que
 * hablan (cada voz es una persona, o casi).
 */
export function cifrasDeResumen(durationMs: number | null, digest: Ficha | null, speakers: readonly Pick<HablanteDTO, "label">[]): CifraDeResumen[] {
  const participantes = digest ? digest.asistentes.length || speakers.length : speakers.length;
  return [
    { clave: "duracion", etiqueta: "Duración", cifra: formatearDuracion(durationMs) },
    { clave: "participantes", etiqueta: digest && digest.asistentes.length ? "Participantes" : "Voces", cifra: String(participantes) },
    { clave: "decisiones", etiqueta: "Decisiones", cifra: String(digest?.decisiones.length ?? 0) },
    { clave: "compromisos", etiqueta: "Compromisos", cifra: String(digest?.compromisos.length ?? 0) },
  ];
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «3 a favor · 0 en contra · 1 abstención»: solo lo que se dijo; vacío si no se dijo nada. */
export function textoDeVotos(v: Pick<FichaVotacion, "aFavor" | "enContra" | "abstenciones">): string {
  const partes: string[] = [];
  if (typeof v.aFavor === "number") partes.push(`${v.aFavor} a favor`);
  if (typeof v.enContra === "number") partes.push(`${v.enContra} en contra`);
  if (typeof v.abstenciones === "number") partes.push(plural(v.abstenciones, "abstención", "abstenciones"));
  return partes.join(" · ");
}

/** Las decisiones, compromisos, votaciones y temas, en el orden en que ocurrieron. */
export function enOrdenDeMinuto<T extends { t: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.t - b.t);
}

export const ordenDelDiaEnOrden = (items: Ficha["ordenDelDia"]): Ficha["ordenDelDia"] => [...items].sort((a, b) => a.inicioS - b.inicioS);

/** La ficha tiene algo más que el resumen (para decidir si se muestran los paneles de debajo). */
export const fichaTieneHallazgos = (f: Ficha): boolean =>
  f.decisiones.length + f.compromisos.length + f.votaciones.length + f.ordenDelDia.length + f.asistentes.length + f.pendientes.length > 0;
