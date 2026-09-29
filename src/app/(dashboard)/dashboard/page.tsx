"use client";

import { CalendarClock, CalendarDays, FileSignature, FileText, FolderCheck, MousePointerClick, Sparkles } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Header } from "@/components/dashboard/Header";
import { pedirJSON, URL_CALENDARIO, URL_GENERACIONES } from "@/components/dashboard/datosIndice";
import { abrirSoporte, useSoporteDisponible } from "@/components/dashboard/soporte";
import { AGENT_IDS, INCLUDED_AGENT_IDS, COMING_SOON_AGENT_IDS } from "@/lib/agents";
import {
  Acceso,
  Accesos,
  Boton,
  Colofon,
  Cornisa,
  EnlaceVer,
  ErrorCarga,
  Esqueleto,
  Estado,
  FichaAgente,
  FilaObligacion,
  FranjaPreparacion,
  ListaObligaciones,
  Loseta,
  MODULOS,
  MasEnLista,
  Pagina,
  RotuloIA,
  Seccion,
  TiraSemanal,
  Urgencia,
  Urgencias,
  Vacio,
  nombreCorto,
  type AgenteId,
  type DiaTira,
  type TipoEstado,
} from "@/components/kit";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
// Solo se enlaza si la cuenta tiene configurado su canal de soporte por WhatsApp.
const WHATSAPP_SOPORTE = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_URL;

/* ════════════════════════════════════════════════════════════════════
   Tipos de lo que devuelven las APIs que ya usa esta pantalla
   ════════════════════════════════════════════════════════════════════ */

/** GET /api/calendar → items (obligaciones de la bitácora) y properties. */
interface ItemCalendario {
  key: string;
  propertyId: string;
  propertyName: string;
  title: string;
  description?: string;
  category: string;
  dueDate: string; // "YYYY-MM-DD"
  source?: string;
  status: string; // pending | done | dismissed
}

interface Copropiedad {
  id: string;
  name: string;
}

/** GET /api/generations (máx. 100, las más recientes primero). */
interface Generacion {
  id: string;
  type: string;
  status: string; // pending | processing | completed | failed
  month: number;
  year: number;
  createdAt: string;
  outputFiles?: Record<string, string> | null;
  property?: { name: string } | null;
}

/** GET /api/properties: solo se leen las unidades declaradas y la ciudad. */
interface FichaPropiedad {
  id: string;
  units?: number | null;
  city?: string | null;
}

