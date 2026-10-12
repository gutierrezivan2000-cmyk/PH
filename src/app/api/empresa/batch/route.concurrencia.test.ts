/**
 * Alta de un lote Élite: el tope mensual no se puede multiplicar con peticiones simultáneas, y no se duplican pendientes.
 *
 * La base se simula en memoria con un `$transaction` que serializa por usuario (como el candado de asesoría real): la segunda
 * petición solo empieza cuando la primera confirmó sus filas pendientes, y las cuenta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

type Fila = { userId: string; propertyId: string; status: string; batchId: string | null; createdAt: Date };

const { estado, limite } = vi.hoisted(() => {
  delete process.env.DEMO_MODE;
  return {
    estado: {
      filas: [] as Array<{ userId: string; propertyId: string; status: string; batchId: string | null; createdAt: Date }>,
      lotes: [] as Array<{ id: string; userId: string; docTypes: string[] }>,
      cola: Promise.resolve() as Promise<unknown>,
      candados: 0,
    },
    limite: { respuesta: { allowed: true } as { allowed: boolean; retryAfterSec?: number; unavailable?: boolean } },
  };
});

vi.mock("@/lib/elite-auth", () => ({
  requireElite: async () => ({ userId: "u1", email: "a@x.co", name: null, plan: "elite" }),
}));
vi.mock("@/lib/blob-owner", () => ({ primerBlobAjeno: () => null }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => limite.respuesta }));

vi.mock("@/lib/db", () => {
  const db = {
    property: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })) },
    propertyMonthlyData: {
      findMany: async ({ where }: { where: { propertyId: { in: string[] } } }) =>
        where.propertyId.in.map((propertyId) => ({
          propertyId,
          files: [{ name: "a.pdf", url: "https://x.public.blob.vercel-storage.com/a.pdf", type: "application/pdf", size: 1 }],
          additionalText: null,
        })),
    },
    generation: {
      findMany: async ({ where }: { where: { status: string | { in: string[] } } }) =>
        typeof where.status === "string"
          ? []
          : estado.filas.filter((f) => (where.status as { in: string[] }).in.includes(f.status)),
      count: async ({ where }: { where: { status: { in: string[] } } }) =>
        estado.filas.filter((f) => where.status.in.includes(f.status)).length,
      createMany: async ({ data }: { data: Array<Omit<Fila, "createdAt">> }) => {
        await Promise.resolve(); // cede el turno: sin candado, otra petición leería el cupo antes de este commit
        for (const d of data) estado.filas.push({ ...d, createdAt: new Date() });
        return { count: data.length };
      },
    },
    generationBatch: {
      create: async ({ data }: { data: { userId: string; docTypes: string[] } }) => {
        const l = { id: `lote${estado.lotes.length + 1}`, userId: data.userId, docTypes: data.docTypes };
        estado.lotes.push(l);
        return l;
      },
      findMany: async ({ where }: { where: { id: { in: string[] }; docTypes: { has: string } } }) =>
        estado.lotes.filter((l) => where.id.in.includes(l.id) && l.docTypes.includes(where.docTypes.has)),
    },
    $executeRaw: async () => {
      estado.candados++;
      return 0;
    },
    // Serializa las transacciones (el candado por usuario de la base real).
    $transaction: (fn: (t: unknown) => Promise<unknown>) => {
      const turno = estado.cola.then(() => fn(db));
      estado.cola = turno.catch(() => {});
      return turno;
    },
  };
  return { db };
});

import { PLANS } from "@/lib/epayco";
import { POST } from "./route";

const TOPE = PLANS.elite.limits.generationsPerMonth;
const post = (propertyIds: string[], docTypes = ["informe"]) =>
  ({ json: async () => ({ month: 9, year: 2026, docTypes, propertyIds }) }) as unknown as NextRequest;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
  estado.filas = [];
  estado.lotes = [];
  estado.cola = Promise.resolve();
  estado.candados = 0;
  limite.respuesta = { allowed: true };
});

describe("POST /api/empresa/batch — concurrencia", () => {
  it("peticiones simultáneas no multiplican el cupo: en total nunca se pasa del tope", async () => {
    // Quedan 3 de cupo; 5 peticiones a la vez con 3 propiedades distintas cada una.
    estado.filas = Array.from({ length: TOPE - 3 }, (_, i) => ({
      userId: "u1", propertyId: `viejo${i}`, status: "completed", batchId: null, createdAt: new Date("2026-09-02T15:00:00Z"),
    }));
    const respuestas = await Promise.all(Array.from({ length: 5 }, (_, k) => POST(post([`a${k}`, `b${k}`, `c${k}`]))));
    const creadas = (await Promise.all(respuestas.map((r) => r.json()))).reduce((t, c) => t + (c.created ?? 0), 0);

    expect(creadas).toBe(3);
    expect(estado.filas.filter((f) => f.status === "pending")).toHaveLength(3);
    expect(estado.candados).toBe(5); // cada petición tomó el candado del usuario
  });

  it("la misma propiedad pedida a la vez solo se encola una vez", async () => {
    const respuestas = await Promise.all(Array.from({ length: 4 }, () => POST(post(ids(2)))));
    const cuerpos = await Promise.all(respuestas.map((r) => r.json()));

    expect(cuerpos.reduce((t, c) => t + (c.created ?? 0), 0)).toBe(2);
    expect(estado.filas).toHaveLength(2);
    expect(respuestas.filter((r) => r.status === 400)).toHaveLength(3); // las demás: nada quedó listo
  });

  it("no duplica una propiedad con pendiente del mismo documento, ni siquiera regenerando", async () => {
    await POST(post(["p0"]));
    const r = await POST({ json: async () => ({ month: 9, year: 2026, docTypes: ["informe"], propertyIds: ["p0"], regenerate: true }) } as unknown as NextRequest);
    expect(r.status).toBe(400);
    expect((await r.json()).skippedExisting).toBe(1);
    expect(estado.filas).toHaveLength(1);
  });

  it("un pendiente de INFORME no impide encolar el ACTA de la misma propiedad", async () => {
    await POST(post(["p0"], ["informe"]));
    const r = await POST(post(["p0"], ["acta"]));
    expect(r.status).toBe(200);
    expect(estado.filas).toHaveLength(2);
  });

  it("el límite por usuario responde 429 con Retry-After y no toca la base", async () => {
    limite.respuesta = { allowed: false, retryAfterSec: 42 };
    const r = await POST(post(["p0"]));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("42");
    expect(estado.candados).toBe(0);
    expect(estado.filas).toHaveLength(0);
  });

  it("si el contador no está disponible (failClosed) responde 503", async () => {
    limite.respuesta = { allowed: false, retryAfterSec: 30, unavailable: true };
    expect((await POST(post(["p0"]))).status).toBe(503);
  });
});
