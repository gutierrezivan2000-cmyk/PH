/**
 * Borrar una copropiedad borra también los archivos de sus reuniones (la base de datos solo borra las filas).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { borrarArchivosDeLasReunionesDe } from "./archivos-de-propiedad";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

let db: DbFalsa;
let borradas: string[];
const borrar = vi.fn(async (id: string) => {
  borradas.push(id);
  return 3;
});

beforeEach(async () => {
  db = crearDbFalsa();
  fake.db = db;
  borradas = [];
  borrar.mockClear();
  await db.meeting.create({ data: { id: "m1", userId: "u1", propertyId: "p1" } });
  await db.meeting.create({ data: { id: "m2", userId: "u1", propertyId: "p1" } });
  await db.meeting.create({ data: { id: "m3", userId: "u1", propertyId: "p2" } }); // de otra copropiedad
  await db.meeting.create({ data: { id: "m4", userId: "otra", propertyId: "p1" } }); // de otra persona
});

describe("borrarArchivosDeLasReunionesDe", () => {
  it("borra los archivos de las reuniones de esa copropiedad y de esa persona, y dice cuántas eran", async () => {
    expect(await borrarArchivosDeLasReunionesDe("p1", "u1", borrar)).toBe(2);
    expect(borradas.sort()).toEqual(["m1", "m2"]);
  });

  it("no toca las reuniones de otra copropiedad ni de otra persona (aunque la copropiedad tenga el mismo id)", async () => {
    expect(await borrarArchivosDeLasReunionesDe("p2", "u1", borrar)).toBe(1);
    expect(await borrarArchivosDeLasReunionesDe("p1", "nadie", borrar)).toBe(0);
    expect(borradas).toEqual(["m3"]);
  });

  it("una copropiedad sin reuniones: no hay nada que borrar", async () => {
    expect(await borrarArchivosDeLasReunionesDe("p9", "u1", borrar)).toBe(0);
    expect(borrar).not.toHaveBeenCalled();
  });

  it("si todavía no existe la tabla de reuniones (nadie ha usado la función) no hay archivos y no falla", async () => {
    for (const mensaje of ['relation "Meeting" does not exist', "The table `public.Meeting` does not exist in the current database. (P2021)", "42P01"]) {
      vi.spyOn(db.meeting, "findMany").mockRejectedValueOnce(new Error(mensaje));
      expect(await borrarArchivosDeLasReunionesDe("p1", "u1", borrar), mensaje).toBe(0);
    }
    expect(borrar).not.toHaveBeenCalled();
  });

  it("cualquier otro fallo de la base de datos se propaga: nadie debe borrar la copropiedad sin saber qué archivos tenía", async () => {
    vi.spyOn(db.meeting, "findMany").mockRejectedValueOnce(new Error("conexión perdida: violación de relation"));
    await expect(borrarArchivosDeLasReunionesDe("p1", "u1", borrar)).rejects.toThrow(/conexión perdida/);
    expect(borrar).not.toHaveBeenCalled();
  });

  it("si no se pueden borrar los archivos de una reunión se detiene y lanza (las siguientes se reintentan después)", async () => {
    borrar.mockImplementationOnce(async (id: string) => {
      borradas.push(id);
      return 1;
    }).mockRejectedValueOnce(new Error("el almacenamiento no contesta"));
    await expect(borrarArchivosDeLasReunionesDe("p1", "u1", borrar)).rejects.toThrow(/almacenamiento/);
    expect(borradas).toHaveLength(1);
  });
});
