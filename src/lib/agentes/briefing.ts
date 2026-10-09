/**
 * El «briefing» que reciben TODOS los agentes en cada conversación: el estado real de la copropiedad en foco (o un resumen de todas),
 * armado desde la base de datos, para que sepan sin que nadie se los cuente. Es la «memoria operativa» de los agentes: la leen todos
 * por igual, como los empleados de una misma oficina leen el mismo tablero.
 *
 * Aquí está la parte PURA (formato y reglas, con pruebas); el cargador de datos está en `briefing-datos.ts`.
 * Reglas: solo cifras que existen (nunca se inventa un cero); un módulo que la cuenta no puede usar no aparece (el piloto manda);
 * el texto tiene tope (~2.500 tokens) para que cada mensaje no se encarezca.
 */
import { fmtCOP } from "@/lib/cartera";

export type Linea = string;

export type DatosDeCartera = {
  unidades: number;
  /** Total que deben todas las unidades (saldos positivos). */
  deudaTotal: number;
  /** Lo vencido sin pagar. */
  enMora: number;
  unidadesEnMora: number;
  aging: { etiqueta: string; unidades: number; monto: number }[];
  morosos: { unidad: string; enMora: number; dias: number }[];
  recaudoDelMes: number;
};

export type DatosDePresupuesto = {
  anio: number;
  ingresos: { presupuestado: number; ejecutado: number };
  gastos: { presupuestado: number; ejecutado: number };
  fondo: { saldo: number; requerido: number; alDia: boolean };
  desviaciones: { concepto: string; presupuestado: number; ejecutado: number }[];
};

export type DatosDePqrs = {
  abiertas: number;
  vencidas: number;
  porEstado: Record<string, number>;
  lista: { codigo: string; asunto: string; estado: string; dias: number; vencida: boolean }[];
};

export type DatosDePropiedad = {
  propiedad: { id: string; nombre: string; direccion?: string | null; ciudad?: string | null; unidades?: number | null; caracteristicas: string[] };
  cartera?: DatosDeCartera | null;
  presupuesto?: DatosDePresupuesto | null;
  /** Hay módulo de presupuesto pero no hay presupuesto de este año. */
  sinPresupuesto?: boolean;
  pqrs?: DatosDePqrs | null;
  asambleas?: { fecha: string; tipo: string; estado: string; modalidad: string }[];
  certificados?: { ultimos30Dias: number; vigentes: number } | null;
  comunicados?: { asunto: string; fecha: string }[];
  vencimientos: { titulo: string; fecha: string; dias: number; categoria: string }[];
  reuniones: { titulo: string; fecha: string; estado: string; resumen?: string; compromisos?: number; pendientes?: number }[];
  generaciones: { tipo: string; mes: number; anio: number }[];
  documentos: { tipo: string; nombre: string }[];
  personas: { nombre: string; rol: string | null }[];
  memoria: { tipo: string; contenido: string; fecha: string; autor: string | null }[];
  eventos: { fecha: string; modulo: string; resumen: string; actor: string }[];
};

export type ResumenDePropiedad = { id: string; nombre: string; ciudad?: string | null; unidades?: number | null; pqrsAbiertas?: number; proximaAsamblea?: string | null };

export const TOPE_DEL_BRIEFING = 9_000;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const fechaCorta = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });
};

