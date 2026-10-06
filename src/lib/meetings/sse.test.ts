/** SSE: cómo se escribe un evento, el flujo de una ruta (con su error y su cancelación) y cómo se lee, partido como llegue. */
import { describe, expect, it } from "vitest";
import { codificarEvento, crearFlujoSSE, leerEventosSSE, type EventoSSE } from "./sse";

const flujoDe = (trozos: Array<string | Uint8Array>): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= trozos.length) return c.close();
      const t = trozos[i++];
      c.enqueue(typeof t === "string" ? enc.encode(t) : t);
    },
  });
};
const leerTodo = async (f: ReadableStream<Uint8Array>): Promise<EventoSSE[]> => {
  const salida: EventoSSE[] = [];
  for await (const e of leerEventosSSE(f)) salida.push(e);
  return salida;
};
const texto = async (f: ReadableStream<Uint8Array>): Promise<string> => {
  const dec = new TextDecoder();
  let s = "";
  const lector = f.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return s + dec.decode();
    s += dec.decode(value, { stream: true });
  }
};

describe("codificarEvento", () => {
  it("escribe el nombre y los datos en JSON, en una línea, y cierra con una línea en blanco", () => {
    expect(new TextDecoder().decode(codificarEvento("delta", { texto: "Hola\nmundo «ñ»" }))).toBe('event: delta\ndata: {"texto":"Hola\\nmundo «ñ»"}\n\n');
  });
});

describe("leerEventosSSE", () => {
  it("lee varios eventos de un solo trozo", async () => {
    const f = flujoDe(['event: delta\ndata: {"texto":"a"}\n\nevent: done\ndata: {"ok":true}\n\n']);
    expect(await leerTodo(f)).toEqual([{ evento: "delta", datos: { texto: "a" } }, { evento: "done", datos: { ok: true } }]);
  });

  it("un evento partido en cualquier punto se entrega entero (se prueba cortando de todas las formas posibles)", async () => {
    const entero = 'event: delta\ndata: {"texto":"Se aprobó la prórroga. ñandú 😀"}\n\nevent: done\ndata: {"cortada":false}\n\n';
    const bytes = new TextEncoder().encode(entero);
    for (let corte = 1; corte < bytes.length; corte++) {
      const r = await leerTodo(flujoDe([bytes.slice(0, corte), bytes.slice(corte)]));
      expect(r, `cortado en ${corte}`).toEqual([{ evento: "delta", datos: { texto: "Se aprobó la prórroga. ñandú 😀" } }, { evento: "done", datos: { cortada: false } }]);
    }
  });

  it("byte a byte también", async () => {
    const bytes = new TextEncoder().encode('event: delta\ndata: {"t":"ñ😀"}\n\n');
    expect(await leerTodo(flujoDe(Array.from(bytes, (b) => new Uint8Array([b]))))).toEqual([{ evento: "delta", datos: { t: "ñ😀" } }]);
  });

  it("entiende los saltos de línea de Windows, aunque el \\r y el \\n lleguen en trozos distintos", async () => {
    expect(await leerTodo(flujoDe(['event: a\r', '\ndata: {"x":1}\r\n', '\r\n']))).toEqual([{ evento: "a", datos: { x: 1 } }]);
  });

  it("sin nombre de evento es «message»; los comentarios (latidos) no cuentan; un espacio después de «data:» es opcional", async () => {
    expect(await leerTodo(flujoDe([': latido\n\ndata:{"x":1}\n\n: otro\ndata: {"y":2}\n\n']))).toEqual([{ evento: "message", datos: { x: 1 } }, { evento: "message", datos: { y: 2 } }]);
  });

  it("un evento sin datos o con datos que no son JSON se descarta, y los demás siguen", async () => {
    expect(await leerTodo(flujoDe(['event: vacio\n\nevent: roto\ndata: {no es json\n\nevent: bien\ndata: {"ok":1}\n\n']))).toEqual([{ evento: "bien", datos: { ok: 1 } }]);
  });

  it("un último evento al que no le llegó la línea en blanco también se entrega", async () => {
    expect(await leerTodo(flujoDe(['event: done\ndata: {"ok":true}']))).toEqual([{ evento: "done", datos: { ok: true } }]);
    expect(await leerTodo(flujoDe(["   \n"]))).toEqual([]);
  });

  it("varias líneas de datos se unen con salto de línea (JSON válido)", async () => {
    expect(await leerTodo(flujoDe(['data: {"a":\ndata: 1}\n\n']))).toEqual([{ evento: "message", datos: { a: 1 } }]);
  });

  it("un flujo vacío no entrega nada; y si quien lee se va a la mitad, el flujo se cancela", async () => {
    expect(await leerTodo(flujoDe([]))).toEqual([]);
    let cancelado = false;
    const f = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(codificarEvento("delta", { texto: "x" }));
      },
      cancel() {
        cancelado = true;
      },
    });
    for await (const e of leerEventosSSE(f)) {
      expect(e.evento).toBe("delta");
      break;
    }
    expect(cancelado).toBe(true);
  });
});

