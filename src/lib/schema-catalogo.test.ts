import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

/**
 * Camino rápido del arranque del esquema (src/lib/schema-catalogo.ts): la consulta única al catálogo que decide si hace falta correr
 * el SQL de los ensure*Schema.
 *
 * Lo que importa de verdad es que NO se desvíe del DDL: los objetos esperados salen de las mismas sentencias, y aquí se comprueba
 * contra un Postgres real (PGlite, si está instalado) que (1) con todo aplicado la consulta no devuelve nada, y (2) si falta CUALQUIERA
 * de los objetos esperados (cada columna, índice y restricción de las cuatro familias, uno por uno) la consulta lo reporta.
 */

vi.mock("@/lib/db", () => ({ db: {} })); // los módulos ensure* importan `db`; aquí solo se leen sus listas de sentencias

import { CAMINO_RAPIDO_ADMIN, SENTENCIAS_ADMIN } from "./ensure-admin-schema";
import { CAMINO_RAPIDO_AGENTES, SENTENCIAS_AGENTES } from "./ensure-agent-tables";
import { CAMINO_RAPIDO_REUNIONES, SENTENCIAS_REUNIONES } from "./ensure-meetings-schema";
import { CAMINO_RAPIDO_OPERACION, SENTENCIAS_OPERACION } from "./ensure-operacion-schema";
import { consultaDeFaltantes, crearCaminoRapido, objetosEsperados, type ObjetosEsperados } from "./schema-catalogo";

const FAMILIAS = [
  { nombre: "admin", sentencias: SENTENCIAS_ADMIN, camino: CAMINO_RAPIDO_ADMIN },
  { nombre: "agentes", sentencias: SENTENCIAS_AGENTES, camino: CAMINO_RAPIDO_AGENTES },
  { nombre: "reuniones", sentencias: SENTENCIAS_REUNIONES, camino: CAMINO_RAPIDO_REUNIONES },
  { nombre: "operacion", sentencias: SENTENCIAS_OPERACION, camino: CAMINO_RAPIDO_OPERACION },
] as const;

