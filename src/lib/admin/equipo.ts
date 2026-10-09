/** El equipo administrador: quién tiene acceso al panel y quién es propietario. Solo lo ven los propietarios. */
export type MiembroDelEquipo = {
  email: string;
  /** null si es un propietario que todavía no ha ingresado nunca. */
  id: string | null;
  propietario: boolean;
  desde: Date | null;
};

export function equipoAdministrador(
  admins: readonly { id: string; email: string; createdAt: Date }[],
  propietarios: readonly string[],
): MiembroDelEquipo[] {
  const dueños = new Set(propietarios.map((e) => e.toLowerCase()));
  const conCuenta = admins.map((a) => ({ email: a.email, id: a.id, propietario: dueños.has(a.email.toLowerCase()), desde: a.createdAt }));
  const vistos = new Set(conCuenta.map((m) => m.email.toLowerCase()));
  const sinIngresar = [...dueños].filter((e) => !vistos.has(e)).map((email) => ({ email, id: null, propietario: true, desde: null }));
  return [...conCuenta, ...sinIngresar].sort((a, b) => Number(b.propietario) - Number(a.propietario) || a.email.localeCompare(b.email));
}
