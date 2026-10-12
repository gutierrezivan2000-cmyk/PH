/**
 * Candado por usuario para reservar una generación (acta): comprobar el cupo y crear la fila como UNA sola operación.
 *
 * Es el mismo patrón de `generate/full`: antes se contaba y luego se creaba sin candado, así que una ráfaga en paralelo leía
 * todas el mismo conteo y superaba el tope. Aquí se toma `pg_advisory_xact_lock(hashtext('generate:'+userId))` dentro de una
 * transacción (se libera al terminar): la siguiente petición solo cuenta cuando la fila de la anterior ya está confirmada. La
 * clave es la MISMA que usa `generate/full`, así que también se serializan entre sí las generaciones de documentos y las actas.
 *
 * La función `reservar` puede escribir con la conexión global (`db`): su fila queda confirmada antes de que la transacción
 * suelte el candado, que es lo único que importa para el siguiente.
 */
import { db } from "@/lib/db";

/** Actas que una cuenta puede tener redactándose a la vez (en reuniones distintas). */
export const MAX_ACTAS_EN_CURSO = 2;

export type TransaccionConCandado = {
  generation: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
};

export async function conCandadoDeGeneracion<T>(userId: string, reservar: (tx: TransaccionConCandado) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`generate:${userId}`}))`;
      return reservar(tx as unknown as TransaccionConCandado);
    },
    { timeout: 20_000, maxWait: 15_000 },
  );
}
