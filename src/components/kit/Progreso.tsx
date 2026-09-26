import type { ReactNode } from "react";
import { Cuadro } from "./Estado";
import { unir } from "./util";

/**
 * Barra de progreso plana: pista --surface-3 + relleno --ink (8 px; 10 con alto={10}).
 * `excede` pinta el relleno en --danger (presupuesto > 100 %).
 * `decorativa` la oculta a lectores cuando el porcentaje ya está en texto al lado.
 */
export function BarraProgreso({ valor, alto = 8, excede, etiquetaAccesible, decorativa, className }: {
  valor: number; alto?: 8 | 10; excede?: boolean;
  /** Nombre de la barra para lectores (aria-label). No se ve. */
  etiquetaAccesible?: string; decorativa?: boolean; className?: string;
}) {
  const pct = Math.max(0, Math.min(100, valor));
  return (
    <span
      className={unir("k-barra", alto === 10 && "k-10", excede && "excede", className)}
      role={decorativa ? undefined : "progressbar"}
      aria-hidden={decorativa || undefined}
      aria-label={decorativa ? undefined : etiquetaAccesible}
      aria-valuemin={decorativa ? undefined : 0}
      aria-valuemax={decorativa ? undefined : 100}
      aria-valuenow={decorativa ? undefined : Math.round(pct)}
    >
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

export type EtapaGeneracion = {
  nombre: string;
  estado: "listo" | "curso" | "espera" | "error";
  /** Solo con estado "error": el motivo concreto. */
  motivo?: ReactNode;
};

/**
 * Progreso de generación (SPEC §f.20): recuadro de 2 px, título 22 px + copropiedad,
 * barra de 10 px con % en mono, lista de ETAPAS REALES del job con estado
 * (■ listo · ◧ en curso · □ en espera · ■ naranja error), nota y acciones.
 * role="status" aria-live="polite".
 *
 *   <ProgresoGeneracion titulo="Informe de gestión · septiembre 2026" subtitulo="Conjunto Residencial Los Pinos"
 *     porcentaje={job.progress} etapas={etapasDelJob}
 *     nota="El proceso continúa aunque cierres esta página."
 *     acciones={<Boton variante="secundario" href="/dashboard">Volver al inicio</Boton>} />
 */
export function ProgresoGeneracion({ titulo, subtitulo, porcentaje, etapas, nota, acciones, className }: {
  titulo: ReactNode; subtitulo?: ReactNode; porcentaje: number; etapas: EtapaGeneracion[];
  nota?: ReactNode; acciones?: ReactNode; className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(porcentaje)));
  const hayError = etapas.some((e) => e.estado === "error");
  return (
    <div className={unir("k-gen", className)} role="status" aria-live="polite">
      <div className="gt"><b>{titulo}</b>{subtitulo && <span>{subtitulo}</span>}</div>
      <div className="gbar">
        <BarraProgreso valor={pct} alto={10} excede={hayError} decorativa />
        <span>{pct}&nbsp;%</span>
      </div>
      <ol>
        {etapas.map((e, i) => (
          <li key={i} className={e.estado}>
            <Cuadro tipo={e.estado === "listo" ? "ok" : e.estado === "curso" ? "enCurso" : e.estado === "error" ? "vencido" : "pendiente"} />
            <span>{e.nombre}</span>
            <small>{e.estado === "listo" ? "listo" : e.estado === "curso" ? "en curso" : e.estado === "error" ? "error" : "en espera"}</small>
            {e.estado === "error" && e.motivo && <span className="motivo">{e.motivo}</span>}
          </li>
        ))}
      </ol>
      {nota && <p className="nota">{nota}</p>}
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}
