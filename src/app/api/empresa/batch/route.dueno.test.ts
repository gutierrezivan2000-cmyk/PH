/**
 * Alta de un lote Élite: los insumos preparados que se encolan deben ser de quien lanza el lote. Si alguno no lo es, 403 y no
 * se crea nada (ni el lote ni las filas pendientes que después lee el trabajador con la credencial del servidor).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, elite } = vi.hoisted(() => ({
  db: {
    property: { findMany: vi.fn() },
    propertyMonthlyData: { findMany: vi.fn() },
    generation: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn() },
    generationBatch: { create: vi.fn(), findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  elite: { actual: null as null | { userId: string; email: string; name: string | null; plan: "elite" | "beta" | "demo" } },
}));
vi.mock("@/lib/elite-auth", () => ({ requireElite: async () => elite.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));

import { POST } from "./route";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const P1 = "cmprop1111111111aa";
const P2 = "cmprop2222222222bb";

const archivo = (url: string, name = "insumo.pdf") => ({ name, url, type: "application/pdf", size: 1000 });
const propio = (n: string, prop = P1) => archivo(`${HOST}/subidas/${U1}/monthly/${prop}/2026-5/${n}-AbC123.pdf`, `${n}.pdf`);
const ajeno = (n: string) => archivo(`${HOST}/subidas/${U2}/monthly/otra/2026-5/${n}-AbC123.pdf`, `${n}.pdf`);
const legado = (n: string, prop: string) => archivo(`${HOST}/monthly/${prop}/2026-5/1700000-${n}-AbC123.pdf`, `${n}.pdf`);

const lanzar = (propertyIds: string[] = [P1]) =>
  POST(
    new Request("http://localhost:3000/api/empresa/batch", {
      method: "POST",
      body: JSON.stringify({ month: 5, year: 2026, docTypes: ["informe"], propertyIds }),
    }) as never
  );

/** Deja en la base las propiedades de U1 y los insumos preparados de cada una. */
function preparar(insumos: Record<string, unknown[]>) {
  db.property.findMany.mockResolvedValue(Object.keys(insumos).map((id) => ({ id })));
  db.propertyMonthlyData.findMany.mockResolvedValue(
    Object.entries(insumos).map(([propertyId, files]) => ({ propertyId, files, additionalText: "nota" }))
  );
}

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  elite.actual = { userId: U1, email: "admin@ph.co", name: "Admin", plan: "beta" };
  for (const m of [db.property.findMany, db.propertyMonthlyData.findMany, db.generation.findMany, db.generation.count, db.generation.createMany, db.generationBatch.create, db.generationBatch.findMany, db.$executeRaw, db.$transaction]) {
    m.mockReset();
  }
  db.generation.findMany.mockResolvedValue([]);
  db.generation.count.mockResolvedValue(0);
  db.generation.createMany.mockResolvedValue({ count: 1 });
  db.generationBatch.create.mockResolvedValue({ id: "lote1" });
  db.generationBatch.findMany.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (fn: (t: typeof db) => Promise<unknown>) => fn(db));
});

