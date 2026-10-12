import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { $executeRawUnsafe: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

// El módulo guarda un indicador por proceso: cada prueba carga una copia fresca.
async function cargar() {
  vi.resetModules();
  return import("./ensure-agent-tables");
}

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(0);
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

describe("isMissingRelationError", () => {
  it("reconoce los errores de tabla que falta", async () => {
    const { isMissingRelationError } = await cargar();
    expect(isMissingRelationError(new Error('relation "AgentChat" does not exist'))).toBe(true);
    expect(isMissingRelationError(new Error("P2021"))).toBe(true);
    expect(isMissingRelationError(new Error("timeout"))).toBe(false);
  });
});