/* ════════════════════════════════════════════════════════════════════
   Fechas y textos (español de Colombia)
   ════════════════════════════════════════════════════════════════════ */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const LETRA_DIA = ["L", "M", "M", "J", "V", "S", "D"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const LETRAS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
const NB = " "; // espacio duro entre número y mes («24 sep»)

const may = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Minúscula inicial salvo siglas («SG-SST») o nombres en mayúscula sostenida. */
const minIni = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const enLetras = (n: number) => (n >= 0 && n <= 10 ? LETRAS[n] : String(n));
const plural = (n: number, uno: string, varios: string) => `${n}${NB}${n === 1 ? uno : varios}`;

function aFecha(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoDe(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}
function sumarDias(f: Date, n: number): Date {
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + n);
}
/** Días desde hoy (00:00) hasta la fecha ISO. Negativo = vencido. */
function diasHasta(iso: string, hoy: Date): number {
  return Math.round((aFecha(iso).getTime() - hoy.getTime()) / 86_400_000);
}
/** «31 mar», o «31 mar de 2025» si no es de este año. */
function fechaCorta(f: Date, hoy: Date): string {
  const base = `${f.getDate()}${NB}${MESES_CORTOS[f.getMonth()]}`;
  return f.getFullYear() === hoy.getFullYear() ? base : `${base} de ${f.getFullYear()}`;
}
/** «vie 25 sep». */
function fechaConDia(f: Date, hoy: Date): string {
  return `${DIAS_CORTOS[f.getDay()]}${NB}${fechaCorta(f, hoy)}`;
}
/** Semana ISO 8601 (la que usa la bitácora: «semana 39»). */
function semanaIso(f: Date): number {
  const d = new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7);
}
/** Cuándo, en Archivo 15/600: «Hace 177 días · venció el 31 mar», «Mañana · vie 25 sep». */
function cuandoTexto(d: number, f: Date, hoy: Date): string {
  if (d < 0) return `Hace ${plural(-d, "día", "días")} · venció el ${fechaCorta(f, hoy)}`;
  if (d === 0) return `Hoy · ${fechaConDia(f, hoy)}`;
  if (d === 1) return `Mañana · ${fechaConDia(f, hoy)}`;
  return `En ${plural(d, "día", "días")} · ${fechaConDia(f, hoy)}`;
}
/** «hoy», «ayer», «hace 3 días»: antigüedad de una generación. */
function haceTexto(fecha: Date, ahora: Date): string {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const n = Math.round((hoy.getTime() - dia.getTime()) / 86_400_000);
  if (n <= 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${plural(n, "día", "días")}`;
}
/** «Los Pinos y Torres del Río», «A, B y C». */
function enumerar(partes: ReactNode[]): ReactNode {
  return partes.map((p, i) => (
    <span key={i}>
      {i > 0 && (i === partes.length - 1 ? " y " : ", ")}
      {p}
    </span>
  ));
}

/* ════════════════════════════════════════════════════════════════════
   Tipo de obligación → verbo de la fila y del titular (SPEC §g 01)
   Sale de la categoría y la clave que ya trae /api/calendar.
   ════════════════════════════════════════════════════════════════════ */

type TipoObligacion = {
  clave: string;
  verbo: string; // en el titular: «Hoy toca convocar…»
  accion: string; // verbo de la fila: «Convocar»
  singular: string;
  plural: string;
  articulo: "el" | "la";
  href: string; // SOLO rutas existentes
};

const BITACORA = "/dashboard/calendario";
const THEMIS = "/dashboard/asistente/themis";

function tipoDe(it: ItemCalendario): TipoObligacion {
  const t = it.title;
  if (it.category === "legal" && it.key.startsWith("asamblea-")) {
    return { clave: "asamblea", verbo: "convocar", accion: "Convocar", singular: "asamblea", plural: "asambleas", articulo: "la", href: THEMIS };
  }
  if (it.category === "asamblea") {
    if (/^enviar convocatoria/i.test(t)) {
      return { clave: "convocatoria", verbo: "enviar", accion: "Convocar", singular: "convocatoria", plural: "convocatorias", articulo: "la", href: THEMIS };
    }
    if (/^publicar acta/i.test(t)) {
      return { clave: "acta", verbo: "publicar", accion: "Generar", singular: "acta", plural: "actas", articulo: "el", href: "/dashboard/generar" };
    }
    return { clave: "asamblea-otro", verbo: "revisar", accion: "Revisar", singular: "plazo de asamblea", plural: "plazos de asamblea", articulo: "el", href: BITACORA };
  }
  if (it.category === "poliza") {
    return { clave: "poliza", verbo: "renovar", accion: "Renovar", singular: "póliza", plural: "pólizas", articulo: "la", href: BITACORA };
  }
  if (it.category === "mantenimiento") {
    if (/^certificaci/i.test(t)) {
      return { clave: "certificacion", verbo: "solicitar", accion: "Solicitar", singular: "certificación", plural: "certificaciones", articulo: "la", href: BITACORA };
    }
    return { clave: "mantenimiento", verbo: "programar", accion: "Programar", singular: "mantenimiento", plural: "mantenimientos", articulo: "el", href: BITACORA };
  }
  if (it.category === "informe") {
    return { clave: "informe", verbo: "generar", accion: "Generar", singular: "informe", plural: "informes", articulo: "el", href: "/dashboard/generar" };
  }
  if (it.category === "sgsst") {
    return { clave: "sgsst", verbo: "revisar", accion: "Revisar", singular: "autoevaluación SG-SST", plural: "autoevaluaciones SG-SST", articulo: "la", href: BITACORA };
  }
  if (it.category === "finanzas") {
    return { clave: "finanzas", verbo: "revisar", accion: "Revisar", singular: "presupuesto", plural: "presupuestos", articulo: "el", href: BITACORA };
  }
  if (it.category === "custom") {
    return { clave: "custom", verbo: "revisar", accion: "Revisar", singular: "recordatorio", plural: "recordatorios", articulo: "el", href: BITACORA };
  }
  return { clave: "otro", verbo: "revisar", accion: "Revisar", singular: "obligación", plural: "obligaciones", articulo: "la", href: BITACORA };
}

/**
 * Título legible. Las pólizas y zonas comunes llegan como «Vencimiento: Todo
 * riesgo (área común)» / «Mantenimiento: Planta eléctrica» (common-assets.ts):
 * se reescriben a «Póliza todo riesgo…» / «Mantenimiento de planta eléctrica».
 */
function tituloDe(it: ItemCalendario): string {
  const m = it.source === "asset" ? it.title.match(/^(Vencimiento|Mantenimiento):\s*(.+)$/) : null;
  if (!m) return it.title;
  const nombre = m[2].trim();
  if (m[1] === "Vencimiento") return /^p[óo]liza/i.test(nombre) ? nombre : `Póliza ${minIni(nombre)}`;
  return /^mantenimiento/i.test(nombre) ? nombre : `Mantenimiento de ${minIni(nombre)}`;
}

/** Rótulo corto bajo el día de la tira semanal («Planta eléctrica», «Informe»). */
function rotuloTira(its: ItemCalendario[]): string {
  if (its.length > 1) return `${its.length} obligaciones`;
  const it = its[0];
  const m = it.source === "asset" ? it.title.match(/^(?:Vencimiento|Mantenimiento):\s*(.+)$/) : null;
  let r = m ? m[1].trim() : it.category === "informe" ? "Informe" : it.title.replace(/\s*\(.*\)\s*$/, "").replace(/\s+\d{4}$/, "");
  if (r.length > 24) r = `${r.slice(0, 22).replace(/\s+\S*$/, "")}…`;
  return r;
}

/** El grupo de vencidas del mismo tipo más numeroso (a igualdad, el primero en aparecer). */
function grupoMayor(vencidas: ItemCalendario[]): { tipo: TipoObligacion; items: ItemCalendario[] } | null {
  const grupos = new Map<string, { tipo: TipoObligacion; items: ItemCalendario[] }>();
  for (const it of vencidas) {
    const tipo = tipoDe(it);
    const g = grupos.get(tipo.clave);
    if (g) g.items.push(it);
    else grupos.set(tipo.clave, { tipo, items: [it] });
  }
  return [...grupos.values()].sort((a, b) => b.items.length - a.items.length)[0] ?? null;
}

/**
 * Titular-respuesta del día (SPEC §g 01.1): agrupa las vencidas por tipo.
 * Todo sale de las obligaciones pendientes de /api/calendar.
 */
function titularDelDia(vencidas: ItemCalendario[], proxima: { it: ItemCalendario; d: number } | null): string {
  if (vencidas.length === 0) {
    if (!proxima || proxima.d > 30) return "Todo al día por los próximos 30 días.";
    const cuando = proxima.d === 0 ? "hoy" : proxima.d === 1 ? "mañana" : `en ${plural(proxima.d, "día", "días")}`;
    return `Todo al día. Lo próximo: ${minIni(tituloDe(proxima.it))}, ${cuando}.`;
  }
  if (vencidas.length === 1) {
    const it = vencidas[0];
    const tipo = tipoDe(it);
    return `Hoy toca ${tipo.verbo} ${tipo.articulo} ${tipo.singular} de ${nombreCorto(it.propertyName)}.`;
  }
  const mayor = grupoMayor(vencidas);
  if (mayor && mayor.items.length >= 2) {
    return `Hoy toca ${mayor.tipo.verbo} ${enLetras(mayor.items.length)} ${mayor.tipo.plural}.`;
  }
  return `Tienes ${enLetras(vencidas.length)} obligaciones vencidas.`;
}

/* ════════════════════════════════════════════════════════════════════
   Reloj y «Ahora no» sin setState en efectos (y sin desajuste de hidratación)
   ════════════════════════════════════════════════════════════════════ */

const suscribirReloj = (avisar: () => void) => {
  const t = window.setInterval(avisar, 60_000);
  return () => window.clearInterval(t);
};
// Resolución de un minuto: dos lecturas seguidas devuelven lo mismo.
const leerReloj = () => Math.floor(Date.now() / 60_000) * 60_000;
const relojServidor = () => 0;

const CLAVE_SUGERENCIA = "sophia-inicio-sugerencia-oculta";
const oyentesSugerencia = new Set<() => void>();
let sugerenciaOcultaEnMemoria = false;
const suscribirSugerencia = (avisar: () => void) => {
  oyentesSugerencia.add(avisar);
  return () => {
    oyentesSugerencia.delete(avisar);
  };
};
const leerSugerenciaOculta = () => {
  if (sugerenciaOcultaEnMemoria) return true;
  try {
    return sessionStorage.getItem(CLAVE_SUGERENCIA) === "1";
  } catch {
    return false;
  }
};
const ocultarSugerencia = () => {
  sugerenciaOcultaEnMemoria = true;
  try {
    sessionStorage.setItem(CLAVE_SUGERENCIA, "1");
  } catch {
    /* sin almacenamiento: basta con la memoria de esta pestaña */
  }
  oyentesSugerencia.forEach((f) => f());
};

/* ════════════════════════════════════════════════════════════════════
   Estilos locales de Inicio (el kit no trae saludo, sugerencia ni fichas por copropiedad)
   ════════════════════════════════════════════════════════════════════ */

const CSS_INICIO = `
.ini-hero { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 430px); gap: 20px 32px; align-items: center; margin-bottom: 30px; padding: 30px 34px; overflow: hidden;
  border-radius: 32px; border: 1px solid var(--line); box-shadow: var(--sh-1);
  background: radial-gradient(90% 160% at 0% 0%, rgb(var(--accent-rgb) / .17), transparent 60%), radial-gradient(60% 120% at 100% 100%, rgb(var(--accent-rgb) / .08), transparent 70%), var(--surface-1); }
.ini-hero:not(:has(.ini-sug)) { grid-template-columns: minmax(0, 1fr); }
.ini-saludo-t { min-width: 0; }
.ini-fecha { margin: 0; font-size: 16px; font-weight: 500; line-height: 1.4; color: var(--ink-2); }
.ini-fecha b { color: var(--ink); font-weight: 800; }
.ini-hero .k-h1 { margin-top: 10px; font-size: 38px; line-height: 1.1; letter-spacing: -.03em; text-wrap: balance; }
.ini-hero .ini-h1-esq { margin-top: 14px; gap: 10px; max-width: 560px; }
.ini-hero .ini-h1-esq i { height: 34px; width: 88%; }
.ini-hero .ini-h1-esq i + i { width: 56%; }
.ini-sug { min-width: 0; display: grid; gap: 10px; padding: 20px 22px 20px; border-radius: 24px; background: var(--surface-1); border: 1.5px solid var(--c-ai-line); box-shadow: var(--sh-1); }
.ini-sug > .top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ini-sug p { margin: 0; font-size: 16px; line-height: 1.45; color: var(--ink-2); text-wrap: pretty; }
.ini-sug p strong { color: var(--ink); font-weight: 800; }
.ini-sug > .acc { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; margin-top: 4px; }
.ini-sug > .n { font-size: 13px; color: var(--ink-3); }
.ini-inicio sup { font-size: 12px; line-height: 0; font-weight: 700; }

.ini-tira { margin-top: 16px; padding: 18px 20px 20px; border-radius: 26px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.ini-tira > h3 { margin: 0 0 14px; display: flex; align-items: center; gap: 12px; font: 800 18px/1.2 var(--f-sans); letter-spacing: -.01em; }
.ini-tira > h3 small { font: 500 14.5px/1.3 var(--f-sans); letter-spacing: 0; color: var(--ink-3); }
.ini-listas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--g); margin-top: 16px; align-items: start; }
.ini-listas .k-ob { grid-template-columns: 44px minmax(0, 1fr); padding: 13px 14px; }
.ini-listas .k-ob > .ico { --t: 44px; }
.ini-listas .k-ob > .acc { grid-column: 2; grid-row: auto; justify-self: start; margin: 8px 0 0; }

