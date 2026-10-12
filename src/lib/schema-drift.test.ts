import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

/**
 * Deriva entre prisma/schema.prisma y el SQL que crea la base en tiempo de ejecución.
 *
 * El `build` ya NO corre `prisma db push` (en Prisma 7 fallaba en cada despliegue, el `|| echo` lo tapaba y el esquema nunca se
 * aplicó por ahí). Una tabla, columna, índice o clave foránea existe en producción SOLO si lo crea alguna de estas sentencias:
 * ensureAdminSchema, ensureAgentTables, ensureMeetingsSchema, ensureOperacionSchema o POST /api/admin/migrate (que las ejecuta
 * todas). Si alguien agrega un modelo o una columna al esquema y olvida su SQL, el código nuevo moriría en producción con
 * «relation/column does not exist». Esta prueba lo vuelve un fallo de CI.
 *
 * Qué comprueba (análisis estático del SQL, sin base de datos):
 *   1. Cada modelo tiene su CREATE TABLE; cada columna, su tipo, nulabilidad y valor por defecto; cada clave primaria.
 *   2. Cada @@index, @@unique y @unique tiene su CREATE [UNIQUE] INDEX con el nombre que usa Prisma, y cada relación su clave
 *      foránea con el mismo ON DELETE. Y al revés: no sobra SQL de algo que el esquema ya no declara.
 *   3. Una columna nueva en una tabla ya publicada necesita su ALTER ... ADD COLUMN IF NOT EXISTS, no solo el CREATE TABLE
 *      (las bases que ya tienen la tabla no se enteran del CREATE; así se quedó sin `Meeting.silences` una base de M0).
 *   4. Todo el SQL es idempotente y solo agrega, y cada familia solo depende de sí misma y de las tablas base.
 * Y, si PGlite (Postgres real compilado a WASM) está instalado, ejecuta las sentencias sobre una base vacía y sobre una a la que
 * se le quitaron las columnas de los ALTER: así se atrapan los errores de sintaxis y de orden que el análisis estático no ve.
 */

vi.mock("@/lib/db", () => ({ db: {} })); // los módulos ensure* importan `db`; aquí solo se leen sus listas de sentencias

import { SENTENCIAS_ADMIN } from "./ensure-admin-schema";
import { SENTENCIAS_AGENTES } from "./ensure-agent-tables";
import { SENTENCIAS_REUNIONES } from "./ensure-meetings-schema";
import { SENTENCIAS_OPERACION } from "./ensure-operacion-schema";

/* ───────────────────────── Listas de excepciones (cada entrada se explica) ───────────────────────── */

/**
 * Tablas base: las crea ensureAdminSchema y de ellas cuelgan las claves foráneas de las demás familias. Cualquier otra familia
 * puede apoyarse en ellas sin crearlas; entre sí no pueden depender (el orden de las llamadas en runtime no está garantizado).
 */
const MODELOS_BASE = ["User", "Account", "Session", "VerificationToken", "Subscription", "Property", "Generation", "UsageRecord"];

/**
 * Cosas del esquema que a propósito NO tienen SQL en runtime. Clave: «Modelo», «Modelo.columna», «Modelo_nombre_del_indice» o
 * «Modelo_columna_fkey». Valor: el motivo. HOY NO SE EXCLUYE NADA: todo el esquema tiene su SQL. Si agregas una entrada, la prueba
 * exige que siga siendo necesaria (si el SQL aparece, hay que quitarla) y que explique el motivo.
 */
const EXCLUIDOS: Record<string, string> = {};

/**
 * Diferencias CONOCIDAS entre el SQL que genera Prisma (`prisma migrate diff --from-empty`) y el de los ensure*. Todas son más
 * estrictas o más permisivas sin romper al cliente. Cualquier diferencia nueva que no esté aquí hace fallar la prueba.
 */
const MOTIVO_LISTA_NOT_NULL =
  "Prisma deja las listas escalares (String[]) sin NOT NULL; aquí van NOT NULL DEFAULT ARRAY[]::TEXT[]. Es más estricto y compatible: el cliente de Prisma nunca escribe NULL en una lista, y las bases creadas por el ALTER histórico ya la tienen así.";
const MOTIVO_UPDATED_AT_DEFAULT =
  "El campo es @updatedAt: Prisma no le pone DEFAULT en la base (lo rellena el cliente) y aquí lleva DEFAULT CURRENT_TIMESTAMP para que una fila insertada sin ese campo (SQL a mano, filas heredadas) no viole el NOT NULL.";
const DIFERENCIAS_CON_PRISMA: Record<string, string> = {
  "Subscription.addonAgents": MOTIVO_LISTA_NOT_NULL,
  "GenerationBatch.docTypes": MOTIVO_LISTA_NOT_NULL,
  "Generation.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "Ticket.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "PropertyMonthlyData.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "ComplianceRecord.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "Unit.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "Pqrs.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "Budget.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "Assembly.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
  "CommonAsset.updatedAt": MOTIVO_UPDATED_AT_DEFAULT,
};

