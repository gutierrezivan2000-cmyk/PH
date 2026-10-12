/**
 * Un administrador no se cambia a sí mismo el plan, la suscripción ni los add-ons desde el panel: el cambio no lo vería
 * nadie más y no pasa por ningún cobro. Los propietarios de la plataforma (isEnvAdmin) sí pueden, para probar los
 * planes en su propia cuenta; igual queda en la auditoría, marcado como cambio propio.
 */
export const MENSAJE_AUTOCONCESION =
  "No puedes cambiar tu propio plan, suscripción ni add-ons desde aquí. Pídeselo a un propietario de la plataforma.";

/** ¿Hay que bloquear este cambio? Solo si el administrador es la cuenta afectada y no es propietario. */
export function autoconcesionBloqueada(adminId: string, cuentaAfectadaId: string, esPropietario: boolean): boolean {
  return adminId === cuentaAfectadaId && !esPropietario;
}

/** Marca para la auditoría: solo aparece cuando el cambio fue sobre la propia cuenta del administrador. */
export function marcaDeCambioPropio(adminId: string, cuentaAfectadaId: string): { propio?: true } {
  return adminId === cuentaAfectadaId ? { propio: true } : {};
}
