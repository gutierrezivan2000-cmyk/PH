import { Construction, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Estado } from "./Estado";
import { Loseta } from "./Loseta";
import type { Tono } from "./modulos";
import { unir } from "./util";

/**
 * Pantalla pausada (ComingSoon): el lienzo con una trama suave de «en construcción» y, al
 * centro, una tarjeta con la ficha de color de la función, la marca «Próximamente»,
 * «Estamos construyendo esta sección.», qué traerá y una acción (p. ej. «Volver al inicio»).
 *
 *   <EnObra nombre="Cartera" icono={Wallet} tono="green" trae="Cartera por unidad, intereses de mora y paz y salvos."
 *     accion={<Boton variante="secundario" href="/dashboard">Volver al inicio</Boton>} />
 */
export function EnObra({ nombre, trae, accion, titulo = "Estamos construyendo esta sección.", className, minAlto, icono, tono }: {
  /** Se acepta y se ignora (número del antiguo índice). */
  nn?: string;
  nombre: string; trae: ReactNode; accion?: ReactNode; titulo?: string; className?: string;
  /** Alto mínimo del lienzo (por defecto 300 px; en pantalla completa, p. ej. "60vh"). */
  minAlto?: number | string;
  icono?: LucideIcon; tono?: Tono;
}) {
  return (
    <div role="group" aria-label={`${nombre} · próximamente`} className={unir("k-obra k-achurado", className)}
      style={minAlto ? { minHeight: minAlto } : undefined}>
      <div className="pl">
        <Loseta icono={icono ?? Construction} tono={tono ?? "amber"} />
        <div className="k"><Estado tipo="enObra">Próximamente</Estado></div>
        <h2>{titulo}</h2>
        <p>{trae}</p>
        {accion}
      </div>
    </div>
  );
}
