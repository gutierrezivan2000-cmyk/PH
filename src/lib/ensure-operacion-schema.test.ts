import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

// El módulo guarda una promesa por proceso: cada prueba carga una copia fresca.
async function cargarModulo() {
  vi.resetModules();
  return import("./ensure-operacion-schema");
}
async function cargar() {
  return (await cargarModulo()).ensureOperacionSchema;
}

/** Lo que responde la consulta de catálogo cuando falta algo (el camino rápido no se toma) o cuando no falta nada. */
const FALTA_ALGO = [{ clase: "tabla", objeto: "PropertyEvent.id" }];
const TODO_EXISTE: unknown[] = [];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(0);
  // Por omisión la base «no está al día»: así las pruebas de abajo ejercen el SQL de arranque. El camino rápido tiene las suyas.
  db.$queryRawUnsafe.mockReset();
  db.$queryRawUnsafe.mockResolvedValue(FALTA_ALGO);
});

describe("ensureOperacionSchema", () => {
  it("crea todas las sentencias una vez y no vuelve a ejecutarlas en la misma vida del proceso", async () => {
    const ensure = await cargar();
    await ensure();
    const primera = db.$executeRawUnsafe.mock.calls.length;
    expect(primera).toBeGreaterThan(5);
    await ensure();
    expect(db.$executeRawUnsafe.mock.calls.length).toBe(primera);
  });

  it("un índice que falla no impide crear las tablas que siguen", async () => {
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.startsWith("CREATE INDEX") && sql.includes("PropertyEvent_propertyId")) throw new Error("ya existe con otro nombre");
      return 0;
    });
    const ensure = await cargar();
    await expect(ensure()).resolves.toBeUndefined();
    const tablas = db.$executeRawUnsafe.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith("CREATE TABLE"));
    expect(tablas.length).toBeGreaterThanOrEqual(4);
    expect(tablas.every((s) => db.$executeRawUnsafe.mock.calls.some((c) => c[0] === s))).toBe(true);
  });

  it("si falla una tabla, la llamada falla y la siguiente lo reintenta (no se cachea el fallo)", async () => {
    let fallar = true;
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (fallar && sql.startsWith('CREATE TABLE IF NOT EXISTS "PropertyMemory"')) throw new Error("sin permiso");
      return 0;
    });
    const ensure = await cargar();
    await expect(ensure()).rejects.toThrow("sin permiso");
    fallar = false;
    const antes = db.$executeRawUnsafe.mock.calls.length;
    await expect(ensure()).resolves.toBeUndefined();
    expect(db.$executeRawUnsafe.mock.calls.length).toBeGreaterThan(antes);
  });
});

describe("ensureOperacionSchema: camino rápido", () => {
  it("con las tablas ya creadas no ejecuta DDL: una sola consulta de catálogo, y se memoiza", async () => {
    db.$queryRawUnsafe.mockResolvedValue(TODO_EXISTE);
    const { ensureOperacionSchema, CAMINO_RAPIDO_OPERACION } = await cargarModulo();
    await ensureOperacionSchema();
    await ensureOperacionSchema();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    // La consulta sale de las mismas sentencias del DDL.
    const sql = String(db.$queryRawUnsafe.mock.calls[0][0]);
    expect(sql).toBe(CAMINO_RAPIDO_OPERACION.consulta());
    for (const objeto of ["('PropertyEvent', 'summary')", "('AgentAction', 'AgentAction_chatId_idx')", "('AgentChatFocus', 'AgentChatFocus_pkey')"]) expect(sql).toContain(objeto);
  });

  it("si falta algo, o la consulta falla, corre todo el SQL de arranque", async () => {
    const { ensureOperacionSchema, SENTENCIAS_OPERACION } = await cargarModulo();
    await ensureOperacionSchema();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_OPERACION.length);

    db.$executeRawUnsafe.mockClear();
    db.$queryRawUnsafe.mockRejectedValue(new Error("sin permiso sobre pg_catalog"));
    const otra = await cargarModulo();
    await otra.ensureOperacionSchema();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_OPERACION.length);
  });

  it("si falla una tabla tras el camino lento sigue sin cachearse: la siguiente llamada vuelve a consultar el catálogo", async () => {
    let fallar = true;
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (fallar && sql.startsWith('CREATE TABLE IF NOT EXISTS "AgentAction"')) throw new Error("sin permiso");
      return 0;
    });
    const ensure = await cargar();
    await expect(ensure()).rejects.toThrow("sin permiso");
    fallar = false;
    db.$queryRawUnsafe.mockResolvedValue(TODO_EXISTE);
    await expect(ensure()).resolves.toBeUndefined();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
