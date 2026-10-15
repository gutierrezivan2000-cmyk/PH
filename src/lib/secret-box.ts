import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Cifrado en reposo de secretos pequeños (hoy: la P_KEY de ePayco de cada administrador).
 *
 * AES-256-GCM con IV aleatorio de 12 bytes por cifrado y etiqueta de autenticación: un valor alterado o descifrado con otra
 * clave lanza un error tipado, nunca devuelve basura. Formato guardado en la columna (sigue siendo texto):
 *
 *   enc:v1:<k|a>:<base64url(iv | etiqueta | texto cifrado)>
 *
 * El marcador dice con qué clave se cifró:
 *  - «k»: la variable ENCRYPTION_KEY (32 bytes en base64 o hex, o un texto de 32+ caracteres que se pasa por HKDF-SHA256).
 *  - «a»: derivada con HKDF-SHA256 de AUTH_SECRET, para que funcione sin configurar nada nuevo.
 * Se cifra con «k» si ENCRYPTION_KEY existe y, si no, con «a»; se descifra siempre con la clave que dice el marcador, así que los
 * valores guardados antes de definir ENCRYPTION_KEY siguen leyéndose. Un valor sin el prefijo «enc:v1:» es un secreto antiguo en
 * claro (de antes del cifrado) y se devuelve tal cual: quien lo lee es quien decide re-guardarlo cifrado.
 *
 * Nunca se escribe en claro en silencio: sin ENCRYPTION_KEY ni AUTH_SECRET, encryptSecret lanza.
 * Ningún mensaje de error ni log de este módulo incluye el secreto ni la clave.
 */

const ALGORITMO = "aes-256-gcm" as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SAL = "soph.ia/secret-box/v1";
const INFO_ENCRYPTION_KEY = "soph.ia/secret-box/v1/encryption-key";
const INFO_AUTH_SECRET = "soph.ia/secret-box/v1/auth-secret";

/** Cualquier valor cifrado por este módulo (de esta o de una versión futura del formato). */
const PREFIJO_RE = /^enc:v\d+:/;
/** El único formato que se sabe leer hoy. */
const SOBRE_RE = /^enc:v1:([ka]):([A-Za-z0-9_-]+)$/;

export type SecretBoxCode =
  /** No hay con qué cifrar: faltan ENCRYPTION_KEY y AUTH_SECRET. */
  | "no_key"
  /** ENCRYPTION_KEY existe pero no sirve (ni 32 bytes en base64/hex ni 32+ caracteres). */
  | "invalid_key"
  /** El valor se cifró con una clave que este entorno ya no tiene. */
  | "key_unavailable"
  /** El valor empieza por «enc:» pero no tiene el formato esperado. */
  | "bad_format"
  /** Autenticación fallida: clave distinta o dato alterado. */
  | "decrypt_failed"
  /** No se cifran secretos vacíos. */
  | "empty";

export class SecretBoxError extends Error {
  readonly code: SecretBoxCode;
  constructor(code: SecretBoxCode, message: string) {
    super(message);
    this.name = "SecretBoxError";
    this.code = code;
  }
}

function derivar(material: string, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", material, SAL, info, 32));
}

/** Clave de ENCRYPTION_KEY: null si no está definida; lanza invalid_key si está definida pero no sirve. */
function claveDeEncryptionKey(): Buffer | null {
  const raw = (process.env.ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(raw)) {
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length === 32) return bytes;
  }
  if (raw.length >= 32) return derivar(raw, INFO_ENCRYPTION_KEY);
  throw new SecretBoxError(
    "invalid_key",
    "ENCRYPTION_KEY no es válida: debe ser de 32 bytes (base64 o hex) o un texto de al menos 32 caracteres."
  );
}

/** Clave derivada de AUTH_SECRET: null si no está definida. */
function claveDeAuthSecret(): Buffer | null {
  // Mismo orden que auth.ts: sin AUTH_SECRET vale NEXTAUTH_SECRET, para que un despliegue que solo tenga esa también cifre.
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || !s.trim()) return null;
  return derivar(s, INFO_AUTH_SECRET);
}

