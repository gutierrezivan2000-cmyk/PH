import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ErrorAlmacen, concatenarFlujos, contarBytes, leerTodo } from "./almacen";
import { AlmacenLocal } from "./almacen-local";

const carpeta = mkdtempSync(join(tmpdir(), "reunion-loc-"));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));
let a: AlmacenLocal;
beforeEach(() => {
  a = new AlmacenLocal(join(carpeta, Math.random().toString(36).slice(2)));
});

const flujoDe = (...trozos: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const t of trozos) c.enqueue(Uint8Array.from(t));
      c.close();
    },
  });
const recoger = async (f: ReadableStream<Uint8Array>) => {
  const salida: number[] = [];
  const lector = f.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return salida;
    salida.push(...value);
  }
};

describe("AlmacenLocal", () => {
  it("sube, lee entero y por rango, y dice el tamaño", async () => {
    const { url, pathname } = await a.subir("m/x/a.bin", Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), "audio/mpeg");
    expect(pathname).toBe("m/x/a.bin");
    expect(await a.tamano(url)).toBe(10);
    expect([...(await leerTodo(a, url))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...(await leerTodo(a, url, { desde: 2, hasta: 4 }))]).toEqual([3, 4, 5]);
    expect([...(await leerTodo(a, url, { desde: 8 }))]).toEqual([9, 10]);
    expect([...(await leerTodo(a, url, { desde: 5, hasta: 500 }))]).toEqual([6, 7, 8, 9, 10]);
    const l = await a.leer(url, { rango: { desde: 3, hasta: 5 } });
    expect(l).toMatchObject({ desde: 3, hasta: 5, total: 10 });
    expect(a.lecturas.at(-1)).toEqual({ url, desde: 3, hasta: 5 });
    expect(a.tipos.get("m/x/a.bin")).toBe("audio/mpeg");
  });

  it("sobrescribe al subir de nuevo (los reintentos no duplican)", async () => {
    const { url } = await a.subir("p/a", Uint8Array.from([1, 2, 3]));
    await a.subir("p/a", Uint8Array.from([9]));
    expect([...(await leerTodo(a, url))]).toEqual([9]);
  });

  it("subirFlujo une los trozos", async () => {
    const { url } = await a.subirFlujo("p/f", flujoDe([1, 2], [3], [4, 5]));
    expect([...(await leerTodo(a, url))]).toEqual([1, 2, 3, 4, 5]);
  });

  it("lista por prefijo (en orden) y borra", async () => {
    await a.subir("m/1/b.mp3", Uint8Array.from([1]));
    await a.subir("m/1/a.mp3", Uint8Array.from([1, 2]));
    await a.subir("m/2/c.mp3", Uint8Array.from([1, 2, 3]));
    expect((await a.listar("m/1/")).map((o) => [o.pathname, o.size])).toEqual([["m/1/a.mp3", 2], ["m/1/b.mp3", 1]]);
    expect(await a.listar("nada/")).toEqual([]);
    await a.borrar([a.urlDe("m/1/a.mp3")]);
    expect((await a.listar("m/1/")).map((o) => o.pathname)).toEqual(["m/1/b.mp3"]);
    await a.borrar([a.urlDe("no/existe")]); // borrar lo que no está no es un error
  });

  it("lo que no existe es «no_encontrado»; las URL ajenas y las rutas que salen de la carpeta, fatales", async () => {
    const e = await a.leer(a.urlDe("no/existe")).then(() => null, (x) => x as ErrorAlmacen);
    expect(e).toBeInstanceOf(ErrorAlmacen);
    expect(e!.tipo).toBe("no_encontrado");
    expect(await a.tamano(a.urlDe("no/existe")).then(() => null, (x) => (x as ErrorAlmacen).tipo)).toBe("no_encontrado");
    expect(await a.leer("https://otro.com/x").then(() => null, (x) => (x as ErrorAlmacen).tipo)).toBe("fatal");
    expect(await a.subir("../fuera", Uint8Array.from([1])).then(() => null, (x) => (x as ErrorAlmacen).tipo)).toBe("fatal");
    expect(await a.subir("a/../../fuera", Uint8Array.from([1])).then(() => null, (x) => (x as ErrorAlmacen).tipo)).toBe("fatal");
  });

  it("un archivo vacío se lee como vacío", async () => {
    const { url } = await a.subir("p/vacio", new Uint8Array(0));
    expect((await leerTodo(a, url)).byteLength).toBe(0);
  });
});

describe("concatenarFlujos y contarBytes", () => {
  it("entrega las fuentes en orden aunque se pidan por adelantado", async () => {
    const pedidas: number[] = [];
    const fuentes = [1, 2, 3, 4, 5].map((n) => async () => {
      pedidas.push(n);
      await new Promise((r) => setTimeout(r, 5 * (6 - n))); // las últimas responden primero
      return flujoDe([n, n], [n]);
    });
    expect(await recoger(concatenarFlujos(fuentes, undefined, 3))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]);
    expect(pedidas.sort()).toEqual([1, 2, 3, 4, 5]); // cada una se pidió una sola vez
  });

  it("sin adelantar las pide de a una, cuando toca; adelantando, pide también las siguientes", async () => {
    const pedidas: number[] = [];
    const fuentes = [1, 2, 3].map((n) => async () => {
      pedidas.push(n);
      return flujoDe([n]);
    });
    const sola = concatenarFlujos(fuentes).getReader();
    await sola.read();
    expect(pedidas).toEqual([1]);
    await sola.cancel();

    pedidas.length = 0;
    const doble = concatenarFlujos(fuentes, undefined, 2).getReader();
    await doble.read();
    expect(pedidas).toEqual([1, 2]); // la actual y la siguiente
    await doble.cancel();
  });

  it("sin fuentes termina vacío; una que falla hace fallar el flujo sin tragarse el error", async () => {
    expect(await recoger(concatenarFlujos([]))).toEqual([]);
    const f = concatenarFlujos([async () => flujoDe([1]), async () => { throw new Error("se cayó"); }, async () => flujoDe([3])], undefined, 3);
    await expect(recoger(f)).rejects.toThrow("se cayó");
  });

  it("una señal de cancelación corta el flujo", async () => {
    const control = new AbortController();
    const f = concatenarFlujos([async () => flujoDe([1]), async () => flujoDe([2])], control.signal);
    const lector = f.getReader();
    expect((await lector.read()).value).toEqual(Uint8Array.from([1]));
    control.abort();
    await expect(lector.read()).rejects.toThrow("Cancelado");
  });

  it("contarBytes suma lo que pasa", async () => {
    const c = contarBytes(flujoDe([1, 2, 3], [4, 5]));
    expect(c.bytes()).toBe(0);
    expect(await recoger(c.flujo)).toEqual([1, 2, 3, 4, 5]);
    expect(c.bytes()).toBe(5);
  });
});
