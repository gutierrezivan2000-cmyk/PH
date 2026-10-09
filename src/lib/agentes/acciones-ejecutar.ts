/**
 * Proponer, aprobar y ejecutar las acciones de los agentes (ver `acciones.ts`). Todo filtra por el dueño de la copropiedad y revalida
 * al ejecutar: lo que se guardó como «pendiente» no se da por bueno, porque pasó tiempo y la persona o los datos pudieron cambiar.
 */
import { applyPaymentFifoTx, fmtCOP } from "@/lib/cartera";
import { hoyEnBogota } from "@/lib/certificados";
import { moduloVisible } from "@/lib/feature-flags";
import { sanitizeBudgetItems } from "@/lib/presupuesto";
import { registrarEvento } from "./eventos";
import { ETIQUETA_DE_ACCION, MODULO_DE_ACCION, validarAccion, type AccionValidada, type TipoDeAccion } from "./acciones";
import type { Visibles } from "./briefing-datos";

export type ContextoDeAccion = { userId: string; agentId: string; chatId?: string | null; visibles: Visibles };

export const TOPE_DE_PENDIENTES = 20;

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const fechaDelDia = (iso: string) => new Date(`${iso}T12:00:00-05:00`);

type Ok = Extract<AccionValidada, { ok: true }>;

/** ¿La cuenta puede usar el módulo que la acción necesita? */
export function moduloPermitido(tipo: TipoDeAccion, visibles: Visibles): boolean {
  const m = MODULO_DE_ACCION[tipo];
  return m === null || Boolean(visibles[m]);
}

async function propiedadDe(userId: string, propertyId: string) {
  const { db } = await import("@/lib/db");
  return db.property.findFirst({ where: { id: propertyId, userId }, select: { id: true, name: true } });
}

/** Comprobaciones previas (para no mostrarle a la persona una tarjeta que no se va a poder cumplir). Devuelve un error o null. */
async function comprobarAntes(userId: string, propertyId: string, a: Ok): Promise<string | null> {
  const { db } = await import("@/lib/db");
  if (a.tipo === "registrar_pago") {
    const r = await resolverUnidad(userId, propertyId, a.datos.unidad);
    return "error" in r ? r.error : null;
  }
  if (a.tipo === "responder_pqrs") {
    const q = await db.pqrs.findFirst({ where: { code: a.datos.codigo, userId, propertyId }, select: { id: true } });
    return q ? null : `No encuentro la PQRS ${a.datos.codigo} en esta copropiedad.`;
  }
  return null;
}

async function resolverUnidad(userId: string, propertyId: string, etiqueta: string): Promise<{ id: string; label: string } | { error: string }> {
  const { db } = await import("@/lib/db");
  const unidades = await db.unit.findMany({ where: { propertyId, userId }, select: { id: true, label: true } });
  const buscada = normalizar(etiqueta);
  const exactas = unidades.filter((u) => normalizar(u.label) === buscada);
  if (exactas.length === 1) return exactas[0];
  if (exactas.length > 1) return { error: `Hay varias unidades llamadas «${etiqueta}»; indica cuál.` };
  const parecidas = unidades.filter((u) => normalizar(u.label).includes(buscada) || buscada.includes(normalizar(u.label)));
  if (parecidas.length === 1) return parecidas[0];
  return { error: parecidas.length > 1 ? `«${etiqueta}» coincide con varias unidades (${parecidas.slice(0, 4).map((u) => u.label).join(", ")}); indica cuál.` : `No encuentro la unidad «${etiqueta}» en esta copropiedad.` };
}

export type RespuestaDePropuesta =
  | { ok: true; id: string; tipo: TipoDeAccion; etiqueta: string; resumen: string; propiedad: string }
  | { ok: false; error: string };