const recortar = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1)}…`);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

/** ¿Qué copropiedad queda «en foco»? La pedida si es del usuario; si solo tiene una, esa; si no, ninguna (se muestra el resumen de todas). */
export function elegirPropiedadEnFoco(propiedades: { id: string }[], pedida?: string | null): string | null {
  if (pedida && propiedades.some((p) => p.id === pedida)) return pedida;
  if (propiedades.length === 1) return propiedades[0].id;
  return null;
}

function seccionCartera(c: DatosDeCartera): Linea[] {
  if (c.unidades === 0) return ["## Cartera", "Sin unidades registradas todavía."];
  const l: Linea[] = ["## Cartera"];
  l.push(
    `${c.unidades} unidades · deuda total ${fmtCOP(c.deudaTotal)} · vencido sin pagar ${fmtCOP(c.enMora)} en ${c.unidadesEnMora} unidad${c.unidadesEnMora === 1 ? "" : "es"} · recaudo de este mes ${fmtCOP(c.recaudoDelMes)}`,
  );
  const edades = c.aging.filter((a) => a.unidades > 0).map((a) => `${a.etiqueta}: ${a.unidades} (${fmtCOP(a.monto)})`);
  if (edades.length) l.push(`Edades de mora: ${edades.join(" · ")}`);
  if (c.morosos.length) l.push(`Mayores morosos: ${c.morosos.map((m) => `${m.unidad} ${fmtCOP(m.enMora)} (${m.dias} d)`).join(" · ")}`);
  return l;
}

function seccionPresupuesto(p: DatosDePresupuesto): Linea[] {
  const l: Linea[] = [`## Presupuesto ${p.anio}`];
  l.push(
    `Ingresos ${fmtCOP(p.ingresos.ejecutado)} de ${fmtCOP(p.ingresos.presupuestado)} (${pct(p.ingresos.ejecutado, p.ingresos.presupuestado)}) · gastos ${fmtCOP(p.gastos.ejecutado)} de ${fmtCOP(p.gastos.presupuestado)} (${pct(p.gastos.ejecutado, p.gastos.presupuestado)})`,
  );
  l.push(`Fondo de imprevistos: saldo ${fmtCOP(p.fondo.saldo)}, requerido ${fmtCOP(p.fondo.requerido)} → ${p.fondo.alDia ? "al día" : "POR DEBAJO de lo requerido (Art. 35 Ley 675)"}`);
  if (p.desviaciones.length) {
    l.push(`Rubros pasados del presupuesto: ${p.desviaciones.map((d) => `${recortar(d.concepto, 40)} ${fmtCOP(d.ejecutado)} vs ${fmtCOP(d.presupuestado)}`).join(" · ")}`);
  }
  return l;
}

function seccionPqrs(p: DatosDePqrs): Linea[] {
  const l: Linea[] = ["## PQRS"];
  if (p.abiertas === 0) return [...l, "Ninguna abierta."];
  const estados = Object.entries(p.porEstado).map(([k, v]) => `${v} ${k}`).join(", ");
  l.push(`${p.abiertas} abierta${p.abiertas === 1 ? "" : "s"} (${estados}) · ${p.vencidas} fuera del plazo de referencia de 15 días hábiles`);
  for (const q of p.lista.slice(0, 6)) l.push(`- ${q.codigo} «${recortar(q.asunto, 70)}» · ${q.estado} · ${q.dias} d${q.vencida ? " · VENCIDA" : ""}`);
  return l;
}

