import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ensureMeetingsSchema() es un espejo escrito a mano de los modelos de Reuniones
 * en prisma/schema.prisma. Si alguien cambia uno y olvida el otro, un entorno
 * donde `prisma db push` falló quedaría con tablas distintas a las que espera el
 * cliente. Esta prueba lee el esquema real y exige que ambos coincidan.
 */

const MODELOS = [
  "Meeting", "MeetingSource", "MeetingLivePart", "MeetingTask",
  "MeetingUtterance", "MeetingSpeaker", "MeetingMarker", "PropertyPerson",
] as const;

const TIPO_SQL: Record<string, string> = {
  String: "TEXT", Int: "INTEGER", Float: "DOUBLE PRECISION", Boolean: "BOOLEAN", DateTime: "TIMESTAMP(3)", Json: "JSONB",
};

type Campo = { nombre: string; tipo: string; opcional: boolean; atributos: string };
type Relacion = { campo: string; ref: string; onDelete: string | null };
type Modelo = { campos: Campo[]; relaciones: Relacion[]; indices: string[][]; unicos: string[][] };

const esquema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

function leerModelo(nombre: string): Modelo {
  const bloque = new RegExp(`\\nmodel ${nombre} \\{([\\s\\S]*?)\\n\\}`).exec(esquema);
  if (!bloque) throw new Error(`No encuentro el modelo ${nombre} en schema.prisma`);
  const modelo: Modelo = { campos: [], relaciones: [], indices: [], unicos: [] };
  for (const cruda of bloque[1].split("\n")) {
    const linea = cruda.replace(/\/\/.*$/, "").trim();
    if (!linea) continue;
    const lista = (re: RegExp) => re.exec(linea)?.[1].split(",").map((s) => s.trim());
    if (linea.startsWith("@@index")) {
      modelo.indices.push(lista(/\[([^\]]+)\]/)!);
      continue;
    }
    if (linea.startsWith("@@unique")) {
      modelo.unicos.push(lista(/\[([^\]]+)\]/)!);
      continue;
    }
    const campo = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(linea);
    if (!campo) continue;
    const [, nom, tipo, arreglo, opcional, atributos] = campo;
    if (TIPO_SQL[tipo] && !arreglo) {
      modelo.campos.push({ nombre: nom, tipo, opcional: Boolean(opcional), atributos });
    } else if (atributos.includes("@relation(fields:")) {
      const campoFk = /fields:\s*\[(\w+)\]/.exec(atributos)![1];
      const refTabla = tipo;
      modelo.relaciones.push({
        campo: campoFk,
        ref: refTabla,
        onDelete: /onDelete:\s*(\w+)/.exec(atributos)?.[1] ?? null,
      });
    }
  }
  return modelo;
}

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

function predeterminadoSql(atributos: string): string | null {
  const bruto = contenidoDefault(atributos);
  if (bruto === null) return null;
  const valor = bruto.trim();
  if (valor === "now()") return "CURRENT_TIMESTAMP";
  if (valor === "cuid()" || valor === "uuid()") return null;
  if (valor.startsWith('"')) return `'${valor.slice(1, -1)}'`;
  return valor; // número o booleano
}

let sentencias: string[] = [];

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true"); // `db` crea su cliente al importarse; en demo es un sustituto inerte
  ({ SENTENCIAS_REUNIONES: sentencias } = await import("./ensure-meetings-schema"));
});

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();

