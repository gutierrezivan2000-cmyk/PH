import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, del } = vi.hoisted(() => ({
  db: { propertyDocument: { findMany: vi.fn() } },
  del: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@vercel/blob", () => ({ del: (...a: unknown[]) => del(...a) }));

import { borrarBlobsPropios } from "./blob-owner-server";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const propio = (n: string) => `${HOST}/subidas/${U1}/uploads/${n}.pdf`;
const ajeno = (n: string) => `${HOST}/subidas/${U2}/uploads/${n}.pdf`;

beforeEach(() => {
  db.propertyDocument.findMany.mockReset().mockResolvedValue([]);
  del.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("borrarBlobsPropios", () => {
  it("borra los blobs del usuario", async () => {
    const r = await borrarBlobsPropios([propio("a"), propio("b")], U1);
    expect(del).toHaveBeenCalledWith([propio("a"), propio("b")]);
    expect(r).toEqual({ borradas: [propio("a"), propio("b")], omitidas: [] });
  });

  it("NUNCA borra el blob de otro usuario, aunque venga mezclado con los propios", async () => {
    const r = await borrarBlobsPropios([propio("a"), ajeno("b")], U1);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith([propio("a")]);
    expect(r.omitidas).toEqual([ajeno("b")]);
    // Ni siquiera se pregunta a la base de datos por lo ajeno.
    expect(db.propertyDocument.findMany).toHaveBeenCalledWith({ where: { url: { in: [propio("a")] } }, select: { url: true } });
  });

  it("si todo es ajeno no toca la base de datos ni el almacenamiento", async () => {
    const r = await borrarBlobsPropios([ajeno("a"), `${HOST}/uploads/viejo.pdf`, "https://servidor-del-atacante.example/x.pdf", 42, null], U1);
    expect(db.propertyDocument.findMany).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(r.borradas).toEqual([]);
    expect(r.omitidas).toHaveLength(3);
  });

  it("NUNCA borra un blob registrado como documento de una copropiedad, aunque sea propio", async () => {
    db.propertyDocument.findMany.mockResolvedValue([{ url: propio("reglamento") }]);
    const r = await borrarBlobsPropios([propio("reglamento"), propio("insumo")], U1);
    expect(del).toHaveBeenCalledWith([propio("insumo")]);
    expect(r.borradas).toEqual([propio("insumo")]);
    expect(r.omitidas).toEqual([propio("reglamento")]);
  });

  it("si todo está registrado, no llama al almacenamiento", async () => {
    db.propertyDocument.findMany.mockResolvedValue([{ url: propio("reglamento") }]);
    const r = await borrarBlobsPropios([propio("reglamento")], U1);
    expect(del).not.toHaveBeenCalled();
    expect(r.borradas).toEqual([]);
  });

  it("sin poder consultar la base de datos no borra nada (falla cerrado) y no lanza", async () => {
    db.propertyDocument.findMany.mockRejectedValue(new Error("db caída"));
    const r = await borrarBlobsPropios([propio("a")], U1, { etiqueta: "prueba" });
    expect(del).not.toHaveBeenCalled();
    expect(r).toEqual({ borradas: [], omitidas: [propio("a")] });
    expect(console.error).toHaveBeenCalledWith("[prueba] no se pudieron borrar los archivos:", expect.any(Error));
  });

  it("si el almacenamiento falla no lanza ni asegura haber borrado", async () => {
    del.mockRejectedValue(new Error("blob caído"));
    const r = await borrarBlobsPropios([propio("a")], U1);
    expect(r.borradas).toEqual([]);
    expect(r.omitidas).toEqual([propio("a")]);
  });

  it("sin repetidos", async () => {
    await borrarBlobsPropios([propio("a"), propio("a")], U1);
    expect(del).toHaveBeenCalledWith([propio("a")]);
  });

  it("acepta varios ids del usuario (sesión y base de datos)", async () => {
    await borrarBlobsPropios([propio("a"), ajeno("b")], [U2, U1]);
    expect(del).toHaveBeenCalledWith([propio("a"), ajeno("b")]);
  });

  it("los insumos mensuales de antes solo se borran con la copropiedad verificada", async () => {
    const legado = `${HOST}/monthly/prop1/2026-5/1700-acta.pdf`;
    await borrarBlobsPropios([legado], U1);
    expect(del).not.toHaveBeenCalled();
    await borrarBlobsPropios([legado], U1, { propertyId: "prop1" });
    expect(del).toHaveBeenCalledWith([legado]);
    del.mockClear();
    await borrarBlobsPropios([legado], U1, { propertyId: "prop2" });
    expect(del).not.toHaveBeenCalled();
  });

  it("una lista vacía no hace nada", async () => {
    const r = await borrarBlobsPropios([], U1);
    expect(del).not.toHaveBeenCalled();
    expect(r).toEqual({ borradas: [], omitidas: [] });
  });
});
