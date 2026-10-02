/**
 * Cierre de una grabación en vivo: qué sesiones se cierran y qué partes faltan (funciones puras).
 *
 * El dispositivo declara, por cada sesión, cuál fue su última parte. El servidor compara con lo que de verdad
 * tiene: si falta alguna, responde cuáles y el dispositivo las vuelve a subir desde lo guardado. Una sesión
 * que nadie declaró (el dispositivo se perdió o se borraron sus datos) se cierra con lo que haya: perder 30 s
 * es mejor que perder la reunión.
 */
import { detectarHuecos } from "./grabadora-partes";

/** Una parte recibida (sin la URL privada del blob: no se necesita para decidir). */
export type ParteRecibida = { session: number; seq: number; bytes: number; durationMs: number; mimeType: string };
export type FuenteGrabada = { kind: string; session: number | null; durationMs?: number | null };
export type SesionPedida = { session: number; ultimaSecuencia: number; mimeType: string; duracionMs: number };

export type SesionACerrar = {
  session: number;
  ultimaSecuencia: number;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  /** Partes que no llegaron entre la 0 y la última. */
  huecos: number;
};

export type PlanCierre = { cerrar: SesionACerrar[]; faltan: Array<{ session: number; seq: number }> };

/** Tope de partes faltantes que se listan en la respuesta (el dispositivo repite la jugada hasta completar). */
export const MAX_FALTAN_EN_RESPUESTA = 2000;

function resumir(session: number, ultima: number, recibidas: ParteRecibida[], mime: string | null, duracionDeclarada: number | null, huecos: number): SesionACerrar {
  const dentro = recibidas.filter((p) => p.seq <= ultima);
  const suma = dentro.reduce((acc, p) => acc + p.durationMs, 0);
  return {
    session,
    ultimaSecuencia: ultima,
    mimeType: mime ?? dentro[0]?.mimeType ?? "audio/webm",
    sizeBytes: dentro.reduce((acc, p) => acc + p.bytes, 0),
    // Lo que midió el dispositivo (solo tiempo grabado) manda; sin eso, la suma de las partes.
    durationMs: duracionDeclarada && duracionDeclarada > 0 ? duracionDeclarada : suma,
    huecos,
  };
}

export function planificarCierre(partes: readonly ParteRecibida[], fuentes: readonly FuenteGrabada[], pedidas: readonly SesionPedida[] | null): PlanCierre {
  const porSesion = new Map<number, ParteRecibida[]>();
  for (const p of partes) {
    if (p.seq < 0) continue; // las reservas de número de sesión no son audio
    const lista = porSesion.get(p.session);
    if (lista) lista.push(p);
    else porSesion.set(p.session, [p]);
  }
  // Una sesión que ya tiene su fuente está cerrada (reintento tras perder la respuesta).
  const cerradas = new Set(fuentes.filter((f) => f.kind === "grabacion" && f.session !== null).map((f) => f.session as number));

  const cerrar: SesionACerrar[] = [];
  const faltan: Array<{ session: number; seq: number }> = [];
  const declaradas = new Set<number>();

  for (const d of pedidas ?? []) {
    declaradas.add(d.session);
    if (cerradas.has(d.session)) continue;
    const recibidas = porSesion.get(d.session) ?? [];
    const mayor = recibidas.reduce((m, p) => Math.max(m, p.seq), -1);
    // Si el servidor tiene MÁS partes de las que el dispositivo dice, gana lo que hay: no se descarta audio.
    const ultima = Math.max(d.ultimaSecuencia, mayor);
    const huecos = detectarHuecos(recibidas.map((p) => p.seq), ultima);
    for (const seq of huecos) faltan.push({ session: d.session, seq });
    cerrar.push(resumir(d.session, ultima, recibidas, d.mimeType, d.duracionMs, huecos.length));
  }

  for (const [session, recibidas] of porSesion) {
    if (cerradas.has(session) || declaradas.has(session)) continue;
    const ultima = recibidas.reduce((m, p) => Math.max(m, p.seq), -1);
    cerrar.push(resumir(session, ultima, recibidas, null, null, detectarHuecos(recibidas.map((p) => p.seq), ultima).length));
  }

  cerrar.sort((a, b) => a.session - b.session);
  faltan.sort((a, b) => a.session - b.session || a.seq - b.seq);
  return { cerrar, faltan: faltan.slice(0, MAX_FALTAN_EN_RESPUESTA) };
}

/**
 * Dónde empieza una sesión nueva dentro de la grabación: lo que duraron las anteriores. Una sesión ya cerrada
 * cuenta por la duración de su fuente; una abierta, por la suma de sus partes (no se cuenta dos veces).
 */
export function offsetAntesDe(session: number, partes: readonly ParteRecibida[], fuentes: readonly FuenteGrabada[]): number {
  const cerradas = new Map<number, number>();
  for (const f of fuentes) {
    if (f.kind === "grabacion" && f.session !== null && f.session < session) cerradas.set(f.session, f.durationMs ?? 0);
  }
  let ms = 0;
  for (const d of cerradas.values()) ms += d;
  for (const p of partes) if (p.seq >= 0 && p.session < session && !cerradas.has(p.session)) ms += p.durationMs;
  return ms;
}

/** «Grabación en la app», y «… — sesión 2» cuando se cierran varias a la vez. */
export const nombreDeSesion = (session: number, total: number): string =>
  total > 1 ? `Grabación en la app — sesión ${session}` : "Grabación en la app";