/** El briefing de UNA copropiedad en foco. */
export function construirBriefing(d: DatosDePropiedad, ahora: Date = new Date()): string {
  const hoy = ahora.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
  const p = d.propiedad;
  const l: Linea[] = [];
  l.push(`# Copropiedad en foco: ${p.nombre}`);
  l.push(`Hoy es ${hoy}. ${[p.direccion, p.ciudad].filter(Boolean).join(", ")}${p.unidades ? ` · ${p.unidades} unidades` : ""}${p.caracteristicas.length ? ` · Tiene: ${p.caracteristicas.join(", ")}` : ""}`);

  if (d.cartera) l.push("", ...seccionCartera(d.cartera));
  if (d.presupuesto) l.push("", ...seccionPresupuesto(d.presupuesto));
  else if (d.sinPresupuesto) l.push("", "## Presupuesto", "No hay presupuesto de este año cargado.");
  if (d.pqrs) l.push("", ...seccionPqrs(d.pqrs));

  if (d.asambleas?.length) {
    l.push("", "## Asambleas");
    for (const a of d.asambleas) l.push(`- ${a.tipo} · ${fechaCorta(a.fecha)} · ${a.modalidad} · ${a.estado}`);
  }
  if (d.certificados) l.push("", "## Certificados", `${d.certificados.ultimos30Dias} emitidos en los últimos 30 días · ${d.certificados.vigentes} vigentes`);
  if (d.comunicados?.length) l.push("", "## Comunicados recientes", ...d.comunicados.map((c) => `- ${fechaCorta(c.fecha)} · ${recortar(c.asunto, 80)}`));

  if (d.vencimientos.length) {
    l.push("", "## Próximos vencimientos y obligaciones");
    for (const v of d.vencimientos) l.push(`- ${fechaCorta(v.fecha)} · ${recortar(v.titulo, 80)} (${v.dias < 0 ? `vencido hace ${-v.dias} d` : v.dias === 0 ? "hoy" : `en ${v.dias} d`})`);
  }

  if (d.reuniones.length) {
    l.push("", "## Reuniones");
    for (const r of d.reuniones) {
      const extra = r.estado === "lista" ? [r.compromisos ? `${r.compromisos} compromisos` : null, r.pendientes ? `${r.pendientes} pendientes` : null].filter(Boolean).join(", ") : r.estado;
      l.push(`- ${fechaCorta(r.fecha)} · ${recortar(r.titulo, 70)}${extra ? ` (${extra})` : ""}${r.resumen ? `: ${recortar(r.resumen, 260)}` : ""}`);
    }
  }
  if (d.generaciones.length) l.push("", "## Documentos generados recientemente", d.generaciones.map((g) => `${g.tipo} ${MESES[g.mes - 1] ?? g.mes}/${g.anio}`).join(" · "));
  if (d.documentos.length) l.push("", "## Documentos cargados", d.documentos.map((x) => `${x.nombre} (${x.tipo})`).join(" · "));
  if (d.personas.length) l.push("", "## Personas clave", d.personas.map((x) => `${x.nombre}${x.rol ? ` (${x.rol})` : ""}`).join(" · "));

  if (d.memoria.length) {
    l.push("", "## Memoria de la copropiedad (notas guardadas por la administración y los agentes)");
    for (const m of d.memoria) l.push(`- [${m.tipo}] ${recortar(m.contenido, 300)} — ${fechaCorta(m.fecha)}${m.autor ? ` · ${m.autor}` : ""}`);
  }
  if (d.eventos.length) {
    l.push("", "## Lo que ha pasado últimamente (más reciente primero)");
    for (const e of d.eventos) l.push(`- ${fechaCorta(e.fecha)} · ${e.modulo} · ${recortar(e.resumen, 160)}${e.actor !== "usuario" ? ` (${e.actor})` : ""}`);
  }

  const texto = l.join("\n");
  return texto.length <= TOPE_DEL_BRIEFING ? texto : `${texto.slice(0, TOPE_DEL_BRIEFING)}\n[…briefing recortado: pide el detalle con la herramienta consultar_operacion]`;
}

/** Las demás copropiedades: una línea cada una. */
export function construirResumenDeLasDemas(items: ResumenDePropiedad[]): string {
  if (items.length === 0) return "";
  const l = ["## Todas las copropiedades de la cuenta"];
  for (const i of items) {
    const partes = [i.ciudad, i.unidades ? `${i.unidades} unidades` : null, i.pqrsAbiertas ? `${i.pqrsAbiertas} PQRS abiertas` : null, i.proximaAsamblea ? `próxima asamblea ${fechaCorta(i.proximaAsamblea)}` : null].filter(Boolean);
    l.push(`- ${i.nombre} (id ${i.id})${partes.length ? ` — ${partes.join(" · ")}` : ""}`);
  }
  l.push("Para el detalle de cualquiera usa la herramienta consultar_operacion con su id.");
  return l.join("\n");
}
