/**
 * Reintento de un lote Élite: el tope mensual también cuenta cuando se reencolan las fallidas.
 *
 * Antes, POST /api/empresa/batch/[id] pasaba las fallidas a "pending" sin mirar el cupo. Como las fallidas no gastan
 * cupo (solo cuentan completed/processing/pending, igual que el alta del lote), bastaba esto para pasarse del tope:
 * agotar el cupo con un lote, tener otro lote con fallidas y reintentarlas todas.
 *
 * La base se simula en memoria (filas reales con su estado) para probar el efecto y no solo las llamadas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

type Fila = { id: string; userId: string; batchId: string | null; status: string; createdAt: Date; progress?: number; errorMessage?: string | null };

const { elite, filas, lotes } = vi.hoisted(() => ({
  elite: { current: null as null | { userId: string; email: string; name: string | null; plan: "elite" | "beta" | "demo" } },
  filas: { current: [] as Array<{ id: string; userId: string; batchId: string | null; status: string; createdAt: Date; progress?: number; errorMessage?: string | null }> },
  lotes: { current: [] as Array<{ id: string; userId: string; status: string; completedAt: Date | null }> },
}));

vi.mock("@/lib/elite-auth", () => ({ requireElite: async () => elite.current }));

/** Evalúa solo los filtros que usa la ruta: igualdad, { in }, { gte } y { lt }. */
function coincide(fila: Record<string, unknown>, donde: Record<string, unknown>): boolean {
  return Object.entries(donde).every(([campo, cond]) => {
    const v = fila[campo];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; gte?: Date; lt?: Date };
      if (c.in && !c.in.includes(v)) return false;
      if (c.gte && !((v as Date) >= c.gte)) return false;
      if (c.lt && !((v as Date) < c.lt)) return false;
      return true;
    }
    return v === cond;
  });
}

vi.mock("@/lib/db", () => ({
  db: {
    generationBatch: {
      findUnique: async ({ where }: { where: { id: string } }) => lotes.current.find((l) => l.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const l = lotes.current.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      },
    },
    generation: {
      count: async ({ where }: { where: Record<string, unknown> }) => filas.current.filter((f) => coincide(f, where)).length,
      findMany: async ({ where, orderBy, select }: { where: Record<string, unknown>; orderBy?: { createdAt: "asc" | "desc" }; select?: Record<string, boolean> }) => {
        let r = filas.current.filter((f) => coincide(f, where));
        if (orderBy) r = [...r].sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * (orderBy.createdAt === "asc" ? 1 : -1));
        return r.map((f) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, (f as Record<string, unknown>)[k]])) : f));
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const r = filas.current.filter((f) => coincide(f, where));
        r.forEach((f) => Object.assign(f, data));
        return { count: r.length };
      },
    },
  },
}));

import { PLANS } from "@/lib/epayco";
import { POST } from "./route";

const TOPE = PLANS.elite.limits.generationsPerMonth;
const AHORA = new Date("2026-10-15T15:00:00Z");
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);
const MES_ANTERIOR = new Date("2026-09-10T15:00:00Z");

const peticion = {} as NextRequest;
const ctx = (id = "lote-B") => ({ params: Promise.resolve({ id }) });