/**
 * Cuántas columnas de cada tabla existían cuando la tabla se creó (y por eso pueden estar SOLO en el CREATE TABLE, sin ALTER).
 * Toda columna que llegó después a una tabla ya publicada necesita su `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`: sin él, una
 * base que ya tenía la tabla nunca la recibe. Si esta prueba falla porque una tabla tiene MÁS columnas solo-CREATE de las
 * esperadas, agrega el ALTER (el número no cambia). Si el modelo es nuevo, apunta aquí cuántas columnas tiene.
 */
const COLUMNAS_DE_NACIMIENTO: Record<string, number> = {
  User: 12, Account: 12, Session: 4, VerificationToken: 3, Subscription: 11, Property: 8, Generation: 15, UsageRecord: 6,
  Ticket: 9, TicketMessage: 8, AdminAuditLog: 8, PendingOrder: 10, RateLimit: 4, PropertyMonthlyData: 9, GenerationBatch: 9,
  ComplianceRecord: 12, Unit: 9, Announcement: 9, Pqrs: 13, PqrsMessage: 5, UnitPaymentOrder: 10, Charge: 12, UnitPayment: 11,
  Budget: 7, LedgerEntry: 10, Assembly: 13, Certificate: 12, CommonAsset: 14, PropertyDocument: 8, AgentChat: 6, AgentMessage: 6,
  AgentMemory: 6, Meeting: 22, MeetingSource: 18, MeetingLivePart: 9, MeetingTask: 13, MeetingUtterance: 7, MeetingSpeaker: 11,
  MeetingMarker: 6, PropertyPerson: 7, PropertyEvent: 10, PropertyMemory: 7, AgentAction: 12, AgentChatFocus: 4,
};

/* ───────────────────────── Esquema de Prisma ───────────────────────── */

type Campo = { nombre: string; tipo: string; lista: boolean; opcional: boolean; atributos: string; unico: boolean; id: boolean };
type Relacion = { campo: string; ref: string; referencia: string; onDelete: string | null; onUpdate: string | null; opcional: boolean };
type Modelo = { nombre: string; campos: Campo[]; relaciones: Relacion[]; indices: string[][]; unicos: string[][] };

const TIPO_SQL: Record<string, string> = {
  String: "TEXT", Int: "INTEGER", Float: "DOUBLE PRECISION", Boolean: "BOOLEAN", DateTime: "TIMESTAMP(3)", Json: "JSONB",
};
const ACCION_SQL: Record<string, string> = {
  Cascade: "CASCADE", SetNull: "SET NULL", Restrict: "RESTRICT", NoAction: "NO ACTION", SetDefault: "SET DEFAULT",
};

const esquema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

const enums = [...esquema.matchAll(/\nenum (\w+) \{([\s\S]*?)\n\}/g)].map((m) => ({
  nombre: m[1],
  valores: m[2].split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean),
}));
const nombresEnum = new Set(enums.map((e) => e.nombre));

