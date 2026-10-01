import {
  CalendarClock, CircleAlert, CircleCheck, CircleMinus, Clock, Hourglass, LoaderCircle, TriangleAlert, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Tono } from "./modulos";
import { unir } from "./util";

/**
 * Tipos de estado: SIEMPRE icono + color + palabra (nunca solo color).
 * ok ✓ verde (hecho, activo, listo, subido) · pendiente ⏱ gris (pendiente, en espera)
 * · falta ⚠ ámbar (falta un dato: sin correo) · vencido ! rojo (vencido, error)
 * · enCurso ◌ azul giratorio (en curso, procesando) · sin – gris (sin enlace, inactivo)
 * · enObra ⌛ gris (en obra, próximamente) · semana 📅 naranja (obligación de esta semana).
 */
export type TipoEstado = "ok" | "pendiente" | "falta" | "vencido" | "enCurso" | "sin" | "enObra" | "semana";

const ESTADOS: Record<TipoEstado, { Icono: LucideIcon; tono: Tono; gira?: boolean }> = {
  ok: { Icono: CircleCheck, tono: "green" },
  pendiente: { Icono: Clock, tono: "slate" },
  falta: { Icono: TriangleAlert, tono: "amber" },
  vencido: { Icono: CircleAlert, tono: "red" },
  enCurso: { Icono: LoaderCircle, tono: "blue", gira: true },
  sin: { Icono: CircleMinus, tono: "slate" },
  enObra: { Icono: Hourglass, tono: "slate" },
  semana: { Icono: CalendarClock, tono: "orange" },
};

/** Icono y tono de un tipo de estado (para tarjetas y filas que pintan su propia ficha). */
export function estiloDeEstado(tipo: TipoEstado): { Icono: LucideIcon; tono: Tono } {
  const { Icono, tono } = ESTADOS[tipo];
  return { Icono, tono };
}

/** Solo el icono de color (decorativo). Úsalo cuando la palabra ya está al lado. */
export function Cuadro({ tipo, className }: { tipo: TipoEstado; className?: string }) {
  const { Icono, tono, gira } = ESTADOS[tipo];
  return <Icono aria-hidden="true" focusable="false" data-h={tono} className={unir("k-cuadro", gira && "k-spin", className)} />;
}

/**
 * Estado = icono + palabra, en una píldora del color de su significado.
 *   <Estado tipo="ok">Activo</Estado>  <Estado tipo="falta">Sin correo</Estado>  <Estado tipo="vencido">Error</Estado>
 * `neutro`: la palabra en tinta normal, sin píldora (matrices densas); el icono conserva su color.
 * `tamLetra={14}` para celdas y listas compactas (tamaño de letra; por defecto 14,5).
 */
export function Estado({ tipo, children, neutro, tamLetra, className }:
  { tipo: TipoEstado; children: ReactNode; neutro?: boolean; tamLetra?: 14 | 15 | 16; className?: string }) {
  const { Icono, tono, gira } = ESTADOS[tipo];
  return (
    <span className={unir("k-estado", neutro && "neutro", className)} data-h={tono} data-spin={gira || undefined} style={tamLetra ? { fontSize: tamLetra } : undefined}>
      <Icono aria-hidden="true" focusable="false" />
      {children}
    </span>
  );
}

/**
 * Etiqueta = icono + palabra en una píldora del color que tú elijas. Para estados propios de una
 * función (radicado, en proceso, vigente, programado…) que no están entre los `TipoEstado`.
 *   <Etiqueta icono={Inbox} tono="blue">Radicado</Etiqueta>
 * `gira` hace girar el icono (procesando).
 */
export function Etiqueta({ icono: Icono, tono, gira, children, className }:
  { icono?: LucideIcon; tono: Tono; gira?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={unir("k-estado", className)} data-h={tono} data-spin={gira || undefined}>
      {Icono && <Icono aria-hidden="true" focusable="false" />}
      {children}
    </span>
  );
}

/**
 * Insignia = un número en una píldora. `alerta` = conteo de vencidas (rojo).
 * `unidad` va en texto solo para lectores de pantalla.
 *   <Insignia alerta unidad="vencidas">3</Insignia>
 */
export function Insignia({ children, alerta, unidad, tono, className }:
  { children: ReactNode; alerta?: boolean; unidad?: string; tono?: Tono; className?: string }) {
  return (
    <span className={unir("k-bdg", alerta && "alerta", className)} data-h={tono}>
      {children}
      {unidad && <span className="k-sr"> {unidad}</span>}
    </span>
  );
}

/** Categoría: etiqueta con su color (siempre el mismo por categoría): legal, póliza, mantenimiento, SG-SST… */
export function Categoria({ children, tono, className }: { children: ReactNode; tono?: Tono; className?: string }) {
  return <span className={unir("k-cat", className)} data-h={tono ?? "slate"}>{children}</span>;
}

/** Color de cada tipo de archivo: PDF rojo, hojas de cálculo verde, Word azul, imágenes rosa, audio fucsia… */
const TONO_ARCHIVO: Record<string, Tono> = {
  PDF: "red", XLS: "green", CSV: "green", DOC: "blue", INF: "violet", ACTA: "indigo", PRES: "amber", PPT: "orange",
  JPG: "pink", PNG: "pink", IMG: "pink", HEIC: "pink", M4A: "fuchsia", MP3: "fuchsia", WAV: "fuchsia", OGG: "fuchsia",
  WEBM: "fuchsia", MP4: "fuchsia", TXT: "slate",
};

/** Tipo de archivo/documento en una etiqueta de su color: XLS, PDF, DOC, INF, ACTA, PRES. */
export function TipoArchivo({ children, tono, className }: { children: ReactNode; tono?: Tono; className?: string }) {
  const clave = typeof children === "string" ? children.trim().toUpperCase() : "";
  return <span className={unir("k-tipo", className)} data-h={tono ?? TONO_ARCHIVO[clave] ?? "slate"}>{children}</span>;
}
