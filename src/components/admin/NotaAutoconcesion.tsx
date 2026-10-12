import { MENSAJE_AUTOCONCESION } from "@/lib/admin/autoconcesion";

/** Versión corta para celdas de tabla; el mensaje completo va en el `title`. */
const TEXTO_BREVE = "Tu cuenta: solo un propietario cambia tu plan o add-ons.";

/**
 * Nota que ocupa el lugar de los controles que terminarían en 403 cuando un administrador mira SU PROPIA cuenta y no es
 * propietario (plan, suscripción y add-ons: ver lib/admin/autoconcesion.ts). Sin controles que fallen al pulsarlos.
 * Presentacional y sin estado: sirve tanto en pantallas de servidor como de cliente.
 */
export function NotaAutoconcesion({ breve = false, className }: { breve?: boolean; className?: string }) {
  return (
    <p
      role="note"
      data-nota="autoconcesion"
      title={breve ? MENSAJE_AUTOCONCESION : undefined}
      className={`text-[11.5px] leading-snug text-muted-foreground/70 ${className ?? ""}`.trim()}
    >
      {breve ? TEXTO_BREVE : MENSAJE_AUTOCONCESION}
    </p>
  );
}
