import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

// El módulo guarda un indicador por proceso: cada prueba carga una copia fresca.
async function cargar() {
  vi.resetModules();
  return import("./ensure-agent-tables");
}

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();

/** Lo que responde la consulta de catálogo cuando falta algo (el camino rápido no se toma) o cuando no falta nada. */
const FALTA_ALGO = [{ clase: "indice", objeto: "AgentChat.AgentChat_userId_agentId_idx" }];
const TODO_EXISTE: unknown[] = [];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(0);
  // Por omisión la base «no está al día»: así las pruebas de abajo ejercen el SQL de arranque. El camino rápido tiene las suyas.
  db.$queryRawUnsafe.mockReset();
  db.$queryRawUnsafe.mockResolvedValue(FALTA_ALGO);
});

describe("ensureAgentTables", () => {
  it("ejecuta todas las sentencias una vez y no vuelve a ejecutarlas en la misma vida del proceso", async () => {
    const { ensureAgentTables, SENTENCIAS_AGENTES } = await cargar();
    await ensureAgentTables();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length);
    await ensureAgentTables();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length);
  });

  it("si alguna sentencia falla NO se memoiza: la siguiente llamada lo reintenta", async () => {
    let fallar = true;
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (fallar && sql.includes('"AgentChat_userId_fkey"')) throw new Error('relation "User" does not exist');
      return 0;
    });
    const { ensureAgentTables, SENTENCIAS_AGENTES } = await cargar();
    await ensureAgentTables();
    fallar = false;
    await ensureAgentTables();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length * 2);
    await ensureAgentTables();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length * 2);
  });

  it("en demo no toca la base", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { ensureAgentTables } = await cargar();
    await ensureAgentTables();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("solo crea las tablas de los agentes: PropertyDocument se crea en ensureAdminSchema", async () => {
    const { SENTENCIAS_AGENTES } = await cargar();
    const creadas = SENTENCIAS_AGENTES.map(normaliza)
      .map((s) => /^CREATE TABLE IF NOT EXISTS "(\w+)"/.exec(s)?.[1])
      .filter(Boolean);
    expect(creadas).toEqual(["AgentChat", "AgentMessage", "AgentMemory"]);
    expect(SENTENCIAS_AGENTES.some((s) => s.includes("PropertyDocument"))).toBe(false);
  });
});

describe("ensureAgentTables: camino rápido", () => {
  it("con las tablas ya creadas no ejecuta DDL: una sola consulta de catálogo, y se memoiza", async () => {
    db.$queryRawUnsafe.mockResolvedValue(TODO_EXISTE);
    const { ensureAgentTables, CAMINO_RAPIDO_AGENTES } = await cargar();
    await ensureAgentTables();
    await ensureAgentTables();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    // La consulta sale de las mismas sentencias del DDL.
    const sql = String(db.$queryRawUnsafe.mock.calls[0][0]);
    expect(sql).toBe(CAMINO_RAPIDO_AGENTES.consulta());
    for (const objeto of ["('AgentChat', 'title')", "('AgentMessage', 'AgentMessage_chatId_fkey')", "('AgentMemory', 'AgentMemory_userId_agentId_key')"]) expect(sql).toContain(objeto);
  });

  it("si falta un objeto corre todo el SQL de arranque y memoiza; si la consulta falla también", async () => {
    const { ensureAgentTables, SENTENCIAS_AGENTES } = await cargar();
    await ensureAgentTables();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length);

    db.$executeRawUnsafe.mockClear();
    db.$queryRawUnsafe.mockRejectedValue(new Error("sin permiso sobre pg_catalog"));
    const otra = await cargar();
    await otra.ensureAgentTables();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length);
    await otra.ensureAgentTables();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length);
  });

  it("llamadas simultáneas comparten una sola ejecución", async () => {
    const { ensureAgentTables, SENTENCIAS_AGENTES } = await cargar();
    await Promise.all([ensureAgentTables(), ensureAgentTables()]);
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_AGENTES.length);
  });

  it("en demo no consulta ni ejecuta nada", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { ensureAgentTables } = await cargar();
    await ensureAgentTables();
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("isMissingRelationError", () => {
  it("reconoce los errores de tabla que falta", async () => {
    const { isMissingRelationError } = await cargar();
    expect(isMissingRelationError(new Error('relation "AgentChat" does not exist'))).toBe(true);
    expect(isMissingRelationError(new Error("P2021"))).toBe(true);
    expect(isMissingRelationError(new Error("timeout"))).toBe(false);
  });
});
