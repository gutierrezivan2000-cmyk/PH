/**
 * Alta de un lote Élite: el tope mensual se cuenta con la MISMA regla que el reintento (lib/generation/cupo-lote.ts).
 *
 * Antes el alta contaba con el mes del servidor (UTC en Vercel): entre las 7 p. m. del último día del mes y la medianoche en
 * Bogotá ya era el mes siguiente para el servidor, el conteo arrancaba en cero y el alta dejaba pasar un mes más de lotes,
 * mientras el reintento (que sí usa el mes de Bogotá) seguía viendo el cupo gastado.
 *
 * La base se simula en memoria (filas reales con su estado y fecha) para probar el efecto y no solo las llamadas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

type Fila = { userId: string; status: string; createdAt: Date };

const { elite, filas, creadas } = vi.hoisted(() => {
  delete process.env.DEMO_MODE;
  return {
    elite: { current: null as null | { userId: string; email: string; name: string | null; plan: "elite" | "beta" | "demo" } },
    filas: { current: [] as Array<{ userId: string; status: string; createdAt: Date }> },
    creadas: { current: [] as Array<Record<string, unknown>> },
  };
});

vi.mock("@/lib/elite-auth", () => ({ requireElite: async () => elite.current }));
// La verificación de dueño de los archivos tiene su propia prueba; aquí no es lo que se mide.
vi.mock("@/lib/blob-owner", () => ({ primerBlobAjeno: () => null }));

const contar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    property: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })),
    },
    propertyMonthlyData: {
      findMany: async ({ where }: { where: { propertyId: { in: string[] } } }) =>
        where.propertyId.in.map((propertyId) => ({
          propertyId,
          files: [{ name: "a.pdf", url: "https://x.public.blob.vercel-storage.com/a.pdf", type: "application/pdf", size: 10 }],
          additionalText: null,
        })),
    },
    generation: {
      // Solo la consulta de "ya generadas" (regenerar) usa findMany: ninguna lo está.
      findMany: async () => [],
      count: async (args: { where: { userId: string; createdAt: { gte: Date }; status: { in: string[] } } }) => {
        contar(args);
        const { userId, createdAt, status } = args.where;
        return filas.current.filter((f) => f.userId === userId && f.createdAt >= createdAt.gte && status.in.includes(f.status)).length;
      },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        creadas.current.push(...data);
        return { count: data.length };
      },
    },
    generationBatch: { create: async () => ({ id: "lote1" }) },
  },
}));

import { PLANS } from "@/lib/epayco";
import { POST } from "./route";

const TOPE = PLANS.elite.limits.generationsPerMonth;
const post = (propertyIds: string[]) =>
  ({ json: async () => ({ month: 9, year: 2026, docTypes: ["informe"], propertyIds }) }) as unknown as NextRequest;
const gastadas = (cuantas: number, creada: string): Fila[] =>
  Array.from({ length: cuantas }, () => ({ userId: "u1", status: "completed", createdAt: new Date(creada) }));

beforeEach(() => {
  vi.useFakeTimers();
  filas.current = [];
  creadas.current = [];
  contar.mockClear();
  elite.current = { userId: "u1", email: "ana@x.co", name: null, plan: "elite" };
});
afterEach(() => vi.useRealTimers());

describe("POST /api/empresa/batch — tope mensual", () => {
  it("cuenta el mes en hora de Bogotá: a las 10 p. m. del 30 de septiembre en Bogotá (03:00 UTC del 1 de octubre) todavía es septiembre", async () => {
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
    // Quedan 2 de cupo de septiembre. Con el mes del servidor (octubre en UTC) el conteo habría arrancado en cero.
    filas.current = gastadas(TOPE - 2, "2026-09-20T15:00:00Z");

    const r = await POST(post(["p1", "p2", "p3", "p4"]));
    const cuerpo = await r.json();

    expect(r.status).toBe(200);
    expect(cuerpo.created).toBe(2);
    expect(cuerpo.skippedCap).toBe(2);
    expect(creadas.current).toHaveLength(2);
    // El conteo arranca en el primer instante del mes de Bogotá, no en la medianoche UTC.
    expect(contar.mock.calls[0][0].where.createdAt.gte.toISOString()).toBe("2026-09-01T05:00:00.000Z");
  });

  it("pasada la medianoche de Bogotá empieza el mes nuevo y el cupo vuelve a estar entero", async () => {
    vi.setSystemTime(new Date("2026-10-01T05:30:00Z"));
    filas.current = gastadas(TOPE, "2026-09-20T15:00:00Z");

    const r = await POST(post(["p1", "p2", "p3"]));

    expect(r.status).toBe(200);
    expect((await r.json()).created).toBe(3);
    expect(contar.mock.calls[0][0].where.createdAt.gte.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });

  it("con el cupo del mes agotado responde 400 y no crea nada", async () => {
    vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
    filas.current = gastadas(TOPE, "2026-09-02T15:00:00Z");

    const r = await POST(post(["p1", "p2"]));
    const cuerpo = await r.json();

    expect(r.status).toBe(400);
    expect(cuerpo.skippedCap).toBe(2);
    expect(creadas.current).toHaveLength(0);
  });

  it("las fallidas no gastan cupo (igual que en el reintento)", async () => {
    vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
    filas.current = [...gastadas(TOPE - 1, "2026-09-02T15:00:00Z"), ...gastadas(40, "2026-09-03T15:00:00Z").map((f) => ({ ...f, status: "failed" }))];

    const r = await POST(post(["p1", "p2"]));

    expect((await r.json()).created).toBe(1);
  });

  it("beta y demo no tienen tope: ni siquiera se cuenta", async () => {
    vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
    elite.current = { userId: "u1", email: "ana@x.co", name: null, plan: "beta" };
    filas.current = gastadas(TOPE + 50, "2026-09-02T15:00:00Z");

    const r = await POST(post(["p1", "p2", "p3"]));

    expect((await r.json()).created).toBe(3);
    expect(contar).not.toHaveBeenCalled();
  });
});
