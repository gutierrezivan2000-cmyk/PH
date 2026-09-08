/**
 * Revocación de sesiones al cambiar la contraseña.
 *
 * Con estrategia JWT la sesión vive dentro de la cookie: restablecer la
 * contraseña no desconectaba nada, así que quien hubiera robado una cookie
 * seguía dentro hasta 30 días (y NextAuth reemite la cookie en cada visita a
 * /api/auth/session, de modo que ese plazo se renovaba solo).
 *
 * El sello guardado en el token es el NACIMIENTO de la sesión, no la fecha de
 * la contraseña. Comparar contra el nacimiento es lo que hace que la
 * revocación funcione para los tokens antiguos: un token emitido antes de que
 * existiera el sello no lleva ninguno y cuenta como nacido en el instante 0, y
 * `passwordChangedAt` solo puede tener valor DESPUÉS de que se desplegara esta
 * función, así que cualquier valor presente es necesariamente posterior a esa
 * sesión y debe cerrarla. Sellar esos tokens con la fecha actual (el otro
 * camino posible) los habría indultado justo del restablecimiento que debía
 * matarlos.
 */

/**
 * Holgura para el desfase de reloj entre instancias: el sello lo pone el
 * servidor que atiende el inicio de sesión y `passwordChangedAt` lo escribe
 * otro. Sin ella, unos milisegundos de diferencia cerrarían la sesión recién
 * creada por el propio usuario que acaba de restablecer su contraseña.
 */
export const CLOCK_SKEW_MS = 30_000;

export function revokedByPasswordChange(
  sessionAt: unknown,
  passwordChangedAt: Date | null | undefined
): boolean {
  if (!passwordChangedAt) return false;
  const born = typeof sessionAt === "number" && Number.isFinite(sessionAt) ? sessionAt : 0;
  return passwordChangedAt.getTime() > born + CLOCK_SKEW_MS;
}
