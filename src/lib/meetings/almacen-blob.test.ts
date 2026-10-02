import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put, head, list, del } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), head: vi.fn(), list: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a), head: (...a: unknown[]) => head(...a), list: (...a: unknown[]) => list(...a), del: (...a: unknown[]) => del(...a) }));

import { ErrorAlmacen, leerTodo } from "./almacen";
import { AlmacenBlob, leerContentRange } from "./almacen-blob";

const URL_BLOB = "https://abc.private.blob.vercel-storage.com/meetings/m1/audio.mp3";
const flujo = (...trozos: number[][]) => new ReadableStream<Uint8Array>({ start(c) { for (const t of trozos) c.enqueue(Uint8Array.from(t)); c.close(); } });
const respuesta = (cuerpo: ReadableStream<Uint8Array>, cabeceras: Record<string, string>, size: number) => ({
  statusCode: 200, stream: cuerpo, headers: new Headers(cabeceras), blob: { size, contentType: "audio/mpeg" },
});
let a: AlmacenBlob;
beforeEach(() => {
  [get, put, head, list, del].forEach((m) => m.mockReset());
  a = new AlmacenBlob();
});

describe("leerContentRange", () => {
  it("lee «bytes a-b/total»", () => {
    expect(leerContentRange("bytes 100-199/1000")).toEqual({ desde: 100, hasta: 199, total: 1000 });
    expect(leerContentRange("bytes */1000")).toBeNull();
    expect(leerContentRange(null)).toBeNull();
    expect(leerContentRange("basura")).toBeNull();
  });
});

describe("subir", () => {
  it("sube en privado, con la ruta fija y sobrescribiendo (los reintentos no duplican)", async () => {
    put.mockResolvedValue({ url: URL_BLOB, pathname: "meetings/m1/audio.mp3" });
    expect(await a.subir("meetings/m1/audio.mp3", Uint8Array.from([1, 2, 3]), "audio/mpeg")).toEqual({ url: URL_BLOB, pathname: "meetings/m1/audio.mp3" });
    const [ruta, cuerpo, opciones] = put.mock.calls[0];
    expect(ruta).toBe("meetings/m1/audio.mp3");
    expect(Buffer.isBuffer(cuerpo) && [...cuerpo]).toEqual([1, 2, 3]);
    expect(opciones).toEqual({ access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "audio/mpeg" });
  });

  it("subirFlujo pide multipart (el cuerpo no cabe en memoria)", async () => {
    put.mockResolvedValue({ url: URL_BLOB, pathname: "p" });
    await a.subirFlujo("p", flujo([1]), "audio/webm");
    expect(put.mock.calls[0][2]).toEqual({ access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "audio/webm", multipart: true });
  });
});