let n = 0;
function filasDe(cuantas: number, extra: Partial<Fila>): Fila[] {
  return Array.from({ length: cuantas }, () => ({ id: `g${++n}`, userId: "u1", batchId: "lote-A", status: "completed", createdAt: hace(60), ...extra }));
}
const estados = (batchId: string) => filas.current.filter((f) => f.batchId === batchId).map((f) => f.status);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  vi.stubEnv("DEMO_MODE", "");
  n = 0;
  elite.current = { userId: "u1", email: "ana@x.co", name: null, plan: "elite" };
  lotes.current = [
    { id: "lote-A", userId: "u1", status: "completed", completedAt: hace(30) },
    { id: "lote-B", userId: "u1", status: "completed", completedAt: hace(30) },
    { id: "lote-ajeno", userId: "otro", status: "completed", completedAt: hace(30) },
  ];
  filas.current = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/empresa/batch/[id] — reintentar fallidas", () => {
  it("con el cupo del mes agotado NO reencola las fallidas (antes se saltaba el tope)", async () => {
    // El lote A gastó todo el cupo; el lote B quedó con 3 fallidas (las fallidas no gastan cupo).
    filas.current = [...filasDe(TOPE, { batchId: "lote-A", status: "completed" }), ...filasDe(3, { batchId: "lote-B", status: "failed" })];

    const r = await POST(peticion, ctx());

    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j).toMatchObject({ requeued: 0, skippedCap: 3 });
    expect(j.error).toMatch(/tope|cupo/i);
    expect(estados("lote-B")).toEqual(["failed", "failed", "failed"]);
    expect(lotes.current.find((l) => l.id === "lote-B")!.status).toBe("completed"); // no se reabre el lote
  });

  it("con cupo parcial reencola solo las que caben (las más antiguas primero) y deja el resto fallidas", async () => {
    filas.current = [
      ...filasDe(TOPE - 2, { batchId: "lote-A", status: "completed" }),
      { id: "b-vieja", userId: "u1", batchId: "lote-B", status: "failed", createdAt: hace(50) },
      { id: "b-media", userId: "u1", batchId: "lote-B", status: "failed", createdAt: hace(40) },
      { id: "b-nueva", userId: "u1", batchId: "lote-B", status: "failed", createdAt: hace(30), errorMessage: "boom" },
    ];

    const r = await POST(peticion, ctx());

    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ requeued: 2, skippedCap: 1 });
    const por = Object.fromEntries(filas.current.filter((f) => f.batchId === "lote-B").map((f) => [f.id, f.status]));
    expect(por).toEqual({ "b-vieja": "pending", "b-media": "pending", "b-nueva": "failed" });
    expect(filas.current.find((f) => f.id === "b-nueva")!.errorMessage).toBe("boom"); // la que no cupo conserva su motivo
    expect(lotes.current.find((l) => l.id === "lote-B")!.status).toBe("processing");
  });

  it("un reintento legítimo no se cobra dos veces: la fallida no gastaba cupo y al reencolarse cuenta una sola vez", async () => {
    // Quedan exactamente 3 de cupo y hay 3 fallidas del mismo lote (p. ej. mató la función el vigilante de 15 min).
    filas.current = [...filasDe(TOPE - 3, { batchId: "lote-A", status: "completed" }), ...filasDe(3, { batchId: "lote-B", status: "failed" })];

    const primero = await POST(peticion, ctx());
    expect(primero.status).toBe(200);
    expect(await primero.json()).toMatchObject({ requeued: 3, skippedCap: 0 });
    expect(estados("lote-B")).toEqual(["pending", "pending", "pending"]);

    // Ahora el mes está justo en el tope (las 3 pendientes cuentan una vez cada una): no hay más que reencolar.
    const gastadas = filas.current.filter((f) => ["completed", "processing", "pending"].includes(f.status)).length;
    expect(gastadas).toBe(TOPE);
    const segundo = await POST(peticion, ctx());
    expect(segundo.status).toBe(200);
    expect(await segundo.json()).toMatchObject({ requeued: 0 });
  });

  it("repetir el reintento no reencola dos veces las mismas filas", async () => {
    filas.current = filasDe(2, { batchId: "lote-B", status: "failed" });
    expect(await (await POST(peticion, ctx())).json()).toMatchObject({ requeued: 2 });
    expect(await (await POST(peticion, ctx())).json()).toMatchObject({ requeued: 0 });
    expect(estados("lote-B")).toEqual(["pending", "pending"]);
  });

  it("los pendientes y en proceso de otros lotes también gastan cupo", async () => {
    filas.current = [
      ...filasDe(TOPE - 1, { batchId: "lote-A", status: "pending" }),
      ...filasDe(1, { batchId: "lote-A", status: "processing" }),
      ...filasDe(2, { batchId: "lote-B", status: "failed" }),
    ];
    const r = await POST(peticion, ctx());
    expect(r.status).toBe(429);
    expect(estados("lote-B")).toEqual(["failed", "failed"]);
  });

  it("las generaciones fallidas del mes no gastan cupo (no se descuentan las que no salieron)", async () => {
    filas.current = [...filasDe(TOPE + 20, { batchId: "lote-A", status: "failed" }), ...filasDe(2, { batchId: "lote-B", status: "failed" })];
    const r = await POST(peticion, ctx());
    expect(r.status).toBe(200);
    // Hay 22 fallidas en total, pero solo las 2 de ESTE lote se reencolan; las del lote A no se tocan.
    expect(await r.json()).toMatchObject({ requeued: 2 });
    expect(estados("lote-A").every((s) => s === "failed")).toBe(true);
  });

  it("las fallidas de un mes anterior no se reencolan: ya no entran en el conteo de este mes", async () => {
    filas.current = [
      ...filasDe(2, { batchId: "lote-B", status: "failed", createdAt: MES_ANTERIOR }),
      ...filasDe(1, { batchId: "lote-B", status: "failed" }),
    ];
    const r = await POST(peticion, ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ requeued: 1, skippedAntiguas: 2 });
    expect(filas.current.filter((f) => f.createdAt === MES_ANTERIOR).map((f) => f.status)).toEqual(["failed", "failed"]);
  });

  it("si todas las fallidas son de un mes anterior responde 400 y explica cómo seguir", async () => {
    filas.current = filasDe(2, { batchId: "lote-B", status: "failed", createdAt: MES_ANTERIOR });
    const r = await POST(peticion, ctx());
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j).toMatchObject({ requeued: 0, skippedAntiguas: 2 });
    expect(j.error).toMatch(/lote nuevo/i);
  });

  it("con acceso beta (sin tope) reencola todas, sin mirar el conteo", async () => {
    elite.current = { userId: "u1", email: "ana@x.co", name: null, plan: "beta" };
    filas.current = [...filasDe(TOPE + 50, { batchId: "lote-A", status: "completed" }), ...filasDe(4, { batchId: "lote-B", status: "failed" })];
    const r = await POST(peticion, ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ requeued: 4, skippedCap: 0 });
  });

  it("sin fallidas responde requeued 0 y no toca el lote", async () => {
    filas.current = filasDe(2, { batchId: "lote-B", status: "completed" });
    const r = await POST(peticion, ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ requeued: 0 });
    expect(lotes.current.find((l) => l.id === "lote-B")!.status).toBe("completed");
  });

  it("no toca fallidas de otros lotes aunque haya cupo", async () => {
    filas.current = [...filasDe(2, { batchId: "lote-A", status: "failed" }), ...filasDe(1, { batchId: "lote-B", status: "failed" })];
    await POST(peticion, ctx());
    expect(estados("lote-A")).toEqual(["failed", "failed"]);
    expect(estados("lote-B")).toEqual(["pending"]);
  });

  it("un lote de otra cuenta responde 404 y no se toca", async () => {
    filas.current = [{ id: "x1", userId: "otro", batchId: "lote-ajeno", status: "failed", createdAt: hace(10) }];
    const r = await POST(peticion, ctx("lote-ajeno"));
    expect(r.status).toBe(404);
    expect(filas.current[0].status).toBe("failed");
  });

  it("sin acceso Élite responde 403", async () => {
    elite.current = null;
    expect((await POST(peticion, ctx())).status).toBe(403);
  });

  it("en el demo responde 403", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect((await POST(peticion, ctx())).status).toBe(403);
  });
});
