"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { Header } from "@/components/dashboard/Header";
import { publicarJSON } from "@/components/dashboard/datosIndice";
import { AssetImport } from "@/components/dashboard/AssetImport";
import { ASSET_KIND_LABELS, recurrenceLabel, type AssetKind } from "@/lib/common-assets";
import {
  AccionesFila,
  AreaTexto,
  Aviso,
  Boton,
  BotonFila,
  BotonIcono,
  CabeceraPieza,
  Campo,
  Casilla,
  Categoria,
  Chevron,
  Cornisa,
  Cuadro,
  Entrada,
  ErrorCarga,
  Esqueleto,
  MenuMas,
  Modal,
  Pagina,
  Panel,
  PestanasUnidas,
  Pieza,
  Segmentos,
  Selector,
  Tabla,
  TiraSemanal,
  Urgencia,
  Urgencias,
  Vacio,
  avisar,
  nombreCorto,
  unir,
  type ColumnaTabla,
  type DiaTira,
  type ItemMenu,
  type TipoEstado,
} from "@/components/kit";

interface CalendarItem {
  key: string;
  propertyId: string;
  propertyName: string;
  title: string;
  description: string;
  category: string;
  dueDate: string;
  source: "auto" | "custom" | "asset";
  status: "pending" | "done" | "dismissed";
}

interface CommonAsset {
  id: string;
  propertyId: string;
  kind: AssetKind;
  name: string;
  provider: string | null;
  reference: string | null;
  notes: string | null;
  dueDate: string;
  recurrenceMonths: number | null;
}

interface PropertyInfo {
  id: string;
  name: string;
  features: {
    ascensor?: boolean;
    piscina?: boolean;
    plantaElectrica?: boolean;
    gimnasio?: boolean;
    empleadosDirectos?: boolean;
    polizaVence?: string | null;
  };
  hasProfile?: boolean;
}

/*
 * La categoría es una PALABRA (SPEC §f.8): sin color ni forma propia. Antes cada
 * categoría llevaba su color (CATEGORY_CONFIG); ahora solo queda su rótulo.
 */
const CATEGORIA: Record<string, string> = {
  legal: "Legal",
  poliza: "Póliza",
  mantenimiento: "Mantenimiento",
  sgsst: "SG-SST",
  finanzas: "Finanzas",
  informe: "Informe",
  asamblea: "Asamblea",
  custom: "Recordatorio",
};

/* ════════════════════════════════════════════════════════════════════
   Fechas y textos (español de Colombia)
   ════════════════════════════════════════════════════════════════════ */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const LETRA_DIA = ["L", "M", "M", "J", "V", "S", "D"];
const CABECERA_MES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NB = "\u00a0"; // espacio duro entre número y mes («24 sep»)

const may = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const minIni = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

function daysUntil(dueDate: string): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - base.getTime()) / 86400000);
}

function relativeLabel(days: number): string {
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days > 1) return `En ${days}${NB}días`;
  if (days === -1) return "Venció ayer";
  return `Hace ${Math.abs(days)}${NB}días`;
}

function aFecha(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoDe(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}
function sumarDias(f: Date, n: number): Date {
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + n);
}
function hoySinHora(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}
/** Lunes de la semana ISO de la fecha. */
function lunesDe(f: Date): Date {
  return sumarDias(f, -((f.getDay() || 7) - 1));
}
/** Semana ISO 8601 («S39»). */
function semanaIso(f: Date): number {
  const d = new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7);
}
/** «21 al 27 de septiembre», «28 de septiembre al 4 de octubre», con año si no es el actual. */
function rangoSemana(lunes: Date, hoy: Date): string {
  const dom = sumarDias(lunes, 6);
  if (lunes.getFullYear() !== dom.getFullYear()) {
    return `${lunes.getDate()} de ${MESES[lunes.getMonth()]} de ${lunes.getFullYear()} al ${dom.getDate()} de ${MESES[dom.getMonth()]} de ${dom.getFullYear()}`;
  }
  const anio = dom.getFullYear() !== hoy.getFullYear() ? ` de ${dom.getFullYear()}` : "";
  if (lunes.getMonth() === dom.getMonth()) return `${lunes.getDate()} al ${dom.getDate()} de ${MESES[dom.getMonth()]}${anio}`;
  return `${lunes.getDate()} de ${MESES[lunes.getMonth()]} al ${dom.getDate()} de ${MESES[dom.getMonth()]}${anio}`;
}
/** «31 mar», o «31 mar 2025» si no es de este año. */
function fechaCorta(f: Date, hoy: Date): string {
  const base = `${f.getDate()}${NB}${MESES_CORTOS[f.getMonth()]}`;
  return f.getFullYear() === hoy.getFullYear() ? base : `${base}${NB}${f.getFullYear()}`;
}
/** «Vie 25» si es del mes de hoy; «Vie 2 oct» si no. */
function fechaDia(f: Date, hoy: Date): string {
  const base = `${DIAS_CORTOS[f.getDay()]}${NB}${f.getDate()}`;
  return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear()
    ? base
    : `${base}${NB}${MESES_CORTOS[f.getMonth()]}`;
}

/**
 * Título legible (la misma regla que Inicio). Las pólizas y zonas comunes llegan
 * como «Vencimiento: Todo riesgo (área común)» / «Mantenimiento: Planta eléctrica»
 * (common-assets.ts): se leen «Póliza todo riesgo…» / «Mantenimiento de planta eléctrica».
 */
function tituloDe(it: CalendarItem): string {
  const m = it.source === "asset" ? it.title.match(/^(Vencimiento|Mantenimiento):\s*(.+)$/) : null;
  if (!m) return it.title;
  const nombre = m[2].trim();
  if (m[1] === "Vencimiento") return /^p[óo]liza/i.test(nombre) ? nombre : `Póliza ${minIni(nombre)}`;
  return /^mantenimiento/i.test(nombre) ? nombre : `Mantenimiento de ${minIni(nombre)}`;
}

/** Rótulo corto para la tira semanal y las celdas del mes («Planta eléctrica», «Asamblea ordinaria»). */
function tituloCorto(it: CalendarItem): string {
  const m = it.source === "asset" ? it.title.match(/^(?:Vencimiento|Mantenimiento):\s*(.+)$/) : null;
  const base = m ? m[1].trim() : it.title;
  return base.replace(/\s*\(.*\)\s*$/, "").replace(/\s+\d{4}$/, "") || base;
}

/** Rótulo bajo el día de la tira semanal (mismo criterio que Inicio). */
function rotuloTira(its: CalendarItem[]): string {
  if (its.length > 1) return `${its.length} obligaciones`;
  let r = its[0].category === "informe" ? "Informe" : tituloCorto(its[0]);
  if (r.length > 24) r = `${r.slice(0, 22).replace(/\s+\S*$/, "")}…`;
  return r;
}

/**
 * Sigla de la copropiedad para las celdas del mes (SPEC §g 03): iniciales del
 * nombre corto, cifras enteras y sin conectores en minúscula.
 * «Los Pinos» → LP · «Torres del Río» → TR · «Mirador 93» → M93.
 */
function siglaDe(nombre: string): string {
  const corto = nombreCorto(nombre);
  let s = "";
  for (const p of corto.split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(p)) s += p;
    else if (/^(de|del|la|las|el|los|y|e)$/.test(p)) continue;
    else s += p[0].toUpperCase();
  }
  return s || corto.slice(0, 2).toUpperCase();
}

/* ════════════════════════════════════════════════════════════════════
   Estilos locales: la lista por semanas y la rejilla del mes no están en
   el kit (se construyen con tokens siguiendo secundarias.html §e).
   Van sin capa: todo ajuste a una clase del kit se acota por media query.
   ════════════════════════════════════════════════════════════════════ */