const vacio = (): ObjetosEsperados => ({ columnas: [], indices: [], restricciones: [], tipos: [], opcionales: [], noEntendidas: [] });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("objetosEsperados: deriva de las sentencias lo que debe existir", () => {
  it("entiende TODAS las sentencias de las cuatro familias (si una forma nueva no se lee, el camino rápido se apagaría en silencio)", () => {
    for (const f of FAMILIAS) {
      const e = f.camino.esperados();
      expect(e.noEntendidas, `${f.nombre}: sentencias sin entender`).toEqual([]);
      expect(e.columnas.length, f.nombre).toBeGreaterThan(0);
    }
  });

  it("cada CREATE TABLE aporta sus columnas y su clave primaria; cada ALTER ADD COLUMN, su columna; cada índice y clave foránea, el suyo", () => {
    const e = objetosEsperados(SENTENCIAS_ADMIN);
    const col = (tabla: string, columna: string) => e.columnas.some((c) => c.tabla === tabla && c.columna === columna);
    expect(col("User", "id")).toBe(true);
    expect(col("User", "passwordChangedAt")).toBe(true); // del CREATE TABLE y de un ALTER: una sola vez
    expect(e.columnas.filter((c) => c.tabla === "User" && c.columna === "passwordChangedAt")).toHaveLength(1);
    expect(col("UsageRecord", "refId")).toBe(true); // columna que llega por la lista compartida de consumo
    expect(e.restricciones).toContainEqual({ tabla: "User", nombre: "User_pkey" });
    expect(e.restricciones.some((k) => k.tabla === "VerificationToken" && k.nombre.endsWith("_pkey"))).toBe(false); // esa tabla no tiene PK
    expect(e.restricciones).toContainEqual({ tabla: "Account", nombre: "Account_userId_fkey" }); // dentro de un DO/EXCEPTION
    expect(e.indices.some((i) => i.nombre === "User_email_key")).toBe(false); // único de mejor esfuerzo (WHEN OTHERS): opcional
    expect(e.opcionales).toContainEqual({ clase: "indice", tabla: "User", nombre: "User_email_key" });
    expect(e.opcionales).toContainEqual({ clase: "indice", tabla: "PendingOrder", nombre: "PendingOrder_epaycoRef_key" });
    expect(e.indices).toContainEqual({ tabla: "Generation", nombre: "Generation_meetingId_idx" });
    expect(e.tipos).toEqual([]);
  });

  it("no pierde objetos: cuenta igual que un recuento independiente de las sentencias", () => {
    for (const f of FAMILIAS) {
      const texto = f.sentencias.map((s) => s.replace(/\s+/g, " "));
      const e = f.camino.esperados();
      const tablas = new Set(texto.map((s) => /^CREATE TABLE IF NOT EXISTS "(\w+)"/.exec(s)?.[1]).filter(Boolean));
      const indices = new Set(texto.map((s) => /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "(\w+)"/.exec(s)?.[1]).filter(Boolean));
      const fks = new Set(texto.map((s) => /ADD CONSTRAINT "(\w+)"/.exec(s)?.[1]).filter(Boolean));
      const pks = new Set(texto.map((s) => /CONSTRAINT "(\w+_pkey)" PRIMARY KEY/.exec(s)?.[1]).filter(Boolean));
      expect(new Set([...e.indices, ...e.opcionales.filter((o) => o.clase === "indice")].map((i) => i.nombre)), `${f.nombre}: índices`).toEqual(indices);
      expect(new Set([...e.restricciones, ...e.opcionales.filter((o) => o.clase === "restriccion")].map((k) => k.nombre)), `${f.nombre}: restricciones`).toEqual(new Set([...fks, ...pks]));
      for (const t of tablas) expect(e.columnas.some((c) => c.tabla === t), `${f.nombre}: la tabla ${t} no aporta columnas`).toBe(true);
    }
  });

  it("lee los enums (CREATE TYPE) aunque hoy el esquema no tenga", () => {
    const e = objetosEsperados([`DO $$ BEGIN CREATE TYPE "Estado" AS ENUM ('a', 'b'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`]);
    expect(e.tipos).toEqual(["Estado"]);
    expect(e.noEntendidas).toEqual([]);
  });

  it("una sentencia con una forma que no sabe leer queda en noEntendidas", () => {
    const e = objetosEsperados([`CREATE VIEW "V" AS SELECT 1`, `CREATE INDEX IF NOT EXISTS "A_idx" ON "A"("x")`]);
    expect(e.noEntendidas).toHaveLength(1);
    expect(e.indices).toEqual([{ tabla: "A", nombre: "A_idx" }]);
  });
});

describe("objetos de mejor esfuerzo (DO ... EXCEPTION WHEN OTHERS)", () => {
  const unico = `DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "T_x_key" ON "T"("x"); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'no se pudo: %', SQLERRM; END $$`;
  const base = [`CREATE TABLE IF NOT EXISTS "T" ("id" TEXT NOT NULL, "x" TEXT, CONSTRAINT "T_pkey" PRIMARY KEY ("id"))`, `CREATE INDEX IF NOT EXISTS "T_id_idx" ON "T"("id")`];

  it("van a opcionales, no a indices, y la consulta no los nombra; los estrictos (incluso con WHEN duplicate_object) siguen siéndolo", () => {
    const e = objetosEsperados([...base, unico, `DO $$ BEGIN ALTER TABLE "T" ADD CONSTRAINT "T_f_fkey" FOREIGN KEY ("x") REFERENCES "T"("id"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`]);
    expect(e.opcionales).toEqual([{ clase: "indice", tabla: "T", nombre: "T_x_key" }]);
    expect(e.indices).toEqual([{ tabla: "T", nombre: "T_id_idx" }]);
    expect(e.restricciones.map((k) => k.nombre)).toContain("T_f_fkey");
    const sql = consultaDeFaltantes(e);
    expect(sql).not.toContain("T_x_key");
    expect(sql).toContain("T_id_idx");
    expect(sql).toContain("T_f_fkey");
  });

  it("índice de mejor esfuerzo ausente => al día (true); objeto estricto ausente => no al día", async () => {
    const camino = crearCaminoRapido("prueba", [...base, unico]);
    // Simula el catálogo: responde solo con lo que la consulta realmente pregunta y que "no existe".
    const noExisten = (ausentes: string[]) => async (sql: string) => ausentes.filter((a) => sql.includes(`'${a}'`)).map((a) => ({ clase: "x", objeto: a }));
    expect(await camino.alDia(noExisten(["T_x_key"]))).toBe(true);
    expect(await camino.alDia(noExisten(["T_x_key", "T_id_idx"]))).toBe(false);
    expect(await camino.alDia(noExisten(["T_pkey"]))).toBe(false);
  });
});

