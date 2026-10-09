import { LEGAL_VERSION } from "./empresa";

/** Lo que se guarda en la cuenta cuando la persona acepta los documentos legales. */
export function datosDeAceptacion(ahora: Date = new Date()): { termsAcceptedAt: Date; termsVersion: string } {
  return { termsAcceptedAt: ahora, termsVersion: LEGAL_VERSION };
}

/** ¿Hay que pedirle a esta cuenta que acepte la versión vigente? (Nunca aceptó, o aceptó una versión anterior.) */
export function debeAceptar(cuenta: { termsVersion?: string | null } | null | undefined): boolean {
  if (!cuenta) return false;
  return cuenta.termsVersion !== LEGAL_VERSION;
}
