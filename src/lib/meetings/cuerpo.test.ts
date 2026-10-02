import { describe, expect, it } from "vitest";
import { leerCuerpoAcotado } from "./cuerpo";

const pedido = (cuerpo?: BodyInit | null) => new Request("http://localhost/x", { method: "POST", body: cuerpo ?? null, ...(cuerpo instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
const flujo = (trozos: Array<Uint8Array | Error>) =>
  new ReadableStream<Uint8Array>({
    start(control) {
      for (const t of trozos) {
        if (t instanceof Error) control.error(t);
        else control.enqueue(t);
      }
      if (!trozos.some((t) => t instanceof Error)) control.close();
    },
  });

describe("leerCuerpoAcotado", () => {
  it("devuelve el cuerpo completo si cabe", async () => {
    const r = await leerCuerpoAcotado(pedido(new Uint8Array([1, 2, 3, 4])), 10);
    expect(r).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
  it("un cuerpo del tamaño exacto del tope cabe; un byte más, no", async () => {
    expect(await leerCuerpoAcotado(pedido(new Uint8Array(10)), 10)).toHaveLength(10);
    expect(await leerCuerpoAcotado(pedido(new Uint8Array(11)), 10)).toBe("excede");
  });
  it("sin cuerpo da un arreglo vacío", async () => {
    expect(await leerCuerpoAcotado(pedido(), 10)).toEqual(new Uint8Array(0));
  });
  it("corta apenas se pasa del tope aunque llegue en trozos y sin Content-Length", async () => {
    let leidos = 0;
    const largo = new ReadableStream<Uint8Array>({
      pull(control) {
        leidos++;
        control.enqueue(new Uint8Array(4));
        if (leidos > 1000) control.close();
      },
    });
    const r = await leerCuerpoAcotado(pedido(largo), 10);
    expect(r).toBe("excede");
    expect(leidos).toBeLessThan(10); // no se leyó el flujo entero
  });
  it("une los trozos en orden", async () => {
    const r = await leerCuerpoAcotado(pedido(flujo([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])])), 10);
    expect(r).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
  it("si la conexión se corta a medias, null", async () => {
    expect(await leerCuerpoAcotado(pedido(flujo([new Uint8Array([1]), new Error("conexión cortada")])), 10)).toBeNull();
  });
});
