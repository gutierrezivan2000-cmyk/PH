import { decryptSecret, encryptSecret, isEncrypted, SecretBoxError } from "@/lib/secret-box";

/**
 * Lectura de la P_KEY de ePayco de cada administrador (User.epaycoPKey), que se guarda cifrada (ver secret-box.ts).
 * Todo lo que necesite la llave en claro (la firma SHA-256 de la confirmación) pasa por aquí; nada la devuelve al navegador.
 */

export type LecturaPKey =
  /** No hay llave guardada. */
  | { estado: "ausente" }
  | { estado: "ok"; pKey: string }
  /** Hay un valor guardado pero no se puede descifrar (cambió la clave de cifrado o el dato se alteró): hay que volver a ingresarla. */
  | { estado: "ilegible" };

/** Lo único del error que es seguro registrar: nunca el mensaje, porque el de Prisma puede traer los argumentos de la consulta. */
function codigoSeguro(e: unknown): string {
  if (e instanceof SecretBoxError) return e.code;
  const codigo = (e as { code?: unknown } | null)?.code;
  if (typeof codigo === "string") return codigo;
  return e instanceof Error ? e.name : typeof e;
}

/**
 * Descifra la llave guardada. Un valor antiguo en claro se devuelve tal cual. Si no se puede descifrar, lo deja en el log SIN el
 * valor (solo el motivo) y responde «ilegible» para que quien llama dé un mensaje seguro.
 */
export function leerPKey(almacenado: string | null | undefined, contexto: string): LecturaPKey {
  if (!almacenado) return { estado: "ausente" };
  try {
    const pKey = decryptSecret(almacenado);
    return pKey ? { estado: "ok", pKey } : { estado: "ausente" };
  } catch (e) {
    console.error(`[${contexto}] no se pudo leer la P_KEY de ePayco guardada`, { motivo: codigoSeguro(e) });
    return { estado: "ilegible" };
  }
}

/**
 * Migración perezosa: una llave que sigue en claro (guardada antes del cifrado) se vuelve a guardar cifrada la primera vez que
 * se lee. Es de mejor esfuerzo: si falla, la lectura sigue funcionando y se reintenta en la próxima.
 * Compara y cambia: solo escribe si la columna sigue valiendo lo que se leyó, para no pisar una llave nueva que el administrador
 * haya guardado entre la lectura y esta escritura.
 */
async function guardarCifrada(userId: string, enClaro: string, contexto: string): Promise<void> {
  try {
    const cifrada = encryptSecret(enClaro);
    const { db } = await import("@/lib/db");
    await db.user.updateMany({ where: { id: userId, epaycoPKey: enClaro }, data: { epaycoPKey: cifrada } });
  } catch (e) {
    console.error(`[${contexto}] no se pudo cifrar la P_KEY de ePayco guardada en claro`, { motivo: codigoSeguro(e) });
  }
}

/**
 * Como leerPKey, y además cifra en la base de datos la llave si todavía estaba en claro (sin fallar nunca por eso).
 *
 * La migración de las llaves YA guardadas es opt-in (MIGRAR_LLAVES_EPAYCO=true): una vez cifradas, volver a una versión
 * anterior del código haría que la firma de los pagos se calcule sobre el texto cifrado y fallen. Se enciende cuando el
 * despliegue con cifrado ya se comprobó en producción. Las llaves que el administrador guarda de nuevo se cifran siempre.
 */
export async function leerPKeyYMigrar(
  userId: string,
  almacenado: string | null | undefined,
  contexto: string
): Promise<LecturaPKey> {
  const lectura = leerPKey(almacenado, contexto);
  if (process.env.MIGRAR_LLAVES_EPAYCO === "true" && lectura.estado === "ok" && almacenado && !isEncrypted(almacenado)) {
    await guardarCifrada(userId, almacenado, contexto);
  }
  return lectura;
}
