/**
 * Nada del servidor puede llegar al navegador: los componentes de cliente de Reuniones (los que empiezan con "use client") no deben
 * importar, ni directa ni indirectamente, la base de datos, el sistema de archivos ni el SDK de la IA. Si pasa, la página deja de
 * compilar (o, peor, el prompt y las claves viajarían al navegador). Esta prueba recorre las importaciones de verdad.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const PROHIBIDOS: Array<[RegExp, string]> = [
  [/@\/lib\/db"/, "la base de datos"], [/from "node:/, "módulos de Node"], [/from "fs"/, "el sistema de archivos"], [/@prisma\//, "Prisma"],
  [/@anthropic-ai\/sdk/, "el SDK de la IA"], [/from "pg"/, "el cliente de Postgres"], [/@\/generated\/prisma/, "Prisma"], [/@\/lib\/auth"/, "la sesión del servidor"],
  [/@\/lib\/email"/, "el correo"],
];

/** Las importaciones de valores de un archivo (las de solo tipos se borran al compilar y no cuentan). */
function importaciones(texto: string): string[] {
  const salida: string[] = [];
  for (const m of texto.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)) if (!m[1]) salida.push(m[2]);
  for (const m of texto.matchAll(/^import\s+"([^"]+)"/gm)) salida.push(m[1]);
  return salida;
}

function resolver(raiz: string, desde: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(raiz, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(desde), spec) : null;
  if (!base) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c)) return c;
  return null;
}

/** Las importaciones prohibidas que alcanza cada componente de cliente de `carpeta` (relativa a `raiz`). */
function analizar(raiz: string, carpeta: string): string[] {
  const dir = join(raiz, carpeta);
  const clientes = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => join(dir, f)).filter((f) => /^"use client"/.test(readFileSync(f, "utf8")));
  const faltas: string[] = [];
  for (const origen of clientes) {
    const vistos = new Set([origen]);
    const cola = [origen];
    while (cola.length > 0) {
      const actual = cola.shift()!;
      const texto = readFileSync(actual, "utf8");
      const soloValores = texto.replace(/^\s*(?:import|export)\s+type\s[^;]*;/gm, "");
      for (const [patron, que] of PROHIBIDOS) {
        if (patron.test(soloValores)) faltas.push(`${origen.slice(raiz.length + 1)} llega a ${actual.slice(raiz.length + 1)}, que importa ${que}`);
      }
      for (const spec of importaciones(texto)) {
        const r = resolver(raiz, actual, spec);
        if (r && !vistos.has(r)) {
          vistos.add(r);
          cola.push(r);
        }
      }
    }
  }
  return faltas;
}

describe("los componentes de cliente de Reuniones", () => {
  it("hay componentes de cliente que revisar (si no, esta prueba no comprueba nada)", () => {
    const raiz = join(process.cwd(), "src");
    const dir = join(raiz, "components/reuniones");
    const clientes = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => /^"use client"/.test(readFileSync(join(dir, f), "utf8")));
    expect(clientes.length).toBeGreaterThanOrEqual(10);
  });

  it("no alcanzan, ni directa ni indirectamente, nada que sea solo del servidor", () => {
    expect(analizar(join(process.cwd(), "src"), "components/reuniones")).toEqual([]);
  });

  describe("el revisor funciona (se prueba con una carpeta inventada)", () => {
    const temporal = mkdtempSync(join(tmpdir(), "cliente-puro-"));
    afterAll(() => rmSync(temporal, { recursive: true, force: true }));
    const escribir = (ruta: string, contenido: string) => {
      mkdirSync(dirname(join(temporal, ruta)), { recursive: true });
      writeFileSync(join(temporal, ruta), contenido);
    };

    it("encuentra una importación prohibida escondida a dos saltos, y no se confunde con las de solo tipos", () => {
      escribir("components/x/Malo.tsx", '"use client";\nimport { algo } from "@/lib/uno";\nexport const Malo = () => algo;\n');
      escribir("lib/uno.ts", 'import { dos } from "./dos";\nexport const algo = dos;\n');
      escribir("lib/dos.ts", 'import { db } from "@/lib/db";\nexport const dos = db;\n');
      escribir("components/x/Bueno.tsx", '"use client";\nimport type { Tipo } from "@/lib/solo-tipos";\nimport { puro } from "@/lib/puro";\nexport const Bueno = (t: Tipo) => puro(t);\n');
      escribir("lib/solo-tipos.ts", 'import { db } from "@/lib/db";\nexport type Tipo = typeof db;\n');
      escribir("lib/puro.ts", "export const puro = (x: unknown) => x;\n");
      escribir("components/x/DelServidor.tsx", 'import { db } from "@/lib/db";\nexport const S = db;\n'); // sin "use client": no se revisa
      const faltas = analizar(temporal, "components/x");
      expect(faltas).toEqual(["components/x/Malo.tsx llega a lib/dos.ts, que importa la base de datos"]);
    });

    it("también detecta el SDK de la IA y los módulos de Node", () => {
      escribir("components/y/Uno.tsx", '"use client";\nimport Anthropic from "@anthropic-ai/sdk";\nexport const U = Anthropic;\n');
      escribir("components/y/Dos.tsx", '"use client";\nimport { readFileSync } from "node:fs";\nexport const D = readFileSync;\n');
      expect(analizar(temporal, "components/y").sort()).toEqual([
        "components/y/Dos.tsx llega a components/y/Dos.tsx, que importa módulos de Node",
        "components/y/Uno.tsx llega a components/y/Uno.tsx, que importa el SDK de la IA",
      ]);
    });
  });
});
