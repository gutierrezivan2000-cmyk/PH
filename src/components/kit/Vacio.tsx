"use client";

import { Inbox, Search, TriangleAlert, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Loseta } from "./Loseta";
import { moduloDe, type Tono } from "./modulos";
import { unir } from "./util";

/** Icono y color por defecto de un estado vacío: los de la función donde está (Residentes → 👥 celeste). */
function porDefecto(pathname: string | null): { icono: LucideIcon; tono: Tono } {
  const m = moduloDe(pathname);
  return m ? { icono: m.icono, tono: m.tono } : { icono: Inbox, tono: "violet" };
}

/**
 * Estado vacío: una ficha de color con el icono de la función, un titular con la
 * situación CONCRETA, un párrafo con el siguiente paso y las acciones (primaria + secundaria).
 *
 *   <Vacio titulo="Edificio Parque Central 127 aún no tiene unidades."
 *     texto="Sube el listado de copropietarios en Excel o PDF y la IA arma la tabla por ti."
 *     acciones={<><Boton onClick={importar}>Importar Excel con IA</Boton>
 *                 <Boton variante="secundario" onClick={agregar}>Agregar a mano</Boton></>} />
 */
export function Vacio({ titulo, texto, acciones, nivel = 2, icono, tono, className }: {
  titulo: ReactNode; texto?: ReactNode; acciones?: ReactNode; nivel?: 2 | 3; icono?: LucideIcon; tono?: Tono; className?: string;
}) {
  const base = porDefecto(usePathname());
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <div className={unir("k-vacio", className)}>
      <Loseta icono={icono ?? base.icono} tono={tono ?? base.tono} />
      <H>{titulo}</H>
      {texto && <p>{texto}</p>}
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}

/**
 * Sin resultados: la consulta repetida junto a una lupa, titular «No encontramos
 * «905» en Los Pinos.», párrafo y acciones DERIVADAS de la consulta
 * (primaria «Agregar la unidad 905», secundaria, fantasma «Limpiar búsqueda»).
 */
export function SinResultados({ consulta, titulo, texto, acciones, nivel = 2, className }: {
  consulta: string; titulo: ReactNode; texto?: ReactNode; acciones?: ReactNode; nivel?: 2 | 3; className?: string;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <div className={unir("k-vacio", className)} role="status">
      <Loseta icono={Search} tono="slate" />
      <div className="q"><span className="k-sr">Búsqueda: </span><span>{consulta}</span></div>
      <H>{titulo}</H>
      {texto && <p>{texto}</p>}
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}

/**
 * Error de carga: ficha roja con ⚠ + «No pudimos cargar las unidades.» + causa +
 * «Reintentar». Nunca una pantalla en blanco.
 */
export function ErrorCarga({ titulo, texto, acciones, nivel = 2, className }: {
  titulo: ReactNode; texto?: ReactNode; acciones?: ReactNode; nivel?: 2 | 3; className?: string;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <div className={unir("k-vacio", className)} role="alert">
      <Loseta icono={TriangleAlert} tono="red" />
      <H>{titulo}</H>
      {texto && <p>{texto}</p>}
      {acciones && <div className="acc">{acciones}</div>}
    </div>
  );
}
