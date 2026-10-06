/**
 * Toda ruta que arranca el trabajador de la cola con `empujar()` lo hace con `after()`, que corre DENTRO de la duración máxima de
 * la ruta. Si la ruta dura menos de lo que dura el trabajador, la plataforma lo corta a mitad de una llamada a la IA (se paga y
 * no se guarda). Esta prueba lee las rutas y exige que la duración alcance.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESUPUESTO_EMPUJON_MS } from "./empujon";

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? rutas(ruta) : nombre === "route.ts" ? [ruta] : [];
  });
}

const RAIZ = join(process.cwd(), "src/app/api");
const QUE_EMPUJAN = rutas(RAIZ).filter((r) => /\bempujar\(/.test(readFileSync(r, "utf8")));

describe("las rutas que empujan al trabajador duran lo que dura el trabajador", () => {
  it("hay rutas que empujan (si no, esta prueba no comprueba nada)", () => {
    expect(QUE_EMPUJAN.length).toBeGreaterThanOrEqual(5);
  });

  it.each(QUE_EMPUJAN.map((r) => [r.slice(RAIZ.length + 1), r]))("%s", (_nombre, ruta) => {
    const m = /export const maxDuration = (\d+);/.exec(readFileSync(ruta, "utf8"));
    expect(m, "declara su maxDuration").not.toBeNull();
    expect(Number(m![1]) * 1000).toBeGreaterThan(PRESUPUESTO_EMPUJON_MS);
  });
});
