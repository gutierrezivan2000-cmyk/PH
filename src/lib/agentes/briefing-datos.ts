/**
 * Carga desde la base de datos lo que alimenta el briefing de los agentes (la parte pura está en `briefing.ts`).
 *
 * Cada sección se pide por separado y, si una falla (una tabla que todavía no existe, una consulta que cae), esa sección se omite y
 * el resto sigue: el chat nunca se cae por el briefing. Todas las consultas filtran por `userId` (aislamiento entre clientes), y un
 * módulo en lanzamiento gradual que la cuenta no puede usar no se consulta ni aparece.
 */
import { AGING_LABELS, agingBucket, computeAgingReport, computeUnitSummary } from "@/lib/cartera";
import { addBusinessDays, assemblyItems, generateAutoItems, monthlyReportItem, parseFeatures, CATEGORY_LABELS } from "@/lib/compliance";
import { computeBudgetExecution, sanitizeBudgetItems } from "@/lib/presupuesto";
import type { ComingSoonKey } from "@/lib/feature-flags";
import {
  construirBriefing,
  construirResumenDeLasDemas,
  elegirPropiedadEnFoco,
  type DatosDeCartera,
  type DatosDePresupuesto,
  type DatosDePqrs,
  type DatosDePropiedad,
  type ResumenDePropiedad,
} from "./briefing";

export type Visibles = Record<ComingSoonKey, boolean>;

const DIA = 86_400_000;

