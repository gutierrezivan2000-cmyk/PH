import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

// El módulo guarda un indicador por proceso: cada prueba carga una copia fresca.
async function cargar() {
  vi.resetModules();
  return import("./ensure-admin-schema");
}

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();

/** Lo que responde la consulta de catálogo cuando falta algo (el camino rápido no se toma) o cuando no falta nada. */
const FALTA_ALGO = [{ clase: "columna", objeto: "UsageRecord.refId" }];
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

describe("ensureAdminSchema", () => {
  it("ejecuta todas las sentencias una vez y no vuelve a ejecutarlas en la misma vida del proceso", async () => {
    const { ensureAdminSchema, SENTENCIAS_ADMIN } = await cargar();
    await ensureAdminSchema();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
    await ensureAdminSchema();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
  });

  it("si alguna sentencia falla NO se memoiza: la siguiente llamada lo reintenta todo", async () => {
    let fallar = true;
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (fallar && sql.includes('"PendingOrder_ref_key"')) throw new Error("conexión caída");
      return 0;
    });
    const { ensureAdminSchema, SENTENCIAS_ADMIN } = await cargar();
    await ensureAdminSchema();
    // Una sentencia fallida no frena a las demás.
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
    fallar = false;
    await ensureAdminSchema();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length * 2);
    await ensureAdminSchema();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length * 2);
  });

  it("en demo no toca la base", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { ensureAdminSchema } = await cargar();
    await ensureAdminSchema();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("crea primero las ocho tablas base (User, Account, Session, VerificationToken, Subscription, Property, Generation, UsageRecord)", async () => {
    const { SENTENCIAS_ADMIN } = await cargar();
    const todas = SENTENCIAS_ADMIN.map(normaliza);
    const base = ["User", "Account", "Session", "VerificationToken", "Subscription", "Property", "Generation", "UsageRecord"];
    for (const tabla of base) {
      const creacion = todas.findIndex((s) => s.startsWith(`CREATE TABLE IF NOT EXISTS "${tabla}" (`));
      expect(creacion, `falta CREATE TABLE de ${tabla}`).toBeGreaterThanOrEqual(0);
      // Ninguna sentencia que mencione la tabla puede ir antes de su CREATE TABLE.
      const primerUso = todas.findIndex((s) => s.includes(`"${tabla}"`));
      expect(primerUso, `${tabla} se usa antes de crearse`).toBe(creacion);
    }
    // Las claves foráneas de las tablas base apuntan a User/Property: van después de crearlas.
    expect(todas[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "User" \(/);
  });

  it("agrega con ALTER las columnas de las tablas base que se sumaron después del primer `db push` (User.passwordHash, Generation.progress)", async () => {
    const { SENTENCIAS_ADMIN } = await cargar();
    const todas = SENTENCIAS_ADMIN.map(normaliza);
    expect(todas).toContain(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT`);
    expect(todas).toContain(`ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0`);
  });

  it("los únicos de las tablas base no pueden impedir el auto-reparado: un índice imposible de crear solo avisa", async () => {
    const { SENTENCIAS_ADMIN } = await cargar();
    const unicos = SENTENCIAS_ADMIN.map(normaliza).filter((s) => /^DO \$\$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "(User|Account|Session|VerificationToken|Subscription)_/.test(s));
    expect(unicos.length).toBe(8);
    for (const s of unicos) expect(s).toContain("EXCEPTION WHEN OTHERS THEN RAISE NOTICE");
  });

  it("PropertyDocument se crea aquí (la leen rutas ajenas a los agentes) y extractedText está en el CREATE y en un ALTER posterior", async () => {
    const { SENTENCIAS_ADMIN } = await cargar();
    const todas = SENTENCIAS_ADMIN.map(normaliza);
    const iCreate = todas.findIndex((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "PropertyDocument" ('));
    const iAlter = todas.indexOf('ALTER TABLE "PropertyDocument" ADD COLUMN IF NOT EXISTS "extractedText" TEXT');
    expect(iCreate).toBeGreaterThanOrEqual(0);
    expect(todas[iCreate]).toContain('"extractedText" TEXT');
    expect(iAlter).toBeGreaterThan(iCreate);
    // Su clave foránea apunta a Property, que se crea antes.
    const iFk = todas.findIndex((s) => s.includes('"PropertyDocument_propertyId_fkey"'));
    expect(iFk).toBeGreaterThan(iCreate);
    expect(todas.findIndex((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "Property" ('))).toBeLessThan(iFk);
  });

  it("Generation.meetingId y su índice se crean aquí: Prisma la pide en toda consulta a Generation, aunque Reuniones nunca haya corrido", async () => {
    const { SENTENCIAS_ADMIN } = await cargar();
    const todas = SENTENCIAS_ADMIN.map(normaliza);
    expect(todas).toContain('ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "meetingId" TEXT');
    expect(todas).toContain('CREATE INDEX IF NOT EXISTS "Generation_meetingId_idx" ON "Generation"("meetingId")');
    // Y NO lleva clave foránea: borrar una reunión no debe borrar el acta (ver el esquema).
    expect(todas.some((s) => s.includes('ALTER TABLE "Generation" ADD CONSTRAINT "Generation_meetingId'))).toBe(false);
  });
});

describe("ensureAdminSchema: camino rápido (una consulta al catálogo en vez de 160 sentencias)", () => {
  it("con todo el esquema ya creado no ejecuta NINGUNA sentencia de DDL: una sola consulta de solo lectura", async () => {
    db.$queryRawUnsafe.mockResolvedValue(TODO_EXISTE);
    const { ensureAdminSchema } = await cargar();
    await ensureAdminSchema();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("la consulta es la derivada de SENTENCIAS_ADMIN: cada tabla, columna, índice y restricción que el DDL crearía", async () => {
    db.$queryRawUnsafe.mockResolvedValue(TODO_EXISTE);
    const { ensureAdminSchema, CAMINO_RAPIDO_ADMIN } = await cargar();
    await ensureAdminSchema();
    const sql = String(db.$queryRawUnsafe.mock.calls[0][0]);
    expect(sql).toBe(CAMINO_RAPIDO_ADMIN.consulta());
    expect(sql).toContain("('UsageRecord', 'refId')"); // del ALTER de consumo
    expect(sql).toContain("('Generation', 'meetingId')");
    expect(sql).toContain("('Generation', 'Generation_meetingId_idx')");
    expect(sql).toContain("('Account', 'Account_userId_fkey')"); // dentro de un DO/EXCEPTION
    expect(sql).not.toContain("User_email_key"); // único de mejor esfuerzo: opcional
    expect(sql).toContain("('CommonAsset', 'CommonAsset_pkey')");
    expect(CAMINO_RAPIDO_ADMIN.esperados().noEntendidas).toEqual([]);
  });

  it("memoiza: la segunda llamada ni consulta ni ejecuta nada", async () => {
    db.$queryRawUnsafe.mockResolvedValue(TODO_EXISTE);
    const { ensureAdminSchema } = await cargar();
    await ensureAdminSchema();
    await ensureAdminSchema();
    await ensureAdminSchema();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("si falta UN objeto, corre todo el SQL de arranque (no solo lo que falta) y luego memoiza", async () => {
    const { ensureAdminSchema, SENTENCIAS_ADMIN } = await cargar();
    await ensureAdminSchema();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
    await ensureAdminSchema();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
  });

  it("si la consulta de catálogo falla, cae al SQL de arranque de siempre (y no rompe nada)", async () => {
    db.$queryRawUnsafe.mockRejectedValue(new Error("permiso denegado para pg_catalog"));
    const { ensureAdminSchema, SENTENCIAS_ADMIN } = await cargar();
    await expect(ensureAdminSchema()).resolves.toBeUndefined();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
    await ensureAdminSchema(); // corrida limpia: memoizada
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
  });

  it("si la consulta no devuelve una lista, tampoco se fía: corre el SQL", async () => {
    db.$queryRawUnsafe.mockResolvedValue(undefined);
    const { ensureAdminSchema, SENTENCIAS_ADMIN } = await cargar();
    await ensureAdminSchema();
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
  });

  it("un fallo del DDL tras el camino lento sigue sin memoizarse: la siguiente llamada vuelve a consultar y a reintentar", async () => {
    let fallar = true;
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (fallar && sql.includes('"PendingOrder_ref_key"')) throw new Error("conexión caída");
      return 0;
    });
    const { ensureAdminSchema, SENTENCIAS_ADMIN } = await cargar();
    await ensureAdminSchema();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    fallar = false;
    db.$queryRawUnsafe.mockResolvedValue(TODO_EXISTE); // entre tanto alguien aplicó el esquema
    await ensureAdminSchema();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length); // la segunda vez ya no hizo falta
    await ensureAdminSchema();
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it("llamadas simultáneas de una instancia en frío comparten una sola ejecución", async () => {
    const { ensureAdminSchema, SENTENCIAS_ADMIN } = await cargar();
    await Promise.all([ensureAdminSchema(), ensureAdminSchema(), ensureAdminSchema()]);
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(SENTENCIAS_ADMIN.length);
  });

  it("en demo no toca la base ni para consultar el catálogo", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { ensureAdminSchema } = await cargar();
    await ensureAdminSchema();
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("las columnas de consumo de UsageRecord vienen de la lista compartida con registrar.ts (una sola copia, en su sitio)", async () => {
    const { SENTENCIAS_ADMIN } = await cargar();
    const { SENTENCIAS_COLUMNAS_CONSUMO } = await import("./consumo/esquema");
    expect(SENTENCIAS_COLUMNAS_CONSUMO).toHaveLength(9);
    const inicio = SENTENCIAS_ADMIN.indexOf(SENTENCIAS_COLUMNAS_CONSUMO[0]);
    expect(inicio).toBeGreaterThan(0);
    expect(SENTENCIAS_ADMIN.slice(inicio, inicio + 9)).toEqual(SENTENCIAS_COLUMNAS_CONSUMO);
    // Y no quedó otra copia escrita a mano en el resto de la lista.
    expect(SENTENCIAS_ADMIN.filter((s) => s.startsWith('ALTER TABLE "UsageRecord" ADD COLUMN'))).toHaveLength(9);
  });
});

describe("isMissingColumnError", () => {
  it("reconoce los errores de columna o tabla que faltan", async () => {
    const { isMissingColumnError } = await cargar();
    expect(isMissingColumnError(new Error('column "silences" does not exist'))).toBe(true);
    expect(isMissingColumnError(new Error("Invalid `prisma.user.findMany()` invocation: P2022"))).toBe(true);
    expect(isMissingColumnError(new Error("P2021 The table `public.Meeting` does not exist"))).toBe(true);
    expect(isMissingColumnError("42P01")).toBe(true);
    expect(isMissingColumnError(new Error("timeout"))).toBe(false);
  });
});
