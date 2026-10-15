import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * asegurarColumnasDeConsumo: las nueve columnas de detalle de UsageRecord. La lista sale de ./esquema.ts (la misma que usa
 * ensureAdminSchema, ya no hay una copia escrita a mano) y, antes de ejecutar ningún ALTER, una consulta al catálogo dice si ya
 * existen (cada ADD COLUMN IF NOT EXISTS toma un bloqueo exclusivo de UsageRecord aunque la columna exista).
 */

const { db } = vi.hoisted(() => ({
  db: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn(), usageRecord: { create: vi.fn() } } as Record<string, unknown>,
}));
vi.mock("@/lib/db", () => ({ db }));

const ejecutar = db.$executeRawUnsafe as ReturnType<typeof vi.fn>;
const consultar = db.$queryRawUnsafe as ReturnType<typeof vi.fn>;
const crear = (db.usageRecord as { create: ReturnType<typeof vi.fn> }).create;

// El módulo guarda indicadores por proceso: cada prueba carga una copia fresca.
async function cargar() {
  vi.resetModules();
  const registrar = await import("./registrar");
  const { SENTENCIAS_COLUMNAS_CONSUMO } = await import("./esquema");
  return { ...registrar, SENTENCIAS_COLUMNAS_CONSUMO };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  ejecutar.mockReset().mockResolvedValue(0);
  consultar.mockReset().mockResolvedValue([{ clase: "columna", objeto: "UsageRecord.refId" }]); // por omisión falta algo
  crear.mockReset().mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("asegurarColumnasDeConsumo", () => {
  it("con las columnas ya creadas no ejecuta ningún ALTER: una consulta de catálogo y se memoiza", async () => {
    consultar.mockResolvedValue([]);
    const { asegurarColumnasDeConsumo } = await cargar();
    await asegurarColumnasDeConsumo();
    await asegurarColumnasDeConsumo();
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(ejecutar).not.toHaveBeenCalled();
    // La consulta pregunta exactamente por las nueve columnas.
    const sql = String(consultar.mock.calls[0][0]);
    for (const c of ["provider", "model", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "audioSeconds", "refType", "refId"]) {
      expect(sql).toContain(`('UsageRecord', '${c}')`);
    }
  });

  it("si falta alguna, ejecuta los nueve ALTER de la lista compartida, en su orden, una sola vez", async () => {
    const { asegurarColumnasDeConsumo, SENTENCIAS_COLUMNAS_CONSUMO } = await cargar();
    await asegurarColumnasDeConsumo();
    await asegurarColumnasDeConsumo();
    expect(ejecutar.mock.calls.map((c) => c[0])).toEqual([...SENTENCIAS_COLUMNAS_CONSUMO]);
    expect(SENTENCIAS_COLUMNAS_CONSUMO).toHaveLength(9);
  });

  it("si la consulta de catálogo falla, o la base no la ofrece, ejecuta los ALTER como antes", async () => {
    consultar.mockRejectedValue(new Error("sin permiso sobre pg_catalog"));
    const a = await cargar();
    await a.asegurarColumnasDeConsumo();
    expect(ejecutar).toHaveBeenCalledTimes(9);

    ejecutar.mockClear();
    const guardada = db.$queryRawUnsafe;
    delete db.$queryRawUnsafe; // una base de pruebas sin $queryRawUnsafe
    try {
      const b = await cargar();
      await b.asegurarColumnasDeConsumo();
      expect(ejecutar).toHaveBeenCalledTimes(9);
    } finally {
      db.$queryRawUnsafe = guardada;
    }
  });

  it("si un ALTER falla no se memoiza, pero no se reintenta antes de un minuto; pasado el minuto vuelve a consultar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    ejecutar.mockRejectedValueOnce(new Error("conexión caída"));
    const { asegurarColumnasDeConsumo } = await cargar();
    await asegurarColumnasDeConsumo(); // falla (y lo anota en el log)
    expect(console.error).toHaveBeenCalled();
    await asegurarColumnasDeConsumo(); // dentro del minuto: no hace nada
    expect(consultar).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-05-01T12:01:01Z"));
    consultar.mockResolvedValue([]);
    await asegurarColumnasDeConsumo();
    expect(consultar).toHaveBeenCalledTimes(2);
    await asegurarColumnasDeConsumo(); // ya quedó lista
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it("llamadas concurrentes en frío esperan la MISMA preparación: ninguna crea la fila antes de que existan las columnas", async () => {
    let liberar!: () => void;
    consultar.mockReturnValue(new Promise((r) => { liberar = () => r([]); }));
    const { asegurarColumnasDeConsumo, registrarConsumo } = await cargar();
    const base: Parameters<typeof registrarConsumo>[0] = { tipo: "chat", proveedor: "anthropic", modelo: "claude-sonnet-5", userId: "u1", tokens: { entrada: 10, salida: 1, cacheLectura: 0, cacheEscritura: 0 } };
    const a = asegurarColumnasDeConsumo();
    const b = asegurarColumnasDeConsumo();
    const registros = [registrarConsumo(base), registrarConsumo(base), registrarConsumo(base)];
    await new Promise((r) => setTimeout(r, 10));
    expect(crear).not.toHaveBeenCalled(); // nadie sigue mientras la preparación está en vuelo
    liberar();
    await Promise.all([a, b, ...registros]);
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(crear).toHaveBeenCalledTimes(3);
  });

  it("si la preparación en vuelo falla, los concurrentes terminan igual y no se reintenta dentro del minuto", async () => {
    consultar.mockRejectedValue(new Error("caída"));
    ejecutar.mockRejectedValue(new Error("caída"));
    const { asegurarColumnasDeConsumo } = await cargar();
    await Promise.all([asegurarColumnasDeConsumo(), asegurarColumnasDeConsumo()]);
    await asegurarColumnasDeConsumo();
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("sin $executeRawUnsafe (base de pruebas) no hace nada ni lanza", async () => {
    const guardada = db.$executeRawUnsafe;
    delete db.$executeRawUnsafe;
    try {
      const { asegurarColumnasDeConsumo } = await cargar();
      await expect(asegurarColumnasDeConsumo()).resolves.toBeUndefined();
      expect(consultar).not.toHaveBeenCalled();
    } finally {
      db.$executeRawUnsafe = guardada;
    }
  });

  it("registrarConsumo asegura las columnas antes de guardar la fila y nunca lanza", async () => {
    consultar.mockResolvedValue([]);
    const { registrarConsumo } = await cargar();
    const costo = await registrarConsumo({ tipo: "chat", proveedor: "anthropic", modelo: "claude-sonnet-5", userId: "u1", tokens: { entrada: 1000, salida: 100, cacheLectura: 0, cacheEscritura: 0 } });
    expect(costo).toBeGreaterThan(0);
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(consultar.mock.invocationCallOrder[0]).toBeLessThan(crear.mock.invocationCallOrder[0]);
  });
});

describe("una sola copia del SQL de las columnas de consumo", () => {
  const leer = (ruta: string) => readFileSync(path.resolve(process.cwd(), ruta), "utf8");

  it("registrar.ts ya no trae ALTER TABLE escritos a mano: usa la lista de ./esquema.ts", () => {
    const fuente = leer("src/lib/consumo/registrar.ts");
    expect(fuente).not.toMatch(/ALTER TABLE/);
    expect(fuente).toContain('from "./esquema"');
  });

  it("ensureAdminSchema usa esa misma lista y no repite los ALTER de UsageRecord", () => {
    const fuente = leer("src/lib/ensure-admin-schema.ts");
    expect(fuente).toContain("...SENTENCIAS_COLUMNAS_CONSUMO");
    expect(fuente).not.toMatch(/ALTER TABLE "UsageRecord" ADD COLUMN/);
  });
});
