/**
 * Candado por usuario para reservar una generación (acta): comprobar el cupo y crear la fila como UNA sola operación.
 *
 * Es el mismo patrón de `generate/full`: antes se contaba y luego se creaba sin candado, así que una ráfaga en paralelo leía
 * todas el mismo conteo y superaba el tope. Aquí se toma `pg_advisory_xact_lock(hashtext('generate:'+userId))` dentro de una
 * transacción (se libera al terminar): la siguiente petición solo cuenta cuando la fila de la anterior ya está confirmada. La
 * clave es la MISMA que usa `generate/full`, así que también se serializan entre sí las generaciones de documentos y las actas.
 *
 * La transacción RETIENE una conexión del pool (10 en total) y tiene un plazo: por eso dentro va SOLO lo mínimo —los conteos
 * y la escritura de la fila— y siempre con `tx`, nunca con la conexión global. Lo lento (validar la reunión, cargar su
 * transcripción, mirar el plan con `checkUsageLimits`) se hace ANTES, y lo que sigue (encolar, avanzar) DESPUÉS de confirmar.
 *
 * Como `checkUsageLimits` usa la conexión global no puede correr dentro, así que el cupo del plan se garantiza así: antes del
 * candado se toma una instantánea del número de generaciones de la cuenta (`instantaneaDeGeneraciones`) y DESPUÉS se mira el
 * plan; dentro del candado se vuelve a contar con `tx` y, si el número cambió, alguien reservó entre medias y la comprobación del
 * plan ya no vale: se devuelve `reintentar` y quien llama repite desde la instantánea (ver `reservarConCupo`). Si no cambió, lo
 * que vio `checkUsageLimits` sigue siendo exacto y, con el candado tomado, nadie puede colarse antes de crear la fila.
 */
import { db } from "@/lib/db";

/** Actas que una cuenta puede tener redactándose a la vez (en reuniones distintas). */
export const MAX_ACTAS_EN_CURSO = 2;

/** Plazo de la transacción del candado (incluye la espera del candado). Solo hace conteos y una escritura: sobra. */
const PLAZO_TRANSACCION_MS = 10_000;
/** Cuántas veces se repite la comprobación del plan si otra petición de la misma cuenta se coló entre medias. */
export const MAX_INTENTOS_DE_RESERVA = 4;

type Donde = Record<string, unknown>;

/** Lo que una reserva puede hacer dentro de la transacción: conteos y las pocas escrituras que consumen cupo. */
export type TransaccionConCandado = {
  generation: {
    count: (args: { where: Donde }) => Promise<number>;
    create: (args: { data: Donde }) => Promise<{ id: string }>;
    updateMany: (args: { where: Donde; data: Donde }) => Promise<{ count: number }>;
  };
  meetingTask: { updateMany: (args: { where: Donde; data: Donde }) => Promise<{ count: number }> };
};

export async function conCandadoDeGeneracion<T>(userId: string, reservar: (tx: TransaccionConCandado) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`generate:${userId}`}))`;
      return reservar(tx as unknown as TransaccionConCandado);
    },
    { timeout: PLAZO_TRANSACCION_MS, maxWait: PLAZO_TRANSACCION_MS },
  );
}

/** Cuántas generaciones tiene la cuenta (de cualquier estado). Toda reserva nueva la cambia; por eso sirve de testigo. */
export const instantaneaDeGeneraciones = (userId: string): Promise<number> => db.generation.count({ where: { userId } });

export type Reserva<T> = { reintentar: true } | { reintentar?: false; valor: T };

/**
 * Reserva con cupo: repite [instantánea → comprobar el plan (global, fuera del candado) → candado y `reservar(tx, instantánea)`]
 * mientras otra reserva de la misma cuenta se cuele entre la instantánea y el candado. `reservar` debe empezar comprobando
 * `tx.generation.count({ where: { userId } }) === instantánea` (ver `contarSinCambios`) y devolver `{ reintentar: true }` si no.
 * Si `plan` rechaza, el resultado es el suyo y no se abre ninguna transacción. Devuelve `null` si se agotaron los intentos.
 */
export async function reservarConCupo<T, R>(
  userId: string,
  plan: () => Promise<{ rechazo: R } | null>,
  reservar: (tx: TransaccionConCandado, instantanea: number) => Promise<Reserva<T>>,
): Promise<{ rechazo: R } | { valor: T } | null> {
  for (let intento = 0; intento < MAX_INTENTOS_DE_RESERVA; intento++) {
    const instantanea = await instantaneaDeGeneraciones(userId);
    const rechazo = await plan();
    if (rechazo) return rechazo;
    const r = await conCandadoDeGeneracion(userId, (tx) => reservar(tx, instantanea));
    if (!r.reintentar) return { valor: r.valor };
  }
  return null;
}

/** Dentro del candado: ¿la cuenta sigue teniendo las mismas generaciones que cuando se miró el plan? */
export async function contarSinCambios(tx: TransaccionConCandado, userId: string, instantanea: number): Promise<boolean> {
  return (await tx.generation.count({ where: { userId } })) === instantanea;
}
