import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { $executeRawUnsafe: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

// El módulo guarda una promesa por proceso: cada prueba carga una copia fresca.
async function cargar() {
  vi.resetModules();
  const mod = await import("./ensure-operacion-schema");
  return mod.ensureOperacionSchema;
}

beforeEach(() => {
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(0);
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