function leerModelo(nombre: string, cuerpo: string): Modelo {
  const modelo: Modelo = { nombre, campos: [], relaciones: [], indices: [], unicos: [] };
  for (const cruda of cuerpo.split("\n")) {
    const linea = cruda.replace(/\/\/.*$/, "").trim();
    if (!linea) continue;
    const columnas = () => /\[([^\]]+)\]/.exec(linea)![1].split(",").map((s) => s.trim());
    if (linea.startsWith("@@index")) modelo.indices.push(columnas());
    else if (linea.startsWith("@@unique")) modelo.unicos.push(columnas());
    else if (linea.startsWith("@@")) throw new Error(`${nombre}: atributo de modelo sin soporte en esta prueba: ${linea}`);
    else {
      const campo = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(linea);
      if (!campo) continue;
      const [, nom, tipo, lista, opcional, atributos] = campo;
      if (TIPO_SQL[tipo] || nombresEnum.has(tipo)) {
        if (/@db\.(?!Text\b)/.test(atributos)) throw new Error(`${nombre}.${nom}: tipo nativo sin soporte en esta prueba: ${atributos}`);
        modelo.campos.push({
          nombre: nom, tipo, lista: Boolean(lista), opcional: Boolean(opcional), atributos,
          unico: /@unique\b/.test(atributos), id: /@id\b/.test(atributos),
        });
      } else if (/@relation\(/.test(atributos) && /fields:\s*\[/.test(atributos)) {
        modelo.relaciones.push({
          campo: /fields:\s*\[(\w+)\]/.exec(atributos)![1],
          ref: tipo,
          referencia: /references:\s*\[(\w+)\]/.exec(atributos)?.[1] ?? "id",
          onDelete: /onDelete:\s*(\w+)/.exec(atributos)?.[1] ?? null,
          onUpdate: /onUpdate:\s*(\w+)/.exec(atributos)?.[1] ?? null,
          opcional: Boolean(opcional),
        });
      } else if (!/^[A-Z]\w*$/.test(tipo) || !esquema.includes(`\nmodel ${tipo} {`)) {
        // Un tipo que no es escalar conocido, ni enum, ni otro modelo (Decimal, BigInt, Bytes…): esta prueba no sabría compararlo.
        throw new Error(`${nombre}.${nom}: tipo «${tipo}» sin soporte en esta prueba`);
      }
    }
  }
  return modelo;
}

const modelos: Modelo[] = [...esquema.matchAll(/\nmodel (\w+) \{([\s\S]*?)\n\}/g)].map((m) => leerModelo(m[1], m[2]));

/** Contenido de `@default(...)` respetando paréntesis anidados (`now()`, `cuid()`). */
function contenidoDefault(atributos: string): string | null {
  const inicio = atributos.indexOf("@default(");
  if (inicio < 0) return null;
  let profundidad = 0;
  const desde = inicio + "@default(".length;
  for (let i = desde - 1; i < atributos.length; i++) {
    if (atributos[i] === "(") profundidad++;
    else if (atributos[i] === ")" && --profundidad === 0) return atributos.slice(desde, i);
  }
  return null;
}

function predeterminadoSql(modelo: string, c: Campo): string | null {
  const bruto = contenidoDefault(c.atributos);
  if (bruto === null) return null;
  const valor = bruto.trim();
  if (valor === "now()") return "CURRENT_TIMESTAMP";
  if (valor === "cuid()" || valor === "uuid()") return null; // lo genera el cliente de Prisma, no la base
  if (c.lista && valor === "[]") return `ARRAY[]::${TIPO_SQL[c.tipo]}[]`;
  if (valor.startsWith('"')) return `'${valor.slice(1, -1).replace(/'/g, "''")}'`;
  if (/^(true|false|-?\d+(\.\d+)?)$/.test(valor)) return valor;
  if (nombresEnum.has(c.tipo) && /^\w+$/.test(valor)) return `'${valor}'`;
  throw new Error(`${modelo}.${c.nombre}: @default(${valor}) sin soporte en esta prueba`);
}

function tipoSql(c: Campo): string {
  const base = nombresEnum.has(c.tipo) ? `"${c.tipo}"` : TIPO_SQL[c.tipo];
  return c.lista ? `${base}[]` : base;
}

/** Lo que genera Prisma para la columna: tipo, NOT NULL (las listas nunca) y DEFAULT (nunca para @updatedAt). */
function definicionPrisma(modelo: string, c: Campo): string {
  const def = predeterminadoSql(modelo, c);
  return `${tipoSql(c)}${c.opcional || c.lista ? "" : " NOT NULL"}${def !== null ? ` DEFAULT ${def}` : ""}`;
}

/**
 * Cómo debe estar escrita la columna en el SQL de runtime: igual que Prisma, salvo las columnas de DIFERENCIAS_CON_PRISMA, donde
 * la lista va NOT NULL o el @updatedAt lleva DEFAULT CURRENT_TIMESTAMP.
 */
function definicionRuntime(modelo: string, c: Campo): string {
  if (!(`${modelo}.${c.nombre}` in DIFERENCIAS_CON_PRISMA)) return definicionPrisma(modelo, c);
  const def = predeterminadoSql(modelo, c);
  const actualizacion = c.atributos.includes("@updatedAt");
  return `${tipoSql(c)}${c.opcional ? "" : " NOT NULL"}${def !== null ? ` DEFAULT ${def}` : actualizacion ? " DEFAULT CURRENT_TIMESTAMP" : ""}`;
}

const nombreIndice = (m: string, cols: string[], sufijo: "idx" | "key") => `${m}_${cols.join("_")}_${sufijo}`;
const accion = (a: string | null, porDefecto: string) => (a ? ACCION_SQL[a] : porDefecto);

/* ───────────────────────── SQL de runtime, entendido sentencia por sentencia ───────────────────────── */

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();

type Origen = { familia: string; archivo: string; sentencias: string[] };
const ORIGENES: Origen[] = [
  { familia: "admin", archivo: "ensure-admin-schema.ts", sentencias: SENTENCIAS_ADMIN },
  { familia: "agentes", archivo: "ensure-agent-tables.ts", sentencias: SENTENCIAS_AGENTES },
  { familia: "reuniones", archivo: "ensure-meetings-schema.ts", sentencias: SENTENCIAS_REUNIONES },
  { familia: "operacion", archivo: "ensure-operacion-schema.ts", sentencias: SENTENCIAS_OPERACION },
];

const RUTA_MIGRATE = path.resolve(process.cwd(), "src/app/api/admin/migrate/route.ts");
const fuenteMigrate = readFileSync(RUTA_MIGRATE, "utf8");

/** SQL escrito a mano en la ruta de migración (hoy no hay: deriva de los ensure*). Cuenta como cobertura igual que los demás. */
const sentenciasEnMigrate = [...fuenteMigrate.matchAll(/`([^`$]*)`/g)].map((m) => m[1]).filter((s) => /^\s*(CREATE|ALTER|DO)\b/.test(s));

type Fk = { tabla: string; columna: string; ref: string; refColumna: string; onDelete: string; onUpdate: string; origen: string };
type Indice = { tabla: string; columnas: string[]; unico: boolean; origen: string };
type Cobertura = {
  /** columnas del CREATE TABLE: tabla → columna → definición */
  create: Map<string, Map<string, string>>;
  /** columnas agregadas con ALTER: tabla → columna → definiciones (puede haber varias) */
  alter: Map<string, Map<string, string[]>>;
  claves: Map<string, string[]>;
  indices: Map<string, Indice>;
  fks: Map<string, Fk>;
  tipos: Set<string>;
  /** sentencias que el análisis no supo interpretar (una forma nueva de escribir SQL): hacen fallar la prueba */
  noEntendidas: string[];
};

const columnasDeLista = (txt: string) => txt.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));

/** Parte por comas de primer nivel (ignora las de paréntesis y las de textos entre comillas simples). */
function partirPorComas(cuerpo: string): string[] {
  const partes: string[] = [];
  let profundidad = 0, comilla = false, actual = "";
  for (const ch of cuerpo) {
    if (ch === "'") comilla = !comilla;
    if (!comilla && ch === "(") profundidad++;
    if (!comilla && ch === ")") profundidad--;
    if (!comilla && profundidad === 0 && ch === ",") {
      partes.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

/** Quita el envoltorio `DO $$ BEGIN <sentencia>; EXCEPTION WHEN <x> THEN ... END $$`. */
function desenvolver(sql: string): { interna: string; guard: string | null } {
  const m = /^DO \$\$ BEGIN (.+?);? EXCEPTION WHEN (\w+) THEN .* END \$\$$/.exec(sql);
  return m ? { interna: m[1], guard: m[2] } : { interna: sql, guard: null };
}

function interpretar(sentencias: { sql: string; origen: string }[]): Cobertura {
  const cob: Cobertura = {
    create: new Map(), alter: new Map(), claves: new Map(), indices: new Map(), fks: new Map(), tipos: new Set(), noEntendidas: [],
  };
  for (const { sql: cruda, origen } of sentencias) {
    const { interna } = desenvolver(normaliza(cruda));
    let m: RegExpExecArray | null;
    if ((m = /^CREATE TABLE IF NOT EXISTS "(\w+)" \((.*)\)$/.exec(interna))) {
      const columnas = cob.create.get(m[1]) ?? new Map<string, string>();
      cob.create.set(m[1], columnas);
      for (const parte of partirPorComas(m[2])) {
        const pk = /^CONSTRAINT "(\w+)" PRIMARY KEY \((.+)\)$/.exec(parte);
        const col = /^"(\w+)" (.+)$/.exec(parte);
        if (pk) cob.claves.set(m[1], [pk[1], ...columnasDeLista(pk[2])]);
        else if (col) columnas.set(col[1], col[2]);
        else cob.noEntendidas.push(`${origen}: parte de CREATE TABLE "${m[1]}" no entendida: ${parte}`);
      }
    } else if ((m = /^ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)" (.+)$/.exec(interna))) {
      const porTabla = cob.alter.get(m[1]) ?? new Map<string, string[]>();
      cob.alter.set(m[1], porTabla);
      porTabla.set(m[2], [...(porTabla.get(m[2]) ?? []), m[3]]);
    } else if ((m = /^CREATE (UNIQUE )?INDEX IF NOT EXISTS "(\w+)" ON "(\w+)"\((.+)\)$/.exec(interna))) {
      cob.indices.set(m[2], { tabla: m[3], columnas: columnasDeLista(m[4]), unico: Boolean(m[1]), origen });
    } else if (
      (m = /^ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" FOREIGN KEY \("(\w+)"\) REFERENCES "(\w+)"\("(\w+)"\) ON DELETE ([A-Z ]+?) ON UPDATE ([A-Z ]+)$/.exec(interna))
    ) {
      cob.fks.set(m[2], { tabla: m[1], columna: m[3], ref: m[4], refColumna: m[5], onDelete: m[6], onUpdate: m[7], origen });
    } else if ((m = /^CREATE TYPE "(\w+)" AS ENUM \(.*\)$/.exec(interna))) {
      cob.tipos.add(m[1]);
    } else cob.noEntendidas.push(`${origen}: ${normaliza(cruda).slice(0, 120)}`);
  }
  return cob;
}

const todasLasSentencias = [
  ...ORIGENES.flatMap((o) => o.sentencias.map((sql) => ({ sql, origen: o.archivo }))),
  ...sentenciasEnMigrate.map((sql) => ({ sql, origen: "admin/migrate/route.ts" })),
];
const cobertura = interpretar(todasLasSentencias);
const modelosPorNombre = new Map(modelos.map((m) => [m.nombre, m]));

/** Todas las definiciones de una columna: la del CREATE TABLE y las de cada ALTER. */
function definiciones(tabla: string, columna: string): string[] {
  const enCreate = cobertura.create.get(tabla)?.get(columna);
  return [...(enCreate ? [enCreate] : []), ...(cobertura.alter.get(tabla)?.get(columna) ?? [])];
}

/* ───────────────────────── Pruebas estáticas ───────────────────────── */

describe("esquema de Prisma ↔ SQL de runtime (ensure* y /api/admin/migrate)", () => {
  it("lee el esquema entero (44 modelos hoy) y entiende todo el SQL", () => {
    expect(modelos.length).toBeGreaterThanOrEqual(44);
    expect(cobertura.noEntendidas, "SQL escrito de una forma que esta prueba no sabe leer").toEqual([]);
  });

  it("la ruta de migración manual ejecuta las sentencias de las cuatro familias", () => {
    for (const nombre of ["SENTENCIAS_ADMIN", "SENTENCIAS_AGENTES", "SENTENCIAS_REUNIONES", "SENTENCIAS_OPERACION"]) {
      expect(fuenteMigrate, `${nombre} no está en POST /api/admin/migrate`).toContain(nombre);
    }
  });

  it("las tablas base y las de cada familia salen de listas separadas y sin repetir CREATE TABLE entre familias", () => {
    const dueno = new Map<string, string>();
    for (const o of ORIGENES) {
      for (const sql of o.sentencias) {
        const m = /^CREATE TABLE IF NOT EXISTS "(\w+)"/.exec(normaliza(sql));
        if (!m) continue;
        expect(dueno.has(m[1]), `«${m[1]}» se crea en ${dueno.get(m[1])} y en ${o.archivo}`).toBe(false);
        dueno.set(m[1], o.archivo);
      }
    }
    for (const base of MODELOS_BASE) expect(dueno.get(base), `${base} debe crearla ensureAdminSchema`).toBe("ensure-admin-schema.ts");
  });

  for (const modelo of modelos) {
    describe(modelo.nombre, () => {
      const nombre = modelo.nombre;
      const excluido = (clave: string) => clave in EXCLUIDOS;

      it("tiene su CREATE TABLE con la clave primaria del esquema", () => {
        if (excluido(nombre)) return;
        expect(cobertura.create.has(nombre), `ningún ensure* ni la migración crean la tabla «${nombre}»`).toBe(true);
        const id = modelo.campos.find((c) => c.id);
        if (id) expect(cobertura.claves.get(nombre), `clave primaria de ${nombre}`).toEqual([`${nombre}_pkey`, id.nombre]);
        else expect(cobertura.claves.has(nombre), `${nombre} no declara @id en el esquema pero el SQL le pone clave primaria`).toBe(false);
      });

      it("cada columna existe, con el mismo tipo, nulabilidad y valor por defecto", () => {
        for (const c of modelo.campos) {
          const clave = `${nombre}.${c.nombre}`;
          if (excluido(clave) || excluido(nombre)) continue;
          const defs = definiciones(nombre, c.nombre);
          expect(defs.length, `la columna ${clave} no la crea ningún CREATE TABLE ni ALTER`).toBeGreaterThan(0);
          const esperadaRuntime = definicionRuntime(nombre, c);
          for (const d of defs) expect(d, `definición de ${clave}`).toBe(esperadaRuntime);
        }
      });

      it("las columnas que el SQL declara existen en el esquema (no queda SQL de columnas borradas o renombradas)", () => {
        const conocidas = new Set(modelo.campos.map((c) => c.nombre));
        const enSql = [...(cobertura.create.get(nombre)?.keys() ?? []), ...(cobertura.alter.get(nombre)?.keys() ?? [])];
        expect(enSql.filter((c) => !conocidas.has(c))).toEqual([]);
      });

      it("los índices y únicos del esquema existen con el nombre y las columnas de Prisma", () => {
        const esperados: { nombre: string; columnas: string[]; unico: boolean }[] = [
          ...modelo.indices.map((cols) => ({ nombre: nombreIndice(nombre, cols, "idx"), columnas: cols, unico: false })),
          ...modelo.unicos.map((cols) => ({ nombre: nombreIndice(nombre, cols, "key"), columnas: cols, unico: true })),
          ...modelo.campos.filter((c) => c.unico).map((c) => ({ nombre: nombreIndice(nombre, [c.nombre], "key"), columnas: [c.nombre], unico: true })),
        ];
        for (const e of esperados) {
          if (excluido(e.nombre)) continue;
          expect(e.nombre.length, `«${e.nombre}» pasa de 63 caracteres: Postgres lo trunca y el nombre ya no coincide`).toBeLessThanOrEqual(63);
          const real = cobertura.indices.get(e.nombre);
          expect(real, `falta ${e.unico ? "el único" : "el índice"} ${e.nombre}`).toBeTruthy();
          expect({ tabla: real!.tabla, columnas: real!.columnas, unico: real!.unico }).toEqual({ tabla: nombre, columnas: e.columnas, unico: e.unico });
        }
      });

      it("no queda SQL de índices o únicos que el esquema ya no declara", () => {
        const esperados = new Set([
          ...modelo.indices.map((cols) => nombreIndice(nombre, cols, "idx")),
          ...modelo.unicos.map((cols) => nombreIndice(nombre, cols, "key")),
          ...modelo.campos.filter((c) => c.unico).map((c) => nombreIndice(nombre, [c.nombre], "key")),
        ]);
        const sobran = [...cobertura.indices.entries()].filter(([n, i]) => i.tabla === nombre && !esperados.has(n)).map(([n]) => n);
        expect(sobran).toEqual([]);
      });

      it("las relaciones tienen su clave foránea, con el mismo ON DELETE, y no sobra ninguna", () => {
        const esperadas = new Set<string>();
        for (const r of modelo.relaciones) {
          const fkNombre = `${nombre}_${r.campo}_fkey`;
          esperadas.add(fkNombre);
          if (excluido(fkNombre)) continue;
          const real = cobertura.fks.get(fkNombre);
          expect(real, `falta la clave foránea ${fkNombre}`).toBeTruthy();
          expect(real).toMatchObject({
            tabla: nombre, columna: r.campo, ref: r.ref, refColumna: r.referencia,
            onDelete: accion(r.onDelete, r.opcional ? "SET NULL" : "RESTRICT"), onUpdate: accion(r.onUpdate, "CASCADE"),
          });
        }
        const sobran = [...cobertura.fks.entries()].filter(([n, f]) => f.tabla === nombre && !esperadas.has(n)).map(([n]) => n);
        expect(sobran, "claves foráneas en el SQL que el esquema no declara").toEqual([]);
      });
    });
  }

  it("el SQL no crea tablas que el esquema no tiene", () => {
    const conocidas = new Set(modelos.map((m) => m.nombre));
    expect([...cobertura.create.keys()].filter((t) => !conocidas.has(t))).toEqual([]);
    expect([...cobertura.alter.keys()].filter((t) => !conocidas.has(t))).toEqual([]);
  });

  it("los enums del esquema (hoy no hay) tienen su CREATE TYPE con guard de duplicate_object", () => {
    for (const e of enums) {
      const sentencia = todasLasSentencias.map((s) => normaliza(s.sql)).find((s) => s.includes(`CREATE TYPE "${e.nombre}" AS ENUM`));
      expect(sentencia, `falta CREATE TYPE para el enum ${e.nombre}`).toBeTruthy();
      expect(sentencia).toContain("EXCEPTION WHEN duplicate_object THEN NULL");
      for (const v of e.valores) expect(sentencia).toContain(`'${v}'`);
    }
  });

  it("las diferencias con el SQL que genera Prisma son solo las de la lista de excepciones, y cada una sigue siendo una diferencia", () => {
    // Que el SQL de cada columna sea el esperado ya lo comprueba la prueba de cada modelo; aquí se vigila la lista en sí.
    for (const [clave, motivo] of Object.entries(DIFERENCIAS_CON_PRISMA)) {
      const [modelo, columna] = clave.split(".");
      const c = modelosPorNombre.get(modelo)?.campos.find((x) => x.nombre === columna);
      expect(c, `DIFERENCIAS_CON_PRISMA: ${clave} ya no existe`).toBeTruthy();
      expect(definicionRuntime(modelo, c!), `${clave} ya no difiere de Prisma: quítala de DIFERENCIAS_CON_PRISMA`).not.toBe(definicionPrisma(modelo, c!));
      expect(motivo.length, `explica ${clave}`).toBeGreaterThan(40);
    }
  });

  it("las listas de excepciones no tienen entradas viejas ni sin explicar", () => {
    const columnas = new Set(modelos.flatMap((m) => m.campos.map((c) => `${m.nombre}.${c.nombre}`)));
    for (const [clave, motivo] of Object.entries(EXCLUIDOS)) {
      expect(motivo.length, `explica por qué se excluye ${clave}`).toBeGreaterThan(20);
      const existe = modelosPorNombre.has(clave) || columnas.has(clave) || cobertura.indices.has(clave) || cobertura.fks.has(clave);
      expect(existe, `EXCLUIDOS: ${clave} ya no existe en el esquema`).toBe(true);
    }
    for (const nombre of Object.keys(COLUMNAS_DE_NACIMIENTO)) expect(modelosPorNombre.has(nombre), `COLUMNAS_DE_NACIMIENTO: ${nombre} ya no existe`).toBe(true);
  });

  it("toda columna que llegó después de crear la tabla tiene su ALTER ... ADD COLUMN IF NOT EXISTS", () => {
    for (const modelo of modelos) {
      const create = cobertura.create.get(modelo.nombre);
      if (!create || modelo.nombre in EXCLUIDOS) continue;
      const nacidas = COLUMNAS_DE_NACIMIENTO[modelo.nombre];
      expect(nacidas, `modelo nuevo «${modelo.nombre}»: apunta en COLUMNAS_DE_NACIMIENTO cuántas columnas tiene al crearse (${create.size})`).toBeDefined();
      const sinAlter = [...create.keys()].filter((c) => !cobertura.alter.get(modelo.nombre)?.has(c));
      expect(
        sinAlter.length,
        `${modelo.nombre}: ${sinAlter.length} columnas solo están en el CREATE TABLE y se esperaban ${nacidas}. Una base que ya tiene la tabla no recibe columnas nuevas del CREATE: ` +
          `agrega «ALTER TABLE "${modelo.nombre}" ADD COLUMN IF NOT EXISTS …» para la columna nueva (y deja el número como está).`
      ).toBe(nacidas);
    }
  });

  it("todo el SQL es idempotente y aditivo (se puede repetir sin romper y nunca borra ni cambia tipos)", () => {
    for (const { sql, origen } of todasLasSentencias) {
      const n = normaliza(sql);
      const { interna, guard } = desenvolver(n);
      const conGuard = guard !== null;
      const idempotente =
        (!conGuard && /^(CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS |ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS )/.test(interna)) ||
        (conGuard && /^ALTER TABLE "\w+" ADD CONSTRAINT /.test(interna) && guard === "duplicate_object") ||
        (conGuard && /^CREATE (UNIQUE )?INDEX IF NOT EXISTS /.test(interna) && guard === "OTHERS") ||
        (conGuard && /^CREATE TYPE "\w+" AS ENUM/.test(interna) && guard === "duplicate_object");
      expect(idempotente, `${origen}: no es idempotente: ${n.slice(0, 100)}`).toBe(true);
      // `ON DELETE CASCADE` de las claves foráneas es esquema, no borrado de datos; por eso se busca DELETE FROM y no DELETE a secas.
      expect(n, `${origen}: la sentencia borra o cambia datos`).not.toMatch(/\b(DROP|RENAME|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"\w+"\s+SET\b|ALTER COLUMN|ALTER TYPE|\bINSERT\s+INTO\b/i);
    }
  });

  it("cada familia solo depende de sí misma y de las tablas base: no importa en qué orden se llamen los ensure*", () => {
    for (const o of ORIGENES) {
      const disponibles = new Set<string>(o.familia === "admin" ? [] : MODELOS_BASE);
      for (const cruda of o.sentencias) {
        const { interna } = desenvolver(normaliza(cruda));
        const creada = /^CREATE TABLE IF NOT EXISTS "(\w+)"/.exec(interna)?.[1];
        if (creada) disponibles.add(creada);
        const usadas = [
          /^ALTER TABLE "(\w+)"/.exec(interna)?.[1],
          /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "\w+" ON "(\w+)"/.exec(interna)?.[1],
          /REFERENCES "(\w+)"\(/.exec(interna)?.[1],
        ].filter((t): t is string => Boolean(t));
        for (const t of usadas) {
          expect(disponibles.has(t), `${o.archivo}: «${normaliza(cruda).slice(0, 90)}» usa «${t}» antes de que esta familia (o las tablas base) la cree`).toBe(true);
        }
      }
    }
  });
});

/* ───────────────────────── Contra un Postgres real (PGlite), si está instalado ───────────────────────── */

type Foto = { columnas: string[]; indices: string[]; restricciones: string[] };

async function fotografia(pg: PGlite): Promise<Foto> {
  const columnas = await pg.query<{ f: string }>(
    `SELECT c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
            || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') AS f
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY 1`
  );
  const indices = await pg.query<{ f: string }>(`SELECT indexdef AS f FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`);
  const restricciones = await pg.query<{ f: string }>(
    `SELECT conname || ' ' || pg_get_constraintdef(oid) AS f FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conname`
  );
  return { columnas: columnas.rows.map((r) => r.f), indices: indices.rows.map((r) => r.f), restricciones: restricciones.rows.map((r) => r.f) };
}

/** El orden en que las familias suelen correr en una base nueva: la primera petición que llega es el registro (ensureAdminSchema). */
const ORDEN_REAL = ORIGENES.map((o) => ({ familia: o.familia, sentencias: o.sentencias }));

async function correrTodo(pg: PGlite): Promise<string[]> {
  const fallos: string[] = [];
  for (const { familia, sentencias } of ORDEN_REAL) {
    for (const sql of sentencias) {
      try {
        await pg.exec(sql);
      } catch (e) {
        fallos.push(`${familia}: ${normaliza(sql).slice(0, 90)} → ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return fallos;
}