/** Un agente propone una acción: se valida y se guarda como PENDIENTE; no ocurre nada hasta que la persona la apruebe. */
export async function proponerAccion(ctx: ContextoDeAccion, entrada: { tipo?: unknown; propertyId?: unknown; datos?: unknown }): Promise<RespuestaDePropuesta> {
  const a = validarAccion(entrada.tipo, entrada.datos, hoyEnBogota());
  if (!a.ok) return { ok: false, error: a.error };
  if (!moduloPermitido(a.tipo, ctx.visibles)) return { ok: false, error: "Esa acción no está disponible para esta cuenta todavía." };
  if (typeof entrada.propertyId !== "string" || !entrada.propertyId) return { ok: false, error: "Falta la copropiedad (propertyId)." };
  const propiedad = await propiedadDe(ctx.userId, entrada.propertyId);
  if (!propiedad) return { ok: false, error: "Esa copropiedad no existe en esta cuenta." };
  const previo = await comprobarAntes(ctx.userId, propiedad.id, a);
  if (previo) return { ok: false, error: previo };

  const { db } = await import("@/lib/db");
  const { ensureOperacionSchema } = await import("@/lib/ensure-operacion-schema");
  await ensureOperacionSchema();
  const pendientes = await db.agentAction.count({ where: { userId: ctx.userId, status: "pendiente" } });
  if (pendientes >= TOPE_DE_PENDIENTES) return { ok: false, error: "Hay demasiadas acciones sin decidir. Pídele a la persona que apruebe o rechace las pendientes primero." };

  const fila = await db.agentAction.create({
    data: { userId: ctx.userId, propertyId: propiedad.id, chatId: ctx.chatId ?? null, agentId: ctx.agentId, type: a.tipo, summary: a.resumen, payload: a.datos as unknown as object },
    select: { id: true },
  });
  return { ok: true, id: fila.id, tipo: a.tipo, etiqueta: ETIQUETA_DE_ACCION[a.tipo], resumen: a.resumen, propiedad: propiedad.name };
}

/* ── Ejecución ─────────────────────────────────────────────────────── */

async function ejecutar(userId: string, propertyId: string, a: Ok): Promise<{ mensaje: string; refType: string; refId: string; modulo: "cartera" | "presupuesto" | "pqrs" | "bitacora"; resumenEvento: string }> {
  const { db } = await import("@/lib/db");

  if (a.tipo === "registrar_pago") {
    const unidad = await resolverUnidad(userId, propertyId, a.datos.unidad);
    if ("error" in unidad) throw new Error(unidad.error);
    const { pago, sobrante } = await db.$transaction(async (tx) => {
      const { allocations, leftover } = await applyPaymentFifoTx(tx as unknown as Parameters<typeof applyPaymentFifoTx>[0], unidad.id, a.datos.monto);
      const creado = await tx.unitPayment.create({
        data: { userId, propertyId, unitId: unidad.id, amount: a.datos.monto, method: a.datos.metodo, reference: a.datos.referencia, allocations: allocations as unknown as object, receivedAt: fechaDelDia(a.datos.fecha) },
      });
      return { pago: creado, sobrante: leftover };
    });
    const m = `Pago de ${fmtCOP(a.datos.monto)} registrado en ${unidad.label}${sobrante > 0 ? ` (${fmtCOP(sobrante)} quedaron como saldo a favor)` : ""}.`;
    return { mensaje: m, refType: "UnitPayment", refId: pago.id, modulo: "cartera", resumenEvento: `Pago de ${fmtCOP(a.datos.monto)} registrado en ${unidad.label} (${a.datos.metodo})` };
  }

  if (a.tipo === "registrar_movimiento_presupuesto") {
    const anio = Number(a.datos.fecha.slice(0, 4));
    let itemId: string | null = null;
    if (a.datos.rubro && (a.datos.tipo === "ingreso" || a.datos.tipo === "gasto")) {
      const presupuesto = await db.budget.findFirst({ where: { propertyId, userId, year: anio }, select: { items: true } });
      const buscado = normalizar(a.datos.rubro);
      const candidatos = sanitizeBudgetItems(presupuesto?.items ?? []).filter((i) => i.group === a.datos.tipo);
      const rubro = candidatos.find((i) => normalizar(i.concept) === buscado) ?? candidatos.find((i) => normalizar(i.concept).includes(buscado));
      itemId = rubro?.id ?? null;
    }
    const mov = await db.ledgerEntry.create({ data: { userId, propertyId, date: fechaDelDia(a.datos.fecha), concept: a.datos.concepto, itemId, type: a.datos.tipo, amount: a.datos.monto } });
    return {
      mensaje: `Movimiento registrado: ${a.datos.tipo.replace("_", " ")} de ${fmtCOP(a.datos.monto)} por «${a.datos.concepto}»${a.datos.rubro ? (itemId ? ` en el rubro ${a.datos.rubro}` : ` (no encontré el rubro «${a.datos.rubro}», quedó sin clasificar)`) : ""}.`,
      refType: "LedgerEntry", refId: mov.id, modulo: "presupuesto",
      resumenEvento: `Movimiento de ${fmtCOP(a.datos.monto)} registrado (${a.datos.tipo.replace("_", " ")}): ${a.datos.concepto}`,
    };
  }

  if (a.tipo === "responder_pqrs") {
    const q = await db.pqrs.findFirst({ where: { code: a.datos.codigo, userId, propertyId }, select: { id: true, status: true } });
    if (!q) throw new Error(`No encuentro la PQRS ${a.datos.codigo}.`);
    const nuevoEstado = a.datos.estado ?? (q.status === "radicado" ? "en_proceso" : q.status);
    await db.$transaction([
      db.pqrsMessage.create({ data: { pqrsId: q.id, fromAdmin: true, content: a.datos.respuesta } }),
      db.pqrs.update({ where: { id: q.id }, data: { status: nuevoEstado } }),
    ]);
    return { mensaje: `Respuesta guardada en la ${a.datos.codigo} (estado: ${nuevoEstado}). Nota: no se envió por correo; avisa al residente si hace falta.`, refType: "Pqrs", refId: q.id, modulo: "pqrs", resumenEvento: `${a.datos.codigo} respondida (estado ${nuevoEstado})` };
  }

  const activo = await db.commonAsset.create({
    data: { userId, propertyId, kind: a.datos.tipo, name: a.datos.nombre, provider: a.datos.proveedor, reference: a.datos.referencia, dueDate: fechaDelDia(a.datos.fecha), recurrenceMonths: a.datos.recurrenciaMeses, status: "active" },
  });
  return { mensaje: `Agregado a la bitácora: «${a.datos.nombre}» con fecha ${a.datos.fecha}.`, refType: "CommonAsset", refId: activo.id, modulo: "bitacora", resumenEvento: `${a.datos.tipo === "poliza" ? "Póliza" : "Zona común"} «${a.datos.nombre}» agregada a la bitácora (${a.datos.fecha})` };
}

