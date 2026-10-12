import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, del, runGeneration, despues, sesion, limites, uso, rl } = vi.hoisted(() => {
  const d = {
    user: { findUnique: vi.fn(), create: vi.fn() },
    property: { findFirst: vi.fn() },
    generation: { create: vi.fn(), count: vi.fn() },
    propertyDocument: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return {
    db: d,
    del: vi.fn(),
    runGeneration: vi.fn(),
    despues: vi.fn(),
    sesion: { actual: null as { user?: { id?: string; email?: string } } | null },
    limites: { maxFiles: 5 },
    uso: { check: vi.fn() },
    rl: vi.fn(),
  };
});
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => rl(...a) }));
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@vercel/blob", () => ({ del: (...a: unknown[]) => del(...a) }));
vi.mock("@/lib/usage", () => ({
  getGenerationFileLimits: async () => ({ maxFiles: limites.maxFiles }),
  checkUsageLimits: (...a: unknown[]) => uso.check(...a),
}));
vi.mock("@/lib/uso-chat-servidor", () => ({ cupoDeAudioMensual: async () => ({ bloqueado: false }) }));
vi.mock("@/lib/generation/run", async (original) => ({
  ...(await original<typeof import("@/lib/generation/run")>()),
  runGeneration: (...a: unknown[]) => runGeneration(...a),
}));
// `after` solo existe dentro de una petición real: aquí se ejecuta el trabajo en segundo plano a mano.
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (fn: () => unknown) => despues(fn) }));

import { POST } from "./route";
import { MENSAJE_BLOB_AJENO } from "@/lib/blob-owner";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const archivo = (url: string, name = "acta.pdf") => ({ url, name, type: "application/pdf", size: 1000 });
const propio = (n: string) => archivo(`${HOST}/subidas/${U1}/uploads/${n}-AbC123.pdf`, `${n}.pdf`);
const ajeno = (n: string) => archivo(`${HOST}/subidas/${U2}/uploads/${n}-AbC123.pdf`, `${n}.pdf`);

const generar = (blobFiles: unknown) =>
  POST(
    new Request("http://localhost:3000/api/generate/full", {
      method: "POST",
      body: JSON.stringify({ propertyId: "prop1", month: 5, year: 2026, docKind: "informe", blobFiles }),
    }) as never
  );

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  sesion.actual = { user: { id: U1, email: "admin@ph.co" } };
  limites.maxFiles = 5;
  for (const m of [db.user.findUnique, db.user.create, db.property.findFirst, db.generation.create, db.generation.count, db.propertyDocument.findMany, db.$executeRaw, db.$transaction, uso.check, rl, del, runGeneration, despues]) m.mockReset();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.$executeRaw.mockResolvedValue(1);
  db.generation.count.mockResolvedValue(0);
  uso.check.mockResolvedValue({ allowed: true, dailyUsed: 0, monthlyUsed: 0 });
  rl.mockResolvedValue({ allowed: true });
  db.user.findUnique.mockResolvedValue({ id: U1 });
  db.property.findFirst.mockResolvedValue({ id: "prop1", name: "Conjunto Los Pinos" });
  db.generation.create.mockResolvedValue({ id: "gen1" });
  db.propertyDocument.findMany.mockResolvedValue([]);
  del.mockResolvedValue(undefined);
  runGeneration.mockResolvedValue(undefined);
  despues.mockImplementation((fn: () => unknown) => void fn());
});

