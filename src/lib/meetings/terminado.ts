/**
 * Lo que pasa UNA vez, cuando una reunión termina de procesarse y queda «lista»: sumar lo que costó, dejar el registro de
 * uso y avisar por correo a quien la grabó. Cada paso es independiente y ninguno puede tumbar a los demás ni a la reunión.
 */
import { db } from "@/lib/db";
import { sendMeetingReadyEmail } from "@/lib/email";
import { formatearDuracion } from "./tipos";
import { KIND_BLOQUE, KIND_FICHA, KIND_TRAMO } from "./transcripcion/claves";

export type Costos = {
  /** Lo que costó transcribir (suma de los tramos, solapes incluidos). */
  transcripcionUsd: number;
  /** Lo que costó el análisis con IA (bloques y ficha) y cuántos tokens fueron. */
  iaUsd: number;
  iaTokens: number;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const positivo = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Suma el costo de las tareas hechas: los tramos guardan `costoUsd`; los bloques y la ficha, `uso`.
 * (Lo que pasó ya está registrado: para sumar solo lo nuevo, el que llama filtra las tareas antes.)
 */
export function sumarCostos(tareas: ReadonlyArray<{ kind: string; result: unknown }>): Costos {
  const total: Costos = { transcripcionUsd: 0, iaUsd: 0, iaTokens: 0 };
  for (const t of tareas) {
    if (!esObjeto(t.result)) continue;
    if (t.kind === KIND_TRAMO) {
      total.transcripcionUsd += positivo(t.result.costoUsd);
    } else if (t.kind === KIND_BLOQUE || t.kind === KIND_FICHA) {
      const uso = esObjeto(t.result.uso) ? t.result.uso : {};
      total.iaUsd += positivo(uso.costoUsd);
      total.iaTokens += positivo(uso.entrada) + positivo(uso.salida) + positivo(uso.cacheLectura) + positivo(uso.cacheEscritura);
    }
  }
  return total;
}

const urlBase = (): string =>
  (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");

type EnviarCorreo = typeof sendMeetingReadyEmail;

export type OpcionesAlPasarALista = {
  /**
   * La reunión ya había estado lista antes y se está volviendo a pedir el resumen: `desde` es cuándo estuvo lista la vez
   * anterior. Entonces solo cuenta lo que se hizo DESPUÉS (lo anterior ya se registró), no se vuelve a registrar el audio y
   * no se manda otro correo.
   */
  desde?: Date | null;
};

export async function alPasarALista(
  meetingId: string,
  enviarCorreo: EnviarCorreo = sendMeetingReadyEmail,
  { desde = null }: OpcionesAlPasarALista = {},
): Promise<void> {
  const reunion = await db.meeting.findFirst({
    where: { id: meetingId },
    select: { userId: true, title: true, durationMs: true, costUsd: true, property: { select: { name: true } } },
  });
  if (!reunion) return;
  const reanalisis = desde !== null;

  // 1 · Costos y registro de uso.
  try {
    if (reanalisis) {
      // Solo el análisis que se rehízo: las tareas que terminaron después de la vez anterior.
      const nuevas = await db.meetingTask.findMany({
        where: { meetingId, status: "hecha", kind: { in: [KIND_BLOQUE, KIND_FICHA] }, updatedAt: { gt: desde } },
        select: { kind: true, result: true },
      });
      const c = sumarCostos(nuevas);
      if (c.iaUsd > 0) await db.meeting.update({ where: { id: meetingId }, data: { costUsd: (reunion.costUsd ?? 0) + c.iaUsd } });
      if (c.iaTokens > 0) await db.usageRecord.create({ data: { userId: reunion.userId, tokens: Math.round(c.iaTokens), costUsd: c.iaUsd, type: "reunion_ia" } });
    } else {
      const tareas = await db.meetingTask.findMany({ where: { meetingId, status: "hecha", kind: { in: [KIND_TRAMO, KIND_BLOQUE, KIND_FICHA] } }, select: { kind: true, result: true } });
      const c = sumarCostos(tareas);
      await db.meeting.update({ where: { id: meetingId }, data: { costUsd: c.transcripcionUsd + c.iaUsd } });
      const segundos = Math.round((reunion.durationMs ?? 0) / 1000);
      if (segundos > 0) await db.usageRecord.create({ data: { userId: reunion.userId, tokens: segundos, costUsd: c.transcripcionUsd, type: "reunion_audio" } });
      if (c.iaTokens > 0) await db.usageRecord.create({ data: { userId: reunion.userId, tokens: Math.round(c.iaTokens), costUsd: c.iaUsd, type: "reunion_ia" } });
    }
  } catch (e) {
    console.error("[meetings/terminado] no se pudo registrar el costo", meetingId, e);
  }

  // 2 · El correo (una sola vez: al volver a pedir el resumen ya se avisó antes).
  if (reanalisis) return;
  try {
    const usuario = await db.user.findFirst({ where: { id: reunion.userId }, select: { email: true } });
    if (usuario?.email) {
      await enviarCorreo({
        to: usuario.email,
        title: reunion.title,
        propertyName: reunion.property?.name ?? "Copropiedad",
        duration: reunion.durationMs ? formatearDuracion(reunion.durationMs) : "",
        url: `${urlBase()}/dashboard/reuniones/${meetingId}`,
      });
    }
  } catch (e) {
    console.error("[meetings/terminado] no se pudo enviar el correo", meetingId, e);
  }
}
