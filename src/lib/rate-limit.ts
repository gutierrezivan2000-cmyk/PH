import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

/**
 * Best-effort client IP. Prefer x-real-ip (Vercel sets it to the true client
 * IP and the client can't override it); the leftmost x-forwarded-for token is
 * client-supplied and spoofable, so only use it as a fallback.
 */
export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

export type RateLimitOptions = {
  max: number;
  windowMs: number;
  /**
   * Qué hacer si la base de datos falla al contar.
   * - false (por omisión): deja pasar. Una caída de infraestructura no debe
   *   dejar fuera a usuarios reales; sirve para el uso normal (chat, informes).
   * - true: deniega. Para los endpoints que protegen códigos de 6 dígitos o el
   *   envío de correos (verificar, restablecer, reenviar): sin contador no hay
   *   freno, y un atacante que logre tumbar o saturar la base se quedaría con
   *   intentos ilimitados. El costo es que, mientras la base falle, esos
   *   endpoints también responden 429 (igual fallarían al consultar la base).
   */
  failClosed?: boolean;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec?: number;
  /**
   * true solo cuando se denegó porque la base falló (failClosed), no porque se
   * alcanzara el límite. Permite responder 503 en vez de 429 si se quiere.
   */
  unavailable?: boolean;
};

// Ninguna ventana en uso pasa de 24 h; 7 días deja margen de sobra antes de borrar.
const CLEANUP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// Los contadores mensuales de cuota de correos ("emails:<usuario>:<AAAA-MM>") viven todo el mes
// (y su windowStart se refresca en cada envío): se purgan aparte, pasados ~40 días.
const MONTHLY_KEY_PREFIX = "emails:";
const MONTHLY_CLEANUP_AFTER_MS = 40 * 24 * 60 * 60 * 1000;
// Una de cada ~100 llamadas aprovecha para borrar contadores muy viejos.
const CLEANUP_PROBABILITY = 0.01;
// Espera sugerida cuando se deniega por falla de la base: no hay ventana real que leer.
const FAIL_CLOSED_RETRY_SEC = 30;

/**
 * Borra contadores vencidos hace mucho. Mejor esfuerzo: no se espera, y
 * cualquier error (incluso síncrono) se ignora; la tabla solo crece despacio.
 */
function purgeExpired(): void {
  if (Math.random() >= CLEANUP_PROBABILITY) return;
  try {
    void db.rateLimit
      .deleteMany({
        where: {
          OR: [
            // Ventanas cortas: 7 días. Los contadores mensuales de correos ("emails:") se excluyen
            // para no reiniciar la cuota a mitad de mes.
            { NOT: { key: { startsWith: MONTHLY_KEY_PREFIX } }, windowStart: { lt: new Date(Date.now() - CLEANUP_AFTER_MS) } },
            { key: { startsWith: MONTHLY_KEY_PREFIX }, windowStart: { lt: new Date(Date.now() - MONTHLY_CLEANUP_AFTER_MS) } },
          ],
        },
      })
      .catch(() => {});
  } catch {
    // Mejor esfuerzo: nunca debe afectar la respuesta del límite.
  }
}

/**
 * Limitador de ventana fija respaldado por la tabla RateLimit.
 *
 * El conteo es UNA sola sentencia (INSERT ... ON CONFLICT DO UPDATE), así que
 * es atómico: dos peticiones simultáneas se serializan sobre la fila y nunca
 * leen el mismo contador, por lo que no se puede superar el máximo con ráfagas.
 * El reloj es el de la base de datos (en UTC, como guarda Prisma), no el de
 * cada instancia, para que todas coincidan en cuándo vence una ventana.
 *
 * Toda petición cuenta, también las denegadas, pero la ventana NO se extiende:
 * se reinicia cuando pasa windowMs desde su inicio. El contador se topa en
 * max + 1 para que un flujo de peticiones denegadas no lo desborde.
 *
 * Si la base falla: por omisión deja pasar; con `failClosed: true` deniega
 * (ver RateLimitOptions.failClosed).
 */
export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  try {
    // Todo valor va como parámetro enlazado; nada se concatena en el SQL.
    // "id" no tiene valor por omisión en la base (el cuid lo pone Prisma), así que se manda uno.
    const rows = await db.$queryRaw<Array<{ count: number; resetInSec: number }>>`
      INSERT INTO "RateLimit" ("id", "key", "count", "windowStart")
      VALUES (${randomUUID()}, ${key}, 1, (NOW() AT TIME ZONE 'UTC'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" <= (NOW() AT TIME ZONE 'UTC') - (${opts.windowMs}::double precision * INTERVAL '1 millisecond')
          THEN 1
          ELSE LEAST("RateLimit"."count", ${opts.max}::int) + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" <= (NOW() AT TIME ZONE 'UTC') - (${opts.windowMs}::double precision * INTERVAL '1 millisecond')
          THEN (NOW() AT TIME ZONE 'UTC')
          ELSE "RateLimit"."windowStart"
        END
      RETURNING
        "count",
        CEIL(EXTRACT(EPOCH FROM ("windowStart" + (${opts.windowMs}::double precision * INTERVAL '1 millisecond') - (NOW() AT TIME ZONE 'UTC'))))::int AS "resetInSec"
    `;

    const row = rows[0];
    if (!row) throw new Error("el conteo atómico no devolvió ninguna fila");

    purgeExpired();

    if (Number(row.count) <= opts.max) return { allowed: true };

    const resetInSec = Number(row.resetInSec);
    return { allowed: false, retryAfterSec: Number.isFinite(resetInSec) ? Math.max(1, resetInSec) : 1 };
  } catch (e) {
    const failClosed = opts.failClosed === true;
    // Solo el propósito del contador (antes del primer ":"): la clave completa
    // lleva correos, IPs o fragmentos de token y no debe quedar en los logs.
    const purpose = key.includes(":") ? key.slice(0, key.indexOf(":")) : "?";
    const reason = e instanceof Error ? e.message.slice(0, 300) : "error desconocido";
    console.error(
      `[rateLimit] la base falló en "${purpose}"; ${failClosed ? "se deniega (failClosed)" : "se deja pasar (fail-open)"}: ${reason}`
    );
    if (failClosed) return { allowed: false, retryAfterSec: FAIL_CLOSED_RETRY_SEC, unavailable: true };
    return { allowed: true };
  }
}
