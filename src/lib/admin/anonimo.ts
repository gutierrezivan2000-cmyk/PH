/**
 * El panel de administración no muestra datos personales de los clientes.
 * Cada persona se ve por un CÓDIGO estable (U-XXXXXX, los últimos 6 caracteres
 * de su id, que son aleatorios), junto con lo operativo: plan, estado, rol,
 * consumo y uso. Con el código se opera (cambiar plan, bloquear, dar acceso,
 * volver admin) sin saber quién es.
 *
 * Qué NO sale nunca hacia el panel: nombre, correo, teléfono, cargo, empresa,
 * ciudad, foto, contraseña, credenciales de pago ni el contenido de sus
 * documentos, reuniones o chats.
 */
const LARGO = 6;

export function codigoDeUsuario(id: string): string {
  return `U-${id.slice(-LARGO).toUpperCase()}`;
}

/** ¿Lo que escribió quien administra es un código (U-ABC123 o solo ABC123)? */
export function comoCodigo(q: string): string | null {
  const m = q.trim().toUpperCase().match(/^(?:U-)?([A-Z0-9]{3,12})$/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Filtro de Prisma para buscar un usuario. Se encuentra por código (parcial) o
 * por correo COMPLETO y exacto: hace falta para darle acceso a alguien que lo
 * pide, pero no permite explorar la base ("ana" no devuelve nada).
 */
export function filtroDeBusqueda(q: string): Record<string, unknown> | null {
  const t = q.trim();
  if (!t) return null;
  const o: Record<string, unknown>[] = [];
  if (t.includes("@")) o.push({ email: { equals: t, mode: "insensitive" } });
  const c = comoCodigo(t);
  if (c) o.push({ id: { endsWith: c, mode: "insensitive" } });
  return { OR: o.length ? o : [{ id: "__sin_resultados__" }] };
}
