import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Enlace de descarga firmado para los archivos que generan los agentes.
 *
 * El archivo vive en Blob PRIVADO, así que su URL no se puede entregar al
 * navegador: hay que servirlo por una ruta propia. En vez de guardar una fila
 * en base de datos para saber quién puede bajarlo, el permiso viaja firmado en
 * el propio enlace. Así funciona igual en el demo, donde no hay base de datos,
 * y no deja registros que limpiar.
 *
 * La firma ata el archivo a UN usuario y a una fecha de caducidad: un enlace
 * copiado a otra cuenta no sirve.
 */

const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

interface Permiso {
  url: string;
  nombre: string;
  mime: string;
  userId: string;
  exp: number;
}

function clave(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado: no se pueden firmar descargas");
  return s;
}

function firma(payload: string): string {
  return createHmac("sha256", clave()).update(payload).digest("base64url");
}

export function firmarDescarga(p: Omit<Permiso, "exp">): string {
  const permiso: Permiso = { ...p, exp: Date.now() + VIGENCIA_MS };
  const payload = Buffer.from(JSON.stringify(permiso)).toString("base64url");
  return `${payload}.${firma(payload)}`;
}

export function verificarDescarga(token: string, userId: string): Permiso | null {
  const [payload, mac] = (token || "").split(".");
  if (!payload || !mac) return null;

  const esperado = firma(payload);
  // Comparación en tiempo constante: comparar con === filtra la firma byte a byte.
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const permiso = JSON.parse(Buffer.from(payload, "base64url").toString()) as Permiso;
    if (permiso.exp < Date.now()) return null;
    if (permiso.userId !== userId) return null;
    return permiso;
  } catch {
    return null;
  }
}