// PGlite llega como dependencia de `prisma` (no está en package.json): si algún día desaparece, estas pruebas se omiten en vez de romper.
let PGliteClase: typeof PGlite | null = null;
try {
  ({ PGlite: PGliteClase } = await import("@electric-sql/pglite"));
} catch {
  PGliteClase = null;
}

describe.skipIf(!PGliteClase)("SQL de runtime sobre un Postgres real (PGlite)", () => {
  let pg: PGlite;
  let fotoInicial: Foto;
  let fallosPrimeraVez: string[];

  beforeAll(async () => {
    pg = new PGliteClase!();
    await pg.waitReady;
    fallosPrimeraVez = await correrTodo(pg);
    fotoInicial = await fotografia(pg);
  }, 120_000);
  afterAll(async () => {
    await pg?.close();
  });

  it("en una base VACÍA todas las sentencias corren sin error, en el orden real de las familias", () => {
    expect(fallosPrimeraVez).toEqual([]);
  });

  it("repetirlas no falla ni cambia nada (idempotencia)", async () => {
    expect(await correrTodo(pg)).toEqual([]);
    expect(await fotografia(pg)).toEqual(fotoInicial);
  }, 120_000);

  it("la base resultante tiene todas las tablas, columnas, tipos, índices y claves foráneas del esquema", () => {
    const esperadasColumnas: string[] = [];
    const esperadosIndices = new Set<string>();
    const esperadasRestricciones = new Set<string>();
    for (const m of modelos) {
      for (const c of m.campos) esperadasColumnas.push(`${m.nombre}.${c.nombre} ${definicionRuntimeCatalogo(m.nombre, c)}`);
      for (const c of m.campos) {
        if (c.id) esperadasRestricciones.add(`${m.nombre}_pkey`);
        if (c.unico) esperadosIndices.add(nombreIndice(m.nombre, [c.nombre], "key"));
      }
      for (const cols of m.indices) esperadosIndices.add(nombreIndice(m.nombre, cols, "idx"));
      for (const cols of m.unicos) esperadosIndices.add(nombreIndice(m.nombre, cols, "key"));
      for (const r of m.relaciones) esperadasRestricciones.add(`${m.nombre}_${r.campo}_fkey`);
    }
    expect(fotoInicial.columnas).toEqual(esperadasColumnas.sort());
    const nombresIndice = fotoInicial.indices.map((d) => /INDEX "?(\w+)"? ON/.exec(d)![1]);
    // Los índices de las claves primarias (`Modelo_pkey`) los crea Postgres solos: se comparan aparte, con las restricciones.
    expect(nombresIndice.filter((n) => !n.endsWith("_pkey")).sort()).toEqual([...esperadosIndices].sort());
    expect(fotoInicial.restricciones.map((r) => r.split(" ")[0]).sort()).toEqual([...esperadasRestricciones].sort());
  });

  it("una base heredada, a la que le faltan las columnas que se agregaron con ALTER, queda igual que una nueva", async () => {
    let quitadas = 0;
    for (const [tabla, columnas] of cobertura.alter) {
      for (const columna of columnas.keys()) {
        await pg.exec(`ALTER TABLE "${tabla}" DROP COLUMN IF EXISTS "${columna}"`); // arrastra sus índices y claves
        quitadas++;
      }
    }
    expect(quitadas, "la prueba casi no quitó columnas: ¿se perdieron los ALTER?").toBeGreaterThan(10);
    expect((await fotografia(pg)).columnas).not.toEqual(fotoInicial.columnas);
    expect(await correrTodo(pg)).toEqual([]);
    expect(await fotografia(pg)).toEqual(fotoInicial);
  }, 120_000);
});

/** Cómo lo describe el catálogo de Postgres (`format_type` + NOT NULL + DEFAULT normalizado) para comparar con la fotografía. */
function definicionRuntimeCatalogo(modelo: string, c: Campo): string {
  const tipos: Record<string, string> = {
    TEXT: "text", INTEGER: "integer", "DOUBLE PRECISION": "double precision", BOOLEAN: "boolean",
    "TIMESTAMP(3)": "timestamp(3) without time zone", JSONB: "jsonb",
  };
  const [, tipo, nulo, def] = /^(.*?)( NOT NULL)?(?: DEFAULT (.*))?$/.exec(definicionRuntime(modelo, c))!;
  const tipoCatalogo = tipos[tipo.replace("[]", "")] + (tipo.endsWith("[]") ? "[]" : "");
  let valor = def ?? null;
  if (valor !== null) {
    if (valor.startsWith("'")) valor = `${valor}::${c.tipo === "Json" ? "jsonb" : "text"}`;
    else if (valor.startsWith("ARRAY")) valor = "ARRAY[]::text[]";
  }
  return `${tipoCatalogo}${nulo ?? ""}${valor !== null ? ` DEFAULT ${valor}` : ""}`;
}
