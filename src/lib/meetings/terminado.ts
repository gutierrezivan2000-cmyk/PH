/**
 * Lo que pasa UNA vez, cuando una reunión termina de procesarse y queda «lista»: sumar lo que costó, dejar el registro de
 * uso y avisar por correo a quien la grabó. Cada paso es independiente y ninguno puede tumbar a los demás ni a la reunión.
 */
import { db } from "@/lib/db";
import { TIPOS } from "@/lib/consumo/funciones";
import { registrarConsumo } from "@/lib/consumo/registrar";
import { sendMeetingReadyEmail } from "@/lib/email";
import { modeloDeReuniones } from "./ia";
import { MODELO_TRANSCRIPCION } from "./transcripcion/openai";
import { formatearDuracion } from "./tipos";
import { KIND_BLOQUE, KIND_FICHA, KIND_TRAMO } from "./transcripcion/claves";

export type Costos = {
  /** Lo que costó transcribir (suma de los tramos, solapes incluidos). */
  transcripcionUsd: number;
  /** Lo que costó el análisis con IA (bloques y ficha) y cuántos tokens fueron. */
  iaUsd: number;
  iaTokens: number;
  /** Los tokens del análisis separados como los cobra el proveedor (para medir el costo por función). */
  ia: { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number };
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const positivo = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Suma el costo de las tareas hechas: los tramos guardan `costoUsd`; los bloques y la ficha, `uso`.
 * (Lo que pasó ya está registrado: para sumar solo lo nuevo, el que llama filtra las tareas antes.)
 */
export function sumarCostos(tareas: ReadonlyArray<{ kind: string; result: unknown }>): Costos {
  const total: Costos = { transcripcionUsd: 0, iaUsd: 0, iaTokens: 0, ia: { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 } };
  for (const t of tareas) {
    if (!esObjeto(t.result)) continue;
    if (t.kind === KIND_TRAMO) {
      total.transcripcionUsd += positivo(t.result.costoUsd);
    } else if (t.kind === KIND_BLOQUE || t.kind === KIND_FICHA) {
      const uso = esObjeto(t.result.uso) ? t.result.uso : {};
      total.iaUsd += positivo(uso.costoUsd);
      total.iaTokens += positivo(uso.entrada) + positivo(uso.salida) + positivo(uso.cacheLectura) + positivo(uso.cacheEscritura);
      total.ia.entrada += positivo(uso.entrada);
      total.ia.salida += positivo(uso.salida);
      total.ia.cacheLectura += positivo(uso.cacheLectura);
      total.ia.cacheEscritura += positivo(uso.cacheEscritura);
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

/** El análisis con IA de la reunión (bloques y ficha), con sus tokens separados y lo que costó. */
const registrarAnalisis = (userId: string, meetingId: string, c: Costos) =>
  registrarConsumo({
    tipo: TIPOS.reunionIa, proveedor: "anthropic", modelo: modeloDeReuniones(), tokens: c.ia, costoUsd: c.iaUsd,
    tokensDelRegistro: c.iaTokens, userId, ref: { tipo: "reunion", id: meetingId },
  });

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
      if (c.iaTokens > 0) await registrarAnalisis(reunion.userId, meetingId, c);
    } else {
      const tareas = await db.meetingTask.findMany({ where: { meetingId, status: "hecha", kind: { in: [KIND_TRAMO, KIND_BLOQUE, KIND_FICHA] } }, select: { kind: true, result: true } });
      const c = sumarCostos(tareas);
      await db.meeting.update({ where: { id: meetingId }, data: { costUsd: c.transcripcionUsd + c.iaUsd } });
      const segundos = Math.round((reunion.durationMs ?? 0) / 1000);
      if (segundos > 0) {
        await registrarConsumo({
          tipo: TIPOS.reunionAudio, proveedor: "openai", modelo: MODELO_TRANSCRIPCION, audioSegundos: segundos, costoUsd: c.transcripcionUsd,
          tokensDelRegistro: segundos, userId: reunion.userId, ref: { tipo: "reunion", id: meetingId },
        });
      }
      if (c.iaTokens > 0) await registrarAnalisis(reunion.userId, meetingId, c);
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
