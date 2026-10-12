import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, get, del, put, generateWithAssistant } = vi.hoisted(() => ({
  db: {
    generation: { update: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    propertyDocument: { findMany: vi.fn() },
  },
  get: vi.fn(),
  del: vi.fn(),
  put: vi.fn(),
  generateWithAssistant: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@vercel/blob", () => ({
  get: (...a: unknown[]) => get(...a),
  del: (...a: unknown[]) => del(...a),
  put: (...a: unknown[]) => put(...a),
}));
vi.mock("@/lib/consumo/registrar", () => ({ conConsumo: (_ctx: unknown, fn: () => unknown) => fn() }));
vi.mock("@/lib/agentes/eventos", () => ({ registrarEvento: async () => {} }));
vi.mock("@/lib/ai-client", () => ({ generateWithAssistant: (...a: unknown[]) => generateWithAssistant(...a) }));

import { BlobAjenoError, blobRefToFile, runGeneration, type BlobFileRef } from "./run";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const TEXTO = "Se aprobó el presupuesto de mantenimiento del tercer trimestre por 12 millones de pesos.";

const ref = (url: string, name = "acta.txt"): BlobFileRef => ({ url, name, type: "text/plain", size: 100 });
const propio = (n: string) => ref(`${HOST}/subidas/${U1}/uploads/${n}-AbC123.txt`, `${n}.txt`);
const ajeno = (n: string) => ref(`${HOST}/subidas/${U2}/uploads/${n}-AbC123.txt`, `${n}.txt`);

const base = (over: Partial<Parameters<typeof runGeneration>[0]> = {}) => ({
  generationId: "gen1",
  userId: U1,
  propertyName: "Conjunto Los Pinos",
  month: 5,
  year: 2026,
  blobFiles: [propio("a")],
  additionalText: null,
  includeInforme: true,
  includeActa: false,
  includePptx: false,
  ...over,
});

/** Lo último que quedó escrito sobre la generación. */
const ultimoEstado = () => db.generation.update.mock.calls.map((c) => c[0].data).findLast((d: { status?: string }) => d.status);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const m of [db.generation.update, db.generation.findUnique, db.user.findUnique, db.propertyDocument.findMany, get, del, put, generateWithAssistant]) m.mockReset();
  db.generation.update.mockResolvedValue({ propertyId: "prop1", type: "custom" });
  db.generation.findUnique.mockResolvedValue({ userId: U1, propertyId: "prop1" });
  db.user.findUnique.mockResolvedValue(null);
  db.propertyDocument.findMany.mockResolvedValue([]);
  get.mockImplementation(async () => ({ stream: new Response(TEXTO).body }));
  del.mockResolvedValue(undefined);
  put.mockImplementation(async (ruta: string) => ({ url: `${HOST}/${ruta}` }));
  generateWithAssistant.mockResolvedValue({ text: "# Informe\n\nTodo en orden.", tokensUsed: 100, costUsd: 0.01 });
});