describe("crearFlujoSSE", () => {
  it("manda lo que `ejecutar` envía y cierra al terminar", async () => {
    const f = crearFlujoSSE(async (enviar) => {
      enviar("inicio", {});
      enviar("delta", { texto: "Hola" });
      enviar("done", { ok: true });
    });
    expect(await leerTodo(f)).toEqual([{ evento: "inicio", datos: {} }, { evento: "delta", datos: { texto: "Hola" } }, { evento: "done", datos: { ok: true } }]);
  });

  it("los eventos llegan mientras `ejecutar` todavía trabaja (no se acumulan hasta el final)", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    const f = crearFlujoSSE(async (enviar) => {
      enviar("delta", { texto: "primero" });
      await espera;
      enviar("delta", { texto: "segundo" });
    });
    const it = leerEventosSSE(f);
    expect((await it.next()).value).toEqual({ evento: "delta", datos: { texto: "primero" } });
    soltar();
    expect((await it.next()).value).toEqual({ evento: "delta", datos: { texto: "segundo" } });
    expect((await it.next()).done).toBe(true);
  });

  it("si `ejecutar` falla, manda un evento «error» con el mensaje (sin detalles internos) y cierra", async () => {
    const f = crearFlujoSSE(
      async (enviar) => {
        enviar("delta", { texto: "a medias" });
        throw new Error("postgres://secreto");
      },
      () => "El servicio de IA no respondió.",
    );
    const r = await leerTodo(f);
    expect(r).toEqual([{ evento: "delta", datos: { texto: "a medias" } }, { evento: "error", datos: { mensaje: "El servicio de IA no respondió." } }]);
    expect(JSON.stringify(r)).not.toContain("secreto");
  });

  it("sin traductor de errores, el mensaje es uno genérico y claro", async () => {
    const r = await leerTodo(crearFlujoSSE(async () => { throw new Error("x"); }));
    expect(r).toEqual([{ evento: "error", datos: { mensaje: "No pudimos completar la respuesta. Inténtalo de nuevo." } }]);
  });

  it("si quien lee se va, se cancela la señal (para dejar de gastar) y lo que se envíe después se descarta sin romper nada", async () => {
    let senalRecibida: AbortSignal | null = null;
    let enviarTarde: ((e: string, d: unknown) => void) | null = null;
    let terminar!: () => void;
    const f = crearFlujoSSE(async (enviar, senal) => {
      senalRecibida = senal;
      enviarTarde = enviar;
      enviar("delta", { texto: "x" });
      await new Promise<void>((r) => (terminar = r));
    });
    const lector = f.getReader();
    await lector.read();
    expect(senalRecibida!.aborted).toBe(false);
    await lector.cancel();
    expect(senalRecibida!.aborted).toBe(true);
    expect(() => enviarTarde!("delta", { texto: "tarde" })).not.toThrow();
    terminar();
  });

  it("si falla DESPUÉS de que quien lee se fue, no manda nada ni lanza", async () => {
    let fallar!: () => void;
    const f = crearFlujoSSE(async () => {
      await new Promise<void>((_, rechazar) => (fallar = () => rechazar(new Error("tarde"))));
    });
    const lector = f.getReader();
    await lector.cancel();
    expect(() => fallar()).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
  });

  it("el texto crudo del flujo es SSE bien formado", async () => {
    expect(await texto(crearFlujoSSE(async (enviar) => enviar("done", { ok: true })))).toBe('event: done\ndata: {"ok":true}\n\n');
  });
});
