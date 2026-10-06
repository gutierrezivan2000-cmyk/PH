/**
 * `DELETE /api/properties?id=`: antes de borrar la copropiedad se borran los archivos de sus reuniones; si no se pueden borrar,
 * la copropiedad se conserva.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, borrar } = vi.hoisted(() => ({ auth: vi.fn(), fake: { db: null as unknown }, borrar: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("./almacen", async (importOriginal) => ({ ...(await importOriginal<typeof import("./almacen")>()), borrarArchivosDeReunion: (...a: unknown[]) => borrar(...a) }));

import { DELETE } from "@/app/api/properties/route";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

let db: DbFalsa;
const eliminar = (id: string | null = "p1") => DELETE(new NextRequest(`http://localhost/api/properties${id ? `?id=${id}` : ""}`, { method: "DELETE" }));

beforeEach(async () => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  borrar.mockReset();
  borrar.mockResolvedValue(2);
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com", name: "Ana" } });
  await db.user.create({ data: { id: "u1", email: "u1@x.com" } });
  await db.property.create({ data: { id: "p1", userId: "u1", name: "Los Pinos" } });
  await db.meeting.create({ data: { id: "m1", userId: "u1", propertyId: "p1" } });
  await db.meeting.create({ data: { id: "m2", userId: "u1", propertyId: "p1" } });
  await db.meeting.create({ data: { id: "m3", userId: "u1", propertyId: "p2" } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DELETE /api/properties", () => {
  it("borra los archivos de las reuniones de la copropiedad ANTES de borrarla", async () => {
    let propiedadesAlBorrarArchivos = -1;
    borrar.mockImplementation(async () => {
      propiedadesAlBorrarArchivos = db.property.filas.length;
    });
    const r = await eliminar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(borrar.mock.calls.map((c) => c[0]).sort()).toEqual(["m1", "m2"]);
    expect(propiedadesAlBorrarArchivos).toBe(1); // la copropiedad todavía existía
    expect(db.property.filas).toHaveLength(0);
  });

  it("si los archivos no se pueden borrar: 502 con el motivo, y la copropiedad se conserva para reintentar", async () => {
    borrar.mockRejectedValue(new Error("el almacenamiento no contesta"));
    const r = await eliminar();
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toMatch(/siguen? guardada/);
    expect(db.property.filas).toHaveLength(1);
  });

  it("una copropiedad sin reuniones se borra como siempre", async () => {
    await db.property.create({ data: { id: "p9", userId: "u1", name: "Sin reuniones" } });
    expect((await eliminar("p9")).status).toBe(200);
    expect(borrar).not.toHaveBeenCalled();
    expect(db.property.filas.map((p) => p.id)).toEqual(["p1"]);
  });

  it("sin la tabla de reuniones (nadie ha usado la función) la copropiedad se borra igual", async () => {
    vi.spyOn(db.meeting, "findMany").mockRejectedValueOnce(new Error("The table `public.Meeting` does not exist in the current database."));
    expect((await eliminar()).status).toBe(200);
    expect(db.property.filas).toHaveLength(0);
  });

  it("sin sesión: 401; sin id: 400; y no toca nada", async () => {
    auth.mockResolvedValue(null);
    expect((await eliminar()).status).toBe(401);
    auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com" } });
    expect((await eliminar(null)).status).toBe(400);
    expect(borrar).not.toHaveBeenCalled();
    expect(db.property.filas).toHaveLength(1);
  });

  it("en el demo borra de la memoria del demo, sin tocar la base de datos ni el almacenamiento", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.resetModules();
    const { DELETE: borrarEnDemo } = await import("@/app/api/properties/route");
    const r = await borrarEnDemo(new NextRequest("http://localhost/api/properties?id=prop-demo-001", { method: "DELETE" }));
    expect(r.status).toBe(200);
    expect(borrar).not.toHaveBeenCalled();
    expect(db.property.filas).toHaveLength(1);
  });
});