describe("consultaDeFaltantes", () => {
  it("nombra cada objeto esperado, es de solo lectura, una sola sentencia y va acotada con LIMIT", () => {
    for (const f of FAMILIAS) {
      const e = f.camino.esperados();
      const sql = consultaDeFaltantes(e);
      expect(sql).toMatch(/^SELECT /);
      expect(sql).toMatch(/ LIMIT \d+$/);
      expect(sql).not.toMatch(/;|\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i);
      for (const c of e.columnas) expect(sql).toContain(`('${c.tabla}', '${c.columna}')`);
      for (const i of e.indices) expect(sql).toContain(`('${i.tabla}', '${i.nombre}')`);
      for (const k of e.restricciones) expect(sql).toContain(`('${k.tabla}', '${k.nombre}')`);
    }
  });

  it("omite la parte de los objetos que no hay (una familia sin enums ni claves foráneas no manda VALUES vacíos)", () => {
    const e = vacio();
    e.columnas.push({ tabla: "T", columna: "c" });
    const sql = consultaDeFaltantes(e);
    expect(sql).toContain("pg_attribute");
    expect(sql).not.toContain("pg_indexes");
    expect(sql).not.toContain("pg_constraint");
    expect(sql).not.toContain("pg_type");
    expect(() => consultaDeFaltantes(vacio())).toThrow();
  });

  it("solo acepta identificadores como los de Prisma: nada que pueda cerrar el texto literal", () => {
    const e = vacio();
    e.columnas.push({ tabla: "T", columna: "c'); DROP TABLE x; --" });
    expect(() => consultaDeFaltantes(e)).toThrow(/identificador no válido/);
  });
});

describe("crearCaminoRapido.alDia", () => {
  const sentencias = [`CREATE TABLE IF NOT EXISTS "T" ("id" TEXT NOT NULL, CONSTRAINT "T_pkey" PRIMARY KEY ("id"))`, `CREATE INDEX IF NOT EXISTS "T_id_idx" ON "T"("id")`];

  it("una sola consulta; sin filas = al día", async () => {
    const consultar = vi.fn<(sql: string) => Promise<unknown[]>>(async () => []);
    expect(await crearCaminoRapido("prueba", sentencias).alDia(consultar)).toBe(true);
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultar.mock.calls[0][0]).toContain("'T_id_idx'");
  });

  it("con filas (falta algo) no está al día y avisa cuáles", async () => {
    const consultar = vi.fn<(sql: string) => Promise<unknown[]>>(async () => [{ clase: "indice", objeto: "T.T_id_idx" }]);
    expect(await crearCaminoRapido("prueba", sentencias).alDia(consultar)).toBe(false);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("T.T_id_idx"));
  });

  it("si la consulta falla, o no devuelve una lista, no está al día (y no lanza)", async () => {
    expect(await crearCaminoRapido("prueba", sentencias).alDia(async () => { throw new Error("conexión caída"); })).toBe(false);
    expect(await crearCaminoRapido("prueba", sentencias).alDia(async () => undefined)).toBe(false);
    expect(await crearCaminoRapido("prueba", sentencias).alDia(() => { throw new TypeError("db.$queryRawUnsafe is not a function"); })).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it("con sentencias que no sabe leer no consulta nada: no puede asegurar que existe todo", async () => {
    const consultar = vi.fn<(sql: string) => Promise<unknown[]>>(async () => []);
    expect(await crearCaminoRapido("prueba", [...sentencias, `CREATE VIEW "V" AS SELECT 1`]).alDia(consultar)).toBe(false);
    expect(consultar).not.toHaveBeenCalled();
  });

  it("un identificador raro desactiva el atajo en vez de romper el arranque", async () => {
    const consultar = vi.fn<(sql: string) => Promise<unknown[]>>(async () => []);
    expect(await crearCaminoRapido("prueba", [`CREATE INDEX IF NOT EXISTS "9malo" ON "T"("id")`]).alDia(consultar)).toBe(false);
    expect(consultar).not.toHaveBeenCalled();
  });
});

