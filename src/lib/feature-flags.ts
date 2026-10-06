/**
 * Funciones pausadas para el lanzamiento. El código de cada una sigue aquí
 * completo, probado y funcionando — esto solo oculta su interfaz y la
 * reemplaza por un aviso de "Próximamente" (ver ComingSoon.tsx). Reactivar
 * una función es cambiar su valor a `false` aquí, nada más: no hay que tocar
 * ninguna de las páginas ni sus rutas.
 *
 * Se usa a la vez en el Sidebar (insignia "Pronto") y en cada página (qué se
 * renderiza), para que ambos nunca queden desincronizados.
 */
export const COMING_SOON = {
  cartera: true,
  presupuesto: true,
  certificados: true,
  asambleas: true,
  comunicados: true,
  pqrs: true,
} as const;

export type ComingSoonKey = keyof typeof COMING_SOON;

/**
 * «Reuniones» (grabar o subir una reunión, transcripción completa, acta desde
 * la reunión). Se lanzó como piloto solo para admins y se abrió a todas las
 * cuentas con aprobación del dueño (fase de pruebas abierta, sin límites).
 *
 *   "admins" → solo cuentas con rol admin (y el demo, que no tiene base de datos)
 *   "todos"  → todas las cuentas con sesión
 *
 * Volver a "admins" cierra el acceso de inmediato (menú, páginas y API).
 * Es una función pura a propósito: la usan a la vez el menú (cliente), las
 * páginas y la API (servidor, que además reconoce a los admins de
 * ADMIN_EMAILS, una variable que el navegador no ve).
 */
export const REUNIONES_PARA = "todos" as "admins" | "todos";

export type UsuarioReuniones = {
  /** `session.user.role`. */
  role?: string | null;
  /** Modo demo: se ve siempre, no hay base de datos que proteger. */
  demo?: boolean;
  /** El servidor sabe si el correo está en ADMIN_EMAILS. */
  adminDeEntorno?: boolean;
};

export function reunionesVisibles(modo: "admins" | "todos", usuario: UsuarioReuniones | null | undefined): boolean {
  if (usuario?.demo) return true;
  if (!usuario) return false;
  if (modo === "todos") return true;
  return usuario.role === "admin" || Boolean(usuario.adminDeEntorno);
}

export function puedeVerReuniones(usuario: UsuarioReuniones | null | undefined): boolean {
  return reunionesVisibles(REUNIONES_PARA, usuario);
}