describe("POST /api/generate/full: dueño de los archivos", () => {
  it("con archivos propios crea la generación y lanza el trabajo con los ids de subida", async () => {
    const r = await generar([propio("a"), propio("b")]);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: "gen1", status: "processing" });
    expect(runGeneration).toHaveBeenCalledTimes(1);
    expect(runGeneration.mock.calls[0][0]).toMatchObject({
      generationId: "gen1",
      userId: U1,
      idsDeSubida: [U1],
      cleanupInputs: true,
      blobFiles: [propio("a"), propio("b")],
    });
  });

  it("RECHAZA (403) un archivo de otro usuario: no crea la generación, no lanza el trabajo, no borra nada", async () => {
    const r = await generar([ajeno("secreto")]);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe(MENSAJE_BLOB_AJENO);
    expect(db.generation.create).not.toHaveBeenCalled();
    expect(runGeneration).not.toHaveBeenCalled();
    // Aunque la petición lo pida, el archivo ajeno no se borra: cualquier otro desenlace sería una fuga destructiva.
    expect(del).not.toHaveBeenCalled();
  });

  it("con un archivo propio y uno ajeno, rechaza todo y solo descarta el propio", async () => {
    const r = await generar([propio("mio"), ajeno("secreto")]);
    expect(r.status).toBe(403);
    expect(runGeneration).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith([propio("mio").url]);
  });

  it("rechaza las rutas de antes (sin dueño) y los trucos de ruta", async () => {
    for (const url of [
      `${HOST}/uploads/1700000-acta.pdf`,
      `${HOST}/subidas/${U1}/../${U2}/uploads/a.pdf`,
      `${HOST}/subidas/${U1}/%2e%2e/${U2}/uploads/a.pdf`,
      `${HOST}/subidas/${U2}/uploads/a.pdf?x=/subidas/${U1}/a.pdf`,
      `https://servidor-del-atacante.example/subidas/${U1}/a.pdf`,
    ]) {
      const r = await generar([archivo(url)]);
      expect(r.status, url).toBe(403);
    }
    expect(runGeneration).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("un elemento que no es un archivo (null, texto) también se rechaza, sin reventar", async () => {
    expect((await generar([null])).status).toBe(403);
    expect((await generar(["texto"])).status).toBe(403);
    expect((await generar([{ name: "x" }])).status).toBe(403);
    expect(runGeneration).not.toHaveBeenCalled();
  });

  it("no borra un archivo propio que es documento de la copropiedad cuando se rechaza por el límite del plan", async () => {
    limites.maxFiles = 1;
    db.propertyDocument.findMany.mockResolvedValue([{ url: propio("reglamento").url }]);
    const r = await generar([propio("reglamento"), propio("insumo")]);
    expect(r.status).toBe(400);
    expect(del).toHaveBeenCalledWith([propio("insumo").url]);
    expect(runGeneration).not.toHaveBeenCalled();
  });

  it("sin archivos sigue funcionando (solo texto)", async () => {
    const r = await generar([]);
    expect(r.status).toBe(200);
    expect(runGeneration).toHaveBeenCalledTimes(1);
  });

  it("acepta un archivo subido con el id de la sesión aunque la base de datos resuelva otro id", async () => {
    db.user.findUnique.mockResolvedValue({ id: U2 });
    db.property.findFirst.mockResolvedValue({ id: "prop1", name: "Conjunto Los Pinos" });
    const r = await generar([propio("a")]);
    expect(r.status).toBe(200);
    expect(runGeneration.mock.calls[0][0]).toMatchObject({ userId: U2, idsDeSubida: [U1, U2] });
  });

  it("sin sesión responde 401 antes de mirar los archivos", async () => {
    sesion.actual = null;
    const r = await generar([propio("a")]);
    expect(r.status).toBe(401);
    expect(runGeneration).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate/full: cupo atómico y ráfagas", () => {
  it("toma el candado por usuario ANTES de contar y crea la generación en la misma transacción", async () => {
    const orden: string[] = [];
    db.$executeRaw.mockImplementation(async () => void orden.push("candado"));
    uso.check.mockImplementation(async () => (orden.push("conteo"), { allowed: true }));
    db.generation.create.mockImplementation(async () => (orden.push("crear"), { id: "gen1" }));
    const r = await generar([]);
    expect(r.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(orden).toEqual(["candado", "conteo", "crear"]);
  });

  it("sobre el tope diario responde 429 y no crea la generación ni lanza el trabajo", async () => {
    uso.check.mockResolvedValue({ allowed: false, reason: "Límite diario", dailyUsed: 3, monthlyUsed: 3 });
    const r = await generar([propio("a")]);
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: "Límite diario", dailyUsed: 3 });
    expect(db.generation.create).not.toHaveBeenCalled();
    expect(runGeneration).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith([propio("a").url]);
  });

  it("una ráfaga en paralelo con un cupo de 2 deja pasar solo 2 (las peticiones se serializan por usuario)", async () => {
    // Calienta los imports dinámicos de la ruta: con 10 peticiones simultáneas en frío vitest puede resolver el módulo real.
    await generar([]);
    runGeneration.mockClear();
    db.generation.create.mockClear();
    let cola: Promise<unknown> = Promise.resolve();
    db.$transaction.mockImplementation((fn: (tx: typeof db) => Promise<unknown>) => {
      const turno = cola.then(() => fn(db));
      cola = turno.catch(() => {});
      return turno;
    });
    let filas = 0;
    uso.check.mockImplementation(async () => {
      await new Promise((res) => setTimeout(res, 15));
      return filas < 2 ? { allowed: true } : { allowed: false, reason: "tope", dailyUsed: filas, monthlyUsed: filas };
    });
    db.generation.create.mockImplementation(async () => ({ id: `gen${++filas}` }));
    // Se escalonan unos milisegundos (vitest resuelve mal los imports dinámicos de módulos mockeados lanzados exactamente a la vez),
    // pero la verificación de cupo tarda más que el escalón, así que las peticiones siguen solapadas.
    const rs = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        await new Promise((res) => setTimeout(res, i * 3));
        return generar([]);
      })
    );
    expect(rs.filter((r) => r.status === 200)).toHaveLength(2);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(8);
    expect(db.generation.create).toHaveBeenCalledTimes(2);
    expect(runGeneration).toHaveBeenCalledTimes(2);
  });

  it("con 2 generaciones ya en curso rechaza una tercera (429)", async () => {
    db.generation.count.mockResolvedValue(2);
    const r = await generar([]);
    expect(r.status).toBe(429);
    expect(db.generation.create).not.toHaveBeenCalled();
    expect(runGeneration).not.toHaveBeenCalled();
  });

  it("aplica rateLimit por usuario y responde 429 si se excede, sin tocar el cupo", async () => {
    rl.mockResolvedValue({ allowed: false });
    const r = await generar([propio("a")]);
    expect(rl).toHaveBeenCalledWith(`generate:${U1}`, { max: 3, windowMs: 60_000 });
    expect(r.status).toBe(429);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(runGeneration).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith([propio("a").url]);
  });

  it("si la reserva falla (base caída) no genera: 503 en vez de dejar pasar sin límite", async () => {
    db.$transaction.mockRejectedValue(new Error("db caída"));
    const r = await generar([]);
    expect(r.status).toBe(503);
    expect(runGeneration).not.toHaveBeenCalled();
  });

  it("una propiedad ajena (404) no consume cupo", async () => {
    db.property.findFirst.mockResolvedValue(null);
    const r = await generar([]);
    expect(r.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate/full: modo demo", () => {
  it("también rechaza (403) un archivo ajeno, sin descargarlo", async () => {
    vi.resetModules();
    vi.stubEnv("DEMO_MODE", "true");
    sesion.actual = { user: { id: "demo-user-001", email: "demo@phgestion.app" } };
    const { POST: POSTDemo } = await import("./route");
    const r = await POSTDemo(
      new Request("http://localhost:3000/api/generate/full", {
        method: "POST",
        body: JSON.stringify({ propertyId: "demo-prop-1", month: 5, year: 2026, blobFiles: [ajeno("secreto")] }),
      }) as never
    );
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe(MENSAJE_BLOB_AJENO);
  });
});