.ini-mes { display: grid; gap: 8px; margin-bottom: 20px; }
.ini-mes-t { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -.025em; line-height: 1.15; text-wrap: balance; }
.ini-mes-t span { color: var(--accent-text); }
.ini-mes-n { margin: 0; max-width: 70ch; font-size: 15.5px; line-height: 1.45; color: var(--ink-2); text-wrap: pretty; }
.ini-props { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 430px), 1fr)); gap: var(--g); }
.ini-prop { display: flex; flex-direction: column; min-width: 0; padding: 20px 22px 18px; border-radius: 28px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.ini-prop > .cab { display: flex; align-items: center; gap: 14px; min-width: 0; }
.ini-prop > .cab b { display: block; font-size: 18px; font-weight: 800; line-height: 1.25; letter-spacing: -.01em; overflow-wrap: anywhere; }
.ini-prop > .cab small { display: block; margin-top: 2px; font-size: 14px; color: var(--ink-3); }
.ini-doc { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; column-gap: 14px; padding: 14px 0; border-top: 1px solid var(--line); }
.ini-doc:first-of-type { margin-top: 16px; }
.ini-doc > .n { min-width: 0; }
.ini-doc > .n b { display: block; font-size: 15.5px; font-weight: 800; line-height: 1.25; }
.ini-doc > .n small { display: block; margin-top: 3px; font-size: 13.5px; line-height: 1.3; color: var(--ink-3); }
.ini-prop > .pie { margin-top: auto; padding-top: 16px; display: flex; justify-content: flex-end; border-top: 1px solid var(--line); }
.ini-mpie { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px 20px; margin-top: 22px; padding: 16px 20px; border-radius: 24px; background: var(--surface-1); border: 1px solid var(--line); box-shadow: var(--sh-1); }
.ini-mpie .tot { margin: 0; display: flex; align-items: center; gap: 16px; min-width: 0; }
.ini-mpie .tot > b { font-size: 40px; font-weight: 800; line-height: 1; letter-spacing: -.03em; font-feature-settings: "tnum" 1; }
.ini-mpie .tot > span { font-size: 15px; line-height: 1.35; color: var(--ink-2); }
.ini-mpie .tot strong { color: var(--ink); font-weight: 800; }
.ini-mpie .tot a { color: var(--accent-text); font-weight: 700; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
.ini-mpie .fallo { margin: 0; font-size: 15px; color: var(--ink-2); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ini-mpie .k-esq { width: 320px; max-width: 100%; }
.ini-mpie .k-esq i { height: 18px; }

.ini-agentes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--g); }
.ini-inicio .k-prep { margin-top: 16px; }
.ini-vacio { margin-bottom: 56px; }
.ini-inicio .k-colofon button { position: relative; padding: 0; font: inherit; color: var(--ink-2); background: none; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.ini-inicio .k-colofon button::after { content: ""; position: absolute; inset: -10px -4px; }

@media (max-width: 1180px) {
  .ini-hero { grid-template-columns: minmax(0, 1fr); }
  .ini-listas { grid-template-columns: minmax(0, 1fr); row-gap: 22px; }
  .ini-agentes { grid-template-columns: minmax(0, 1fr); }
}
@media (min-width: 861px) and (max-height: 820px) {
  .ini-hero { padding: 22px 28px; margin-bottom: 22px; }
  .ini-hero .k-h1 { font-size: 32px; }
}
@media (max-width: 860px) {
  .ini-hero { padding: 20px 18px 22px; border-radius: 26px; margin-bottom: 22px; }
  .ini-hero .k-h1 { font-size: 27px; }
  .ini-fecha { font-size: 14.5px; }
  .ini-sug { padding: 16px 16px 18px; border-radius: 20px; }
  .ini-sug > .acc .k-btn { flex: 1 1 100%; min-height: 48px; }
  .ini-listas { margin-top: 12px; }
  .ini-mes-t { font-size: 23px; }
  .ini-props { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .ini-prop { padding: 16px 16px 14px; border-radius: 24px; }
  .ini-doc { grid-template-columns: 40px minmax(0, 1fr); row-gap: 8px; }
  .ini-doc > .k-estado { grid-column: 2; justify-self: start; }
  .ini-prop > .pie .k-btn { width: 100%; min-height: 48px; }
  .ini-mpie { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; }
  .ini-tira { padding: 14px 12px 16px; }
  .ini-inicio .k-colofon button { padding: 12px 0; }
}
`;

/* ════════════════════════════════════════════════════════════════════
   Página
   ════════════════════════════════════════════════════════════════════ */

type Celda = { tipo: TipoEstado; palabra: string; detalle?: string };

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [checking, setChecking] = useState(!IS_DEMO);
  const [userName, setUserName] = useState<string>("");

  // Datos: los mismos GET de siempre (calendario y generaciones) + las fichas
  // de propiedad para las unidades declaradas. `null` = cargando.
  const [calendario, setCalendario] = useState<{ items: ItemCalendario[]; propiedades: Copropiedad[] } | null>(null);
  const [errorCalendario, setErrorCalendario] = useState(false);
  const [intentoCalendario, setIntentoCalendario] = useState(0);
  const [generaciones, setGeneraciones] = useState<Generacion[] | null>(null);
  const [errorGeneraciones, setErrorGeneraciones] = useState(false);
  const [intentoGeneraciones, setIntentoGeneraciones] = useState(0);
  const [fichas, setFichas] = useState<Record<string, FichaPropiedad>>({});
  // Alcance de la cornisa: filtra en el cliente lo ya cargado.
  const [alcance, setAlcance] = useState("todas");

  const relojMs = useSyncExternalStore(suscribirReloj, leerReloj, relojServidor);
  const sugerenciaOculta = useSyncExternalStore(suscribirSugerencia, leerSugerenciaOculta, () => false);
  const soporteDisponible = useSoporteDisponible();

  // Los mismos GET de siempre, a través de la caché de 2 s que comparte el índice
  // (datosIndice): al entrar a Inicio ya no se piden dos veces, y el índice y esta
  // pantalla muestran siempre el mismo conteo. Un reintento pide sin caché.
  useEffect(() => {
    let vivo = true;
    pedirJSON<unknown>(URL_GENERACIONES, { fresco: intentoGeneraciones > 0 }).then((data) => {
      if (!vivo) return;
      if (Array.isArray(data)) setGeneraciones(data as Generacion[]);
      else setErrorGeneraciones(true);
    });
    return () => {
      vivo = false;
    };
  }, [intentoGeneraciones]);

  useEffect(() => {
    let vivo = true;
    pedirJSON<{ items?: unknown; properties?: unknown }>(URL_CALENDARIO, { fresco: intentoCalendario > 0 })
      .then((data) => {
        if (!vivo) return;
        if (data && Array.isArray(data.items)) {
          setCalendario({
            items: data.items as ItemCalendario[],
            propiedades: Array.isArray(data.properties)
              ? (data.properties as Copropiedad[]).map((p) => ({ id: p.id, name: p.name }))
              : [],
          });
        } else {
          setErrorCalendario(true);
        }
      });
    return () => {
      vivo = false;
    };
  }, [intentoCalendario]);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!Array.isArray(data)) return;
        const mapa: Record<string, FichaPropiedad> = {};
        for (const p of data as FichaPropiedad[]) mapa[p.id] = { id: p.id, units: p.units, city: p.city };
        setFichas(mapa);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (IS_DEMO) return;
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) throw new Error("Profile fetch failed");
        return r.json();
      })
      .then((data) => {
        if (data.onboarded === false && !data.error) {
          router.replace("/dashboard/onboarding");
        } else {
          if (data.name) setUserName(data.name.split(" ")[0]);
          setChecking(false);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  const reintentarCalendario = () => {
    setErrorCalendario(false);
    setCalendario(null);
    setIntentoCalendario((n) => n + 1);
  };
  const reintentarGeneraciones = () => {
    setErrorGeneraciones(false);
    setGeneraciones(null);
    setIntentoGeneraciones((n) => n + 1);
  };

  const estilos = (
    <style href="k-inicio-local" precedence="default">
      {CSS_INICIO}
    </style>
  );

  if (checking) {
    return (
      <div>
        {estilos}
        <Header title="Inicio" />
        <Pagina>
          <div className="ini-saludo">
            <div className="ini-saludo-t">
              <Esqueleto variante="bloque" etiquetaAccesible="Cargando tu inicio…" />
            </div>
          </div>
        </Pagina>
      </div>
    );
  }

  // Nombre: el del perfil y, si no llegó (modo demo), el de la sesión.
  const firstName = userName || session?.user?.name?.split(" ")[0] || "";

  /* ── reloj ────────────────────────────────────────────────────────── */
  const ahora = relojMs ? new Date(relojMs) : null;
  const hoy = ahora ? new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()) : null;
  const hora = ahora?.getHours() ?? 0;
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const lineaFecha = ahora
    ? `${may(DIAS[ahora.getDay()])} ${ahora.getDate()} de ${MESES[ahora.getMonth()]} de ${ahora.getFullYear()} · semana ${semanaIso(ahora)}`
    : "";
  const mes = ahora ? MESES[ahora.getMonth()] : "";

  /* ── obligaciones (GET /api/calendar) ─────────────────────────────── */
  const listo = Boolean(calendario && hoy);
  const propiedades = calendario?.propiedades ?? [];
  const sinPropiedades = listo && propiedades.length === 0;
  const alcanceValido = alcance === "todas" || propiedades.some((p) => p.id === alcance);
  const enAlcance = (propertyId: string) => !alcanceValido || alcance === "todas" || propertyId === alcance;

  const pendientesTodas = (calendario?.items ?? []).filter((it) => it.status === "pending" && typeof it.dueDate === "string");
  const conDias = hoy ? pendientesTodas.map((it) => ({ it, d: diasHasta(it.dueDate, hoy) })) : [];
  const pendientes = conDias.filter(({ it }) => enAlcance(it.propertyId)).sort((a, b) => a.it.dueDate.localeCompare(b.it.dueDate));

  // «Esta semana» = de hoy al domingo de la semana ISO actual.
  const hastaDomingo = ahora ? 7 - (ahora.getDay() || 7) : 0;
  const vencidas = pendientes.filter((x) => x.d < 0);
  const semana = pendientes.filter((x) => x.d >= 0 && x.d <= hastaDomingo);
  const treinta = pendientes.filter((x) => x.d > hastaDomingo && x.d <= 30);
  const proxima = pendientes.find((x) => x.d >= 0) ?? null;

  const cornisa = propiedades.map((p) => ({
    id: p.id,
    nombre: p.name,
    vencidas: conDias.filter(({ it, d }) => it.propertyId === p.id && d < 0).length,
  }));

  // Tira L–D de la semana ISO actual con las obligaciones pendientes de cada día.
  const dias: DiaTira[] = [];
  if (hoy && ahora) {
    const lunes = sumarDias(hoy, -((ahora.getDay() || 7) - 1));
    for (let i = 0; i < 7; i++) {
      const f = sumarDias(lunes, i);
      const d = Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
      const delDia = d >= 0 ? pendientes.filter((x) => x.it.dueDate === isoDe(f)).map((x) => x.it) : [];
      dias.push({
        etiqueta: d === 0 ? "Hoy" : LETRA_DIA[i],
        dia: f.getDate(),
        estado: d < 0 ? "pasado" : d === 0 ? "hoy" : "normal",
        evento: delDia.length ? rotuloTira(delDia) : undefined,
      });
    }
  }
  const diasConObligaciones = [...new Set(semana.map((x) => x.it.dueDate))].map(aFecha);
  const detalleSemana = (() => {
    if (!hoy || diasConObligaciones.length === 0) return "Semana libre";
    if (diasConObligaciones.length > 3) return `${diasConObligaciones.length} días con obligaciones`;
    const mismoMes = diasConObligaciones.every((f) => f.getMonth() === diasConObligaciones[0].getMonth());
    const partes = diasConObligaciones.map((f, i) =>
      mismoMes && i < diasConObligaciones.length - 1
        ? `${DIAS_CORTOS[f.getDay()]} ${f.getDate()}`
        : fechaConDia(f, hoy),
    );
    const texto = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0];
    return may(texto);
  })();

  const titular = sinPropiedades
    ? "Empieza por tu primera copropiedad."
    : errorCalendario
      ? "No pudimos revisar tus vencimientos."
      : titularDelDia(vencidas.map((x) => x.it), proxima);

  // «Pídeselo a Themis»: solo si el grupo mayor de vencidas son ≥ 2 asambleas
  // (o convocatorias) gemelas. No es una acción en lote: abre el chat real de Themis.
  // Es el mismo grupo que nombra el titular («Hoy toca convocar dos asambleas.»).
  const gemelas = (() => {
    const mayor = grupoMayor(vencidas.map((x) => x.it));
    const deAsamblea = mayor && (mayor.tipo.clave === "asamblea" || mayor.tipo.clave === "convocatoria");
    return deAsamblea && mayor.items.length >= 2 ? mayor.items : null;
  })();
  const mostrarSugerencia = Boolean(gemelas) && !sugerenciaOculta;

  const fila = ({ it, d }: { it: ItemCalendario; d: number }, tipoCuadro: "vencido" | "semana") => {
    const tipo = tipoDe(it);
    const titulo = tituloDe(it);
    return (
      <FilaObligacion
        key={`${it.propertyId}:${it.key}`}
        tipo={tipoCuadro}
        que={titulo}
        cuando={cuandoTexto(d, aFecha(it.dueDate), hoy as Date)}
        donde={it.propertyName}
        accion={{
          texto: tipo.accion,
          href: tipo.href,
          etiquetaAccesible: `${tipo.accion}: ${titulo} · ${it.propertyName}`,
        }}
      />
    );
  };

  /* ── informes y actas del mes (calendario + GET /api/generations) ─── */
  const anio = ahora?.getFullYear() ?? 0;
  const mesNum = ahora ? ahora.getMonth() + 1 : 0;
  const filasMatriz = propiedades.filter((p) => enAlcance(p.id)).map((p) => {
    // /api/generations no trae el id de la propiedad: se cruza por su nombre.
    const delMes = (generaciones ?? []).filter(
      (g) => g.property?.name === p.name && g.month === mesNum && g.year === anio,
    );
    const informeGen = delMes.find((g) => g.status === "completed" && g.outputFiles?.informeHtml);
    const actaGen = delMes.find((g) => g.status === "completed" && g.outputFiles?.actaHtml);
    const enCurso = delMes.find((g) => g.status === "pending" || g.status === "processing");
    const fallida = delMes.find((g) => g.status === "failed");
    // El ítem «Informe de gestión de {mes}» de la bitácora: se marca solo al
    // completar una generación, o a mano.
    const itemInforme = calendario?.items.find((it) => it.propertyId === p.id && it.category === "informe");
    const marcadoAMano = itemInforme?.status === "done" && !informeGen && !actaGen;

    let informe: Celda;
    let accion: ReactNode;
    const fecha = (g: Generacion) => (hoy ? fechaCorta(new Date(g.createdAt), hoy) : "");
    if (informeGen) {
      informe = { tipo: "ok", palabra: "Listo", detalle: `Generado el ${fecha(informeGen)}` };
      accion = (
        <EnlaceVer href={`/dashboard/generar/${informeGen.id}`} aria-label={`Abrir el informe de ${mes} de ${p.name}`}>
          Abrir informe
        </EnlaceVer>
      );
    } else if (enCurso) {
      informe = { tipo: "enCurso", palabra: "En curso", detalle: `Iniciado el ${fecha(enCurso)}` };
      accion = (
        <Boton variante="secundario" href={`/dashboard/generar/${enCurso.id}`} ancho="movil"
          aria-label={`Ver progreso de la generación de ${p.name}`}>
          Ver progreso
        </Boton>
      );
    } else if (marcadoAMano) {
      informe = { tipo: "ok", palabra: "Hecho", detalle: "Marcado en la bitácora" };
      accion = <EnlaceVer href={BITACORA} aria-label={`Ver en la bitácora el informe de ${p.name}`}>Ver en la bitácora</EnlaceVer>;
    } else if (fallida) {
      informe = { tipo: "vencido", palabra: "Error", detalle: `Falló el ${fecha(fallida)}` };
      accion = (
        <Boton variante="secundario" href={`/dashboard/generar/${fallida.id}`} ancho="movil"
          aria-label={`Ver el error de la generación de ${p.name}`}>
          Ver el error
        </Boton>
      );
    } else {
      const vence = itemInforme && hoy ? `Vence el ${fechaCorta(aFecha(itemInforme.dueDate), hoy)}` : "Sin generar";
      informe = { tipo: "pendiente", palabra: "Pendiente", detalle: vence };
      accion = (
        <Boton href="/dashboard/generar" ancho="movil" aria-label={`Generar el informe de ${mes} de ${p.name}`}>
          Generar informe
        </Boton>
      );
    }
    const acta: Celda = actaGen
      ? { tipo: "ok", palabra: "Lista", detalle: `Generada el ${fecha(actaGen)}` }
      : { tipo: "pendiente", palabra: "Pendiente", detalle: "Sin generar este mes" };
    const ficha = fichas[p.id];
    const apoyo = ficha?.units ? plural(ficha.units, "unidad", "unidades") : ficha?.city || "";
    return { p, informe, acta, accion, apoyo, conInforme: informe.tipo === "ok" };
  });
  const sinInforme = filasMatriz.filter((f) => !f.conInforme).length;

  const frasesMes = (() => {
    const n = filasMatriz.length;
    if (n === 1) {
      const nombre = nombreCorto(filasMatriz[0].p.name);
      return sinInforme
        ? { a: `${nombre} `, b: `aún no tiene informe de ${mes}.` }
        : { a: `${nombre} `, b: `ya tiene su informe de ${mes}.` };
    }
    if (sinInforme === 0) return { a: `Las ${n} copropiedades `, b: `ya tienen informe de ${mes}.` };
    return { a: `${sinInforme} de ${n} copropiedades `, b: `aún sin informe de ${mes}.` };
  })();

  // Pie de la matriz: generaciones COMPLETADAS de la cuenta (lo mismo que el
  // historial llama «documentos»), contadas por fecha de creación.
  const completadas = (generaciones ?? []).filter((g) => g.status === "completed");
  const delAnio = completadas.filter((g) => new Date(g.createdAt).getFullYear() === anio);
  const delMesCreadas = delAnio.filter((g) => new Date(g.createdAt).getMonth() + 1 === mesNum);
  const ultima = completadas[0];
  // La API devuelve como mucho 100: si llegan 100 y todas son de este año, puede haber más.
  const tope = (generaciones?.length ?? 0) >= 100 && delAnio.length === completadas.length;

  /* ── agentes (lib/agents: cuáles están activos) ──────────────────── */
  const activos = AGENT_IDS.filter((id) => INCLUDED_AGENT_IDS.includes(id)) as AgenteId[];
  const enPreparacion = AGENT_IDS.filter((id) => COMING_SOON_AGENT_IDS.includes(id)) as AgenteId[];

  const cargandoCalendario = !listo && !errorCalendario;

  return (
    <div className="ini-inicio">
      {estilos}
      {/* Sin copropiedades, el único primario es «Agregar copropiedad». */}
      <Header title="Inicio" accion={sinPropiedades ? null : undefined} />

      {listo && propiedades.length > 0 && (
        <Cornisa copropiedades={cornisa} valor={alcanceValido ? alcance : "todas"} alCambiar={setAlcance} />
      )}

      <Pagina>
        {/* ── saludo: el titular RESPONDE la pregunta del día ─────────── */}
        <section className="ini-hero" aria-label="Resumen del día">
          <div className="ini-saludo-t">
            <p className="ini-fecha">
              <b>{firstName ? `${saludo}, ${firstName}.` : `${saludo}.`}</b> {lineaFecha}
            </p>
            {cargandoCalendario || !ahora ? (
              <span className="k-esq ini-h1-esq" aria-hidden="true"><i /><i /></span>
            ) : (
              <h1 className="k-h1">{titular}</h1>
            )}
          </div>

          {mostrarSugerencia && gemelas && (
            <div className="ini-sug">
              <div className="top">
                <RotuloIA>Pídeselo a Themis</RotuloIA>
                <Boton variante="fantasma" tam={40} onClick={ocultarSugerencia}>Ahora no</Boton>
              </div>
              <p>
                Themis puede redactar las convocatorias de{" "}
                {enumerar(gemelas.map((it) => <strong key={it.propertyId + it.key}>{nombreCorto(it.propertyName)}</strong>))}
                . Deben enviarse con al menos 15 días calendario de antelación<sup>1</sup>.
              </p>
              <div className="acc">
                <Boton href={THEMIS} icono={Sparkles} tono="ai">Redactar con Themis</Boton>
              </div>
              <p className="n"><sup>1</sup> Ley 675 de 2001, art. 39.</p>
            </div>
          )}
        </section>

        {sinPropiedades ? (
          <Vacio
            className="ini-vacio"
            titulo="Aún no tienes copropiedades."
            texto="Agrega la primera con su nombre y dirección: con ella SOPH.IA arma tu bitácora de obligaciones y los informes de cada mes."
            acciones={<Boton href="/dashboard/propiedades" flecha="crea">Agregar copropiedad</Boton>}
          />
        ) : (
          <>
            {/* ── ¿QUÉ QUIERES HACER?: las cuatro tareas de siempre, a un clic ── */}
            <Seccion id="s0" titulo="¿Qué quieres hacer?" icono={MousePointerClick} tono="violet">
              <Accesos>
                <Acceso href={MODULOS.generar.href} icono={MODULOS.generar.icono} tono={MODULOS.generar.tono}
                  titulo="Generar informe o acta" texto="En cinco pasos." />
                <Acceso href={MODULOS.bitacora.href} icono={MODULOS.bitacora.icono} tono={MODULOS.bitacora.tono}
                  titulo="Ver mis vencimientos" texto="Pólizas y plazos legales." />
                <Acceso href={MODULOS.asistente.href} icono={MODULOS.asistente.icono} tono={MODULOS.asistente.tono}
                  titulo="Preguntar a un agente" texto="Themis y Chronos." />
                <Acceso href={MODULOS.historial.href} icono={MODULOS.historial.icono} tono={MODULOS.historial.tono}
                  titulo="Ver mis documentos" texto="Lo que ya generaste." />
              </Accesos>
            </Seccion>

            {/* ── VENCIMIENTOS: el color de cada tarjeta dice la urgencia ── */}
            <Seccion
              id="s11"
              titulo="Vencimientos"
              nota="lo más urgente primero"
              icono={CalendarClock}
              tono="orange"
              enlace={{ href: BITACORA, texto: "Abrir bitácora" }}
            >
              {errorCalendario ? (
                <ErrorCarga
                  nivel={3}
                  titulo="No pudimos cargar la bitácora."
                  texto="Revisa tu conexión e inténtalo de nuevo."
                  acciones={<Boton variante="secundario" onClick={reintentarCalendario}>Reintentar</Boton>}
                />
              ) : cargandoCalendario || !hoy ? (
                <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando vencimientos…" />
              ) : (
                <>
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

                  <div className="ini-tira">
                    <h3><Loseta icono={CalendarDays} tono="violet" tam={36} />Tu semana</h3>
                    <TiraSemanal dias={dias} />
                  </div>

                  <div className="ini-listas">
                    <ListaObligaciones
                      className="a"
                      titulo="Vencidas"
                      conteo={vencidas.length}
                      etiquetaAccesible={vencidas.length === 1 ? "1 obligación vencida" : `${vencidas.length} obligaciones vencidas`}
                    >
                      {vencidas.slice(0, 3).map((x) => fila(x, "vencido"))}
                      {vencidas.length > 3 && (
                        <MasEnLista href={BITACORA}>{vencidas.length - 3} más en la bitácora</MasEnLista>
                      )}
                    </ListaObligaciones>

                    <ListaObligaciones
                      className="b"
                      titulo="Esta semana"
                      conteo={semana.length}
                      etiquetaAccesible={semana.length === 1 ? "1 obligación esta semana" : `${semana.length} obligaciones esta semana`}
                    >
                      {semana.slice(0, 3).map((x) => fila(x, "semana"))}
                      {semana.length > 3 && (
                        <MasEnLista href={BITACORA}>{semana.length - 3} más en la bitácora</MasEnLista>
                      )}
                    </ListaObligaciones>

                    <ListaObligaciones
                      className="c"
                      titulo={`Próximos 30${NB}días`}
                      conteo={treinta.length}
                      etiquetaAccesible={
                        treinta.length === 1
                          ? "1 obligación en los próximos 30 días"
                          : `${treinta.length} obligaciones en los próximos 30 días`
                      }
                    >
                      {treinta.slice(0, 3).map(({ it, d }) => (
                        <FilaObligacion
                          key={`${it.propertyId}:${it.key}`}
                          tipo="sin"
                          que={tituloDe(it)}
                          href={BITACORA}
                          cuando={cuandoTexto(d, aFecha(it.dueDate), hoy)}
                          donde={it.propertyName}
                        />
                      ))}
                      {treinta.length > 3 && (
                        <MasEnLista href={BITACORA}>{treinta.length - 3} más en la bitácora</MasEnLista>
                      )}
                    </ListaObligaciones>
                  </div>
                </>
              )}
            </Seccion>

            {/* ── INFORMES Y ACTAS DEL MES: una tarjeta por copropiedad ── */}
            <Seccion
              id="s12"
              titulo={mes ? `Informes y actas de ${mes}` : "Informes y actas del mes"}
              nota="lo que toca cada mes"
              icono={FileText}
              tono="blue"
              enlace={{ href: "/dashboard/generar", texto: "Ir a Generar" }}
            >
              {errorCalendario ? (
                <ErrorCarga
                  nivel={3}
                  titulo="No pudimos cargar tus copropiedades."
                  texto="Sin la bitácora no sabemos qué informes faltan este mes."
                  acciones={<Boton variante="secundario" onClick={reintentarCalendario}>Reintentar</Boton>}
                />
              ) : cargandoCalendario || !hoy ? (
                <Esqueleto variante="completo" filas={2} etiquetaAccesible="Cargando informes del mes…" />
              ) : (
                <>
                  <div className="ini-mes">
                    <p className="ini-mes-t">
                      {frasesMes.a}
                      <span>{frasesMes.b}</span>
                    </p>
                    <p className="ini-mes-n">
                      Cada informe sale del asistente de 5 pasos: propiedad, periodo, documentos, archivos y notas.
                      {/* Solo es verdad fuera del demo: ahí /api/calendar marca «informe» como hecho
                          al completar una generación del mes; el demo no cruza sus generaciones. */}
                      {!IS_DEMO && " Al completarlo, la bitácora lo marca como hecho."}
                    </p>
                  </div>

                  <ul className="ini-props" aria-label={`Informes y actas de ${mes} por copropiedad`} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {filasMatriz.map((f) => (
                      <li key={f.p.id} className="ini-prop">
                        <div className="cab">
                          <Loseta icono={MODULOS.propiedades.icono} tono={MODULOS.propiedades.tono} />
                          <span style={{ minWidth: 0 }}>
                            <b>{f.p.name}</b>
                            {f.apoyo && <small>{f.apoyo}</small>}
                          </span>
                        </div>
                        <div className="ini-doc">
                          <Loseta icono={FileText} tono="blue" tam={40} suave />
                          <span className="n"><b>Informe de gestión</b>{f.informe.detalle && <small>{f.informe.detalle}</small>}</span>
                          <Estado tipo={f.informe.tipo}>{f.informe.palabra}</Estado>
                        </div>
                        <div className="ini-doc">
                          <Loseta icono={FileSignature} tono="indigo" tam={40} suave />
                          <span className="n"><b>Acta del consejo</b>{f.acta.detalle && <small>{f.acta.detalle}</small>}</span>
                          <Estado tipo={f.acta.tipo}>{f.acta.palabra}</Estado>
                        </div>
                        <div className="pie">{f.accion}</div>
                      </li>
                    ))}
                  </ul>

                  <div className="ini-mpie">
                    {errorGeneraciones ? (
                      <p className="fallo">
                        No pudimos cargar tus documentos generados.
                        <Boton variante="fantasma" tam={40} onClick={reintentarGeneraciones}>Reintentar</Boton>
                      </p>
                    ) : generaciones === null ? (
                      <span role="status">
                        <span className="k-esq" aria-hidden="true"><i /><i /></span>
                        <span className="k-sr">Cargando documentos…</span>
                      </span>
                    ) : (
                      <div className="tot">
                        <Loseta icono={FolderCheck} tono="green" tam={52} />
                        <b>
                          {delAnio.length}
                          {tope ? "+" : ""}
                        </b>
                        <span>
                          <strong>
                            {delAnio.length === 1 ? "documento generado" : "documentos generados"} en {anio}
                          </strong>
                          <br />
                          {ultima ? (
                            <>
                              {delMesCreadas.length === 0 ? "ninguno este mes" : `${delMesCreadas.length} este mes`} ·{" "}
                              <Link href={`/dashboard/generar/${ultima.id}`}>el último</Link>, {haceTexto(new Date(ultima.createdAt), ahora as Date)}
                            </>
                          ) : (
                            "Aún no has generado documentos."
                          )}
                        </span>
                      </div>
                    )}
                    <EnlaceVer href="/dashboard/historial">Historial completo</EnlaceVer>
                  </div>
                </>
              )}
            </Seccion>
          </>
        )}

        {/* ── AGENTES: cada uno con su icono y su color, sin citas inventadas ── */}
        <Seccion
          id="s13"
          titulo="Tus agentes"
          nota={`${activos.length} ${activos.length === 1 ? "activo" : "activos"} · ${enPreparacion.length} en preparación`}
          icono={Sparkles}
          tono="ai"
          enlace={{ href: "/dashboard/asistente", texto: "Asistente IA" }}
        >
          <div className="ini-agentes">
            {activos.map((id) => (
              <FichaAgente key={id} agente={id} href={`/dashboard/asistente/${id}`} />
            ))}
          </div>
          {enPreparacion.length > 0 && <FranjaPreparacion agentes={enPreparacion} />}
        </Seccion>

        <Colofon
          izquierda="SOPH.IA · propiedad horizontal · Ley 675 de 2001"
          derecha={
            <>
              ¿Dudas?{" "}
              {soporteDisponible && (
                <>
                  <button type="button" onClick={abrirSoporte} aria-controls="soporte-sophia">
                    Chat de soporte
                  </button>
                  {" · "}
                </>
              )}
              <Link href="/dashboard/configuracion">Centro de soporte</Link>
              {WHATSAPP_SOPORTE && (
                <>
                  {" · "}
                  <a href={WHATSAPP_SOPORTE} target="_blank" rel="noopener noreferrer">Soporte por WhatsApp</a>
                </>
              )}
            </>
          }
        />
      </Pagina>
    </div>
  );
}
