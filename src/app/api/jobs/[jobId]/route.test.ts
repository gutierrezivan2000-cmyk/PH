import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  generation: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));

import { GET } from "./route";

const MIN = 60 * 1000;
const hace = (ms: number) => new Date(Date.now() - ms);
const fila = (extra: Record<string, unknown>) => ({
  id: "g1", userId: "u1", status: "pending", meetingId: null, batchId: null, progress: 0, outputFiles: null,
  createdAt: hace(40 * MIN), updatedAt: hace(40 * MIN), property: null, ...extra,
});
const consultar = () => GET({} as NextRequest, { params: Promise.resolve({ jobId: "g1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.generation.updateMany.mockResolvedValue({ count: 1 });
});

describe("GET /api/jobs/[jobId] — vigilante de generaciones colgadas", () => {
  it("una generación suelta pendiente desde hace más de 15 min se marca como fallida", async () => {
    db.generation.findFirst.mockResolvedValueOnce(fila({})).mockResolvedValueOnce(fila({ status: "failed" }));
    const r = await consultar();
    expect(r.status).toBe(200);
    expect(db.generation.updateMany).toHaveBeenCalledTimes(1);
    expect(db.generation.updateMany.mock.calls[0][0].data.status).toBe("failed");
  });

  it("una fila de lote en cola (pending) NO se cancela por antigüedad: espera su turno", async () => {
    db.generation.findFirst.mockResolvedValue(fila({ batchId: "b1", status: "pending" }));
    await consultar();
    expect(db.generation.updateMany).not.toHaveBeenCalled();
  });

  it("una fila de lote en proceso con actividad reciente tampoco se cancela", async () => {
    db.generation.findFirst.mockResolvedValue(fila({ batchId: "b1", status: "processing", updatedAt: hace(2 * MIN) }));
    await consultar();
    expect(db.generation.updateMany).not.toHaveBeenCalled();
  });

  it("una fila de lote en proceso sin actividad desde hace más de 15 min sí se cancela", async () => {
    db.generation.findFirst
      .mockResolvedValueOnce(fila({ batchId: "b1", status: "processing", updatedAt: hace(20 * MIN) }))
      .mockResolvedValueOnce(fila({ batchId: "b1", status: "failed" }));
    await consultar();
    expect(db.generation.updateMany).toHaveBeenCalledTimes(1);
  });

  it("un acta de reunión se mide por actividad, no por creación", async () => {
    db.generation.findFirst.mockResolvedValue(fila({ meetingId: "m1", status: "processing", createdAt: hace(60 * MIN), updatedAt: hace(5 * MIN) }));
    await consultar();
    expect(db.generation.updateMany).not.toHaveBeenCalled();
  });

  it("una generación de otro usuario responde 404 (la consulta va filtrada por userId)", async () => {
    db.generation.findFirst.mockResolvedValue(null);
    const r = await consultar();
    expect(r.status).toBe(404);
    expect(db.generation.findFirst.mock.calls[0][0].where).toMatchObject({ id: "g1", userId: "u1" });
  });
});
