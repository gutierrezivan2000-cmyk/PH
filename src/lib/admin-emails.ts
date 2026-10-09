/**
 * Quién es administrador PERMANENTE de la plataforma.
 *
 * Son los dueños: entran con rol admin en cada inicio de sesión y no se pueden
 * degradar ni bloquear desde el panel. Se suman dos fuentes:
 *  - `PROPIETARIOS`: cuentas fijas en el código, para que el acceso del dueño no
 *    dependa de que una variable de entorno esté bien puesta en cada despliegue.
 *  - `ADMIN_EMAILS` (variable de entorno, separada por comas): más propietarios
 *    sin tocar el código.
 *
 * El correo que llega aquí viene de un inicio de sesión (Google lo verifica;
 * con contraseña, la cuenta exige correo verificado), así que no se puede
 * reclamar un correo ajeno.
 */
export const PROPIETARIOS: readonly string[] = ["gutierrezivan2000@gmail.com"];

export function adminEmails(): string[] {
  const deEntorno = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...PROPIETARIOS.map((e) => e.toLowerCase()), ...deEntorno])];
}

export function esAdminDeEntorno(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