async function seguro<T>(etiqueta: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[agentes/briefing] ${etiqueta}:`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

export async function cargarCartera(userId: string, propertyId: string, ahora: Date, limiteDeMorosos = 5): Promise<DatosDeCartera> {
  const { db } = await import("@/lib/db");
  const unidades = await db.unit.findMany({
    where: { propertyId, userId },
    take: 1500,
    select: { label: true, charges: { select: { amount: true, paidAmount: true, dueDate: true } }, payments: { select: { amount: true, receivedAt: true } } },
  });
  const inicioDeMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  let recaudoDelMes = 0;
  const filas = unidades.map((u) => {
    const pagado = u.payments.reduce((s, p) => s + p.amount, 0);
    for (const p of u.payments) if (p.receivedAt >= inicioDeMes) recaudoDelMes += p.amount;
    return { unidad: u.label, resumen: computeUnitSummary(u.charges, pagado, ahora) };
  });
  const enMora = filas.filter((f) => f.resumen.overdueAmount > 0);
  const aging = computeAgingReport(filas.map((f) => ({ summary: f.resumen }))).map((a) => ({ etiqueta: AGING_LABELS[a.bucket] ?? a.label, unidades: a.count, monto: a.amount }));
  return {
    unidades: unidades.length,
    deudaTotal: filas.reduce((s, f) => s + Math.max(0, f.resumen.balance), 0),
    enMora: enMora.reduce((s, f) => s + f.resumen.overdueAmount, 0),
    unidadesEnMora: enMora.length,
    aging,
    morosos: enMora
      .sort((a, b) => b.resumen.overdueAmount - a.resumen.overdueAmount)
      .slice(0, limiteDeMorosos)
      .map((f) => ({ unidad: f.unidad, enMora: f.resumen.overdueAmount, dias: f.resumen.overdueDays })),
    recaudoDelMes,
  };
}

export async function cargarPresupuesto(userId: string, propertyId: string, anio: number): Promise<DatosDePresupuesto | null> {
  const { db } = await import("@/lib/db");
  const presupuesto = await db.budget.findFirst({ where: { propertyId, userId, year: anio } });
  if (!presupuesto) return null;
  const movimientos = await db.ledgerEntry.findMany({
    where: { propertyId, userId, date: { gte: new Date(anio, 0, 1), lt: new Date(anio + 1, 0, 1) } },
    select: { itemId: true, type: true, amount: true },
  });
  const e = computeBudgetExecution(sanitizeBudgetItems(presupuesto.items), movimientos);
  return {
    anio,
    ingresos: { presupuestado: e.ingresos.budgeted, ejecutado: e.ingresos.executed },
    gastos: { presupuestado: e.gastos.budgeted, ejecutado: e.gastos.executed },
    fondo: { saldo: e.fondo.balance, requerido: e.fondo.required, alDia: e.fondo.compliant },
    desviaciones: e.gastos.rows
      .filter((r) => r.executed > r.budgeted && r.budgeted > 0)
      .sort((a, b) => b.executed - b.budgeted - (a.executed - a.budgeted))
      .slice(0, 3)
      .map((r) => ({ concepto: r.concept, presupuestado: r.budgeted, ejecutado: r.executed })),
  };
}

export async function cargarPqrs(userId: string, propertyId: string, ahora: Date): Promise<DatosDePqrs> {
  const { db } = await import("@/lib/db");
  const filas = await db.pqrs.findMany({
    where: { propertyId, userId, status: { in: ["radicado", "en_proceso"] } },
    orderBy: { createdAt: "asc" },
    take: 60,
    select: { code: true, subject: true, status: true, createdAt: true },
  });
  const lista = filas.map((f) => ({
    codigo: f.code,
    asunto: f.subject,
    estado: f.status,
    dias: Math.floor((ahora.getTime() - f.createdAt.getTime()) / DIA),
    vencida: addBusinessDays(f.createdAt, 15).getTime() < ahora.getTime(),
  }));
  const porEstado: Record<string, number> = {};
  for (const f of lista) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
  return { abiertas: lista.length, vencidas: lista.filter((q) => q.vencida).length, porEstado, lista };
}

export async function cargarVencimientos(userId: string, propertyId: string, features: unknown, visibles: Visibles, ahora: Date, hastaDias = 60, limite = 8) {
  const { db } = await import("@/lib/db");
  const registros = await db.complianceRecord.findMany({ where: { propertyId }, select: { itemKey: true, status: true } });
  const cerrados = new Set(registros.filter((r) => r.status === "done" || r.status === "dismissed").map((r) => r.itemKey));
  const items = [...generateAutoItems(parseFeatures(features), ahora), monthlyReportItem(ahora)];
  if (visibles.asambleas) {
    const asambleas = await db.assembly.findMany({
      where: { propertyId, userId, status: { not: "cancelada" } },
      select: { id: true, type: true, date: true, status: true, convokedAt: true, actaReadyAt: true },
    });
    for (const a of asambleas) items.push(...assemblyItems(a, ahora));
  }
  const activos = await db.commonAsset.findMany({ where: { propertyId, userId, status: "active" }, select: { id: true, name: true, kind: true, dueDate: true } });
  const lista = items
    .filter((i) => !cerrados.has(i.key))
    .map((i) => ({ titulo: i.title, fecha: i.dueDate, categoria: CATEGORY_LABELS[i.category as keyof typeof CATEGORY_LABELS] ?? String(i.category) }));
  for (const a of activos) lista.push({ titulo: a.name, fecha: a.dueDate.toISOString().slice(0, 10), categoria: a.kind === "poliza" ? "Póliza" : "Zona común" });
  return lista
    .map((v) => ({ ...v, dias: Math.round((new Date(`${v.fecha}T12:00:00`).getTime() - ahora.getTime()) / DIA) }))
    .filter((v) => v.dias >= -30 && v.dias <= hastaDias)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, limite);
}

export async function cargarDatosDePropiedad(userId: string, propertyId: string, visibles: Visibles, ahora: Date = new Date()): Promise<DatosDePropiedad | null> {
  const { db } = await import("@/lib/db");
  const p = await db.property.findFirst({ where: { id: propertyId, userId }, select: { id: true, name: true, address: true, city: true, units: true, features: true } });
  if (!p) return null;
  const caracteristicas = Object.entries(parseFeatures(p.features) as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const hace30 = new Date(ahora.getTime() - 30 * DIA);

  const [cartera, presupuesto, pqrs, asambleas, certificados, comunicados, vencimientos, reuniones, generaciones, documentos, personas, memoria, eventos] = await Promise.all([
    visibles.cartera ? seguro("cartera", () => cargarCartera(userId, propertyId, ahora)) : undefined,
    visibles.presupuesto ? seguro("presupuesto", () => cargarPresupuesto(userId, propertyId, ahora.getFullYear())) : undefined,
    visibles.pqrs ? seguro("pqrs", () => cargarPqrs(userId, propertyId, ahora)) : undefined,
    visibles.asambleas
      ? seguro("asambleas", async () =>
          (await db.assembly.findMany({ where: { propertyId, userId, status: { not: "cancelada" }, date: { gte: new Date(ahora.getTime() - 45 * DIA) } }, orderBy: { date: "asc" }, take: 4, select: { date: true, type: true, status: true, modality: true } })).map((a) => ({ fecha: a.date.toISOString(), tipo: a.type, estado: a.status, modalidad: a.modality })),
        )
      : undefined,
    visibles.certificados
      ? seguro("certificados", async () => ({
          ultimos30Dias: await db.certificate.count({ where: { propertyId, userId, createdAt: { gte: hace30 } } }),
          vigentes: await db.certificate.count({ where: { propertyId, userId, status: "valid" } }),
        }))
      : undefined,
    visibles.comunicados
      ? seguro("comunicados", async () => (await db.announcement.findMany({ where: { propertyId, userId }, orderBy: { createdAt: "desc" }, take: 4, select: { subject: true, createdAt: true } })).map((c) => ({ asunto: c.subject, fecha: c.createdAt.toISOString() })))
      : undefined,
    seguro("vencimientos", () => cargarVencimientos(userId, propertyId, p.features, visibles, ahora)),
    seguro("reuniones", async () =>
      (await db.meeting.findMany({ where: { propertyId, userId }, orderBy: { date: "desc" }, take: 3, select: { title: true, date: true, status: true, digest: true } })).map((m) => {
        const f = (m.digest ?? null) as { resumen?: string; compromisos?: unknown[]; pendientes?: unknown[] } | null;
        return { titulo: m.title, fecha: m.date.toISOString(), estado: m.status, resumen: f?.resumen, compromisos: f?.compromisos?.length, pendientes: f?.pendientes?.length };
      }),
    ),
    seguro("generaciones", async () => (await db.generation.findMany({ where: { propertyId, userId, status: "completed" }, orderBy: { createdAt: "desc" }, take: 5, select: { type: true, month: true, year: true } })).map((g) => ({ tipo: g.type, mes: g.month, anio: g.year }))),
    seguro("documentos", async () => (await db.propertyDocument.findMany({ where: { propertyId }, orderBy: { createdAt: "desc" }, take: 8, select: { type: true, name: true } })).map((d) => ({ tipo: d.type, nombre: d.name }))),
    seguro("personas", async () => (await db.propertyPerson.findMany({ where: { propertyId, active: true }, take: 8, select: { name: true, role: true } })).map((x) => ({ nombre: x.name, rol: x.role }))),
    seguro("memoria", async () => (await db.propertyMemory.findMany({ where: { propertyId, userId }, orderBy: { createdAt: "desc" }, take: 25, select: { kind: true, content: true, createdAt: true, authorAgent: true } })).map((m) => ({ tipo: m.kind, contenido: m.content, fecha: m.createdAt.toISOString(), autor: m.authorAgent }))),
    seguro("eventos", async () => (await db.propertyEvent.findMany({ where: { propertyId, userId }, orderBy: { createdAt: "desc" }, take: 15, select: { module: true, summary: true, actor: true, createdAt: true } })).map((e) => ({ fecha: e.createdAt.toISOString(), modulo: e.module, resumen: e.summary, actor: e.actor }))),
  ]);

  return {
    propiedad: { id: p.id, nombre: p.name, direccion: p.address, ciudad: p.city, unidades: p.units, caracteristicas },
    cartera: cartera ?? null,
    presupuesto: presupuesto ?? null,
    sinPresupuesto: visibles.presupuesto && presupuesto === null,
    pqrs: pqrs ?? null,
    asambleas: asambleas ?? [],
    certificados: certificados ?? null,
    comunicados: comunicados ?? [],
    vencimientos: vencimientos ?? [],
    reuniones: reuniones ?? [],
    generaciones: generaciones ?? [],
    documentos: documentos ?? [],
    personas: personas ?? [],
    memoria: memoria ?? [],
    eventos: eventos ?? [],
  };
}

/**
 * El contexto operativo que se agrega al prompt de un agente: el briefing de la copropiedad en foco y la lista de todas.
 * Devuelve también cuál quedó en foco (para guardarla en el chat).
 */
export async function contextoOperativo(userId: string, visibles: Visibles, propertyIdPedida?: string | null, ahora: Date = new Date()): Promise<{ texto: string; propertyId: string | null; propiedades: { id: string; name: string }[] }> {
  const { db } = await import("@/lib/db");
  const propiedades = await db.property.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take: 30, select: { id: true, name: true, city: true, units: true } });
  if (propiedades.length === 0) return { texto: "La cuenta todavía no tiene copropiedades registradas.", propertyId: null, propiedades: [] };
  const enFoco = elegirPropiedadEnFoco(propiedades, propertyIdPedida);

  const resumenes: ResumenDePropiedad[] = propiedades.map((p) => ({ id: p.id, nombre: p.name, ciudad: p.city, unidades: p.units }));
  if (visibles.pqrs) {
    const abiertas = await seguro("pqrs-resumen", () => db.pqrs.groupBy({ by: ["propertyId"], where: { userId, status: { in: ["radicado", "en_proceso"] } }, _count: { _all: true } }));
    for (const g of abiertas ?? []) {
      const r = resumenes.find((x) => x.id === g.propertyId);
      if (r) r.pqrsAbiertas = g._count._all;
    }
  }
  if (visibles.asambleas) {
    const proximas = await seguro("asambleas-resumen", () => db.assembly.findMany({ where: { userId, status: "convocada", date: { gte: ahora } }, orderBy: { date: "asc" }, select: { propertyId: true, date: true } }));
    for (const a of proximas ?? []) {
      const r = resumenes.find((x) => x.id === a.propertyId);
      if (r && !r.proximaAsamblea) r.proximaAsamblea = a.date.toISOString();
    }
  }

  const partes: string[] = [];
  if (enFoco) {
    const datos = await cargarDatosDePropiedad(userId, enFoco, visibles, ahora);
    if (datos) partes.push(construirBriefing(datos, ahora));
  } else {
    partes.push("No hay una copropiedad en foco: pregúntale a la persona de cuál habla, o consulta la que corresponda por su id.");
  }
  partes.push(construirResumenDeLasDemas(resumenes));
  return { texto: partes.join("\n\n"), propertyId: enFoco, propiedades: propiedades.map((p) => ({ id: p.id, name: p.name })) };
}

export { agingBucket };