function claveDeOrigen(origen: "k" | "a"): Buffer {
  const clave = origen === "k" ? claveDeEncryptionKey() : claveDeAuthSecret();
  if (clave) return clave;
  throw new SecretBoxError(
    "key_unavailable",
    origen === "k"
      ? "El secreto guardado se cifró con ENCRYPTION_KEY y esa variable ya no está configurada."
      : "El secreto guardado se cifró con AUTH_SECRET y esa variable ya no está configurada."
  );
}

/** ¿El valor guardado es un secreto cifrado por este módulo? (Si no, es un secreto antiguo en claro.) */
export function isEncrypted(valor: string | null | undefined): boolean {
  return typeof valor === "string" && PREFIJO_RE.test(valor);
}

/**
 * Con qué clave se cifraría hoy (null si no se puede cifrar) y si ENCRYPTION_KEY está mal puesta.
 * Solo para diagnóstico (health): no devuelve ni deriva nada que se pueda usar fuera de este módulo.
 */
export function encryptionStatus(): { source: "k" | "a" | null; invalidEncryptionKey: boolean } {
  try {
    if (claveDeEncryptionKey()) return { source: "k", invalidEncryptionKey: false };
  } catch {
    return { source: null, invalidEncryptionKey: true };
  }
  return { source: claveDeAuthSecret() ? "a" : null, invalidEncryptionKey: false };
}

/** Cifra un secreto para guardarlo. Lanza SecretBoxError si no hay clave: jamás devuelve el texto en claro. */
export function encryptSecret(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new SecretBoxError("empty", "No hay ningún secreto para cifrar.");
  }
  let origen: "k" | "a" = "k";
  let clave = claveDeEncryptionKey();
  if (!clave) {
    origen = "a";
    clave = claveDeAuthSecret();
  }
  if (!clave) {
    throw new SecretBoxError(
      "no_key",
      "El servidor no tiene una clave de cifrado configurada (ENCRYPTION_KEY o AUTH_SECRET)."
    );
  }
  const cabecera = `enc:v1:${origen}`;
  const iv = randomBytes(IV_BYTES);
  const cifrador = createCipheriv(ALGORITMO, clave, iv, { authTagLength: TAG_BYTES });
  // La cabecera va autenticada: cambiar el marcador de clave también invalida el valor.
  cifrador.setAAD(Buffer.from(cabecera));
  const cifrado = Buffer.concat([cifrador.update(plain, "utf8"), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return `${cabecera}:${Buffer.concat([iv, etiqueta, cifrado]).toString("base64url")}`;
}

/**
 * Descifra un valor guardado con la clave que indica su marcador. Un valor sin prefijo «enc:» es un secreto antiguo en claro y
 * se devuelve tal cual. Lanza SecretBoxError (sin incluir el valor) si el formato es raro, falta la clave o la autenticación falla.
 */
export function decryptSecret(guardado: string): string {
  if (!isEncrypted(guardado)) return guardado;
  const m = SOBRE_RE.exec(guardado);
  if (!m) {
    throw new SecretBoxError("bad_format", "El secreto guardado tiene un formato que no se reconoce.");
  }
  const origen = m[1] as "k" | "a";
  const bytes = Buffer.from(m[2], "base64url");
  if (bytes.length <= IV_BYTES + TAG_BYTES) {
    throw new SecretBoxError("bad_format", "El secreto guardado está incompleto.");
  }
  const clave = claveDeOrigen(origen);
  const iv = bytes.subarray(0, IV_BYTES);
  const etiqueta = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const cifrado = bytes.subarray(IV_BYTES + TAG_BYTES);
  try {
    const descifrador = createDecipheriv(ALGORITMO, clave, iv, { authTagLength: TAG_BYTES });
    descifrador.setAAD(Buffer.from(`enc:v1:${origen}`));
    descifrador.setAuthTag(etiqueta);
    return Buffer.concat([descifrador.update(cifrado), descifrador.final()]).toString("utf8");
  } catch {
    // Se descarta el error nativo a propósito: no hay nada útil que añadir y así nada del valor viaja en el mensaje.
    throw new SecretBoxError(
      "decrypt_failed",
      "No se pudo descifrar el secreto guardado: la clave de cifrado cambió o el dato fue alterado."
    );
  }
}
