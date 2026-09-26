import type { ReactNode } from "react";
import { unir } from "./util";

/**
 * Pantalla pausada (SPEC §f.18, ComingSoon): el lienzo entero achurado con
 * borde 1,5 px --line-strong y, abajo a la izquierda, una PLACA SÓLIDA:
 * «05 Cartera · próximamente» + «Esta sección está en obra.» (40 px) + qué
 * traerá + acción (p. ej. «Avisarme» secundario, SOLO si existe ese flujo).
 *
 *   <EnObra nn="05" nombre="Cartera" trae="Cartera por unidad, intereses de mora y paz y salvos."
 *     accion={<Boton variante="secundario" href="/dashboard/soporte">Escríbenos</Boton>} />
 */
export function EnObra({ nn, nombre, trae, accion, titulo = "Esta sección está en obra.", className, minAlto }: {
  nn: string; nombre: string; trae: ReactNode; accion?: ReactNode; titulo?: string; className?: string;
  /** Alto mínimo del lienzo (por defecto 300 px; en pantalla completa, p. ej. "60vh"). */
  minAlto?: number | string;
}) {
  return (
    <div role="group" aria-label={`${nombre} · próximamente`} className={unir("k-obra k-achurado", className)}
      style={minAlto ? { minHeight: minAlto } : undefined}>
      <div className="pl">
        <div className="k"><span className="k-ref">{nn}</span>{nombre} · próximamente</div>
        <h2>{titulo}</h2>
        <p>{trae}</p>
        {accion}
      </div>
    </div>
  );
}
