/**
 * Qué ve el panel de administración de cada cliente.
 *
 * SÍ: quién es y cómo contactarlo (nombre, correo, foto, cargo, teléfono, empresa, ciudad), sus fechas (registro,
 * verificación del correo, último ingreso, aceptación de los documentos legales), su plan, su estado y su consumo.
 * NO: el contenido que genera (documentos, actas, reuniones y transcripciones, chats con los asistentes, propiedades
 * y sus datos), ni secretos (hash de contraseña, credenciales de su pasarela de pagos).
 *
 * Cada cuenta tiene además un código estable (U-XXXXXX, los últimos 6 caracteres de su id) para referirse a ella sin
 * copiar datos personales en notas, auditorías o conversaciones.
 */
const LARGO = 6;

export function codigoDeUsuario(id: string): string {
  return `U-${id.slice(-LARGO).toUpperCase()}`;
}

/** ¿Lo que se escribió en el buscador es un código (U-ABC123)? */
export function comoCodigo(q: string): string | null {
  const m = q.trim().toUpperCase().match(/^U-([A-Z0-9]{2,12})$/);
  return m ? m[1].toLowerCase() : null;
}

/** Campos de identidad y contacto que el panel puede leer (para `select` de Prisma). Nunca incluye secretos. */
export const CAMPOS_DE_IDENTIDAD = {
  id: true,
  name: true,
  email: true,
  image: true,
  cargo: true,
  phone: true,
  company: true,
  city: true,
  role: true,
  banned: true,
  createdAt: true,
  emailVerified: true,
  lastLoginAt: true,
  termsAcceptedAt: true,
  termsVersion: true,
} as const;

/** Lo mínimo para nombrar a una persona en una lista. */
export const CAMPOS_DE_NOMBRE = { id: true, name: true, email: true, image: true } as const;

/** Filtro de Prisma del buscador: nombre, correo, empresa, ciudad, teléfono o código. */
export function filtroDeBusqueda(q: string): Record<string, unknown> | null {
  const t = q.trim();
  if (!t) return null;
  const c = comoCodigo(t);
  if (c) return { id: { endsWith: c, mode: "insensitive" } };
  const contiene = { contains: t, mode: "insensitive" };
  return { OR: [{ name: contiene }, { email: contiene }, { company: contiene }, { city: contiene }, { phone: contiene }] };
}
