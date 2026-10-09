/**
 * Lo que los agentes pueden CONSULTAR a pedido (más allá del briefing que ya traen): el detalle de cada módulo de una copropiedad.
 * Todo filtra por el dueño de la cuenta; un módulo en lanzamiento gradual que la cuenta no puede usar responde «no disponible».
 * Cada respuesta es texto compacto con tope (los resultados de herramienta entran al contexto del modelo).
 */
import { fmtCOP, computeUnitSummary } from "@/lib/cartera";
import { computeBudgetExecution, sanitizeBudgetItems } from "@/lib/presupuesto";
import type { ComingSoonKey } from "@/lib/feature-flags";
import { construirBriefing, fechaCorta } from "./briefing";
import { cargarCartera, cargarDatosDePropiedad, cargarVencimientos, type Visibles } from "./briefing-datos";

export const SECCIONES = ["briefing", "morosos", "unidad", "presupuesto", "pqrs", "calendario", "reuniones", "reglamento", "actividad", "memoria", "comunicados", "asambleas", "certificados", "bitacora"] as const;
export type Seccion = (typeof SECCIONES)[number];

const MODULO_DE_SECCION: Partial<Record<Seccion, ComingSoonKey>> = {
  morosos: "cartera", unidad: "cartera", presupuesto: "presupuesto", pqrs: "pqrs", comunicados: "comunicados", asambleas: "asambleas", certificados: "certificados",
};

export const TOPE_DE_RESULTADO = 7_000;

export type EntradaDeConsulta = { seccion?: unknown; propertyId?: unknown; unidad?: unknown; anio?: unknown; estado?: unknown; dias?: unknown; consulta?: unknown; reunionId?: unknown };