describe("ensureMeetingsSchema ↔ prisma/schema.prisma", () => {
  for (const nombre of MODELOS) {
    describe(nombre, () => {
      const modelo = leerModelo(nombre);

      it("crea la tabla con las mismas columnas, tipos, nulabilidad y valores por defecto", () => {
        const create = sentencias.find((s) => s.startsWith(`CREATE TABLE IF NOT EXISTS "${nombre}" (`));
        expect(create, `falta CREATE TABLE de ${nombre}`).toBeTruthy();
        const columnasSql = new Map<string, string>();
        for (const l of create!.split("\n").slice(1)) {
          const linea = l.trim().replace(/,$/, "");
          const m = /^"(\w+)" (.+)$/.exec(linea);
          if (m) columnasSql.set(m[1], m[2]);
        }
        const esperadas = new Map<string, string>();
        for (const c of modelo.campos) {
          const def = predeterminadoSql(c.atributos);
          esperadas.set(c.nombre, `${TIPO_SQL[c.tipo]}${c.opcional ? "" : " NOT NULL"}${def !== null ? ` DEFAULT ${def}` : ""}`);
        }
        expect(Object.fromEntries(columnasSql)).toEqual(Object.fromEntries(esperadas));
        expect(create).toContain(`CONSTRAINT "${nombre}_pkey" PRIMARY KEY ("id")`);
      });

      it("crea los mismos índices y únicos", () => {
        const todas = sentencias.map(normaliza);
        for (const cols of modelo.indices) {
          const esperada = `CREATE INDEX IF NOT EXISTS "${nombre}_${cols.join("_")}_idx" ON "${nombre}"(${cols.map((c) => `"${c}"`).join(", ")})`;
          expect(todas, `falta el índice ${cols.join(",")}`).toContain(esperada);
        }
        for (const cols of modelo.unicos) {
          const esperada = `CREATE UNIQUE INDEX IF NOT EXISTS "${nombre}_${cols.join("_")}_key" ON "${nombre}"(${cols.map((c) => `"${c}"`).join(", ")})`;
          expect(todas, `falta el único ${cols.join(",")}`).toContain(esperada);
        }
        const enSql = todas.filter((s) => new RegExp(`^CREATE (UNIQUE )?INDEX IF NOT EXISTS "${nombre}_`).test(s));
        expect(enSql.length, "índices de más en el SQL").toBe(modelo.indices.length + modelo.unicos.length);
      });

      it("crea las mismas claves foráneas con su ON DELETE", () => {
        const fks = sentencias.map(normaliza).filter((s) => s.includes(`ALTER TABLE "${nombre}" ADD CONSTRAINT`));
        expect(fks.length, "claves foráneas de más o de menos").toBe(modelo.relaciones.length);
        for (const r of modelo.relaciones) {
          const accion = (r.onDelete ?? "Restrict").toUpperCase();
          const buscada = `ADD CONSTRAINT "${nombre}_${r.campo}_fkey" FOREIGN KEY ("${r.campo}") REFERENCES "${r.ref}"("id") ON DELETE ${accion} ON UPDATE CASCADE`;
          expect(fks.some((s) => s.includes(buscada)), `falta la FK ${r.campo} → ${r.ref}`).toBe(true);
        }
      });
    });
  }

  it("Generation.meetingId existe en el esquema y en el SQL, con su índice y SIN clave foránea", () => {
    const generacion = /\nmodel Generation \{([\s\S]*?)\n\}/.exec(esquema)![1];
    expect(generacion).toMatch(/\n\s*meetingId\s+String\?/);
    expect(generacion).toMatch(/@@index\(\[meetingId\]\)/);
    const todas = sentencias.map(normaliza);
    expect(todas).toContain(`ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "meetingId" TEXT`);
    expect(todas).toContain(`CREATE INDEX IF NOT EXISTS "Generation_meetingId_idx" ON "Generation"("meetingId")`);
    expect(todas.some((s) => s.includes(`ALTER TABLE "Generation" ADD CONSTRAINT`))).toBe(false);
  });

  it("las relaciones inversas están en User y en Property", () => {
    const usuario = /\nmodel User \{([\s\S]*?)\n\}/.exec(esquema)![1];
    const propiedad = /\nmodel Property \{([\s\S]*?)\n\}/.exec(esquema)![1];
    expect(usuario).toMatch(/\n\s*meetings\s+Meeting\[\]/);
    expect(propiedad).toMatch(/\n\s*meetings\s+Meeting\[\]/);
    expect(propiedad).toMatch(/\n\s*people\s+PropertyPerson\[\]/);
  });

  it("todas las sentencias son idempotentes (se pueden repetir sin romper)", () => {
    for (const s of sentencias) {
      const n = normaliza(s);
      const ok =
        /^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS /.test(n) ||
        /^ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS /.test(n) ||
        (/^DO \$\$ BEGIN ALTER TABLE/.test(n) && n.includes("EXCEPTION WHEN duplicate_object THEN NULL"));
      expect(ok, `no es idempotente: ${n.slice(0, 90)}`).toBe(true);
    }
  });

  it("solo agrega: ninguna sentencia borra ni renombra", () => {
    // `ON DELETE CASCADE` de las claves foráneas es esquema, no borrado de datos.
    for (const s of sentencias) expect(s).not.toMatch(/\b(DROP|RENAME|TRUNCATE)\b|\bDELETE\s+FROM\b/i);
  });
});