describe("POST /api/empresa/batch: dueño de los insumos preparados", () => {
  it("encola los insumos propios tal cual", async () => {
    preparar({ [P1]: [propio("a"), propio("b")] });
    const r = await lanzar();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ batchId: "lote1", created: 1 });
    expect(db.generationBatch.create).toHaveBeenCalledTimes(1);
    const filas = db.generation.createMany.mock.calls[0][0].data;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ userId: U1, propertyId: P1, status: "pending", batchId: "lote1", inputFiles: [propio("a"), propio("b")] });
  });

  it("RECHAZA (403) un insumo de otro usuario y no crea ni el lote ni las filas", async () => {
    preparar({ [P1]: [propio("a"), ajeno("secreto")] });
    const r = await lanzar();
    expect(r.status).toBe(403);
    const { error } = await r.json();
    expect(error).toMatch(/no pertenece a tu cuenta/);
    expect(error).not.toContain(U2); // no se devuelve la ruta del archivo ajeno
    expect(db.generationBatch.create).not.toHaveBeenCalled();
    expect(db.generation.createMany).not.toHaveBeenCalled();
  });

  it("basta un insumo ajeno en UNA de las propiedades: el lote entero se rechaza, también las propiedades limpias", async () => {
    preparar({ [P1]: [propio("a")], [P2]: [propio("b", P2), ajeno("secreto")] });
    const r = await lanzar([P1, P2]);
    expect(r.status).toBe(403);
    expect(db.generationBatch.create).not.toHaveBeenCalled();
    expect(db.generation.createMany).not.toHaveBeenCalled();
  });

  it("los insumos mensuales de antes valen solo en la carpeta de SU propiedad", async () => {
    preparar({ [P1]: [legado("viejo", P1), propio("nuevo")] });
    expect((await lanzar()).status).toBe(200);

    db.generationBatch.create.mockClear();
    db.generation.createMany.mockClear();
    preparar({ [P1]: [legado("viejo", P2)] }); // la carpeta de antes de OTRA propiedad
    expect((await lanzar()).status).toBe(403);
    expect(db.generationBatch.create).not.toHaveBeenCalled();
  });

  it("rechaza las rutas de antes sin propiedad, los trucos de ruta, los hosts ajenos y los elementos que no son archivos", async () => {
    for (const insumo of [
      archivo(`${HOST}/uploads/1700000-acta.pdf`),
      archivo(`${HOST}/subidas/${U1}/../${U2}/monthly/x/a.pdf`),
      archivo(`${HOST}/subidas/${U1}/%2e%2e/${U2}/a.pdf`),
      archivo(`${HOST}/subidas/${U2}/a.pdf?x=/subidas/${U1}/b.pdf`),
      archivo(`${HOST}/monthly/${P1}/../${P2}/a.pdf`),
      archivo(`https://servidor-del-atacante.example/subidas/${U1}/a.pdf`),
      archivo("http://169.254.169.254/latest/meta-data/"),
      archivo(""),
      { name: "sin-url.pdf" },
      "https://abc.private.blob.vercel-storage.com/subidas/" + U1 + "/a.pdf", // una cadena en vez de un archivo
      null,
    ]) {
      preparar({ [P1]: [propio("a"), insumo] });
      db.generationBatch.create.mockClear();
      const r = await lanzar();
      expect(r.status, JSON.stringify(insumo)).toBe(403);
      expect(db.generationBatch.create).not.toHaveBeenCalled();
    }
    expect(db.generation.createMany).not.toHaveBeenCalled();
  });

  it("solo se comprueban las propiedades que de verdad se encolan (la ya generada se salta antes)", async () => {
    preparar({ [P1]: [propio("a")], [P2]: [ajeno("viejo")] });
    db.generation.findMany.mockResolvedValue([{ propertyId: P2, outputFiles: { informeHtml: "x" } }]);
    const r = await lanzar([P1, P2]);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ created: 1, skippedExisting: 1 });
    expect(db.generation.createMany.mock.calls[0][0].data.map((f: { propertyId: string }) => f.propertyId)).toEqual([P1]);
  });

  it("una propiedad sin insumos sigue saltándose como antes, sin 403", async () => {
    preparar({ [P1]: [], [P2]: [propio("b", P2)] });
    const r = await lanzar([P1, P2]);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ created: 1, skippedNoData: 1 });
  });

  it("sin sesión de Élite responde 403 y no consulta nada", async () => {
    elite.actual = null;
    expect((await lanzar()).status).toBe(403);
    expect(db.property.findMany).not.toHaveBeenCalled();
  });

  it("en el demo el lote sigue sin estar disponible", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect((await lanzar()).status).toBe(403);
    expect(db.generationBatch.create).not.toHaveBeenCalled();
  });
});