describe("blobRefToFile con dueño", () => {
  it("lee el blob del propio usuario", async () => {
    const file = await blobRefToFile(propio("a"), { userId: U1 });
    expect(await file.text()).toBe(TEXTO);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("NO pide nada al almacenamiento si el blob es de otro: lanza BlobAjenoError", async () => {
    const fetchEspia = vi.spyOn(globalThis, "fetch");
    await expect(blobRefToFile(ajeno("b"), { userId: U1 })).rejects.toBeInstanceOf(BlobAjenoError);
    await expect(blobRefToFile(ajeno("b"), { userId: U1 })).rejects.toThrow(/no pertenece a tu cuenta/);
    expect(get).not.toHaveBeenCalled();
    expect(fetchEspia).not.toHaveBeenCalled();
    fetchEspia.mockRestore();
  });

  it("rechaza también las rutas de antes, sin dueño", async () => {
    await expect(blobRefToFile(ref(`${HOST}/uploads/123-acta.txt`), { userId: U1 })).rejects.toBeInstanceOf(BlobAjenoError);
    expect(get).not.toHaveBeenCalled();
  });

  it("los insumos mensuales de antes solo se leen con la copropiedad indicada", async () => {
    const legado = ref(`${HOST}/monthly/prop1/2026-5/1700-acta.txt`);
    await expect(blobRefToFile(legado, { userId: U1 })).rejects.toBeInstanceOf(BlobAjenoError);
    await expect(blobRefToFile(legado, { userId: U1, propertyId: "prop2" })).rejects.toBeInstanceOf(BlobAjenoError);
    await expect(blobRefToFile(legado, { userId: U1, propertyId: "prop1" })).resolves.toBeInstanceOf(File);
  });

  it("sigue rechazando los hosts ajenos al almacenamiento con o sin dueño", async () => {
    const trampa = ref("https://servidor-del-atacante.example/subidas/" + U1 + "/a.txt");
    await expect(blobRefToFile(trampa, { userId: U1 })).rejects.toThrow(/Origen de archivo no permitido/);
    await expect(blobRefToFile(trampa)).rejects.toThrow(/Origen de archivo no permitido/);
  });
});

describe("runGeneration: dueño de los insumos", () => {
  it("con insumos propios genera el documento", async () => {
    await runGeneration(base());
    expect(ultimoEstado()).toMatchObject({ status: "completed" });
    expect(generateWithAssistant).toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("con UN insumo ajeno aborta la generación entera: no lee nada, no llama a la IA ni borra", async () => {
    await runGeneration(base({ blobFiles: [propio("a"), ajeno("b")], cleanupInputs: true }));
    expect(ultimoEstado()).toMatchObject({ status: "failed" });
    expect(ultimoEstado().errorMessage).toMatch(/b\.txt.*no pertenece a tu cuenta/);
    // Ni siquiera el propio se lee: se valida la lista completa ANTES de leer.
    expect(get).not.toHaveBeenCalled();
    expect(generateWithAssistant).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("una URL de otro usuario con trucos de ruta tampoco pasa", async () => {
    for (const url of [
      `${HOST}/subidas/${U1}/../${U2}/uploads/b.txt`,
      `${HOST}/subidas/${U1}/%2e%2e/${U2}/uploads/b.txt`,
      `${HOST}/subidas/${U2}/uploads/b.txt?/subidas/${U1}/`,
      `${HOST}/uploads/123-b.txt`,
    ]) {
      db.generation.update.mockClear();
      await runGeneration(base({ blobFiles: [ref(url)] }));
      expect(ultimoEstado(), url).toMatchObject({ status: "failed" });
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("acepta los insumos subidos con otro de los ids del usuario (sesión vs base de datos)", async () => {
    await runGeneration(base({ blobFiles: [ajeno("b")], idsDeSubida: [U2] }));
    expect(ultimoEstado()).toMatchObject({ status: "completed" });
  });

  it("los insumos mensuales de antes valen si pertenecen a la copropiedad de ESTA generación", async () => {
    const legado = ref(`${HOST}/monthly/prop1/2026-5/1700-acta-AbC123.txt`);
    await runGeneration(base({ blobFiles: [legado] }));
    expect(db.generation.findUnique).toHaveBeenCalledWith({ where: { id: "gen1" }, select: { userId: true, propertyId: true } });
    expect(ultimoEstado()).toMatchObject({ status: "completed" });
  });

  it("...pero no si son de la copropiedad de otra generación o de otro usuario", async () => {
    const deOtraPropiedad = ref(`${HOST}/monthly/prop9/2026-5/1700-acta-AbC123.txt`);
    await runGeneration(base({ blobFiles: [deOtraPropiedad] }));
    expect(ultimoEstado()).toMatchObject({ status: "failed" });

    db.generation.update.mockClear();
    db.generation.findUnique.mockResolvedValue({ userId: U2, propertyId: "prop1" }); // la generación no es de este usuario
    await runGeneration(base({ blobFiles: [ref(`${HOST}/monthly/prop1/2026-5/1700-acta-AbC123.txt`)] }));
    expect(ultimoEstado()).toMatchObject({ status: "failed" });
    expect(get).not.toHaveBeenCalled();
  });

  it("si no se puede consultar la generación, los insumos de antes no se aceptan", async () => {
    db.generation.findUnique.mockRejectedValue(new Error("db caída"));
    await runGeneration(base({ blobFiles: [ref(`${HOST}/monthly/prop1/2026-5/1700-acta-AbC123.txt`)] }));
    expect(ultimoEstado()).toMatchObject({ status: "failed" });
  });

  it("con insumos propios no consulta la generación (sin costo extra)", async () => {
    await runGeneration(base());
    expect(db.generation.findUnique).not.toHaveBeenCalled();
  });
});

describe("runGeneration: limpieza de insumos", () => {
  it("borra solo los insumos propios (cleanupInputs)", async () => {
    await runGeneration(base({ blobFiles: [propio("a"), propio("b")], cleanupInputs: true }));
    expect(ultimoEstado()).toMatchObject({ status: "completed" });
    expect(del).toHaveBeenCalledWith([propio("a").url, propio("b").url]);
  });

  it("NO borra un insumo que es documento de la copropiedad", async () => {
    db.propertyDocument.findMany.mockResolvedValue([{ url: propio("reglamento").url }]);
    await runGeneration(base({ blobFiles: [propio("reglamento"), propio("insumo")], cleanupInputs: true }));
    expect(ultimoEstado()).toMatchObject({ status: "completed" });
    expect(del).toHaveBeenCalledWith([propio("insumo").url]);
  });

  it("sin cleanupInputs (lotes) no borra nada", async () => {
    await runGeneration(base({ blobFiles: [propio("a")] }));
    expect(del).not.toHaveBeenCalled();
  });

  it("si falla la limpieza, la generación sigue completada", async () => {
    del.mockRejectedValue(new Error("blob caído"));
    await runGeneration(base({ cleanupInputs: true }));
    expect(ultimoEstado()).toMatchObject({ status: "completed" });
  });
});
