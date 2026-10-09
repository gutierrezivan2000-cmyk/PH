import { cuandoSeLibera, mensajeDeAgotado, nivelDeAviso, type EstadoDeUso } from "@/lib/uso-chat";

/** El uso del chat tal como llega del servidor: la fecha de renovación viaja como texto. */
export type UsoVista = Omit<EstadoDeUso, "renovaEn"> & { renovaEn: string };

const DONDE: Record<EstadoDeUso["ventana"], string> = {
  sesion: "en esta sesión de 5 horas",
  semana: "esta semana",
  mes: "este mes",
};

const CSS_BARRA_DE_USO = `
.barra-uso { display: grid; gap: 6px; margin: 0 0 10px; }
.barra-uso-cifra { margin: 0; font-size: 13px; color: var(--ink-3); }
.barra-uso-cifra b { color: var(--ink); font-weight: 700; }
.barra-uso-pista { height: 6px; border-radius: 999px; background: var(--line); overflow: hidden; }
.barra-uso-pista > span { display: block; height: 100%; border-radius: inherit; background: var(--ink-2); transition: width .3s ease; }
.barra-uso[data-nivel="poco"] .barra-uso-pista > span { background: var(--warn-text); }
.barra-uso[data-nivel="casi_agotado"] .barra-uso-pista > span,
.barra-uso[data-nivel="agotado"] .barra-uso-pista > span { background: var(--danger-text); }
.barra-uso-aviso { margin: 0; font-size: 13px; color: var(--ink-2); }
@media (prefers-reduced-motion: reduce) { .barra-uso-pista > span { transition: none; } }
`;

/**
 * El porcentaje de uso del chat que le queda a la cuenta, como en Claude o ChatGPT: 100 % al empezar y que baja con lo que se
 * usa. Avisa al 20 % y al 5 %, y dice cuándo vuelve el uso cuando se agota.
 */
export function BarraDeUso({ uso, ahora }: { uso: UsoVista; ahora?: Date }) {
  const nivel = nivelDeAviso(uso.porcentajeRestante);
  const estado: EstadoDeUso = { ...uso, renovaEn: new Date(uso.renovaEn) };
  const hoy = ahora ?? new Date();
  const aviso =
    nivel === "agotado"
      ? mensajeDeAgotado(estado, hoy)
      : nivel === "casi_agotado"
        ? `Te queda muy poco uso ${DONDE[uso.ventana]}. Vuelve a tener uso ${cuandoSeLibera(estado.renovaEn, hoy)}.`
        : nivel === "poco"
          ? `Te queda poco uso ${DONDE[uso.ventana]}.`
          : null;

  return (
    <div className="barra-uso" data-nivel={nivel}>
      <style>{CSS_BARRA_DE_USO}</style>
      <p className="barra-uso-cifra">
        <b>{uso.porcentajeRestante} %</b> de tu uso disponible {DONDE[uso.ventana]}
      </p>
      <div
        className="barra-uso-pista"
        role="progressbar"
        aria-label="Uso del chat disponible"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={uso.porcentajeRestante}
        aria-valuetext={`${uso.porcentajeRestante} % disponible`}
      >
        <span style={{ width: `${uso.porcentajeRestante}%` }} />
      </div>
      {aviso && (
        <p className="barra-uso-aviso" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}
