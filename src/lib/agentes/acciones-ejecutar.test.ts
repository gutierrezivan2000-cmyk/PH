import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, estado } = vi.hoisted(() => {
  const estado = { demora: 0, acciones: [] as Array<Record<string, unknown>>, pagos: [] as Array<Record<string, unknown>>, cobros: [{ id: "c1", amount: 300_000, paidAmount: 0 }] as Array<{ id: string; amount: number; paidAmount: number }> };
  const tx = {
    $queryRaw: async () => [],
    charge: {
      findMany: async () => estado.cobros.map((c) => ({ ...c })),
      update: async ({ where, data }: { where: { id: string }; data: { paidAmount: { increment: number } } }) => {
        const c = estado.cobros.find((x) => x.id === where.id)!;
        c.paidAmount += data.paidAmount.increment;
      },
    },
    unitPayment: { create: async ({ data }: { data: Record<string, unknown> }) => { const p = { id: `p${estado.pagos.length + 1}`, ...data }; estado.pagos.push(p); return p; } },
  };
  const db = {
    agentAction: {
      count: async ({ where }: { where: { status: string } }) => estado.acciones.filter((a) => a.status === where.status).length,
      create: async ({ data }: { data: Record<string, unknown> }) => { const a = { id: `a${estado.acciones.length + 1}`, status: "pendiente", ...data }; estado.acciones.push(a); return a; },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        // La lectura ocurre ahora y la respuesta llega después (como la red): lo leído es una COPIA que no cambia sola.
        const fila = estado.acciones.find((a) => a.id === where.id && a.userId === where.userId);
        const copia = fila ? { ...fila } : null;
        if (estado.demora) await new Promise((r) => setTimeout(r, estado.demora));
        return copia;
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        const a = estado.acciones.find((x) => x.id === where.id && x.status === where.status);
        if (a) Object.assign(a, data);
        return { count: a ? 1 : 0 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(estado.acciones.find((x) => x.id === where.id)!, data),
    },
    property: { findFirst: async ({ where }: { where: { id: string; userId: string } }) => (where.id === "p1" && where.userId === "u1" ? { id: "p1", name: "Los Pinos" } : null) },
    unit: { findMany: async () => [{ id: "un1", label: "Apto 101" }, { id: "un2", label: "Apto 102" }] },
    pqrs: { findFirst: async () => null },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { db, estado };
});
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-operacion-schema", () => ({ ensureOperacionSchema: async () => {} }));
vi.mock("./eventos", () => ({ registrarEvento: async () => {} }));

import { decidirAccion, proponerAccion } from "./acciones-ejecutar";
import type { Visibles } from "./briefing-datos";

const abiertos: Visibles = { cartera: true, presupuesto: true, certificados: true, asambleas: true, comunicados: true, pqrs: true };
const cerrados: Visibles = { cartera: false, presupuesto: false, certificados: false, asambleas: false, comunicados: false, pqrs: false };
const ctx = (visibles: Visibles) => ({ userId: "u1", agentId: "metra", chatId: "ch1", visibles });
const pago = { tipo: "registrar_pago", propertyId: "p1", datos: { unidad: "Apto 101", monto: "300.000", metodo: "transferencia" } };

beforeEach(() => {
  estado.demora = 0;
  estado.acciones.length = 0;
  estado.pagos.length = 0;
  estado.cobros.splice(0, estado.cobros.length, { id: "c1", amount: 300_000, paidAmount: 0 });
});

describe("proponer", () => {
  it("guarda la acción como pendiente y NO hace nada todavía", async () => {
    const r = await proponerAccion(ctx(abiertos), pago);
    expect(r).toMatchObject({ ok: true, etiqueta: "Registrar un pago", propiedad: "Los Pinos" });
    expect(estado.acciones[0]).toMatchObject({ status: "pendiente", type: "registrar_pago", userId: "u1" });
    expect(estado.pagos).toHaveLength(0);
    expect(estado.cobros[0].paidAmount).toBe(0);
  });
  it("rechaza datos inválidos, copropiedades ajenas, unidades inexistentes y módulos cerrados", async () => {
    expect((await proponerAccion(ctx(abiertos), { ...pago, datos: { unidad: "Apto 101", monto: -5 } })).ok).toBe(false);
    expect(await proponerAccion(ctx(abiertos), { ...pago, propertyId: "ajena" })).toMatchObject({ ok: false, error: expect.stringContaining("no existe") });
    expect(await proponerAccion(ctx(abiertos), { ...pago, datos: { ...pago.datos, unidad: "Apto 999" } })).toMatchObject({ ok: false, error: expect.stringContaining("No encuentro la unidad") });
    expect(await proponerAccion(ctx(cerrados), pago)).toMatchObject({ ok: false, error: expect.stringContaining("no está disponible") });
    expect(estado.acciones).toHaveLength(0);
  });
  it("hay un tope de acciones sin decidir", async () => {
    for (let i = 0; i < 20; i++) estado.acciones.push({ id: `x${i}`, userId: "u1", status: "pendiente" });
    expect(await proponerAccion(ctx(abiertos), pago)).toMatchObject({ ok: false, error: expect.stringContaining("demasiadas") });
  });
});

describe("decidir", () => {
  it("aprobar ejecuta el pago (se aplica al cobro más viejo) y dos clics no lo ejecutan dos veces", async () => {
    const p = await proponerAccion(ctx(abiertos), pago);
    if (!p.ok) throw new Error("no se propuso");
    const r1 = await decidirAccion("u1", p.id, "aprobar", abiertos);
    expect(r1).toMatchObject({ ok: true, estado: "aprobada" });
    expect(estado.pagos).toHaveLength(1);
    expect(estado.cobros[0].paidAmount).toBe(300_000);
    const r2 = await decidirAccion("u1", p.id, "aprobar", abiertos);
    expect(r2).toMatchObject({ ok: false, estado: "ya_decidida" });
    expect(estado.pagos).toHaveLength(1);
  });
  it("dos aprobaciones SIMULTÁNEAS (doble clic) ejecutan el pago una sola vez", async () => {
    const p = await proponerAccion(ctx(abiertos), pago);
    if (!p.ok) throw new Error("no se propuso");
    // Las dos llamadas se traslapan (ambas leen «pendiente» antes de que cualquiera la reclame), pero no arrancan a la vez:
    // vitest se salta el simulacro cuando dos import() dinámicos de un módulo simulado ocurren en el mismo instante.
    estado.demora = 30;
    const primera = decidirAccion("u1", p.id, "aprobar", abiertos);
    await new Promise((r) => setTimeout(r, 10));
    const segunda = decidirAccion("u1", p.id, "aprobar", abiertos);
    const [a, b] = await Promise.all([primera, segunda]);
    estado.demora = 0;
    expect([a.estado, b.estado].sort()).toEqual(["aprobada", "ya_decidida"]);
    expect(estado.pagos).toHaveLength(1);
    expect(estado.cobros[0].paidAmount).toBe(300_000);
  });
  it("rechazar no hace nada", async () => {
    const p = await proponerAccion(ctx(abiertos), pago);
    if (!p.ok) throw new Error("no se propuso");
    expect(await decidirAccion("u1", p.id, "rechazar", abiertos)).toMatchObject({ ok: true, estado: "rechazada" });
    expect(estado.pagos).toHaveLength(0);
  });
  it("no se puede decidir la acción de otra cuenta", async () => {
    const p = await proponerAccion(ctx(abiertos), pago);
    if (!p.ok) throw new Error("no se propuso");
    expect(await decidirAccion("otro-usuario", p.id, "aprobar", abiertos)).toMatchObject({ ok: false, estado: "no_encontrada" });
    expect(estado.pagos).toHaveLength(0);
  });
  it("si el módulo se cerró entre la propuesta y la aprobación, falla sin ejecutar", async () => {
    const p = await proponerAccion(ctx(abiertos), pago);
    if (!p.ok) throw new Error("no se propuso");
    const r = await decidirAccion("u1", p.id, "aprobar", cerrados);
    expect(r).toMatchObject({ ok: false, estado: "fallida" });
    expect(estado.pagos).toHaveLength(0);
    expect(estado.acciones[0].status).toBe("fallida");
  });
  it("si lo guardado ya no es válido (datos alterados), falla sin ejecutar", async () => {
    const p = await proponerAccion(ctx(abiertos), pago);
    if (!p.ok) throw new Error("no se propuso");
    (estado.acciones[0].payload as { monto: number }).monto = -1;
    expect(await decidirAccion("u1", p.id, "aprobar", abiertos)).toMatchObject({ ok: false, estado: "fallida" });
    expect(estado.pagos).toHaveLength(0);
  });
});

describe("coincidencia de unidad (no por parecido)", () => {
  it("«Apto 10» NO se asigna a «Apto 101» ni «Apto 1» aunque el texto contenga esas letras", async () => {
    const r = await proponerAccion(ctx(abiertos), { ...pago, datos: { unidad: "Apto 10", monto: 100_000, metodo: "efectivo" } });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("No encuentro la unidad") });
    expect(estado.acciones).toHaveLength(0);
  });
  it("la etiqueta se compara sin importar mayúsculas y la tarjeta guarda la unidad EXACTA del directorio", async () => {
    const r = await proponerAccion(ctx(abiertos), { ...pago, datos: { unidad: "  apto 101 ", monto: 100_000, metodo: "efectivo" } });
    expect(r).toMatchObject({ ok: true });
    expect(estado.acciones[0].payload).toMatchObject({ unidad: "Apto 101" });
    expect(String(estado.acciones[0].summary)).toContain("Apto 101");
  });
});

describe("un fallo al anotar el resultado después de aplicar el pago", () => {
  it("la acción queda APROBADA (el pago sí se aplicó) y no se marca como fallida", async () => {
    const p = await proponerAccion(ctx(abiertos), pago);
    if (!p.ok) throw new Error("no se propuso");
    const original = db.agentAction.update;
    db.agentAction.update = async () => { throw new Error("conexión perdida al anotar"); };
    try {
      const r = await decidirAccion("u1", p.id, "aprobar", abiertos);
      expect(r).toMatchObject({ ok: true, estado: "aprobada" });
      expect(estado.pagos).toHaveLength(1);
      expect(estado.acciones[0].status).toBe("aprobada");
    } finally {
      db.agentAction.update = original;
    }
  });
});