describe("leer", () => {
  it("sin rango: sin cabecera Range, sin caché, con el tamaño", async () => {
    get.mockResolvedValue(respuesta(flujo([1, 2, 3, 4]), { "content-length": "4" }, 4));
    const l = await a.leer(URL_BLOB);
    expect(l).toMatchObject({ desde: 0, hasta: 3, total: 4 });
    expect([...(await leerTodo(a, URL_BLOB))]).toEqual([1, 2, 3, 4]);
    expect(get.mock.calls[0][1]).toMatchObject({ access: "private", useCache: false });
    expect(get.mock.calls[0][1].headers).toBeUndefined();
  });

  it("con rango pide «bytes=a-b» y usa el content-range de la respuesta", async () => {
    get.mockResolvedValue(respuesta(flujo([3, 4, 5]), { "content-range": "bytes 2-4/10", "content-length": "3" }, 3));
    const l = await a.leer(URL_BLOB, { rango: { desde: 2, hasta: 4 } });
    expect(get.mock.calls[0][1].headers).toEqual({ Range: "bytes=2-4" });
    expect(l).toMatchObject({ desde: 2, hasta: 4, total: 10 });
    get.mockResolvedValue(respuesta(flujo([9]), { "content-range": "bytes 9-9/10" }, 1));
    await a.leer(URL_BLOB, { rango: { desde: 9 } });
    expect(get.mock.calls[1][1].headers).toEqual({ Range: "bytes=9-" });
  });

  it("si el servicio ignora el rango y manda todo, recorta del lado nuestro (y avisa)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    get.mockResolvedValue(respuesta(flujo([0, 1, 2], [3, 4, 5], [6, 7, 8, 9]), { "content-length": "10" }, 10));
    const tramo = await leerTodo(a, URL_BLOB, { desde: 4, hasta: 6 });
    expect([...tramo]).toEqual([4, 5, 6]);
    expect(aviso).toHaveBeenCalled();
    get.mockResolvedValue(respuesta(flujo([0, 1, 2], [3, 4, 5], [6, 7, 8, 9]), { "content-length": "10" }, 10));
    expect([...(await leerTodo(a, URL_BLOB, { desde: 7 }))]).toEqual([7, 8, 9]);
    aviso.mockRestore();
  });

  it("un archivo que no existe es «no_encontrado»", async () => {
    get.mockResolvedValue(null);
    const e = await a.leer(URL_BLOB).then(() => null, (x) => x as ErrorAlmacen);
    expect(e).toBeInstanceOf(ErrorAlmacen);
    expect(e!.tipo).toBe("no_encontrado");
  });

  it("clasifica los errores del SDK (en inglés) como lo que son, en español", async () => {
    const intentar = async () => (await a.leer(URL_BLOB).then(() => null, (x) => x as ErrorAlmacen))!;
    get.mockRejectedValue(new Error("Failed to fetch blob: 503 Service Unavailable"));
    expect(await intentar()).toMatchObject({ tipo: "transitorio", message: expect.stringMatching(/No pudimos acceder al almacenamiento/) });
    get.mockRejectedValue(new Error("Vercel Blob: Access denied, please provide a valid token for this resource"));
    expect(await intentar()).toMatchObject({ tipo: "fatal", message: expect.stringMatching(/Avisa a soporte/) });
    get.mockRejectedValue(new Error("Vercel Blob: This store has been suspended."));
    expect((await intentar()).tipo).toBe("fatal");
    get.mockRejectedValue(new Error("Vercel Blob: algo raro que no conocemos"));
    expect((await intentar()).tipo).toBe("transitorio"); // lo desconocido se trata como del momento (se reintenta, con tope)
    get.mockRejectedValue(new Error("Vercel Blob: The requested blob does not exist"));
    expect((await intentar()).tipo).toBe("no_encontrado");
    get.mockRejectedValue(new TypeError("fetch failed"));
    expect((await intentar()).tipo).toBe("transitorio");
  });

  it("una cancelación del que llama no se disfraza de error del almacén", async () => {
    const control = new AbortController();
    control.abort();
    get.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const e = await a.leer(URL_BLOB, { senal: control.signal }).then(() => null, (x) => x as Error);
    expect(e).toBeInstanceOf(DOMException);
  });
});

describe("tamano, listar y borrar", () => {
  it("el tamaño sale de head()", async () => {
    head.mockResolvedValue({ size: 1234 });
    expect(await a.tamano(URL_BLOB)).toBe(1234);
    head.mockRejectedValue(new Error("Vercel Blob: The requested blob does not exist"));
    expect(await a.tamano(URL_BLOB).then(() => null, (x) => (x as ErrorAlmacen).tipo)).toBe("no_encontrado");
  });
  it("listar recorre todas las páginas", async () => {
    list
      .mockResolvedValueOnce({ blobs: [{ url: "u1", pathname: "p/1", size: 1 }], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [{ url: "u2", pathname: "p/2", size: 2 }], hasMore: false });
    expect(await a.listar("p/")).toEqual([{ url: "u1", pathname: "p/1", size: 1 }, { url: "u2", pathname: "p/2", size: 2 }]);
    expect(list.mock.calls[0][0]).toMatchObject({ prefix: "p/", limit: 1000 });
    expect(list.mock.calls[1][0]).toMatchObject({ cursor: "c1" });
  });
  it("borrar parte la lista en tandas y no llama sin nada que borrar", async () => {
    del.mockResolvedValue(undefined);
    await a.borrar([]);
    expect(del).not.toHaveBeenCalled();
    await a.borrar(Array.from({ length: 1200 }, (_, i) => `u${i}`));
    expect(del.mock.calls.map((c) => c[0].length)).toEqual([500, 500, 200]);
  });
});