const CSS_BITACORA = `
@media (min-width: 1181px) {
  .bit .k-pieza-h .tt { grid-column: 2 / 8; }
  .bit .k-pieza-h .acc { grid-column: 8 / 13; flex-wrap: nowrap; }
}
.bit-tabs { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 16px; border-bottom: 2px solid var(--rule); margin-bottom: 28px; }
.bit-tabs > .k-seg { border-bottom: 0; min-width: 0; }
.bit-tabs > .fin { margin-left: auto; padding-bottom: 2px; }

.bit-urg { margin: 0 0 34px; }
@media (min-width: 1181px) {
  .bit-urg .k-cubo-a .k-num { font-size: 176px; }
  .bit-urg .k-cubo-b .k-num { font-size: 124px; }
  .bit-urg .k-cubo-c .k-num { font-size: 84px; }
  .bit-urg .k-cubo-a .cap b { font-size: 32px; }
  .bit-urg .k-cubo-b .cap b { font-size: 26px; }
  .bit-urg .k-cubo-c .cap b { font-size: 22px; }
}
@media (min-width: 861px) and (max-width: 1180px) {
  .bit-urg .k-cubo { flex-direction: row; align-items: flex-end; gap: 12px; }
  .bit-urg .k-cubo-a .k-num { font-size: 150px; }
  .bit-urg .k-cubo-b .k-num { font-size: 104px; }
  .bit-urg .k-cubo-c .k-num { font-size: 72px; }
  .bit-urg .k-cubo-a .cap b { font-size: 26px; }
  .bit-urg .k-cubo-b .cap b { font-size: 21px; }
  .bit-urg .k-cubo-c .cap b { font-size: 18px; }
}
.bit-aviso { margin: 0 0 24px; }

/* ── lista por semanas ── */
.bit-grupo { margin: 0 0 30px; }
.bit-gh { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 12px 0 10px; border-top: 2px solid var(--rule); font-weight: 400; }
.bit-gh b { font-size: 32px; font-weight: 800; font-stretch: 62%; letter-spacing: -.02em; line-height: .9; }
.bit-gh.venc b { color: var(--signal); }
.bit-gh .r { font-size: 14px; line-height: 1.3; color: var(--ink-2); }
.bit-gh em { margin-left: auto; font-style: normal; font-size: 14px; font-weight: 700; }
.bit-tira { margin: 0; }
.bit-tira + .bit-nada, .bit-tira + .bit-lista > .bit-fila:first-child { border-top: 0; }
.bit-nada { margin: 0; padding: 12px 0; border-top: 1px solid var(--line); font-size: 15px; color: var(--ink-2); }
.bit-lista { list-style: none; margin: 0; padding: 0; }
.bit-fila { position: relative; display: grid; grid-template-columns: 20px 104px minmax(0, 1fr) 128px auto; column-gap: 12px; align-items: start; padding: 13px 0 14px; border-top: 1px solid var(--line); }
.bit-fila:hover { background: var(--hl); box-shadow: calc(var(--g) / -2) 0 0 var(--hl), calc(var(--g) / 2) 0 0 var(--hl); }
.bit-fila > .k-cuadro { margin-top: 5px; }
.bit-fila > .d { font-size: 15px; font-weight: 700; line-height: 1.3; white-space: nowrap; }
.bit-fila > .t { min-width: 0; }
.bit-fila > .t b { display: block; font-size: 16px; font-weight: 650; line-height: 1.25; letter-spacing: -.005em; overflow-wrap: anywhere; }
.bit-fila > .t small { display: block; margin-top: 3px; font-size: 14px; line-height: 1.3; color: var(--ink-3); }
.bit-fila > .t small .v { color: var(--danger-text); font-weight: 600; }
.bit-fila > .t p { margin: 6px 0 0; max-width: 72ch; font-size: 14px; line-height: 1.4; color: var(--ink-3); text-wrap: pretty; }
.bit-fila > .k-cat { padding-top: 2px; white-space: normal; }
.bit-fila > .acc { margin-top: -10px; display: flex; justify-content: flex-end; }
.bit-fila.hecha > .d, .bit-fila.hecha > .t b { color: var(--ink-3); }
.bit-plegable { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 0; border: 0; border-top: 2px solid var(--rule); background: transparent; color: var(--ink); text-align: left; font: inherit; cursor: pointer; }
.bit-plegable:hover { background: var(--hl); }
.bit-plegable b { font-size: 22px; font-weight: 800; font-stretch: 75%; letter-spacing: -.01em; line-height: 1.05; }
.bit-plegable .n { font-size: 14px; font-weight: 700; color: var(--ink-2); }
.bit-plegable .k-ar { margin-left: auto; width: 14px; height: 14px; }

/* ── mes ── */
.bit-mes-cab { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px 0 12px; border-top: 2px solid var(--rule); }
.bit-mes-cab h2 { margin: 0; font-size: 32px; font-weight: 800; font-stretch: 72%; letter-spacing: -.02em; line-height: .9; }
.bit-mes-cab .pg { display: flex; align-items: center; gap: 10px; }
.bit-mes-cab .pg > span { display: flex; }
.bit-mesg { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 2px solid var(--rule); border-left: 1px solid var(--line); }
.bit-dh { padding: 8px 8px 7px; border-bottom: 2px solid var(--rule); border-right: 1px solid var(--line); font-size: 13px; font-weight: 700; line-height: 1.2; color: var(--ink-2); }
.bit-dia { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-width: 0; min-height: 108px; margin: 0; padding: 6px 6px 8px; border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.bit-dia:hover { background: var(--hl); }
.bit-dia[aria-pressed="true"] { background: var(--hl); box-shadow: inset 0 0 0 2px var(--rule); }
.bit-dia .dn { align-self: flex-start; padding: 2px 4px; font-size: 22px; font-weight: 800; font-stretch: 62%; line-height: 1; }
.bit-dia.fuera .dn { color: var(--ink-4); font-weight: 600; }
.bit-dia.pas .dn { color: var(--ink-3); }
.bit-dia.con .dn { background: var(--day-mark); color: var(--ink); }
.bit-dia.hoy, .bit-dia.hoy[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--signal); }
.bit-dia .hoy-l { position: absolute; top: 8px; right: 8px; font-size: 12px; font-weight: 800; line-height: 1; color: var(--danger-text); }
.bit-ev { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; padding: 3px 5px 0 7px; border-bottom: 3px solid var(--surface-2); border-left: 4px solid var(--ink); background: var(--surface-2); color: var(--ink); font-size: 13px; font-weight: 600; line-height: 1.2; overflow-wrap: anywhere; }
.bit-ev b { font-weight: 800; }
.bit-ev.venc { border-left-color: var(--danger); }
.bit-ev.hecha { border-left-color: var(--ok); color: var(--ink-2); font-weight: 500; }
.bit-mas-ev { align-self: flex-start; font-size: 13px; font-weight: 700; line-height: 1.2; text-decoration: underline; text-underline-offset: 3px; }
.bit-rayas { display: none; }
.bit-leyenda { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 12px 0 0; font-size: 14px; line-height: 1.3; color: var(--ink-2); }
.bit-leyenda span { display: inline-flex; align-items: center; gap: 8px; }
.bit-leyenda i { width: 4px; height: 16px; background: var(--ink); }
.bit-leyenda i.venc { background: var(--danger); }
.bit-leyenda i.hecha { background: var(--ok); }
.bit-leyenda b { font-weight: 800; color: var(--ink); }
.bit-dpanel { margin-top: 28px; }
.bit-dpanel h3 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 0; padding: 12px 0 10px; border-top: 2px solid var(--rule); font-size: 22px; font-weight: 800; font-stretch: 75%; letter-spacing: -.01em; line-height: 1.05; }
.bit-dpanel h3 small { font-size: 14px; font-weight: 400; font-stretch: 100%; letter-spacing: 0; color: var(--ink-2); }
.bit-dvacio { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; padding: 14px 0; border-top: 1px solid var(--line); }
.bit-dvacio p { margin: 0; font-size: 15px; color: var(--ink-2); }
.bit-pista { margin: 0; padding: 14px 0; border-top: 2px solid var(--rule); font-size: 15px; color: var(--ink-2); }

/* ── registro de zonas comunes y pólizas ── */
.bit-reg { align-items: start; row-gap: 36px; }
.bit-reg > .lst { grid-column: 1 / 9; min-width: 0; }
.bit-reg > .imp { grid-column: 9 / 13; min-width: 0; }
.bit-reg:has(.ai-prev) > .imp { grid-column: 1 / -1; order: -1; }
.bit-reg .imp .k-panel-h { margin-bottom: 10px; }
.bit-imp-t { margin: 0 0 14px; font-size: 15px; line-height: 1.45; color: var(--ink-2); text-wrap: pretty; }
.bit-fa { display: grid; grid-template-columns: 10px auto; column-gap: 8px; row-gap: 2px; align-items: baseline; }
.bit-fa > .k-cuadro { align-self: center; }
.bit-fa b { font-size: 15px; font-weight: 700; line-height: 1.3; white-space: nowrap; }
.bit-fa small { grid-column: 2; font-size: 14px; line-height: 1.3; color: var(--ink-2); }
.bit-fa small.v { color: var(--danger-text); font-weight: 600; }
.bit-arch-l { list-style: none; margin: 0; padding: 0; }
.bit-arch { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 16px; min-height: 60px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.bit-arch b { display: block; font-size: 15px; font-weight: 650; line-height: 1.3; color: var(--ink-2); }
.bit-arch small { display: block; font-size: 14px; line-height: 1.3; color: var(--ink-3); }
.bit-reg .bit-plegable { margin-top: 28px; }
@media (min-width: 861px) {
  .bit-reg .k-tr:not(.th) { padding: 12px 0; }
}

/* ── formularios en modal ── */
.bit-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 16px; margin-top: 18px; }
.bit-form > .ancho { grid-column: 1 / -1; }
.bit-form-err { margin: 0 0 4px; }
.bit-perfil { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 16px; margin: 6px 0 18px; border-top: 1px solid var(--line); }
.bit-perfil > * { border-bottom: 1px solid var(--line); color: var(--ink); }

@media (max-width: 860px) {
  .bit-tabs { margin-bottom: 22px; }
  .bit-tabs > .fin { margin-left: 0; flex-basis: 100%; padding-bottom: 8px; }
  .bit-urg { margin-bottom: 28px; }
  .bit-gh b { font-size: 28px; }
  .bit-fila { grid-template-columns: 20px 72px minmax(0, 1fr); row-gap: 6px; column-gap: 10px; }
  .bit-fila:hover { box-shadow: -8px 0 0 var(--hl), 8px 0 0 var(--hl); }
  .bit-fila > .k-cat { grid-column: 3; grid-row: 2; padding: 0; }
  .bit-fila > .acc { grid-column: 3; margin: 4px 0 0; justify-content: flex-start; }
  .bit-mes-cab h2 { font-size: 28px; }
  .bit-mes-cab .k-ic { width: 44px; height: 44px; }
  .bit-mes-cab .k-btn { min-height: 44px; }
  .bit-dh { padding: 7px 2px 6px; text-align: center; }
  .bit-dia { min-height: 64px; padding: 4px 3px 6px; gap: 4px; }
  .bit-dia .dn { font-size: 18px; padding: 2px 3px; }
  .bit-dia .hoy-l, .bit-ev, .bit-mas-ev { display: none; }
  .bit-rayas { display: grid; gap: 3px; }
  .bit-rayas i { display: block; height: 4px; background: var(--ink); }
  .bit-rayas i.venc { background: var(--danger); }
  .bit-rayas i.hecha { background: var(--ok); }
  .bit-rayas small { font-size: 12px; font-weight: 700; line-height: 1; }
  .bit-dvacio .k-btn { flex: 1 1 100%; }
  .bit-arch { grid-template-columns: minmax(0, 1fr); row-gap: 8px; }
  .bit-form, .bit-perfil { grid-template-columns: minmax(0, 1fr); }
}
`;

