/**
 * Camino rápido del arranque del esquema: UNA consulta al catálogo de Postgres que dice si ya existe todo lo que crearían las
 * sentencias de un ensure*Schema (tablas, columnas, índices, restricciones y enums).
 *
 * Por qué: el SQL de arranque son cientos de sentencias idempotentes (160 solo en ensureAdminSchema) y cada instancia serverless
 * en frío las pagaba TODAS en su primera llamada, una ida y vuelta por sentencia. Además `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
 * toma un bloqueo exclusivo de la tabla aunque la columna exista (y `CREATE INDEX IF NOT EXISTS` un bloqueo compartido), así que
 * en cada arranque en frío había una cola breve de bloqueos sobre tablas calientes (UsageRecord, Generation). Con la base al día,
 * que es el caso normal, ahora basta una consulta de solo lectura.
 *
 * Qué NO cambia: el SQL idempotente sigue siendo el que crea y repara (bases nuevas o con deriva). Aquí solo se decide si hace falta
 * correrlo. Ante CUALQUIER duda (falta un objeto, la consulta falla, una sentencia tiene una forma que no se sabe leer) se responde
 * «no está al día» y el llamador corre el SQL de siempre: el peor caso es el comportamiento de antes más una consulta.
 *
 * Los objetos esperados NO están escritos a mano: se derivan de las mismas sentencias que ejecuta el DDL, así que no pueden desviarse
 * de él (src/lib/schema-drift.test.ts, además, vigila que esas sentencias coincidan con prisma/schema.prisma). Solo se comprueba
 * que el objeto EXISTA, igual que el DDL (`IF NOT EXISTS` tampoco corrige tipos).
 */

export type ObjetosEsperados = {
  columnas: { tabla: string; columna: string }[];
  indices: { tabla: string; nombre: string }[];
  /** Claves primarias y foráneas, por tabla y nombre. */
  restricciones: { tabla: string; nombre: string }[];
  /** Enums (hoy el esquema no tiene). */
  tipos: string[];
  /**
   * Objetos que el DDL solo intenta crear dentro de un `DO $$ ... EXCEPTION WHEN OTHERS THEN RAISE NOTICE ... $$` (únicos de «mejor
   * esfuerzo», p. ej. PendingOrder_epaycoRef_key): en una base heredada con filas repetidas NO se pueden crear y el DDL lo tolera. Si
   * se exigieran, la consulta los reportaría siempre y el camino rápido jamás se tomaría. No se consultan; el DDL sigue intentándolos.
   */
  opcionales: { clase: "indice" | "restriccion"; tabla: string; nombre: string }[];
  /**
   * Sentencias cuya forma no se supo leer. Si hay alguna no se puede asegurar que «existe todo», así que no hay camino rápido
   * (la prueba de este módulo exige que en las cuatro familias reales esté vacía).
   */
  noEntendidas: string[];
};

export type Consultar = (sql: string) => Promise<unknown>;

export type CaminoRapido = {
  /** Lo que se espera encontrar, derivado de las sentencias (expuesto para las pruebas). */
  esperados(): ObjetosEsperados;
  /** La consulta única al catálogo (expuesta para las pruebas). */
  consulta(): string;
  /**
   * true SOLO si la consulta confirma que existe todo lo que crearían las sentencias. En cualquier otro caso (falta algo, la consulta
   * falla, hay sentencias sin entender) false. Nunca lanza.
   */
  alDia(consultar: Consultar): Promise<boolean>;
};

/** Cuántos objetos faltantes se piden como máximo: basta para el aviso del log y evita arrastrar cientos de filas en una base vacía. */
const MAX_FALTANTES = 25;

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();

