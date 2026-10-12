import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara un secreto recibido con el configurado sin que el tiempo de respuesta revele cuántos caracteres coinciden.
 * Ambos lados se pasan por SHA-256 para que tengan siempre la misma longitud (timingSafeEqual exige eso y, si no,
 * revelaría la longitud del secreto). Un secreto vacío o ausente nunca coincide.
 */
export function secretoCoincide(recibido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recibido || !esperado) return false;
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