/* ════════════════════════════════════════════════════════════════════
   Componentes FUERA de CalendarioPage a propósito.
   Definidos dentro, cada render del padre creaba funciones nuevas y React
   remontaba el subárbol entero: comprobado en el navegador — se escribía en el
   formulario, se pulsaba un chip de propiedad y el campo quedaba vacío. Lo
   mismo borraba la vista previa del import por IA con hasta 300 filas ya
   revisadas. Aquí su identidad es estable y conservan su estado.
   ════════════════════════════════════════════════════════════════════ */

type AccionItem = "done" | "undo" | "dismiss";

/**
 * Fila de la bitácora (secundarias.html §e): estado · fecha 15/700 · título
 * 16/650 + copropiedad y plazo 14 · categoría como palabra · acción principal
 * con texto + «Más». Pasados/hechos en --ink-3 con ■ ok.
 */
function FilaEvento({
  item,
  fecha,
  mostrarProp,
  ocupado,
  alMarcar,
  alPedirEliminar,
}: {
  item: CalendarItem;
  fecha: string;
  mostrarProp: boolean;
  ocupado: boolean;
  alMarcar: (item: CalendarItem, action: AccionItem) => void;
  alPedirEliminar: (item: CalendarItem) => void;
}) {
  const d = daysUntil(item.dueDate);
  const hecha = item.status === "done";
  const titulo = tituloDe(item);
  const tipo: TipoEstado = hecha ? "ok" : d < 0 ? "vencido" : "pendiente";
  const menu: ItemMenu[] = hecha
    ? []
    : item.source === "custom"
      ? [{ etiqueta: "Eliminar recordatorio…", nota: "pide confirmación", peligro: true, alElegir: () => alPedirEliminar(item) }]
      : item.source === "asset"
        ? [{ etiqueta: "Archivar", nota: "deja de recordarse", alElegir: () => alMarcar(item, "dismiss") }]
        : [{ etiqueta: "No aplica · ocultar", alElegir: () => alMarcar(item, "dismiss") }];
  const verbo = hecha ? "Marcar pendiente" : "Marcar hecho";

  return (
    <li className={unir("bit-fila", hecha && "hecha")}>
      <Cuadro tipo={tipo} />
      <span className="d">{fecha}</span>
      <div className="t">
        <b>{titulo}</b>
        <small>
          {mostrarProp && <>{item.propertyName} · </>}
          {hecha ? "Hecha" : <span className={d < 0 ? "v" : undefined}>{relativeLabel(d)}</span>}
        </small>
        {item.description && !hecha && <p>{item.description}</p>}
      </div>
      <Categoria>{CATEGORIA[item.category] ?? CATEGORIA.custom}</Categoria>
      <div className="acc">
        <AccionesFila>
          <BotonFila
            onClick={() => alMarcar(item, hecha ? "undo" : "done")}
            disabled={ocupado}
            aria-label={`${ocupado ? "Guardando" : verbo}: ${titulo} · ${item.propertyName}`}
          >
            {ocupado ? "Guardando…" : verbo}
          </BotonFila>
          {menu.length > 0 && <MenuMas items={menu} etiquetaAccesible={`Más acciones · ${titulo} · ${item.propertyName}`} />}
        </AccionesFila>
      </div>
    </li>
  );
}

/** Días de la rejilla: del lunes anterior al 1 hasta el domingo posterior al último día. */
function diasDeRejilla(anio: number, mes: number): Date[] {
  const inicio = lunesDe(new Date(anio, mes, 1));
  const ultimo = new Date(anio, mes + 1, 0);
  const fin = sumarDias(ultimo, 7 - (ultimo.getDay() || 7));
  const dias: Date[] = [];
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) dias.push(f);
  return dias;
}

function claseEvento(ev: CalendarItem, hoyIso: string): string | undefined {
  if (ev.status === "done") return "hecha";
  return ev.dueDate < hoyIso ? "venc" : undefined;
}

/**
 * Rejilla del mes (SPEC §g 03): 7 columnas con filetes de 1 px, celdas ≥ 108 px,
 * número 22 px/62 % (en --day-mark si hay obligaciones), hoy con recuadro
 * --signal, eventos como barras con filete izquierdo de 4 px (máx. 2 + «+N más»).
 * Cada día es un botón que abre su lista debajo; flechas del teclado para moverse.
 * En móvil, una raya de 4 px por evento (el nombre del botón lleva el detalle).
 */
