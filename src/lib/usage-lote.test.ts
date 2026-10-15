/**
 * Cupo de generaciones sueltas (diario y mensual) frente a las filas que siguen en cola o en proceso.
 *
 * Una fila de un lote Élite se crea en bloque y el cron la va tomando de a pocas por minuto (un lote de 50 tarda ~25 min en
 * drenar). Antes, `activeGenerationWhere` solo contaba lo "en vuelo" si se había CREADO hace menos de 15 min, así que las que
 * esperaban su turno (o que el cron reclamó tarde) dejaban de gastar cupo siendo trabajo legítimo, y quien tenía un lote en
 * marcha podía encadenar generaciones sueltas por encima del tope. Peor: `failStuckGenerations` (que corre justo antes de contar)
 * daba por muerta, por haberse creado hace más de 15 min, una fila de lote que el cron acababa de reclamar.
 *
 * La base se simula en memoria (filas reales con su estado y fechas) para probar el efecto sobre el conteo y no solo las llamadas.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  // Fase de pruebas abierta (OPEN_TESTING por omisión): todos tienen los topes de Pro, sin tocar suscripciones.
  delete process.env.OPEN_TESTING;
  delete process.env.DEMO_MODE;
  return { fake: { db: null as unknown } };
});
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { crearDbFalsa, type DbFalsa } from "@/lib/meetings/db-falsa";
import { PLANS } from "@/lib/epayco";
import { STUCK_REUNION_MS, LOTE_PENDIENTE_MAX_MS, checkUsageLimits } from "./usage";

const MIN = 60_000;
const HORA = 60 * MIN;
// Mediodía en Bogotá (17:00 UTC) del 12 de octubre de 2026: lejos de la medianoche de Bogotá, así que "hace 3 h" sigue siendo hoy.
const AHORA = new Date("2026-10-12T17:00:00Z");
const DIA = PLANS.pro.limits.generationsPerDay;
const MES = PLANS.pro.limits.generationsPerMonth;

let db: DbFalsa;
let n = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  db = crearDbFalsa();
  fake.db = db;
  n = 0;
});
afterEach(() => vi.useRealTimers());

/** Una fila con fechas explícitas: creada hace `creadaHace` ms y con su última actividad hace `actividadHace` ms. */
function fila(datos: Record<string, unknown>, creadaHace: number, actividadHace: number = creadaHace) {
  db.generation.filas.push({
    id: `g${++n}`, userId: "u1", propertyId: "p1", type: "custom", status: "pending", progress: 0, batchId: null, meetingId: null,
    errorMessage: null, createdAt: new Date(Date.now() - creadaHace), updatedAt: new Date(Date.now() - actividadHace), ...datos,
  });
}
const estado = (id: string) => db.generation.filas.find((g) => g.id === id)!.status;

/** Rellena el cupo con generaciones terminadas de hoy hasta dejar `faltan` por gastar. */
function llenarElDia(faltan: number) {
  for (let i = 0; i < DIA - faltan; i++) fila({ status: "completed", progress: 100 }, 3 * HORA);
}
/** Rellena el cupo del mes con generaciones terminadas de días anteriores (no tocan el cupo diario). */
function llenarElMes(faltan: number) {
  for (let i = 0; i < MES - faltan; i++) fila({ status: "completed", progress: 100 }, 5 * 24 * HORA);
}

describe("las filas de un lote que esperan su turno siguen gastando cupo", () => {
  it("DIARIO: una fila de lote pendiente desde hace 20 min (pasada la ventana de 15) cuenta, y la siguiente generación suelta se rechaza", async () => {
    llenarElDia(1);
    fila({ batchId: "b1", status: "pending" }, 20 * MIN);
    const r = await checkUsageLimits("u1");
    expect(r.allowed).toBe(false);
    expect(r.dailyUsed).toBe(DIA);
    expect(r.reason).toMatch(/diario/);
  });

  it("MENSUAL: lo mismo con el tope del mes", async () => {
    llenarElMes(1);
    fila({ batchId: "b1", status: "pending" }, 20 * MIN);
    const r = await checkUsageLimits("u1");
    expect(r.allowed).toBe(false);
    expect(r.monthlyUsed).toBe(MES);
    expect(r.reason).toMatch(/mensual/);
  });

  it("un lote de 50 filas que lleva 25 min drenando: las que quedan en cola cuentan todas, con cualquier antigüedad dentro del lote vivo", async () => {
    for (let i = 0; i < 50; i++) fila({ batchId: "b1", status: "pending" }, 25 * MIN);
    const r = await checkUsageLimits("u1");
    expect(r.dailyUsed).toBe(50);
    expect(r.monthlyUsed).toBe(50);
    expect(r.allowed).toBe(false);
  });

  it("sigue contando una pendiente de lote de 23 h; la de 25 h se da por abandonada y deja de contar (y no se toca: el cron aún puede recogerla)", async () => {
    // Dos días atrás no entran al cupo diario, pero sí al mensual.
    fila({ batchId: "b1", status: "pending" }, LOTE_PENDIENTE_MAX_MS - HORA);
    fila({ batchId: "b2", status: "pending" }, LOTE_PENDIENTE_MAX_MS + HORA);
    const r = await checkUsageLimits("u1");
    expect(r.monthlyUsed).toBe(1);
    expect(["g1", "g2"].map(estado)).toEqual(["pending", "pending"]);
  });
});