/* ───────────────────────── Contra un Postgres real (PGlite), si está instalado ───────────────────────── */

// PGlite llega como dependencia de `prisma` (no está en package.json): si algún día desaparece, estas pruebas se omiten.
let PGliteClase: typeof PGlite | null = null;
try {
  ({ PGlite: PGliteClase } = await import("@electric-sql/pglite"));
} catch {
  PGliteClase = null;
}

describe.skipIf(!PGliteClase)("la consulta de catálogo sobre un Postgres real (PGlite)", () => {
  let pg: PGlite;
  const consultar = async (sql: string) => (await pg.query(sql)).rows;
  /** Las cuatro familias, en el orden real de una base nueva. */
  const aplicarTodo = async () => {
    for (const f of FAMILIAS) for (const sql of f.sentencias) await pg.exec(sql);
  };
  const faltantes = async (e: ObjetosEsperados) => ((await consultar(consultaDeFaltantes(e, 5000))) as { clase: string; objeto: string }[]).map((r) => `${r.clase}:${r.objeto}`);

  beforeAll(async () => {
    pg = new PGliteClase!();
    await pg.waitReady;
  }, 120_000);
  afterAll(async () => {
    await pg?.close();
  });

  it("en una base VACÍA no está al día ninguna familia, y reporta qué falta", async () => {
    for (const f of FAMILIAS) {
      expect(await f.camino.alDia(consultar), f.nombre).toBe(false);
      expect((await faltantes(f.camino.esperados())).length, f.nombre).toBeGreaterThan(0);
    }
  });

  it("legado con filas repetidas: el único de mejor esfuerzo no se puede crear y aun así las cuatro familias están al día", async () => {
    await aplicarTodo();
    await pg.exec(`DROP INDEX "User_email_key"`);
    await pg.exec(`INSERT INTO "User" ("id","email","updatedAt") VALUES ('u1','dup@x.co',now()), ('u2','dup@x.co',now())`);
    await pg.exec(`DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email"); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'x'; END $$`); // no puede
    expect((await consultar(`SELECT 1 FROM pg_indexes WHERE indexname = 'User_email_key'`)).length).toBe(0);
    for (const f of FAMILIAS) expect(await f.camino.alDia(consultar), f.nombre).toBe(true);
    await pg.exec(`DELETE FROM "User"`);
    await pg.exec(`CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`);
  });

  it("con todo el SQL aplicado, la consulta no devuelve nada: las cuatro familias están al día (el camino rápido se toma)", async () => {
    await aplicarTodo();
    for (const f of FAMILIAS) {
      expect(await faltantes(f.camino.esperados()), f.nombre).toEqual([]);
      expect(await f.camino.alDia(consultar), f.nombre).toBe(true);
    }
  }, 120_000);

  it("si falta UN objeto cualquiera (columna, índice, restricción) lo detecta: uno por uno, los de las cuatro familias", async () => {
    let comprobados = 0;
    for (const f of FAMILIAS) {
      const e = f.camino.esperados();
      const casos: { objeto: string; clase: string; ddl: string }[] = [
        ...e.columnas.map((c) => ({ clase: "columna", objeto: `${c.tabla}.${c.columna}`, ddl: `ALTER TABLE "${c.tabla}" DROP COLUMN "${c.columna}" CASCADE` })),
        ...e.indices.map((i) => ({ clase: "indice", objeto: `${i.tabla}.${i.nombre}`, ddl: `DROP INDEX "${i.nombre}"` })),
        ...e.restricciones.map((k) => ({ clase: "restriccion", objeto: `${k.tabla}.${k.nombre}`, ddl: `ALTER TABLE "${k.tabla}" DROP CONSTRAINT "${k.nombre}" CASCADE` })),
      ];
      for (const caso of casos) {
        // Un solo objeto en la consulta (la misma forma que la real, más corta) y todo dentro de una transacción que se deshace.
        const solo = vacio();
        if (caso.clase === "columna") solo.columnas.push(e.columnas.find((c) => `${c.tabla}.${c.columna}` === caso.objeto)!);
        if (caso.clase === "indice") solo.indices.push(e.indices.find((i) => `${i.tabla}.${i.nombre}` === caso.objeto)!);
        if (caso.clase === "restriccion") solo.restricciones.push(e.restricciones.find((k) => `${k.tabla}.${k.nombre}` === caso.objeto)!);
        await pg.exec("BEGIN");
        try {
          expect(await faltantes(solo), `antes de quitar ${caso.objeto} ya faltaba`).toEqual([]);
          await pg.exec(caso.ddl);
          expect(await faltantes(solo), `quitar ${caso.objeto} no se detectó`).toEqual([`${caso.clase}:${caso.objeto}`]);
          comprobados++;
        } finally {
          await pg.exec("ROLLBACK");
        }
      }
    }
    expect(comprobados).toBeGreaterThan(500);
    // Y nada quedó cambiado.
    for (const f of FAMILIAS) expect(await f.camino.alDia(consultar), f.nombre).toBe(true);
  }, 120_000);

  it("con la consulta REAL de cada familia: quitar un solo objeto la saca del camino rápido, y repetir el SQL la devuelve", async () => {
    const casos: { familia: (typeof FAMILIAS)[number]; ddl: string; objeto: string }[] = [
      { familia: FAMILIAS[0], ddl: `ALTER TABLE "UsageRecord" DROP COLUMN "refId"`, objeto: "UsageRecord.refId" },
      { familia: FAMILIAS[0], ddl: `ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey"`, objeto: "Account.Account_userId_fkey" },
      { familia: FAMILIAS[1], ddl: `DROP INDEX "AgentChat_userId_agentId_idx"`, objeto: "AgentChat.AgentChat_userId_agentId_idx" },
      { familia: FAMILIAS[2], ddl: `ALTER TABLE "Meeting" DROP COLUMN "silences"`, objeto: "Meeting.silences" },
      { familia: FAMILIAS[3], ddl: `DROP TABLE "AgentChatFocus"`, objeto: "AgentChatFocus.chatId" },
    ];
    for (const { familia, ddl, objeto } of casos) {
      await pg.exec(ddl);
      expect(await familia.camino.alDia(consultar), `${familia.nombre} tras «${ddl}»`).toBe(false);
      const lista = await faltantes(familia.camino.esperados());
      expect(lista.some((x) => x.endsWith(`:${objeto}`)), `${objeto} debía figurar entre los faltantes: ${lista.slice(0, 5).join(", ")}`).toBe(true);
      // Lo que falta en una familia no saca a las demás del camino rápido.
      for (const otra of FAMILIAS) if (otra !== familia) expect(await otra.camino.alDia(consultar), `${otra.nombre} no debía verse afectada`).toBe(true);
      for (const sql of familia.sentencias) await pg.exec(sql); // el SQL de arranque lo repara
      expect(await familia.camino.alDia(consultar), `${familia.nombre} tras repararla`).toBe(true);
    }
  }, 120_000);

  it("un enum que falta se detecta, y existir con otro nombre no cuenta", async () => {
    const crear = `DO $$ BEGIN CREATE TYPE "EstadoPrueba" AS ENUM ('a', 'b'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    const camino = crearCaminoRapido("prueba-enum", [crear]);
    expect(await camino.alDia(consultar)).toBe(false);
    await pg.exec(`CREATE TYPE "OtroEstado" AS ENUM ('a')`);
    expect(await camino.alDia(consultar)).toBe(false);
    await pg.exec(crear);
    expect(await camino.alDia(consultar)).toBe(true);
  });

  it("mira el esquema actual (current_schema): lo que existe en otro esquema no cuenta", async () => {
    await pg.exec(`CREATE SCHEMA otro`);
    await pg.exec(`SET search_path TO otro`);
    try {
      expect(await CAMINO_RAPIDO_OPERACION.alDia(consultar), "en «otro» no hay nada").toBe(false);
      for (const sql of SENTENCIAS_OPERACION) await pg.exec(sql); // se crean en «otro», el primero del search_path
      expect(await CAMINO_RAPIDO_OPERACION.alDia(consultar), "ya creadas en «otro»").toBe(true);
    } finally {
      await pg.exec(`SET search_path TO public`);
    }
    expect(await CAMINO_RAPIDO_OPERACION.alDia(consultar), "las de «public» siguen en su sitio").toBe(true);
  });
});
