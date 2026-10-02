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

/** Suma el costo de las tareas hechas: los tramos guardan `costoUsd`; los bloques y la ficha, `uso`. */
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

export async function alPasarALista(meetingId: string, enviarCorreo: EnviarCorreo = sendMeetingReadyEmail): Promise<void> {
  const reunion = await db.meeting.findFirst({
    where: { id: meetingId },
    select: { userId: true, title: true, durationMs: true, property: { select: { name: true } } },
  });
  if (!reunion) return;

  // 1 · Costos y registro de uso.
  try {
    const tareas = await db.meetingTask.findMany({ where: { meetingId, status: "hecha", kind: { in: [KIND_TRAMO, KIND_BLOQUE, KIND_FICHA] } }, select: { kind: true, result: true } });
    const c = sumarCostos(tareas);
    await db.meeting.update({ where: { id: meetingId }, data: { costUsd: c.transcripcionUsd + c.iaUsd } });
    const segundos = Math.round((reunion.durationMs ?? 0) / 1000);
    if (segundos > 0) await db.usageRecord.create({ data: { userId: reunion.userId, tokens: segundos, costUsd: c.transcripcionUsd, type: "reunion_audio" } });
    if (c.iaTokens > 0) await db.usageRecord.create({ data: { userId: reunion.userId, tokens: Math.round(c.iaTokens), costUsd: c.iaUsd, type: "reunion_ia" } });
  } catch (e) {
    console.error("[meetings/terminado] no se pudo registrar el costo", meetingId, e);
  }

  // 2 · El correo.
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