/** Parte por comas de primer nivel (ignora las de paréntesis y las de textos entre comillas simples). */
function partirPorComas(cuerpo: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let comilla = false;
  let actual = "";
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

/**
 * Quita el envoltorio `DO $$ BEGIN <sentencia>; EXCEPTION WHEN <x> THEN ... END $$`. `mejorEsfuerzo` es true cuando el guardia es
 * `WHEN OTHERS`: cualquier fallo se traga, así que el objeto puede legítimamente no existir. (`duplicate_object` solo traga «ya existe»,
 * por lo que ese objeto sigue siendo obligatorio.)
 */
function desenvolver(sql: string): { interna: string; mejorEsfuerzo: boolean } {
  const m = /^DO \$\$ BEGIN (.+?);? EXCEPTION WHEN (\w+) THEN .* END \$\$$/.exec(sql);
  return m ? { interna: m[1], mejorEsfuerzo: m[2].toLowerCase() === "others" } : { interna: sql, mejorEsfuerzo: false };
}

/** Deriva de las sentencias del DDL los objetos que deben existir cuando todo está aplicado. */
export function objetosEsperados(sentencias: readonly string[]): ObjetosEsperados {
  const e: ObjetosEsperados = { columnas: [], indices: [], restricciones: [], tipos: [], opcionales: [], noEntendidas: [] };
  const vistos = new Set<string>();
  const una = <T>(lista: T[], clave: string, valor: T) => {
    if (vistos.has(clave)) return;
    vistos.add(clave);
    lista.push(valor);
  };
  for (const cruda of sentencias) {
    const { interna: sql, mejorEsfuerzo } = desenvolver(normaliza(cruda));
    let m: RegExpExecArray | null;
    if ((m = /^CREATE TABLE IF NOT EXISTS "(\w+)" \((.*)\)$/.exec(sql))) {
      const tabla = m[1];
      for (const parte of partirPorComas(m[2])) {
        const pk = /^CONSTRAINT "(\w+)" PRIMARY KEY \(.+\)$/.exec(parte);
        const col = /^"(\w+)" .+$/.exec(parte);
        if (pk) una(e.restricciones, `k.${tabla}.${pk[1]}`, { tabla, nombre: pk[1] });
        else if (col) una(e.columnas, `c.${tabla}.${col[1]}`, { tabla, columna: col[1] });
        else e.noEntendidas.push(`parte de CREATE TABLE "${tabla}": ${parte.slice(0, 80)}`);
      }
    } else if ((m = /^ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)" .+$/.exec(sql))) {
      una(e.columnas, `c.${m[1]}.${m[2]}`, { tabla: m[1], columna: m[2] });
    } else if ((m = /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "(\w+)" ON "(\w+)"\(.+\)$/.exec(sql))) {
      if (mejorEsfuerzo) una(e.opcionales, `i.${m[2]}.${m[1]}`, { clase: "indice", tabla: m[2], nombre: m[1] });
      else una(e.indices, `i.${m[2]}.${m[1]}`, { tabla: m[2], nombre: m[1] });
    } else if ((m = /^ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" .+$/.exec(sql))) {
      if (mejorEsfuerzo) una(e.opcionales, `k.${m[1]}.${m[2]}`, { clase: "restriccion", tabla: m[1], nombre: m[2] });
      else una(e.restricciones, `k.${m[1]}.${m[2]}`, { tabla: m[1], nombre: m[2] });
    } else if ((m = /^CREATE TYPE "(\w+)" AS ENUM \(.*\)$/.exec(sql))) {
      una(e.tipos, `t.${m[1]}`, m[1]);
    } else e.noEntendidas.push(sql.slice(0, 100));
  }
  return e;
}

/** Un identificador entra a la consulta como texto literal: solo se aceptan los que escribe Prisma (letras, números y guion bajo). */
function literal(identificador: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identificador)) throw new Error(`identificador no válido para el catálogo: ${identificador}`);
  return `'${identificador}'`;
}

const filas = (lista: string[][]) => lista.map((f) => `(${f.map(literal).join(", ")})`).join(", ");

/**
 * La consulta única: devuelve una fila por cada objeto esperado que NO existe en el esquema actual (`current_schema()`, que es donde
 * caen las sentencias sin esquema explícito). Sin filas = todo existe. Es constante para un mismo juego de sentencias y de solo lectura.
 */