function VistaMes({
  anio,
  mes,
  hoy,
  eventos,
  siglas,
  leyendaSiglas,
  elegido,
  alElegir,
  alCambiarMes,
}: {
  anio: number;
  mes: number;
  hoy: Date;
  eventos: Map<string, CalendarItem[]>;
  siglas: Map<string, string> | null;
  leyendaSiglas: Array<{ sigla: string; nombre: string }>;
  elegido: string | null;
  alElegir: (iso: string) => void;
  alCambiarMes: (delta: number) => void;
}) {
  const dias = diasDeRejilla(anio, mes);
  const hoyIso = isoDe(hoy);
  const botones = useRef(new Map<string, HTMLButtonElement>());
  const enfocar = useRef<string | null>(null);

  // Tras mover con el teclado (aunque cambie de mes) el foco sigue al día elegido.
  useEffect(() => {
    if (!enfocar.current) return;
    botones.current.get(enfocar.current)?.focus();
    enfocar.current = null;
  });

  const clavesMes = `${anio}-${String(mes + 1).padStart(2, "0")}`;
  const hoyEnMes = hoyIso.startsWith(clavesMes);
  const foco = elegido && dias.some((f) => isoDe(f) === elegido)
    ? elegido
    : hoyEnMes
      ? hoyIso
      : `${clavesMes}-01`;

  const tecla = (e: KeyboardEvent<HTMLButtonElement>, f: Date) => {
    const saltos: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let destino: Date | null = null;
    if (e.key in saltos) destino = sumarDias(f, saltos[e.key]);
    else if (e.key === "Home") destino = lunesDe(f);
    else if (e.key === "End") destino = sumarDias(lunesDe(f), 6);
    if (!destino) return;
    e.preventDefault();
    const iso = isoDe(destino);
    enfocar.current = iso;
    alElegir(iso);
  };

  return (
    <div>
      <div className="bit-mes-cab">
        <h2 id="bit-mes-h" aria-live="polite">
          {may(MESES[mes])} {anio}
        </h2>
        <div className="pg">
          {!hoyEnMes && (
            <Boton variante="secundario" tam={40} onClick={() => alElegir(hoyIso)}>
              Volver a hoy
            </Boton>
          )}
          <span>
            <BotonIcono tam={40} etiquetaAccesible="Mes anterior" onClick={() => alCambiarMes(-1)}>
              <Chevron dir="izq" />
            </BotonIcono>
            <BotonIcono tam={40} etiquetaAccesible="Mes siguiente" onClick={() => alCambiarMes(1)}>
              <Chevron />
            </BotonIcono>
          </span>
        </div>
      </div>

      <div className="bit-mesg" role="group" aria-labelledby="bit-mes-h">
        {CABECERA_MES.map((n) => (
          <span key={n} className="bit-dh" aria-hidden="true">
            {n}
          </span>
        ))}
        {dias.map((f) => {
          const iso = isoDe(f);
          const evs = eventos.get(iso) ?? [];
          const esHoy = iso === hoyIso;
          const vencidas = evs.filter((ev) => claseEvento(ev, hoyIso) === "venc").length;
          const hechas = evs.filter((ev) => ev.status === "done").length;
          const nombreDia = `${may(DIAS[f.getDay()])} ${f.getDate()} de ${MESES[f.getMonth()]}${esHoy ? ", hoy" : ""}`;
          const resumen =
            evs.length === 0
              ? "sin obligaciones"
              : `${evs.length} ${evs.length === 1 ? "obligación" : "obligaciones"}` +
                (vencidas ? `, ${vencidas} ${vencidas === 1 ? "vencida" : "vencidas"}` : "") +
                (hechas ? `, ${hechas} ${hechas === 1 ? "hecha" : "hechas"}` : "");
          return (
            <button
              key={iso}
              type="button"
              ref={(el) => {
                if (el) botones.current.set(iso, el);
                else botones.current.delete(iso);
              }}
              tabIndex={iso === foco ? 0 : -1}
              className={unir(
                "bit-dia",
                f.getMonth() !== mes && "fuera",
                iso < hoyIso && "pas",
                evs.length > 0 && "con",
                esHoy && "hoy",
              )}
              aria-pressed={iso === elegido}
              aria-current={esHoy ? "date" : undefined}
              aria-label={`${nombreDia}: ${resumen}`}
              onClick={() => alElegir(iso)}
              onKeyDown={(e) => tecla(e, f)}
            >
              <span className="dn">{f.getDate()}</span>
              {esHoy && <span className="hoy-l">Hoy</span>}
              {evs.slice(0, 2).map((ev) => (
                <span key={`${ev.propertyId}:${ev.key}`} className={unir("bit-ev", claseEvento(ev, hoyIso))}>
                  {siglas && <b>{siglas.get(ev.propertyId)} </b>}
                  {tituloCorto(ev)}
                </span>
              ))}
              {evs.length > 2 && <span className="bit-mas-ev">+{evs.length - 2} más</span>}
              {evs.length > 0 && (
                <span className="bit-rayas">
                  {evs.slice(0, 3).map((ev) => (
                    <i key={`${ev.propertyId}:${ev.key}`} className={claseEvento(ev, hoyIso)} />
                  ))}
                  {evs.length > 3 && <small>+{evs.length - 3}</small>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="bit-leyenda">
        <span><i className="venc" aria-hidden="true" />Vencida</span>
        <span><i aria-hidden="true" />Pendiente</span>
        <span><i className="hecha" aria-hidden="true" />Hecha</span>
        {leyendaSiglas.map((l) => (
          <span key={l.sigla}>
            <b>{l.sigla}</b>
            {l.nombre}
          </span>
        ))}
      </p>
    </div>
  );
}

function AssetForm({
  properties,
  reloadAll,
  onDone,
  onCancel,
}: {
  properties: PropertyInfo[];
  reloadAll: () => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<AssetKind>("zona_comun");
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState(properties[0]?.id || "");
  const [provider, setProvider] = useState("");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !propertyId || !dueDate) {
      setErr("Completa nombre, propiedad y fecha.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/common-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          kind,
          name,
          provider: provider || undefined,
          reference: reference || undefined,
          dueDate,
          recurrenceMonths: recurrence || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error || "No se pudo crear el registro.");
        return;
      }
      await reloadAll();
      avisar({ tipo: "ok", titulo: "Guardado en la bitácora.", texto: name.trim() });
      onDone();
    } catch {
      setErr("Error de red. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const poliza = kind === "poliza";
  return (
    <Modal
      abierto
      alCerrar={onCancel}
      ancho={560}
      cerrarConVelo={false}
      titulo="Agregar zona común o póliza"
      acciones={
        <>
          <Boton variante="secundario" onClick={onCancel}>
            Cancelar
          </Boton>
          <Boton type="submit" form="bit-form-activo" cargando={busy} textoCargando="Guardando…" flecha="crea">
            Guardar en la bitácora
          </Boton>
        </>
      }
    >
      <form id="bit-form-activo" onSubmit={submit} noValidate>
        <Segmentos
          etiquetaAccesible="Tipo de registro"
          valor={kind}
          alCambiar={(id) => setKind(id === "poliza" ? "poliza" : "zona_comun")}
          items={[
            { id: "zona_comun", etiqueta: ASSET_KIND_LABELS.zona_comun },
            { id: "poliza", etiqueta: ASSET_KIND_LABELS.poliza },
          ]}
        />
        <div className="bit-form">
          <Campo id="ac-nombre" etiqueta="Nombre" className="ancho">
            <Entrada
              id="ac-nombre"
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={poliza ? "Ej.: Todo riesgo área común" : "Ej.: Ascensor Torre A"}
              maxLength={150}
            />
          </Campo>
          <Campo id="ac-prop" etiqueta="Copropiedad">
            <Selector id="ac-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo id="ac-fecha" etiqueta={poliza ? "Vence" : "Próximo mantenimiento"}>
            <Entrada id="ac-fecha" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Campo>
          <Campo id="ac-prov" etiqueta={poliza ? "Aseguradora" : "Contratista"} opcional>
            <Entrada id="ac-prov" value={provider} onChange={(e) => setProvider(e.target.value)} maxLength={150} />
          </Campo>
          <Campo id="ac-ref" etiqueta={poliza ? "Número de póliza" : "Contrato"} opcional>
            <Entrada id="ac-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </Campo>
          <Campo id="ac-rec" etiqueta="Se repite cada (meses)" opcional ayuda="Déjalo vacío si no se repite." className="ancho">
            <Entrada
              id="ac-rec"
              type="number"
              min={1}
              max={60}
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              placeholder="Ej.: 12 para una póliza anual"
            />
          </Campo>
        </div>
        {err && (
          <p className="k-err bit-form-err" role="alert">
            {err}
          </p>
        )}
      </form>
    </Modal>
  );
}

function ProfileEditor({
  property,
  alCerrar,
  alGuardar,
}: {
  property: PropertyInfo;
  alCerrar: () => void;
  alGuardar: () => Promise<void>;
}) {
  const [f, setF] = useState({ ...property.features });
  const [saving, setSaving] = useState(false);

  const toggles: { key: keyof typeof f; label: string }[] = [
    { key: "ascensor", label: "Ascensor" },
    { key: "piscina", label: "Piscina" },
    { key: "plantaElectrica", label: "Planta eléctrica" },
    { key: "gimnasio", label: "Gimnasio" },
    { key: "empleadosDirectos", label: "Empleados directos" },
  ];

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: property.id, features: f }),
      });
      if (res.ok) {
        alCerrar();
        await alGuardar();
        avisar({ tipo: "ok", titulo: "Perfil guardado.", texto: property.name });
      } else {
        avisar({ tipo: "error", titulo: "No se pudo guardar el perfil.", texto: "Inténtalo de nuevo en un momento." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      ancho={560}
      cerrarConVelo={false}
      titulo={`Perfil de ${nombreCorto(property.name)}`}
      acciones={
        <>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={save} cargando={saving} textoCargando="Guardando…">
            Guardar perfil
          </Boton>
        </>
      }
    >
      <p>Marca lo que tiene esta copropiedad y SOPH.IA generará sus obligaciones automáticamente.</p>
      <div className="bit-perfil" role="group" aria-label={`Qué tiene ${property.name}`}>
        {toggles.map((t) => {
          const on = f[t.key] === true;
          return (
            <Casilla
              key={t.key}
              etiqueta={t.label}
              checked={on}
              onChange={() => setF((prev) => ({ ...prev, [t.key]: !on }))}
            />
          );
        })}
      </div>
      <Campo id="perfil-poliza" etiqueta="Vencimiento de la póliza de zonas comunes" opcional>
        <Entrada
          id="perfil-poliza"
          type="date"
          value={f.polizaVence || ""}
          onChange={(e) => setF((prev) => ({ ...prev, polizaVence: e.target.value || null }))}
        />
      </Campo>
    </Modal>
  );
}

function RegistroTab({
  assets,
  properties,
  propertyFilter,
  showAssetForm,
  setShowAssetForm,
  assetsLoading,
  errorActivos,
  reintentarActivos,
  assetBusy,
  markAsset,
  deleteAsset,
  restoreAsset,
  archived,
  showArchived,
  setShowArchived,
  reloadAll,
}: {
  assets: CommonAsset[];
  properties: PropertyInfo[];
  propertyFilter: string;
  showAssetForm: boolean;
  setShowAssetForm: Dispatch<SetStateAction<boolean>>;
  assetsLoading: boolean;
  errorActivos: boolean;
  reintentarActivos: () => void;
  assetBusy: string | null;
  markAsset: (a: CommonAsset, action: "done" | "archive") => void;
  deleteAsset: (a: CommonAsset) => void;
  restoreAsset: (a: CommonAsset) => void;
  archived: CommonAsset[];
  showArchived: boolean;
  setShowArchived: Dispatch<SetStateAction<boolean>>;
  reloadAll: () => Promise<void>;
}) {
  const [borrar, setBorrar] = useState<CommonAsset | null>(null);
  const filtered = assets
    .filter((a) => propertyFilter === "all" || a.propertyId === propertyFilter)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const importTargetId = propertyFilter !== "all" ? propertyFilter : properties[0]?.id;
  const importTarget = properties.find((p) => p.id === importTargetId);
  const nombreProp = (id: string) => properties.find((p) => p.id === id)?.name;
  const hoy = hoySinHora();
  const hastaDomingo = 7 - (hoy.getDay() || 7);
  const alcance =
    propertyFilter === "all"
      ? properties.length === 1
        ? properties[0].name
        : `tus ${properties.length} copropiedades`
      : nombreProp(propertyFilter) ?? "";

  const columnas: ColumnaTabla<CommonAsset>[] = [
    {
      id: "f",
      titulo: "Fecha",
      principal: true,
      ancho: "112px",
      celda: (a) => {
        const d = daysUntil(a.dueDate.slice(0, 10));
        // Misma escala que Inicio: vencido ■ naranja · esta semana ■ gris · después □.
        const tipo: TipoEstado = d < 0 ? "vencido" : d <= hastaDomingo ? "semana" : "sin";
        return (
          <span className="bit-fa">
            <Cuadro tipo={tipo} />
            <b>{fechaCorta(aFecha(a.dueDate), hoy)}</b>
            <small className={d < 0 ? "v" : undefined}>{relativeLabel(d)}</small>
          </span>
        );
      },
    },
    {
      id: "n",
      titulo: "Nombre",
      ancho: "minmax(0, 3fr)",
      claseCelda: "k-c-nom",
      celda: (a) => {
        const detalle = [
          a.provider,
          a.reference ? `Ref. ${a.reference}` : null,
          a.recurrenceMonths ? recurrenceLabel(a.recurrenceMonths) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const prop = propertyFilter === "all" ? nombreProp(a.propertyId) : null;
        return (
          <>
            {a.name}
            {detalle && <span>{detalle}</span>}
            {prop && <span title={prop}>{nombreCorto(prop)}</span>}
          </>
        );
      },
    },
    {
      id: "k",
      titulo: "Tipo",
      ancho: "minmax(0, 1fr)",
      celda: (a) => <Categoria>{ASSET_KIND_LABELS[a.kind]}</Categoria>,
    },
    {
      id: "a",
      titulo: "Acciones",
      tituloOculto: true,
      alinear: "fin",
      ancho: "auto",
      claseCelda: "k-td-acc",
      celda: (a) => {
        const ocupado = assetBusy === a.id;
        return (
          <AccionesFila>
            <BotonFila
              onClick={() => markAsset(a, "done")}
              disabled={ocupado}
              title={a.recurrenceMonths ? "Marcar hecho: pasa al próximo ciclo" : "Marcar hecho y archivar"}
              aria-label={`${ocupado ? "Guardando" : "Marcar hecho"}: ${a.name}`}
            >
              {ocupado ? "Guardando…" : "Marcar hecho"}
            </BotonFila>
            <MenuMas
              etiquetaAccesible={`Más acciones · ${a.name}`}
              items={[
                {
                  etiqueta: "Eliminar del registro…",
                  nota: "pide confirmación",
                  peligro: true,
                  deshabilitado: ocupado,
                  alElegir: () => setBorrar(a),
                },
              ]}
            />
          </AccionesFila>
        );
      },
    },
  ];

  return (
    <div className="k-r12 bit-reg">
      <section className="lst" aria-labelledby="bit-reg-h">
        <h2 id="bit-reg-h" className="bit-gh">
          <b>Registro</b>
          <span className="r">Zonas comunes y pólizas{alcance ? ` · ${alcance}` : ""}</span>
          {!assetsLoading && (
            <em>
              {filtered.length}
              <span className="k-sr"> {filtered.length === 1 ? "registro" : "registros"}</span>
            </em>
          )}
        </h2>

        {assetsLoading ? (
          <Esqueleto variante="tabla" filas={4} etiquetaAccesible="Cargando zonas comunes y pólizas…" />
        ) : errorActivos && assets.length === 0 ? (
          <ErrorCarga
            nivel={3}
            titulo="No pudimos cargar las zonas comunes y pólizas."
            texto="Revisa tu conexión e inténtalo de nuevo."
            acciones={<Boton variante="secundario" onClick={reintentarActivos}>Reintentar</Boton>}
          />
        ) : (
          <Tabla
            etiquetaAccesible={`Zonas comunes y pólizas${alcance ? ` de ${alcance}` : ""}`}
            filas={filtered}
            claveFila={(a) => a.id}
            columnas={columnas}
            vacio={
              <Vacio
                nivel={3}
                titulo="Aún no hay zonas comunes ni pólizas registradas."
                texto="Añádelas a mano o importa el listado desde un documento: cada una avisa en Recordatorios cuando se acerca su fecha."
                acciones={
                  <Boton flecha="crea" onClick={() => setShowAssetForm(true)}>
                    Agregar zona común o póliza
                  </Boton>
                }
              />
            }
          />
        )}

        {!assetsLoading && archived.length > 0 && (
          <div>
            <button
              type="button"
              className="bit-plegable"
              aria-expanded={showArchived}
              aria-controls="bit-archivados"
              onClick={() => setShowArchived((v) => !v)}
            >
              <b>Archivados</b>
              <span className="n">
                {archived.length}
                <span className="k-sr"> {archived.length === 1 ? "registro" : "registros"}</span>
              </span>
              <Chevron dir={showArchived ? "arriba" : "abajo"} />
            </button>
            {showArchived && (
              <ul id="bit-archivados" className="bit-arch-l">
                {archived.map((a) => (
                  <li key={a.id} className="bit-arch">
                    <span>
                      <b>{a.name}</b>
                      <small>
                        {ASSET_KIND_LABELS[a.kind]} · archivado
                        {nombreProp(a.propertyId) ? ` · ${nombreProp(a.propertyId)}` : ""}
                      </small>
                    </span>
                    <span>
                      <BotonFila
                        onClick={() => restoreAsset(a)}
                        disabled={assetBusy === a.id}
                        aria-label={`${assetBusy === a.id ? "Restaurando" : "Restaurar"}: ${a.name}`}
                      >
                        {assetBusy === a.id ? "Restaurando…" : "Restaurar"}
                      </BotonFila>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {importTargetId && (
        <Panel className="imp" nivel={2} titulo="Importar con IA" nota="Excel, PDF o Word">
          <p className="bit-imp-t">
            Sube el Excel, PDF o Word con tus zonas comunes y pólizas: la IA organiza la lista
            {importTarget ? ` para ${importTarget.name}` : ""} y tú revisas antes de guardar.
          </p>
          <AssetImport
            propertyId={importTargetId}
            onImported={(creados) => {
              reloadAll();
              avisar({
                tipo: "ok",
                titulo: creados === 1 ? "1 registro creado." : `${creados} registros creados.`,
                texto: importTarget?.name,
              });
            }}
          />
        </Panel>
      )}

      {showAssetForm && (
        <AssetForm
          properties={properties}
          reloadAll={reloadAll}
          onDone={() => setShowAssetForm(false)}
          onCancel={() => setShowAssetForm(false)}
        />
      )}

      <Modal
        abierto={Boolean(borrar)}
        alCerrar={() => setBorrar(null)}
        titulo={borrar ? `¿Eliminar «${borrar.name}» del registro?` : ""}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setBorrar(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              lleno
              onClick={() => {
                const a = borrar;
                setBorrar(null);
                if (a) deleteAsset(a);
              }}
            >
              Eliminar del registro
            </Boton>
          </>
        }
      >
        <p>
          Deja de aparecer en la bitácora{borrar && nombreProp(borrar.propertyId) ? ` de ${nombreProp(borrar.propertyId)}` : ""} y
          no se puede deshacer. Si solo quieres dejar de verlo por ahora, márcalo como hecho.
        </p>
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Página
   ════════════════════════════════════════════════════════════════════ */

type GrupoLista = { clave: string; tipo: "semana" | "mes"; fecha: Date; items: CalendarItem[] };

export default function CalendarioPage() {
  const [tab, setTab] = useState<"recordatorios" | "registro">("recordatorios");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [properties, setProperties] = useState<PropertyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  // Sin datos que mostrar, un fallo de red no puede pasar por «aún no tienes copropiedades».
  const [errorCarga, setErrorCarga] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [showDone, setShowDone] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Vista «Lista | Mes» (SPEC §g 03; Lista por defecto), mes visible y día abierto.
  const [vista, setVista] = useState<"lista" | "mes">("lista");
  const [mesVisible, setMesVisible] = useState(() => {
    const h = new Date();
    return { anio: h.getFullYear(), mes: h.getMonth() };
  });
  const [diaElegido, setDiaElegido] = useState<string | null>(() => isoDe(new Date()));
  const [confirmarBorrado, setConfirmarBorrado] = useState<CalendarItem | null>(null);

  // Add-reminder form
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addProperty, setAddProperty] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  // Building profile editor
  const [profileFor, setProfileFor] = useState<string | null>(null);

  // Registro de zonas comunes y pólizas
  const [assets, setAssets] = useState<CommonAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [errorActivos, setErrorActivos] = useState(false);
  const [assetBusy, setAssetBusy] = useState<string | null>(null);
  const [showAssetForm, setShowAssetForm] = useState(false);
  // Los archivados no se listan por defecto, pero deben poder recuperarse: un
  // activo sin recurrencia marcado como "hecho" se archiva, y sin esto quedaba
  // invisible para siempre aunque la API ya soportara "restore".
  const [archived, setArchived] = useState<CommonAsset[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
        setProperties(data.properties || []);
        setErrorCarga(false);
        // El índice y el dock cuentan las vencidas de esta misma respuesta: tras marcar
        // una obligación, su «N vencidas» cambia en la misma pantalla.
        publicarJSON("/api/calendar", data);
      } else {
        setErrorCarga(true);
      }
    } catch {
      // keep whatever we had
      setErrorCarga(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssets = useCallback(async () => {
    try {
      const [res, resArch] = await Promise.all([
        fetch("/api/common-assets"),
        fetch("/api/common-assets?status=archived"),
      ]);
      const data = await res.json();
      const dataArch = await resArch.json().catch(() => ({}));
      if (resArch.ok) setArchived(dataArch.assets || []);
      if (res.ok) setAssets(data.assets || []);
      setErrorActivos(!res.ok);
    } catch {
      // keep whatever we had
      setErrorActivos(true);
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  // Ambas pestañas comparten la misma fuente de verdad: un cambio en el
  // registro debe reflejarse de inmediato en la línea de tiempo de recordatorios.
  const reloadAll = useCallback(async () => {
    await Promise.all([load(), loadAssets()]);
  }, [load, loadAssets]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    load();
  }, [load]);

  const reintentar = () => {
    setLoading(true);
    load();
  };
  const reintentarActivos = () => {
    setAssetsLoading(true);
    loadAssets();
  };

  // Si la copropiedad elegida en la cornisa ya no existe, se vuelve a «Todas».
  const filtroValido = propertyFilter === "all" || properties.some((p) => p.id === propertyFilter);
  const alcanceId = filtroValido ? propertyFilter : "all";

  const filtered = items.filter(
    (it) => it.status !== "dismissed" && (alcanceId === "all" || it.propertyId === alcanceId),
  );

  const pending = filtered.filter((it) => it.status === "pending");
  const done = filtered.filter((it) => it.status === "done");

  const unconfigured = properties.filter((p) => !p.hasProfile);

  async function mark(item: CalendarItem, action: AccionItem) {
    setBusyKey(item.key);
    try {
      // Los ítems de la bitácora (zonas comunes/pólizas) viven en su propio
      // registro con su propia semántica: "hecho" en uno recurrente adelanta
      // la fecha en vez de solo marcarlo, y no tiene "deshacer".
      const res =
        item.source === "asset"
          ? await fetch("/api/common-assets", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: item.key.replace(/^asset-/, ""),
                action: action === "dismiss" ? "archive" : action === "undo" ? "restore" : "done",
              }),
            })
          : await fetch("/api/calendar", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                propertyId: item.propertyId,
                itemKey: item.key,
                action,
              }),
            });
      if (res.ok) {
        await (item.source === "asset" ? reloadAll() : load());
        const titulo =
          action === "done"
            ? "Marcada como hecha."
            : action === "undo"
              ? "Marcada como pendiente."
              : item.source === "custom"
                ? "Recordatorio eliminado."
                : item.source === "asset"
                  ? "Archivado: deja de recordarse."
                  : "Ocultado de la bitácora.";
        avisar({ tipo: "ok", titulo, texto: `${tituloDe(item)} · ${item.propertyName}` });
      } else {
        avisar({ tipo: "error", titulo: "No se pudo actualizar la bitácora.", texto: "Inténtalo de nuevo en un momento." });
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function markAsset(asset: CommonAsset, action: "done" | "archive") {
    setAssetBusy(asset.id);
    try {
      const res = await fetch("/api/common-assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, action }),
      });
      if (res.ok) {
        await reloadAll();
        avisar({
          tipo: "ok",
          titulo: action === "done" ? (asset.recurrenceMonths ? "Hecho: pasa al próximo ciclo." : "Hecho y archivado.") : "Archivado.",
          texto: asset.name,
        });
      } else {
        avisar({ tipo: "error", titulo: "No se pudo actualizar el registro.", texto: "Inténtalo de nuevo en un momento." });
      }
    } finally {
      setAssetBusy(null);
    }
  }

  async function restoreAsset(asset: CommonAsset) {
    setAssetBusy(asset.id);
    try {
      const res = await fetch("/api/common-assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, action: "restore" }),
      });
      if (res.ok) {
        await reloadAll();
        avisar({ tipo: "ok", titulo: "Restaurado.", texto: asset.name });
      }
    } finally {
      setAssetBusy(null);
    }
  }

  async function deleteAsset(asset: CommonAsset) {
    setAssetBusy(asset.id);
    try {
      const res = await fetch(`/api/common-assets?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      if (res.ok) {
        await reloadAll();
        avisar({ tipo: "ok", titulo: "Eliminado del registro.", texto: asset.name });
      } else {
        avisar({ tipo: "error", titulo: "No se pudo eliminar.", texto: asset.name });
      }
    } finally {
      setAssetBusy(null);
    }
  }

  async function addReminder(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addTitle.trim() || !addDate || !addProperty) {
      setAddError("Completa título, propiedad y fecha.");
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: addProperty,
          title: addTitle,
          description: addDesc,
          dueDate: addDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "No se pudo crear el recordatorio.");
        return;
      }
      const creado = addTitle.trim();
      setAddTitle("");
      setAddDate("");
      setAddDesc("");
      setShowAdd(false);
      await load();
      avisar({ tipo: "ok", titulo: "Recordatorio creado.", texto: creado });
    } catch {
      setAddError("Error de red. Intenta de nuevo.");
    } finally {
      setAddBusy(false);
    }
  }

  /** Abre el alta de recordatorio (con la fecha del día abierto, si viene). */
  const abrirAlta = (fecha?: string) => {
    setShowAdd(true);
    if (properties.length > 0 && !addProperty) setAddProperty(properties[0].id);
    if (fecha) setAddDate(fecha);
  };

  const profileProperty = profileFor ? properties.find((p) => p.id === profileFor) : null;

  /* ── derivados para la vista (todo sale de /api/calendar) ─────────── */
  const hoy = hoySinHora();
  const hoyIso = isoDe(hoy);
  const unaProp = alcanceId !== "all" || properties.length === 1;
  const nombreAlcance =
    alcanceId === "all"
      ? properties.length === 1
        ? properties[0].name
        : properties.length > 1
          ? `tus ${properties.length} copropiedades`
          : ""
      : properties.find((p) => p.id === alcanceId)?.name ?? "";

  const pendientes = pending
    .map((it) => ({ it, d: daysUntil(it.dueDate) }))
    .sort((a, b) => a.it.dueDate.localeCompare(b.it.dueDate));
  const hastaDomingo = 7 - (hoy.getDay() || 7);
  const vencidas = pendientes.filter((x) => x.d < 0);
  const semana = pendientes.filter((x) => x.d >= 0 && x.d <= hastaDomingo);
  const treinta = pendientes.filter((x) => x.d > hastaDomingo && x.d <= 30);

  // Cornisa: vencidas por copropiedad de TODAS las obligaciones cargadas (no del alcance).
  const cornisa = properties.map((p) => ({
    id: p.id,
    nombre: p.name,
    vencidas: items.filter((it) => it.propertyId === p.id && it.status === "pending" && daysUntil(it.dueDate) < 0).length,
  }));

  // Tira L–D de la semana ISO actual con las obligaciones pendientes de cada día (como en Inicio).
  const lunesHoy = lunesDe(hoy);
  const dias: DiaTira[] = [];
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunesHoy, i);
    const d = Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
    const delDia = d >= 0 ? pendientes.filter((x) => x.it.dueDate === isoDe(f)).map((x) => x.it) : [];
    dias.push({
      etiqueta: d === 0 ? "Hoy" : LETRA_DIA[i],
      dia: f.getDate(),
      estado: d < 0 ? "pasado" : d === 0 ? "hoy" : "normal",
      evento: delDia.length ? rotuloTira(delDia) : undefined,
    });
  }
  const diasConObligaciones = [...new Set(semana.map((x) => x.it.dueDate))].map(aFecha);
  const detalleSemana = (() => {
    if (diasConObligaciones.length === 0) return "Semana libre";
    if (diasConObligaciones.length > 3) return `${diasConObligaciones.length} días con obligaciones`;
    const partes = diasConObligaciones.map((f) => `${DIAS_CORTOS[f.getDay()].toLowerCase()} ${f.getDate()}`);
    const texto = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0];
    return may(texto);
  })();

  // Lista: vencidas primero; luego semanas ISO hasta la semana que contiene el día 30
  // y, más adelante, por mes (así un horizonte de un año no se vuelve 40 cabeceras).
  const finSemanas = sumarDias(lunesDe(sumarDias(hoy, 30)), 6);
  const grupos: GrupoLista[] = [
    { clave: `s-${isoDe(lunesHoy)}`, tipo: "semana", fecha: lunesHoy, items: [] },
  ];
  for (const { it, d } of pendientes) {
    if (d < 0) continue;
    const f = aFecha(it.dueDate);
    const enSemanas = f <= finSemanas;
    const clave = enSemanas ? `s-${isoDe(lunesDe(f))}` : `m-${f.getFullYear()}-${f.getMonth()}`;
    let g = grupos.find((x) => x.clave === clave);
    if (!g) {
      g = {
        clave,
        tipo: enSemanas ? "semana" : "mes",
        fecha: enSemanas ? lunesDe(f) : new Date(f.getFullYear(), f.getMonth(), 1),
        items: [],
      };
      grupos.push(g);
    }
    g.items.push(it);
  }

  // Mes: obligaciones del alcance (pendientes y hechas) por día, vencidas primero.
  const eventosPorDia = new Map<string, CalendarItem[]>();
  for (const it of filtered) {
    const lista = eventosPorDia.get(it.dueDate) ?? [];
    lista.push(it);
    eventosPorDia.set(it.dueDate, lista);
  }
  const orden = (ev: CalendarItem) => (ev.status === "done" ? 2 : ev.dueDate < hoyIso ? 0 : 1);
  for (const lista of eventosPorDia.values()) lista.sort((a, b) => orden(a) - orden(b));

  // Siglas solo con varias copropiedades en alcance (SPEC: con una sola, sin sigla).
  let siglas: Map<string, string> | null = null;
  const leyendaSiglas: Array<{ sigla: string; nombre: string }> = [];
  if (!unaProp && properties.length > 1) {
    siglas = new Map();
    const usadas = new Map<string, number>();
    for (const p of properties) {
      const base = siglaDe(p.name);
      const n = (usadas.get(base) ?? 0) + 1;
      usadas.set(base, n);
      siglas.set(p.id, n === 1 ? base : `${base}${n}`);
    }
    // La leyenda nombra solo las copropiedades que tienen algo en el mes visible.
    const conEventos = new Set<string>();
    for (const f of diasDeRejilla(mesVisible.anio, mesVisible.mes)) {
      for (const ev of eventosPorDia.get(isoDe(f)) ?? []) conEventos.add(ev.propertyId);
    }
    for (const p of properties) {
      if (conEventos.has(p.id)) leyendaSiglas.push({ sigla: siglas.get(p.id) ?? "", nombre: nombreCorto(p.name) });
    }
  }

  const elegirDia = (iso: string) => {
    setDiaElegido(iso);
    const f = aFecha(iso);
    if (f.getFullYear() !== mesVisible.anio || f.getMonth() !== mesVisible.mes) {
      setMesVisible({ anio: f.getFullYear(), mes: f.getMonth() });
    }
  };
  const cambiarMes = (delta: number) => {
    const f = new Date(mesVisible.anio, mesVisible.mes + delta, 1);
    setMesVisible({ anio: f.getFullYear(), mes: f.getMonth() });
    setDiaElegido(null);
  };

  const fila = (it: CalendarItem, fecha: string) => (
    <FilaEvento
      key={`${it.propertyId}:${it.key}`}
      item={it}
      fecha={fecha}
      mostrarProp={!unaProp}
      ocupado={busyKey === it.key}
      alMarcar={mark}
      alPedirEliminar={setConfirmarBorrado}
    />
  );

  const listo = !loading;
  const sinPropiedades = listo && !errorCarga && properties.length === 0;
  const falloSinDatos = listo && errorCarga && properties.length === 0 && items.length === 0;

  const acciones =
    tab === "recordatorios" ? (
      <>
        <PestanasUnidas
          vista
          etiquetaAccesible="Vista"
          valor={vista}
          alCambiar={(id) => setVista(id === "mes" ? "mes" : "lista")}
          items={[
            { id: "lista", etiqueta: "Lista" },
            { id: "mes", etiqueta: "Mes" },
          ]}
        />
        <Boton flecha="crea" onClick={() => abrirAlta()}>
          Agregar recordatorio
        </Boton>
      </>
    ) : (
      <Boton flecha="crea" onClick={() => setShowAssetForm(true)}>
        Agregar zona común o póliza
      </Boton>
    );

  const diaF = diaElegido ? aFecha(diaElegido) : null;
  const eventosDia = diaElegido ? eventosPorDia.get(diaElegido) ?? [] : [];

  return (
    <div className="bit">
      <style href="k-bitacora-local" precedence="default">
        {CSS_BITACORA}
      </style>
      <Header title="Bitácora" />

      {listo && properties.length > 0 && (
        <Cornisa
          copropiedades={cornisa}
          valor={alcanceId === "all" ? "todas" : alcanceId}
          alCambiar={(id) => setPropertyFilter(id === "todas" ? "all" : id)}
        />
      )}

      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="03"
            titulo="Bitácora"
            subtitulo={`Vencimientos legales, mantenimientos, pólizas y zonas comunes${nombreAlcance ? ` · ${nombreAlcance}` : ""}`}
            acciones={acciones}
          />

          {/* Recordatorios (la línea de tiempo) vs. el registro que la alimenta */}
          <div className="bit-tabs">
            <Segmentos
              modo="pestanas"
              etiquetaAccesible="Secciones de la bitácora"
              valor={tab}
              alCambiar={(id) => setTab(id === "registro" ? "registro" : "recordatorios")}
              panelId={(id) => `bit-panel-${id}`}
              items={[
                { id: "recordatorios", etiqueta: "Recordatorios", conteo: listo ? pending.length : undefined },
                {
                  id: "registro",
                  etiqueta: "Zonas comunes y pólizas",
                  conteo: assetsLoading
                    ? undefined
                    : assets.filter((a) => alcanceId === "all" || a.propertyId === alcanceId).length,
                },
              ]}
            />
            {tab === "recordatorios" && alcanceId !== "all" && !profileFor && (
              <Boton className="fin" variante="fantasma" tam={40} onClick={() => setProfileFor(alcanceId)}>
                Editar perfil del edificio
              </Boton>
            )}
          </div>

          {tab === "recordatorios" && (
            <div id="bit-panel-recordatorios" role="tabpanel" aria-label="Recordatorios">
              {/* Perfil sin configurar: las obligaciones automáticas dependen de él */}
              {listo && unconfigured.length > 0 && !profileFor && alcanceId === "all" && (
                <Aviso
                  enLinea
                  rol={null}
                  className="bit-aviso"
                  titulo={
                    unconfigured.length === 1
                      ? `Falta el perfil de ${unconfigured[0].name}.`
                      : `${unconfigured.length} propiedades sin perfil configurado.`
                  }
                  texto={
                    unconfigured.length === 1
                      ? "Configúralo para generar sus obligaciones (ascensor, piscina, póliza…)."
                      : "Configúralas para generar sus obligaciones."
                  }
                  accion={{ etiqueta: "Configurar", alElegir: () => setProfileFor(unconfigured[0].id) }}
                />
              )}

              {loading ? (
                <Esqueleto variante="completo" filas={5} etiquetaAccesible="Cargando la bitácora…" />
              ) : falloSinDatos ? (
                <ErrorCarga
                  titulo="No pudimos cargar la bitácora."
                  texto="Revisa tu conexión e inténtalo de nuevo."
                  acciones={<Boton variante="secundario" onClick={reintentar}>Reintentar</Boton>}
                />
              ) : sinPropiedades ? (
                <Vacio
                  titulo="Crea tu primera propiedad para activar la bitácora."
                  texto="Las obligaciones legales y de mantenimiento se generan automáticamente por copropiedad."
                  acciones={
                    <Boton href="/dashboard/propiedades" flecha="avanza">
                      Agregar copropiedad
                    </Boton>
                  }
                />
              ) : (
                <>
                  {pending.length > 0 ? (
                    <section className="bit-urg" aria-labelledby="bit-urg-h">
                      <h2 id="bit-urg-h" className="k-sr">Resumen de vencimientos</h2>
                      <Urgencias>
                        <Urgencia
                          nivel="a"
                          n={vencidas.length}
                          titulo="Vencidas"
                          detalle={vencidas.length === 0 ? "Nada vencido" : vencidas.length === 1 ? "Requiere acción hoy" : "Requieren acción hoy"}
                        />
                        <Urgencia nivel="b" n={semana.length} titulo="Esta semana" detalle={detalleSemana} />
                        <Urgencia
                          nivel="c"
                          n={treinta.length}
                          titulo={`Próximos 30${NB}días`}
                          detalle={treinta.length === 0 ? `Nada en 30${NB}días` : `Hasta el ${fechaCorta(sumarDias(hoy, 30), hoy)}`}
                        />
                      </Urgencias>
                    </section>
                  ) : (
                    <Vacio
                      className="bit-grupo"
                      titulo={alcanceId === "all" ? "Todo al día." : `${nombreCorto(nombreAlcance)} está al día.`}
                      texto="Sin obligaciones pendientes en el horizonte."
                      acciones={
                        <Boton flecha="crea" onClick={() => abrirAlta()}>
                          Agregar recordatorio
                        </Boton>
                      }
                    />
                  )}

                  {vista === "lista" && pending.length > 0 && (
                    <>
                      {vencidas.length > 0 && (
                        <section className="bit-grupo" aria-labelledby="bit-g-venc">
                          <h2 id="bit-g-venc" className="bit-gh venc">
                            <b>Vencidas</b>
                            <span className="r">primero lo que ya pasó</span>
                            <em>
                              {vencidas.length}
                              <span className="k-sr"> {vencidas.length === 1 ? "obligación" : "obligaciones"}</span>
                            </em>
                          </h2>
                          <ul className="bit-lista">{vencidas.map(({ it }) => fila(it, fechaCorta(aFecha(it.dueDate), hoy)))}</ul>
                        </section>
                      )}

                      {grupos.map((g, n) => {
                        const actual = n === 0;
                        const siguiente = g.tipo === "semana" && isoDe(g.fecha) === isoDe(sumarDias(lunesHoy, 7));
                        const id = `bit-g-${g.clave}`;
                        return (
                          <section key={g.clave} className="bit-grupo" aria-labelledby={id}>
                            <h2 id={id} className="bit-gh">
                              {g.tipo === "semana" ? (
                                <>
                                  <b>S{semanaIso(g.fecha)}</b>
                                  <span className="r">
                                    {rangoSemana(g.fecha, hoy)}
                                    {actual ? " · esta semana" : siguiente ? " · la próxima semana" : ""}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <b>{may(MESES[g.fecha.getMonth()])}</b>
                                  <span className="r">de {g.fecha.getFullYear()} · más adelante</span>
                                </>
                              )}
                              <em>
                                {g.items.length}
                                <span className="k-sr"> {g.items.length === 1 ? "obligación" : "obligaciones"}</span>
                              </em>
                            </h2>
                            {actual && <TiraSemanal className="bit-tira" dias={dias} />}
                            {g.items.length > 0 ? (
                              <ul className="bit-lista">
                                {g.items.map((it) =>
                                  fila(it, g.tipo === "semana" ? fechaDia(aFecha(it.dueDate), hoy) : `${DIAS_CORTOS[aFecha(it.dueDate).getDay()]}${NB}${aFecha(it.dueDate).getDate()}`),
                                )}
                              </ul>
                            ) : (
                              <p className="bit-nada">
                                {hastaDomingo === 0 ? "Nada más vence hoy." : "Nada más vence esta semana."}
                                {vencidas.length > 0 ? " Las vencidas están arriba." : ""}
                              </p>
                            )}
                          </section>
                        );
                      })}
                    </>
                  )}

                  {vista === "mes" && (
                    <>
                      <VistaMes
                        anio={mesVisible.anio}
                        mes={mesVisible.mes}
                        hoy={hoy}
                        eventos={eventosPorDia}
                        siglas={siglas}
                        leyendaSiglas={leyendaSiglas}
                        elegido={diaElegido}
                        alElegir={elegirDia}
                        alCambiarMes={cambiarMes}
                      />
                      <section className="bit-dpanel" aria-labelledby={diaF ? "bit-dia-h" : undefined}>
                        {diaF && diaElegido ? (
                          <>
                            <h3 id="bit-dia-h">
                              {may(DIAS[diaF.getDay()])} {diaF.getDate()} de {MESES[diaF.getMonth()]}
                              {diaF.getFullYear() !== hoy.getFullYear() ? ` de ${diaF.getFullYear()}` : ""}
                              <small>
                                {diaElegido === hoyIso ? "hoy · " : ""}
                                {eventosDia.length === 0
                                  ? "sin obligaciones"
                                  : `${eventosDia.length} ${eventosDia.length === 1 ? "obligación" : "obligaciones"}`}
                              </small>
                            </h3>
                            {eventosDia.length > 0 ? (
                              <ul className="bit-lista">
                                {eventosDia.map((it) => fila(it, fechaCorta(diaF, hoy)))}
                              </ul>
                            ) : (
                              <div className="bit-dvacio">
                                <p>Nada vence {diaElegido === hoyIso ? "hoy" : "este día"}.</p>
                                <Boton variante="secundario" tam={40} flecha="crea" onClick={() => abrirAlta(diaElegido)}>
                                  Agregar recordatorio para este día
                                </Boton>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="bit-pista">Elige un día del mes para ver sus obligaciones.</p>
                        )}
                      </section>
                    </>
                  )}

                  {/* Completadas (plegable) */}
                  {vista === "lista" && done.length > 0 && (
                    <div className="bit-grupo">
                      <button
                        type="button"
                        className="bit-plegable"
                        aria-expanded={showDone}
                        aria-controls="bit-hechas"
                        onClick={() => setShowDone((v) => !v)}
                      >
                        <b>Completadas</b>
                        <span className="n">
                          {done.length}
                          <span className="k-sr"> {done.length === 1 ? "obligación" : "obligaciones"}</span>
                        </span>
                        <Chevron dir={showDone ? "arriba" : "abajo"} />
                      </button>
                      {showDone && (
                        <ul id="bit-hechas" className="bit-lista">
                          {done.map((it) => fila(it, fechaCorta(aFecha(it.dueDate), hoy)))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "registro" && (
            <div id="bit-panel-registro" role="tabpanel" aria-label="Zonas comunes y pólizas">
              <RegistroTab
                assets={assets}
                properties={properties}
                propertyFilter={alcanceId}
                showAssetForm={showAssetForm}
                setShowAssetForm={setShowAssetForm}
                assetsLoading={assetsLoading}
                errorActivos={errorActivos}
                reintentarActivos={reintentarActivos}
                assetBusy={assetBusy}
                markAsset={markAsset}
                deleteAsset={deleteAsset}
                restoreAsset={restoreAsset}
                archived={archived}
                showArchived={showArchived}
                setShowArchived={setShowArchived}
                reloadAll={reloadAll}
              />
            </div>
          )}
        </Pieza>
      </Pagina>

      {/* Perfil del edificio */}
      {profileProperty && (
        <ProfileEditor
          key={profileProperty.id}
          property={profileProperty}
          alCerrar={() => setProfileFor(null)}
          alGuardar={load}
        />
      )}

      {/* Alta de recordatorio */}
      <Modal
        abierto={showAdd}
        alCerrar={() => setShowAdd(false)}
        ancho={560}
        cerrarConVelo={false}
        titulo="Nuevo recordatorio"
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setShowAdd(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" form="bit-form-recordatorio" cargando={addBusy} textoCargando="Creando…" flecha="crea">
              Crear recordatorio
            </Boton>
          </>
        }
      >
        <form id="bit-form-recordatorio" onSubmit={addReminder} noValidate>
          <p>Aparece en la bitácora de la copropiedad y cuenta en sus vencimientos.</p>
          <div className="bit-form">
            <Campo id="rec-titulo" etiqueta="Título" className="ancho">
              <Entrada
                id="rec-titulo"
                data-autofocus
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Ej.: Renovar contrato de vigilancia"
                maxLength={200}
              />
            </Campo>
            <Campo id="rec-prop" etiqueta="Copropiedad">
              <Selector id="rec-prop" value={addProperty} onChange={(e) => setAddProperty(e.target.value)}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo id="rec-fecha" etiqueta="Fecha límite">
              <Entrada id="rec-fecha" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
            </Campo>
            <Campo id="rec-desc" etiqueta="Descripción" opcional className="ancho">
              <AreaTexto
                id="rec-desc"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                placeholder="Detalles del recordatorio"
                maxLength={2000}
                rows={3}
              />
            </Campo>
          </div>
          {addError && (
            <p className="k-err bit-form-err" role="alert">
              {addError}
            </p>
          )}
        </form>
      </Modal>

      {/* Confirmación antes de borrar un recordatorio propio */}
      <Modal
        abierto={Boolean(confirmarBorrado)}
        alCerrar={() => setConfirmarBorrado(null)}
        titulo={confirmarBorrado ? `¿Eliminar el recordatorio «${tituloDe(confirmarBorrado)}»?` : ""}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setConfirmarBorrado(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              lleno
              onClick={() => {
                const it = confirmarBorrado;
                setConfirmarBorrado(null);
                if (it) mark(it, "dismiss");
              }}
            >
              Eliminar recordatorio
            </Boton>
          </>
        }
      >
        <p>
          Se borra de la bitácora{confirmarBorrado ? ` de ${confirmarBorrado.propertyName}` : ""} y no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
}
