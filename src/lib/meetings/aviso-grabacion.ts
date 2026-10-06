/**
 * El aviso global de «estás grabando» (puro): si esta pestaña graba una reunión y la persona está en otra pantalla, se le recuerda
 * y se le da el camino de vuelta. En las pantallas de esa misma reunión no hace falta: ahí ya ve la grabadora.
 */
export type GrabacionActiva = { meetingId: string; transcurridoMs: number };

export const rutaDeLaGrabadora = (meetingId: string): string => `/dashboard/reuniones/${encodeURIComponent(meetingId)}/grabar`;

/** ¿La ruta es una pantalla de esa reunión (su página, su grabadora)? */
function esDeLaReunion(pathname: string | null, meetingId: string): boolean {
  if (!pathname) return false;
  const base = `/dashboard/reuniones/${encodeURIComponent(meetingId)}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** La grabación de la que hay que avisar (la que lleva más tiempo), o null si no hay o la persona ya está en su pantalla. */
export function grabacionAAvisar(activas: readonly GrabacionActiva[], pathname: string | null): GrabacionActiva | null {
  const fuera = activas.filter((g) => !esDeLaReunion(pathname, g.meetingId));
  if (fuera.length === 0) return null;
  return fuera.reduce((a, b) => (b.transcurridoMs > a.transcurridoMs ? b : a));
}