export function consultaDeFaltantes(e: ObjetosEsperados, limite = MAX_FALTANTES): string {
  const partes: string[] = [];
  if (e.columnas.length) {
    partes.push(
      `SELECT 'columna' AS clase, v.tabla || '.' || v.nombre AS objeto FROM (VALUES ${filas(e.columnas.map((c) => [c.tabla, c.columna]))}) AS v(tabla, nombre) ` +
        `WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class r ON r.oid = a.attrelid JOIN pg_namespace n ON n.oid = r.relnamespace ` +
        `WHERE n.nspname = current_schema() AND r.relkind IN ('r', 'p') AND r.relname = v.tabla AND a.attname = v.nombre AND a.attnum > 0 AND NOT a.attisdropped)`
    );
  }
  if (e.indices.length) {
    partes.push(
      `SELECT 'indice' AS clase, v.tabla || '.' || v.nombre AS objeto FROM (VALUES ${filas(e.indices.map((i) => [i.tabla, i.nombre]))}) AS v(tabla, nombre) ` +
        `WHERE NOT EXISTS (SELECT 1 FROM pg_indexes x WHERE x.schemaname = current_schema() AND x.tablename = v.tabla AND x.indexname = v.nombre)`
    );
  }
  if (e.restricciones.length) {
    partes.push(
      `SELECT 'restriccion' AS clase, v.tabla || '.' || v.nombre AS objeto FROM (VALUES ${filas(e.restricciones.map((k) => [k.tabla, k.nombre]))}) AS v(tabla, nombre) ` +
        `WHERE NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace ` +
        `WHERE n.nspname = current_schema() AND r.relname = v.tabla AND k.conname = v.nombre)`
    );
  }
  if (e.tipos.length) {
    partes.push(
      `SELECT 'tipo' AS clase, v.nombre AS objeto FROM (VALUES ${filas(e.tipos.map((t) => [t]))}) AS v(nombre) ` +
        `WHERE NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace ` +
        `WHERE n.nspname = current_schema() AND t.typname = v.nombre AND t.typtype = 'e')`
    );
  }
  // e.opcionales no se consulta a propósito (ver ObjetosEsperados.opcionales).
  if (!partes.length) throw new Error("no hay objetos que comprobar");
  return `${partes.join(" UNION ALL ")} LIMIT ${Math.max(1, Math.floor(limite))}`;
}

/**
 * Prepara el camino rápido de una familia de sentencias. Lo costoso (leer las sentencias y armar la consulta) se hace la primera vez
 * que se necesita, no al importar el módulo, y un error al prepararlo solo desactiva el atajo.
 */
export function crearCaminoRapido(nombre: string, sentencias: readonly string[]): CaminoRapido {
  let esperados: ObjetosEsperados | null = null;
  let sql: string | null = null;
  const preparar = () => {
    esperados ??= objetosEsperados(sentencias);
    if (sql === null && esperados.noEntendidas.length === 0) sql = consultaDeFaltantes(esperados);
    return { esperados, sql };
  };

  return {
    esperados: () => preparar().esperados,
    consulta: () => {
      const p = preparar();
      if (p.sql === null) throw new Error("hay sentencias sin entender: no hay consulta de catálogo");
      return p.sql;
    },
    async alDia(consultar) {
      try {
        const p = preparar();
        if (p.sql === null) {
          console.warn(`[${nombre}] ${p.esperados.noEntendidas.length} sentencia(s) sin entender: no hay camino rápido, se aplica el SQL de arranque`);
          return false;
        }
        const resultado = await consultar(p.sql);
        if (!Array.isArray(resultado)) throw new Error("la consulta del catálogo no devolvió una lista de filas");
        if (resultado.length === 0) return true;
        const ejemplos = resultado
          .slice(0, 3)
          .map((f) => String((f as { objeto?: unknown }).objeto ?? "?"))
          .join(", ");
        console.info(
          `[${nombre}] faltan ${resultado.length}${resultado.length >= MAX_FALTANTES ? " o más" : ""} objetos del esquema (p. ej. ${ejemplos}): se aplica el SQL de arranque`
        );
        return false;
      } catch (err) {
        console.warn(`[${nombre}] no se pudo consultar el catálogo; se aplica el SQL de arranque:`, err instanceof Error ? err.message : err);
        return false;
      }
    },
  };
}
