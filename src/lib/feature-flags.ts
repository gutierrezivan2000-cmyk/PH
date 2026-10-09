/**
 * Módulos en lanzamiento gradual (Cartera, Presupuesto, Certificados, Asambleas, Comunicados, PQRS).
 * Abrir un módulo a todos es cambiar su modo a "todos" en `MODO_DE_MODULO`; ponerlo en piloto lo deja solo para admins
 * y para la lista `PILOTO_EMAILS`. Lo usan a la vez el menú, las páginas y la API (ver `lib/modulos-acceso.ts`).
 */
export const MODULOS_PAUSADOS = ["cartera", "presupuesto", "certificados", "asambleas", "comunicados", "pqrs"] as const;
export type ComingSoonKey = (typeof MODULOS_PAUSADOS)[number];

/**
 * Cómo está lanzado cada módulo:
 *   "oculto" → nadie lo usa (todos ven «Próximamente»)
 *   "piloto" → lo usan solo los admins y las cuentas de `PILOTO_EMAILS` (variable de entorno, separada por comas);
 *              el resto ve «Próximamente»
 *   "todos"  → lo usan todas las cuentas con el plan que corresponda
 * Se aplica en el servidor (páginas, API, impresiones) además de en el menú.
 */
export type ModoModulo = "oculto" | "piloto" | "todos";
export const MODO_DE_MODULO: Record<ComingSoonKey, ModoModulo> = {
  cartera: "piloto",
  presupuesto: "piloto",
  certificados: "piloto",
  asambleas: "piloto",
  comunicados: "piloto",
  pqrs: "piloto",
};

/** `true` mientras el módulo no esté abierto a todos: la landing y el resto de la gente lo ven como «Próximamente». */
export const COMING_SOON = Object.fromEntries(MODULOS_PAUSADOS.map((k) => [k, MODO_DE_MODULO[k] !== "todos"])) as Record<ComingSoonKey, boolean>;

export type UsuarioDeModulo = {
  role?: string | null;
  /** El servidor sabe si el correo es de un propietario (lista fija o ADMIN_EMAILS). */
  adminDeEntorno?: boolean;
  /** El servidor sabe si el correo está en PILOTO_EMAILS. */
  enPiloto?: boolean;
};

/** Función pura: ¿puede esta persona usar el módulo? */
export function moduloVisible(
  clave: ComingSoonKey,
  usuario: UsuarioDeModulo | null | undefined,
  modos: Record<ComingSoonKey, ModoModulo> = MODO_DE_MODULO,
): boolean {
  const modo = modos[clave];
  if (modo === "todos") return true;
  if (!usuario || modo === "oculto") return false;
  return usuario.role === "admin" || Boolean(usuario.adminDeEntorno) || Boolean(usuario.enPiloto);
}

/** Correos de la lista de testers del piloto (`PILOTO_EMAILS`). */
export function esDePiloto(email: string | null | undefined, env: string | undefined = process.env.PILOTO_EMAILS): boolean {
  if (!email) return false;
  return (env || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}


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
