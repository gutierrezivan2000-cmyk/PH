import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { $executeRawUnsafe: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

// El módulo guarda un indicador por proceso: cada prueba carga una copia fresca.
async function cargar() {
  vi.resetModules();
  return import("./ensure-admin-schema");
}

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(0);
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