describe("las filas de un lote que el cron reclamó (processing) se miden por actividad, no por creación", () => {
  it("reclamada 40 min después de crearse y activa hace 2 min: cuenta y NO se da por muerta al comprobar el cupo de otra generación", async () => {
    llenarElDia(1);
    fila({ batchId: "b1", status: "processing", progress: 30 }, 40 * MIN, 2 * MIN);
    const r = await checkUsageLimits("u1");
    expect(estado("g" + n)).toBe("processing");
    expect(r.dailyUsed).toBe(DIA);
    expect(r.allowed).toBe(false);
  });

  it("sin actividad en más de 15 min sí se da por muerta: pasa a fallida y no gasta cupo", async () => {
    llenarElDia(1);
    fila({ batchId: "b1", status: "processing", progress: 30 }, 40 * MIN, 20 * MIN);
    const r = await checkUsageLimits("u1");
    expect(estado("g" + n)).toBe("failed");
    expect(r.dailyUsed).toBe(DIA - 1);
    expect(r.allowed).toBe(true);
  });
});

describe("lo que no es de un lote sigue igual (no se revive lo colgado)", () => {
  it("una generación suelta pendiente o en proceso con más de 15 min se reapa y no cuenta", async () => {
    fila({ status: "processing" }, 20 * MIN);
    fila({ status: "pending" }, 30 * MIN);
    const r = await checkUsageLimits("u1");
    expect(["g1", "g2"].map(estado)).toEqual(["failed", "failed"]);
    expect(r.dailyUsed).toBe(0);
    expect(r.monthlyUsed).toBe(0);
  });

  it("una generación suelta de hace 10 min sí cuenta", async () => {
    fila({ status: "processing" }, 10 * MIN);
    const r = await checkUsageLimits("u1");
    expect(r.dailyUsed).toBe(1);
  });

  it("las fallidas y las de otra persona no cuentan", async () => {
    fila({ batchId: "b1", status: "failed" }, 20 * MIN);
    fila({ batchId: "b2", status: "pending", userId: "u2" }, 20 * MIN);
    const r = await checkUsageLimits("u1");
    expect(r.dailyUsed).toBe(0);
    expect(r.monthlyUsed).toBe(0);
  });

  it("una pendiente de lote de hace 20 min no cuenta en el cupo DIARIO si se creó ayer (ventana del día)", async () => {
    // 17:00 UTC = 12:00 Bogotá. Hace 20 h fue ayer a las 16:00 de Bogotá: fuera de hoy, dentro del mes.
    fila({ batchId: "b1", status: "pending" }, 20 * HORA);
    const r = await checkUsageLimits("u1");
    expect(r.dailyUsed).toBe(0);
    expect(r.monthlyUsed).toBe(1);
  });
});

describe("las actas de reuniones también se miden por actividad", () => {
  it("un acta en proceso creada hace 2 h pero activa hace 3 min cuenta; sin actividad en 3 h se reapa y no cuenta", async () => {
    fila({ type: "acta", meetingId: "r1", status: "processing" }, 2 * HORA, 3 * MIN);
    let r = await checkUsageLimits("u1");
    expect(r.dailyUsed).toBe(1);
    expect(estado("g1")).toBe("processing");

    db.generation.filas.length = 0;
    fila({ type: "acta", meetingId: "r1", status: "processing" }, 5 * HORA, STUCK_REUNION_MS + MIN);
    r = await checkUsageLimits("u1");
    expect(estado("g2")).toBe("failed");
    expect(r.dailyUsed).toBe(0);
  });
});

describe("cliente de transacción", () => {
  it("con un cliente explícito (tx) TODAS las lecturas y el reaper van por él y el db global no se toca", async () => {
    const global = db;
    const spies = [vi.spyOn(global.generation, "count"), vi.spyOn(global.generation, "updateMany")];
    const tx = crearDbFalsa();
    fila({ status: "completed", progress: 100 }, 3 * HORA); // en el db global: no debe leerse
    tx.generation.filas.push({
      id: "t1", userId: "u1", propertyId: "p1", type: "custom", status: "completed", progress: 100, batchId: null, meetingId: null,
      errorMessage: null, createdAt: new Date(Date.now() - 3 * HORA), updatedAt: new Date(Date.now() - 3 * HORA),
    });
    const r = await checkUsageLimits("u1", tx as never);
    expect(r.dailyUsed).toBe(1);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
