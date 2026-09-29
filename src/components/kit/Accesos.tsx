import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Loseta } from "./Loseta";
import type { Tono } from "./modulos";
import { unir } from "./util";

/**
 * Accesos rápidos: fichas grandes y amables que llevan a una función, con su icono y color.
 * Sirven para que cualquiera encuentre qué hacer sin conocer el menú.
 *
 *   <Accesos>
 *     <Acceso href="/dashboard/generar" icono={FilePlus2} tono="blue" titulo="Generar informe o acta" texto="En cinco pasos, en minutos." />
 *   </Accesos>
 */
export function Accesos({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={unir("k-accesos", className)}>{children}</div>;
}

export function Acceso({ href, icono, tono, titulo, texto, insignia }: {
  href: string; icono: LucideIcon; tono: Tono; titulo: ReactNode; texto?: ReactNode;
  /** Número pendiente (p. ej. «2» por generar); se lee junto al título. */
  insignia?: { n: number; unidad: string; alerta?: boolean };
}) {
  return (
    <Link href={href} className="k-acceso" data-h={tono}>
      <Loseta icono={icono} tono={tono} tam={52} />
      <span className="t">
        <b>{titulo}</b>
        {texto && <small>{texto}</small>}
      </span>
      {insignia && insignia.n > 0 && (
        <span className={unir("k-bdg", insignia.alerta && "alerta")}>{insignia.n}<span className="k-sr"> {insignia.unidad}</span></span>
      )}
      <ArrowRight className="ir" aria-hidden="true" focusable="false" />
    </Link>
  );
}
