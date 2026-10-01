import { beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ list: (...a: unknown[]) => list(...a), del: (...a: unknown[]) => del(...a) }));

import { borrarArchivosDeReunion, borrarPrefijo, prefijoDeReunion } from "./almacen";

const blob = (n: number) => ({ url: `https://x.private.blob.vercel-storage.com/meetings/m1abcdefg/${n}.mp3` });

beforeEach(() => {
  list.mockReset();
  del.mockReset();
});

describe("prefijoDeReunion", () => {
  it("construye meetings/<id>/", () => {
    expect(prefijoDeReunion("cmabc12345xyz")).toBe("meetings/cmabc12345xyz/");
    expect(prefijoDeReunion("reunion-demo-001")).toBe("meetings/reunion-demo-001/");
  });
  it("rechaza ids que podrían salirse de su carpeta", () => {
    for (const id of ["", "a", "../otra", "meetings/x/y", "id con espacio", "x".repeat(65), "abc/def12345"]) {
      expect(() => prefijoDeReunion(id), id).toThrow();
    }
  });
});

describe("borrarPrefijo", () => {
  it("nunca borra con un prefijo vacío, corto o ajeno (vaciaría todo el almacenamiento)", async () => {
    for (const p of ["", "/", "meetings/", "meetings", "documents/abc12345/", "meetings/abc/", "meetings/abc12345", "meetings/../abc12345/"]) {
      await expect(borrarPrefijo(p), p).rejects.toThrow(/no permitido/);
    }
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("recorre todas las páginas y borra por lotes", async () => {
    list
      .mockResolvedValueOnce({ blobs: [blob(1), blob(2)], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [blob(3)], hasMore: false });
    del.mockResolvedValue(undefined);
    const n = await borrarPrefijo("meetings/m1abcdefg/");
    expect(n).toBe(3);
    expect(list).toHaveBeenNthCalledWith(1, { prefix: "meetings/m1abcdefg/", cursor: undefined, limit: 1000 });
    expect(list).toHaveBeenNthCalledWith(2, { prefix: "meetings/m1abcdefg/", cursor: "c1", limit: 1000 });
    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenNthCalledWith(1, [blob(1).url, blob(2).url]);
    expect(del).toHaveBeenNthCalledWith(2, [blob(3).url]);
  });

  it("si no hay nada no llama a del (con un arreglo vacío fallaría)", async () => {
    list.mockResolvedValueOnce({ blobs: [], hasMore: false });
    expect(await borrarPrefijo("meetings/m1abcdefg/")).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("si el borrado falla, el error sube (la reunión no se elimina a medias sin avisar)", async () => {
    list.mockResolvedValueOnce({ blobs: [blob(1)], hasMore: false });
    del.mockRejectedValueOnce(new Error("blob caído"));
    await expect(borrarPrefijo("meetings/m1abcdefg/")).rejects.toThrow("blob caído");
  });
});

describe("borrarArchivosDeReunion", () => {
  it("borra la carpeta de esa reunión", async () => {
    list.mockResolvedValueOnce({ blobs: [blob(1)], hasMore: false });
    del.mockResolvedValue(undefined);
    expect(await borrarArchivosDeReunion("m1abcdefg")).toBe(1);
    expect(list).toHaveBeenCalledWith({ prefix: "meetings/m1abcdefg/", cursor: undefined, limit: 1000 });
  });
});