export type ResultadoDeDecision = { ok: boolean; estado: "aprobada" | "rechazada" | "fallida" | "ya_decidida" | "no_encontrada"; mensaje: string };

/** La persona aprueba o rechaza una acción pendiente. Aprobar la ejecuta (una sola vez, aunque se pulse dos veces). */
export async function decidirAccion(userId: string, id: string, decision: "aprobar" | "rechazar", visibles: Visibles): Promise<ResultadoDeDecision> {
  const { db } = await import("@/lib/db");
  const { ensureOperacionSchema } = await import("@/lib/ensure-operacion-schema");
  await ensureOperacionSchema();
  const accion = await db.agentAction.findFirst({ where: { id, userId }, select: { id: true, status: true, type: true, payload: true, propertyId: true, agentId: true } });
  if (!accion) return { ok: false, estado: "no_encontrada", mensaje: "No encuentro esa acción." };
  if (accion.status !== "pendiente") return { ok: false, estado: "ya_decidida", mensaje: `Esa acción ya estaba ${accion.status}.` };

  // Se «reclama» antes de actuar: dos clics a la vez no la ejecutan dos veces.
  const nuevo = decision === "aprobar" ? "aprobada" : "rechazada";
  const reclamo = await db.agentAction.updateMany({ where: { id, userId, status: "pendiente" }, data: { status: nuevo, decidedAt: new Date() } });
  if (reclamo.count !== 1) return { ok: false, estado: "ya_decidida", mensaje: "Esa acción ya fue decidida." };
  if (decision === "rechazar") return { ok: true, estado: "rechazada", mensaje: "Acción rechazada. No se hizo nada." };

  const falla = async (mensaje: string): Promise<ResultadoDeDecision> => {
    await db.agentAction.update({ where: { id }, data: { status: "fallida", result: { error: mensaje } } });
    return { ok: false, estado: "fallida", mensaje };
  };
  try {
    const a = validarAccion(accion.type, accion.payload, hoyEnBogota());
    if (!a.ok) return await falla(a.error);
    if (!moduloPermitido(a.tipo, visibles)) return await falla("Esa acción no está disponible para esta cuenta.");
    if (!accion.propertyId) return await falla("La acción no tiene copropiedad.");
    if (!(await propiedadDe(userId, accion.propertyId))) return await falla("La copropiedad ya no existe.");
    const r = await ejecutar(userId, accion.propertyId, a);
    await db.agentAction.update({ where: { id }, data: { result: { mensaje: r.mensaje, refType: r.refType, refId: r.refId } } });
    await registrarEvento({ userId, propertyId: accion.propertyId, modulo: r.modulo, accion: `${a.tipo}_aprobada`, resumen: r.resumenEvento, refType: r.refType, refId: r.refId, actor: `agente:${accion.agentId}` });
    return { ok: true, estado: "aprobada", mensaje: r.mensaje };
  } catch (e) {
    console.error("[agentes/acciones] falló la ejecución:", e instanceof Error ? e.message : e);
    return await falla(e instanceof Error && e.message.length < 200 ? e.message : "No se pudo completar la acción.");
  }
}

export { moduloVisible };