const recortar = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1)}…`);
const limitar = (t: string) => (t.length <= TOPE_DE_RESULTADO ? t : `${t.slice(0, TOPE_DE_RESULTADO)}\n[…resultado recortado; pide una parte más específica]`);
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los párrafos del texto que más se parecen a la consulta (por palabras en común), hasta `max` caracteres. Pura. */
export function fragmentosRelevantes(texto: string, consulta: string, max = 5_500): string {
  const parrafos = texto.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter((p) => p.length > 20);
  const palabras = [...new Set(normalizar(consulta).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3))];
  if (!palabras.length) return recortar(texto, max);
  const puntuados = parrafos
    .map((p, i) => ({ p, i, n: palabras.reduce((s, w) => s + (normalizar(p).includes(w) ? 1 : 0), 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i);
  const elegidos: { p: string; i: number }[] = [];
  let usado = 0;
  for (const x of puntuados) {
    const t = recortar(x.p, 1_400);
    if (usado + t.length > max) break;
    elegidos.push({ p: t, i: x.i });
    usado += t.length;
  }
  return elegidos.sort((a, b) => a.i - b.i).map((x) => x.p).join("\n\n");
}

export async function consultarOperacion(userId: string, visibles: Visibles, enFoco: string | null, entrada: EntradaDeConsulta, ahora: Date = new Date()): Promise<string> {
  const seccion = SECCIONES.find((s) => s === entrada.seccion);
  if (!seccion) return `La sección debe ser una de: ${SECCIONES.join(", ")}.`;
  const modulo = MODULO_DE_SECCION[seccion];
  if (modulo && !visibles[modulo]) return "Ese módulo no está disponible para esta cuenta todavía.";
  const propertyId = typeof entrada.propertyId === "string" && entrada.propertyId ? entrada.propertyId : enFoco;
  if (!propertyId) return "Indica la copropiedad (propertyId): hay varias y ninguna está en foco.";

  const { db } = await import("@/lib/db");
  const propiedad = await db.property.findFirst({ where: { id: propertyId, userId }, select: { id: true, name: true, features: true } });
  if (!propiedad) return "Esa copropiedad no existe en esta cuenta.";
  const encabezado = `# ${propiedad.name} — ${seccion}`;

  switch (seccion) {
    case "briefing": {
      const d = await cargarDatosDePropiedad(userId, propiedad.id, visibles, ahora);
      return limitar(d ? construirBriefing(d, ahora) : "Sin datos.");
    }
    case "morosos": {
      const c = await cargarCartera(userId, propiedad.id, ahora, 25);
      if (!c.unidades) return `${encabezado}\nSin unidades registradas.`;
      return limitar([encabezado, `Vencido sin pagar: ${fmtCOP(c.enMora)} en ${c.unidadesEnMora} unidades (deuda total ${fmtCOP(c.deudaTotal)}).`, ...c.morosos.map((m) => `- ${m.unidad}: ${fmtCOP(m.enMora)} · ${m.dias} días`)].join("\n"));
    }
    case "unidad": {
      const etiqueta = typeof entrada.unidad === "string" ? entrada.unidad.trim() : "";
      if (!etiqueta) return "Indica la unidad (por ejemplo «Apto 502»).";
      const unidades = await db.unit.findMany({
        where: { propertyId: propiedad.id, userId },
        select: { id: true, label: true, coeficiente: true, monthlyFee: true, charges: { orderBy: { dueDate: "desc" }, take: 14, select: { concept: true, amount: true, paidAmount: true, dueDate: true } }, payments: { orderBy: { receivedAt: "desc" }, take: 10, select: { amount: true, method: true, receivedAt: true } } },
      });
      const exactas = unidades.filter((x) => normalizar(x.label) === normalizar(etiqueta));
      if (exactas.length > 1) return `Hay varias unidades llamadas «${etiqueta}»: no puedo distinguirlas. Revisa el directorio.`;
      const u = exactas[0];
      if (!u) return `No encuentro la unidad «${etiqueta}» en esta copropiedad. Escríbela tal como aparece en el directorio.`;
      // Por el id de la unidad (no por etiqueta): dos unidades con el mismo nombre no mezclan sus saldos.
      const todas = await db.charge.findMany({ where: { unitId: u.id, userId }, select: { amount: true, paidAmount: true, dueDate: true } });
      const pagos = await db.unitPayment.aggregate({ where: { unitId: u.id, userId }, _sum: { amount: true } });
      const r = computeUnitSummary(todas, pagos._sum.amount ?? 0, ahora);
      return limitar([
        `${encabezado}: ${u.label}${u.coeficiente ? ` · coeficiente ${u.coeficiente}` : ""}${u.monthlyFee ? ` · cuota ${fmtCOP(u.monthlyFee)}` : ""}`,
        `Cobrado ${fmtCOP(r.charged)} · pagado ${fmtCOP(r.paid)} · saldo ${fmtCOP(r.balance)}${r.balance < 0 ? " (a favor)" : ""} · vencido ${fmtCOP(r.overdueAmount)}${r.overdueDays ? ` (${r.overdueDays} días)` : ""}`,
        "Últimos cobros:", ...u.charges.map((c) => `- ${fechaCorta(c.dueDate.toISOString())} · ${recortar(c.concept, 50)} · ${fmtCOP(c.amount)} · pagado ${fmtCOP(c.paidAmount)}`),
        "Últimos pagos:", ...u.payments.map((p) => `- ${fechaCorta(p.receivedAt.toISOString())} · ${fmtCOP(p.amount)} · ${p.method}`),
      ].join("\n"));
    }
    case "presupuesto": {
      const anio = Number.isInteger(Number(entrada.anio)) && Number(entrada.anio) > 2000 ? Number(entrada.anio) : ahora.getFullYear();
      const b = await db.budget.findFirst({ where: { propertyId: propiedad.id, userId, year: anio } });
      if (!b) return `${encabezado}\nNo hay presupuesto del ${anio}.`;
      const movs = await db.ledgerEntry.findMany({ where: { propertyId: propiedad.id, userId, date: { gte: new Date(anio, 0, 1), lt: new Date(anio + 1, 0, 1) } }, select: { itemId: true, type: true, amount: true } });
      const e = computeBudgetExecution(sanitizeBudgetItems(b.items), movs);
      const fila = (r: { concept: string; budgeted: number; executed: number; pct: number }) => `- ${recortar(r.concept, 45)}: ${fmtCOP(r.executed)} de ${fmtCOP(r.budgeted)} (${Math.round(r.pct)} %)`;
      return limitar([`${encabezado} ${anio}`, `Fondo de imprevistos: saldo ${fmtCOP(e.fondo.balance)} / requerido ${fmtCOP(e.fondo.required)}`, `Resultado (ingresos − gastos ejecutados): ${fmtCOP(e.resultado)}`, "Ingresos:", ...e.ingresos.rows.slice(0, 20).map(fila), "Gastos:", ...e.gastos.rows.slice(0, 30).map(fila)].join("\n"));
    }
    case "pqrs": {
      const soloAbiertas = entrada.estado !== "todas";
      const filas = await db.pqrs.findMany({
        where: { propertyId: propiedad.id, userId, ...(soloAbiertas ? { status: { in: ["radicado", "en_proceso"] } } : {}) },
        orderBy: { createdAt: "desc" }, take: 15,
        select: { code: true, type: true, subject: true, status: true, unitLabel: true, createdAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, fromAdmin: true } } },
      });
      if (!filas.length) return `${encabezado}\nNo hay PQRS ${soloAbiertas ? "abiertas" : ""}.`;
      return limitar([encabezado, ...filas.map((q) => `- ${q.code} · ${q.type} · ${q.status} · ${fechaCorta(q.createdAt.toISOString())}${q.unitLabel ? ` · ${q.unitLabel}` : ""} · «${recortar(q.subject, 70)}»${q.messages[0] ? ` · último mensaje (${q.messages[0].fromAdmin ? "administración" : "residente"}): ${recortar(q.messages[0].content, 160)}` : ""}`)].join("\n"));
    }
    case "calendario": {
      const dias = Math.min(180, Math.max(7, Number(entrada.dias) || 90));
      const v = await cargarVencimientos(userId, propiedad.id, propiedad.features, visibles, ahora, dias, 40);
      return limitar([`${encabezado} (próximos ${dias} días)`, ...(v.length ? v.map((x) => `- ${fechaCorta(x.fecha)} · ${recortar(x.titulo, 90)} · ${x.categoria} · ${x.dias < 0 ? `vencido hace ${-x.dias} d` : `en ${x.dias} d`}`) : ["Nada por vencer."])].join("\n"));
    }
    case "reuniones": {
      if (typeof entrada.reunionId === "string" && entrada.reunionId) {
        const m = await db.meeting.findFirst({ where: { id: entrada.reunionId, propertyId: propiedad.id, userId }, select: { title: true, date: true, status: true, digest: true } });
        if (!m) return "No encuentro esa reunión.";
        const f = (m.digest ?? null) as { resumen?: string; decisiones?: { id: string; texto: string }[]; compromisos?: { id: string; texto: string; responsable?: string; fecha?: string }[]; votaciones?: { asunto: string; resultado: string }[]; pendientes?: string[] } | null;
        if (!f) return `${m.title}: la reunión está «${m.status}» y todavía no tiene resumen.`;
        return limitar([`# ${m.title} (${fechaCorta(m.date.toISOString())})`, f.resumen ?? "", "Decisiones:", ...(f.decisiones ?? []).map((d) => `- ${d.id}: ${d.texto}`), "Compromisos:", ...(f.compromisos ?? []).map((c) => `- ${c.id}: ${c.texto}${c.responsable ? ` · ${c.responsable}` : ""}${c.fecha ? ` · ${c.fecha}` : ""}`), "Votaciones:", ...(f.votaciones ?? []).map((v) => `- ${v.asunto}: ${v.resultado}`), "Pendientes:", ...(f.pendientes ?? []).map((p) => `- ${p}`)].join("\n"));
      }
      const filas = await db.meeting.findMany({ where: { propertyId: propiedad.id, userId }, orderBy: { date: "desc" }, take: 8, select: { id: true, title: true, date: true, status: true } });
      return limitar([encabezado, ...(filas.length ? filas.map((m) => `- ${m.id} · ${fechaCorta(m.date.toISOString())} · ${recortar(m.title, 80)} · ${m.status}`) : ["Sin reuniones."]), "Para el detalle de una, pide la sección «reuniones» con su reunionId."].join("\n"));
    }
    case "reglamento": {
      const consulta = typeof entrada.consulta === "string" ? entrada.consulta : "";
      const { getReglamentoText } = await import("@/lib/reglamento");
      const texto = await getReglamentoText(propiedad.id);
      if (!texto || texto.length < 40) return `${encabezado}\nEsta copropiedad no tiene reglamento ni manual cargado.`;
      return limitar(`${encabezado}${consulta ? ` — «${recortar(consulta, 80)}»` : ""}\n${fragmentosRelevantes(texto, consulta)}`);
    }
    case "actividad": {
      const dias = Math.min(60, Math.max(1, Number(entrada.dias) || 14));
      const filas = await db.propertyEvent.findMany({ where: { propertyId: propiedad.id, userId, createdAt: { gte: new Date(ahora.getTime() - dias * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 40, select: { module: true, summary: true, actor: true, createdAt: true } });
      return limitar([`${encabezado} (últimos ${dias} días)`, ...(filas.length ? filas.map((e) => `- ${fechaCorta(e.createdAt.toISOString())} · ${e.module} · ${e.summary}${e.actor !== "usuario" ? ` (${e.actor})` : ""}`) : ["Sin actividad registrada."])].join("\n"));
    }
    case "memoria": {
      const filas = await db.propertyMemory.findMany({ where: { propertyId: propiedad.id, userId }, orderBy: { createdAt: "desc" }, take: 60, select: { kind: true, content: true, createdAt: true, authorAgent: true } });
      return limitar([encabezado, ...(filas.length ? filas.map((m) => `- [${m.kind}] ${m.content} — ${fechaCorta(m.createdAt.toISOString())}${m.authorAgent ? ` · ${m.authorAgent}` : ""}`) : ["Sin notas guardadas."])].join("\n"));
    }
    case "comunicados": {
      const filas = await db.announcement.findMany({ where: { propertyId: propiedad.id, userId }, orderBy: { createdAt: "desc" }, take: 8, select: { subject: true, content: true, recipientCount: true, createdAt: true } });
      return limitar([encabezado, ...(filas.length ? filas.map((c) => `- ${fechaCorta(c.createdAt.toISOString())} · ${recortar(c.subject, 80)} · ${c.recipientCount} destinatarios · ${recortar(c.content.replace(/\s+/g, " "), 200)}`) : ["Sin comunicados."])].join("\n"));
    }
    case "asambleas": {
      const filas = await db.assembly.findMany({ where: { propertyId: propiedad.id, userId }, orderBy: { date: "desc" }, take: 8, select: { type: true, date: true, status: true, modality: true, location: true, agenda: true, convokedAt: true, actaReadyAt: true } });
      return limitar([encabezado, ...(filas.length ? filas.map((a) => `- ${a.type} · ${fechaCorta(a.date.toISOString())} · ${a.modality} · ${a.status}${a.convokedAt ? ` · convocada ${fechaCorta(a.convokedAt.toISOString())}` : " · sin convocar"}${a.actaReadyAt ? ` · acta ${fechaCorta(a.actaReadyAt.toISOString())}` : ""}${Array.isArray(a.agenda) && a.agenda.length ? ` · orden del día: ${(a.agenda as string[]).slice(0, 8).join("; ")}` : ""}`) : ["Sin asambleas."])].join("\n"));
    }
    case "certificados": {
      const filas = await db.certificate.findMany({ where: { propertyId: propiedad.id, userId }, orderBy: { createdAt: "desc" }, take: 12, select: { type: true, unitLabel: true, status: true, meta: true, createdAt: true } });
      return limitar([encabezado, ...(filas.length ? filas.map((c) => `- ${fechaCorta(c.createdAt.toISOString())} · ${c.type} · ${c.unitLabel} · ${c.status}${(c.meta as { validUntil?: string } | null)?.validUntil ? ` · hasta ${(c.meta as { validUntil?: string }).validUntil}` : ""}`) : ["Sin certificados."])].join("\n"));
    }
    case "bitacora": {
      const filas = await db.commonAsset.findMany({ where: { propertyId: propiedad.id, userId, status: "active" }, orderBy: { dueDate: "asc" }, take: 40, select: { kind: true, name: true, provider: true, reference: true, dueDate: true, recurrenceMonths: true } });
      return limitar([encabezado, ...(filas.length ? filas.map((a) => `- ${fechaCorta(a.dueDate.toISOString())} · ${a.kind === "poliza" ? "Póliza" : "Zona común"} · ${recortar(a.name, 70)}${a.provider ? ` · ${a.provider}` : ""}${a.reference ? ` · ref. ${a.reference}` : ""}${a.recurrenceMonths ? ` · cada ${a.recurrenceMonths} meses` : ""}`) : ["Bitácora vacía."])].join("\n"));
    }
  }
}

/* ── Memoria ─────────────────────────────────────────────────────────── */

export const TIPOS_DE_NOTA = ["nota", "decision", "preferencia"] as const;
export const TOPE_DE_NOTAS_POR_PROPIEDAD = 200;

export type EntradaDeNota = { propertyId?: unknown; tipo?: unknown; contenido?: unknown };

/** Una nota que los agentes comparten sobre una copropiedad. Pura: valida y limpia. */
export function validarNota(e: EntradaDeNota): { ok: true; tipo: (typeof TIPOS_DE_NOTA)[number]; contenido: string } | { ok: false; error: string } {
  const contenido = typeof e.contenido === "string" ? e.contenido.replace(/\s+/g, " ").trim() : "";
  if (contenido.length < 8 || contenido.length > 600) return { ok: false, error: "La nota debe tener entre 8 y 600 caracteres." };
  const tipo = e.tipo === undefined || e.tipo === null ? "nota" : (TIPOS_DE_NOTA as readonly string[]).includes(String(e.tipo)) ? (String(e.tipo) as (typeof TIPOS_DE_NOTA)[number]) : null;
  if (!tipo) return { ok: false, error: `El tipo debe ser uno de: ${TIPOS_DE_NOTA.join(", ")}.` };
  return { ok: true, tipo, contenido };
}

export async function guardarNota(userId: string, agentId: string, enFoco: string | null, e: EntradaDeNota): Promise<string> {
  const v = validarNota(e);
  if (!v.ok) return v.error;
  const propertyId = typeof e.propertyId === "string" && e.propertyId ? e.propertyId : enFoco;
  if (!propertyId) return "Indica la copropiedad (propertyId).";
  const { db } = await import("@/lib/db");
  const propiedad = await db.property.findFirst({ where: { id: propertyId, userId }, select: { id: true } });
  if (!propiedad) return "Esa copropiedad no existe en esta cuenta.";
  const { ensureOperacionSchema } = await import("@/lib/ensure-operacion-schema");
  await ensureOperacionSchema();
  // Contar, comprobar duplicados y guardar van juntos bajo un bloqueo de la copropiedad: dos notas a la vez no pueden
  // pasar ambas el tope (las dos contarían 49 y guardarían la 50.ª).
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Property" WHERE id = ${propertyId} FOR UPDATE`;
    if ((await tx.propertyMemory.count({ where: { propertyId, userId } })) >= TOPE_DE_NOTAS_POR_PROPIEDAD) return "La memoria de esta copropiedad está llena. Pídele a la persona que borre notas viejas.";
    const parecida = await tx.propertyMemory.findFirst({ where: { propertyId, userId, content: v.contenido }, select: { id: true } });
    if (parecida) return "Esa nota ya estaba guardada.";
    // Un agente nunca guarda una «decisión» ni una «preferencia»: esas las confirma la persona. Su nota queda como propuesta.
    await tx.propertyMemory.create({ data: { userId, propertyId, kind: "nota", content: v.contenido, authorAgent: agentId } });
    return "Nota guardada en la memoria de la copropiedad: todos los agentes la verán.";
  });
}
