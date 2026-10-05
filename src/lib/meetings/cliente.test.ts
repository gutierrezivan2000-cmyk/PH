import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ErrorApi, actualizarReunion, clienteDeActa, crearPersona, crearReunion, eliminarReunion, listarIntervenciones, listarPersonas, listarReuniones,
  obtenerActa, obtenerEstado, obtenerReunion, pedirActa, preguntarALaReunion, procesarReunion, quitarFuente, reanudarActa, reintentarReunion, urlDeTranscripcion,
} from "./cliente";
import { codificarEvento } from "./sse";

const respuesta = (status: number, cuerpo: unknown, comoTexto = false) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (comoTexto) throw new SyntaxError("Unexpected token <");
      return cuerpo;
    },
  }) as Response;

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

describe("lecturas", () => {
  it("lista las reuniones, con o sin filtro por copropiedad", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { items: [{ id: "m1" }] }));
    expect(await listarReuniones()).toEqual([{ id: "m1" }]);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings", undefined);
    await listarReuniones("prop/1 &x");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings?propertyId=prop%2F1%20%26x", undefined);
  });
  it("trae el detalle y escapa la id", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { meeting: { id: "a" } }));
    await obtenerReunion("a/b");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/a%2Fb", undefined);
  });
  it("lista personas", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { items: [{ id: "p" }] }));
    expect(await listarPersonas("c1")).toEqual([{ id: "p" }]);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/properties/c1/people", undefined);
  });
});

describe("escrituras", () => {
  it("crea con JSON y devuelve la reunión", async () => {
    fetchMock.mockResolvedValue(respuesta(201, { meeting: { id: "nueva" } }));
    expect(await crearReunion({ propertyId: "c1", type: "consejo" })).toEqual({ id: "nueva" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/meetings");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ propertyId: "c1", type: "consejo" });
  });
  it("actualiza, elimina y crea personas con el método correcto", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { meeting: { id: "m" }, ok: true, person: { id: "p" } }));
    await actualizarReunion("m", { title: "x", consentAt: null });
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "x", consentAt: null });
    await eliminarReunion("m");
    expect(fetchMock.mock.calls[1]).toEqual(["/api/meetings/m", { method: "DELETE" }]);
    expect(await crearPersona("c1", { name: "Ana" })).toEqual({ id: "p" });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/properties/c1/people");
  });
});

describe("errores con mensaje para personas", () => {
  it("usa el mensaje que manda el servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(400, { error: "El título no puede quedar vacío." }));
    const e = await crearReunion({ propertyId: "c1" }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.message).toBe("El título no puede quedar vacío.");
    expect(e.status).toBe(400);
  });
  it("sin mensaje del servidor, uno por estado", async () => {
    const casos: Array<[number, RegExp]> = [[401, /sesión/], [404, /No lo encontramos/], [413, /demasiado grande/], [500, /de nuestro lado/], [502, /de nuestro lado/], [418, /Algo salió mal/]];
    for (const [status, re] of casos) {
      fetchMock.mockResolvedValueOnce(respuesta(status, null));
      expect(((await obtenerReunion("x").catch((e) => e)) as Error).message, String(status)).toMatch(re);
    }
  });
  it("una página de error HTML (504) no se lee como JSON: mensaje claro, no «Unexpected token <»", async () => {
    fetchMock.mockResolvedValue(respuesta(504, null, true));
    const e = await listarReuniones().catch((x) => x);
    expect(e.message).toMatch(/de nuestro lado/);
    expect(e.message).not.toMatch(/Unexpected/);
    expect(e.status).toBe(504);
  });
  it("sin conexión: estado 0 y un mensaje que dice qué hacer", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const e = await listarReuniones().catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.status).toBe(0);
    expect(e.message).toMatch(/internet/);
  });
  it("un error con mensaje vacío o que no es texto usa el de por defecto", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(400, { error: "" }));
    expect(((await listarReuniones().catch((e) => e)) as Error).message).toMatch(/Algo salió mal/);
    fetchMock.mockResolvedValueOnce(respuesta(400, { error: { code: 1 } }));
    expect(((await listarReuniones().catch((e) => e)) as Error).message).toMatch(/Algo salió mal/);
  });
});

describe("archivos de la reunión", () => {
  it("quita un archivo y procesa con el método y la ruta correctos", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { ok: true, status: "en_cola" }));
    await quitarFuente("m/1", "s 2");
    expect(fetchMock.mock.calls[0]).toEqual(["/api/meetings/m%2F1/sources/s%202", { method: "DELETE" }]);
    expect(await procesarReunion("m1")).toEqual({ ok: true, status: "en_cola" });
    expect(fetchMock.mock.calls[1]).toEqual(["/api/meetings/m1/process", { method: "POST" }]);
  });
  it("traduce los rechazos del servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(400, { error: "Sube al menos un archivo antes de procesar la reunión." }));
    const e = await procesarReunion("m1").catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.message).toMatch(/al menos un archivo/);
  });
});

describe("procesamiento", () => {
  it("consulta el estado liviano y escapa la id", async () => {
    const estado = { status: "procesando", stage: "preparando_audio", progress: 40, tareas: { hechas: 1, total: 3 } };
    fetchMock.mockResolvedValue(respuesta(200, estado));
    expect(await obtenerEstado("a/b")).toEqual(estado);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/a%2Fb/status", undefined);
  });
  it("reintenta con POST y devuelve el estado nuevo", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { status: "procesando" }));
    expect(await reintentarReunion("m1")).toEqual({ status: "procesando" });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/m1/retry", { method: "POST" });
  });
  it("un 409 trae el mensaje del servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(409, { error: "No hay nada que reintentar en esta reunión." }));
    await expect(reintentarReunion("m1")).rejects.toMatchObject({ status: 409, message: "No hay nada que reintentar en esta reunión." });
  });
});

describe("transcripción", () => {
  const pagina = { items: [{ id: "u1", startMs: 5000, endMs: 9000, speaker: "V1", text: "Hola" }], nombres: { V1: "Ana" }, siguienteMs: 1_800_000 };

  it("pide la primera página sin parámetros y escapa la id", async () => {
    fetchMock.mockResolvedValue(respuesta(200, pagina));
    expect(await listarIntervenciones("a/b")).toEqual(pagina);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/a%2Fb/utterances", undefined);
  });

  it("pide un tramo por minutos enteros y una búsqueda por texto", async () => {
    fetchMock.mockResolvedValue(respuesta(200, pagina));
    await listarIntervenciones("m1", { desdeMs: 1_800_000.4, hastaMs: 3_600_000 });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/m1/utterances?desde=1800000&hasta=3600000", undefined);
    await listarIntervenciones("m1", { q: "cámaras y vigilancia" });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/m1/utterances?q=c%C3%A1maras+y+vigilancia", undefined);
    await listarIntervenciones("m1", { desdeMs: -5 });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/m1/utterances?desde=0", undefined);
  });

  it("traduce los rechazos del servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(400, { error: "El minuto de inicio («desde») no es válido." }));
    await expect(listarIntervenciones("m1", { desdeMs: 1 })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no es válido/) });
  });

  it("la descarga apunta a la ruta del .txt", () => {
    expect(urlDeTranscripcion("m/1")).toBe("/api/meetings/m%2F1/transcript");
  });
});

describe("acta", () => {
  it("lee el acta más reciente, con o sin su texto, y escapa la id", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { acta: null, texto: null }));
    expect(await obtenerActa("a/b")).toEqual({ acta: null, texto: null });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/a%2Fb/acta", undefined);
    await obtenerActa("a", { texto: true });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/meetings/a/acta?texto=1", undefined);
  });

  it("la pide con POST y cuerpo vacío; y la retoma con el identificador del acta", async () => {
    fetchMock.mockResolvedValue(respuesta(201, { acta: { id: "g1" }, yaEnCurso: false }));
    expect(await pedirActa("m1")).toEqual({ acta: { id: "g1" }, yaEnCurso: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/meetings/m1/acta");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({});
    await reanudarActa("m1", "g1");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ reanudar: "g1" });
  });

  it("los errores del servidor llegan con su mensaje (por ejemplo, el cupo del plan)", async () => {
    fetchMock.mockResolvedValue(respuesta(429, { error: "Has alcanzado el límite diario de 3 generaciones." }));
    await expect(pedirActa("m1")).rejects.toMatchObject({ name: "ErrorApi", status: 429, message: "Has alcanzado el límite diario de 3 generaciones." });
  });

  it("el cliente del controlador usa esas tres funciones", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { acta: null, texto: null, yaEnCurso: false }));
    const c = clienteDeActa("m9");
    await c.obtener({ texto: true });
    await c.pedir();
    await c.reanudar("g7");
    expect(fetchMock.mock.calls.map((x) => x[0])).toEqual(["/api/meetings/m9/acta?texto=1", "/api/meetings/m9/acta", "/api/meetings/m9/acta"]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ reanudar: "g7" });
  });
});

describe("preguntar", () => {
  const sse = (...eventos: Array<[string, unknown]>) => {
    const cuerpo = new ReadableStream<Uint8Array>({
      start(c) {
        for (const [e, d] of eventos) c.enqueue(codificarEvento(e, d));
        c.close();
      },
    });
    return { ok: true, status: 200, body: cuerpo, json: async () => ({}) } as unknown as Response;
  };
  const pedido = { pregunta: "¿Qué se decidió?", historial: [{ rol: "user" as const, texto: "p" }, { rol: "assistant" as const, texto: "r" }] };
  const control = () => new AbortController();

  it("manda la pregunta con el historial y entrega la respuesta por trozos; devuelve si se cortó", async () => {
    fetchMock.mockResolvedValue(sse(["inicio", {}], ["delta", { texto: "Se aprobó " }], ["delta", { texto: "la prórroga." }], ["done", { cortada: false, modelo: "m" }]));
    const trozos: string[] = [];
    const c = control();
    const r = await preguntarALaReunion("a/b")(pedido, { alTexto: (t) => trozos.push(t), senal: c.signal });
    expect(r).toEqual({ cortada: false });
    expect(trozos).toEqual(["Se aprobó ", "la prórroga."]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/meetings/a%2Fb/preguntar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(pedido);
    expect(init.signal).toBe(c.signal);
  });

  it("una respuesta cortada por su largo lo dice", async () => {
    fetchMock.mockResolvedValue(sse(["delta", { texto: "x" }], ["done", { cortada: true }]));
    expect(await preguntarALaReunion("m")(pedido, { alTexto: () => {}, senal: control().signal })).toEqual({ cortada: true });
  });

  it("los errores de antes de empezar llegan con el mensaje del servidor (cupo, reunión sin terminar…)", async () => {
    fetchMock.mockResolvedValue(respuesta(429, { error: "Has alcanzado el límite diario de 30 mensajes. Intenta mañana." }));
    await expect(preguntarALaReunion("m")(pedido, { alTexto: () => {}, senal: control().signal })).rejects.toMatchObject({
      name: "ErrorApi", status: 429, message: "Has alcanzado el límite diario de 30 mensajes. Intenta mañana.",
    });
    fetchMock.mockResolvedValue(respuesta(502, null, true));
    await expect(preguntarALaReunion("m")(pedido, { alTexto: () => {}, senal: control().signal })).rejects.toMatchObject({ status: 502, message: "Tuvimos un problema de nuestro lado. Inténtalo de nuevo en un momento." });
  });

  it("un evento «error» a mitad de la respuesta se lanza con su mensaje, después de entregar lo que llegó", async () => {
    fetchMock.mockResolvedValue(sse(["delta", { texto: "a medias" }], ["error", { mensaje: "El servicio de IA está saturado." }]));
    const trozos: string[] = [];
    await expect(preguntarALaReunion("m")(pedido, { alTexto: (t) => trozos.push(t), senal: control().signal })).rejects.toMatchObject({ message: "El servicio de IA está saturado." });
    expect(trozos).toEqual(["a medias"]);
  });

  it("si el flujo se acaba sin «done» (se perdió la conexión), no se da por terminada", async () => {
    fetchMock.mockResolvedValue(sse(["delta", { texto: "x" }]));
    await expect(preguntarALaReunion("m")(pedido, { alTexto: () => {}, senal: control().signal })).rejects.toMatchObject({ message: "La respuesta se cortó antes de terminar. Inténtalo de nuevo." });
  });

  it("sin conexión: un mensaje claro; si la persona detuvo la respuesta, el AbortError tal cual", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(preguntarALaReunion("m")(pedido, { alTexto: () => {}, senal: control().signal })).rejects.toMatchObject({ status: 0, message: "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo." });
    const c = control();
    const abortado = new DOMException("Detenida", "AbortError");
    fetchMock.mockImplementation(async () => {
      c.abort();
      throw abortado;
    });
    await expect(preguntarALaReunion("m")(pedido, { alTexto: () => {}, senal: c.signal })).rejects.toBe(abortado);
  });

  it("los eventos con datos raros no rompen: se ignoran", async () => {
    fetchMock.mockResolvedValue(sse(["delta", { texto: 7 }], ["delta", null], ["delta", { texto: "ok" }], ["otro", {}], ["done", null]));
    const trozos: string[] = [];
    expect(await preguntarALaReunion("m")(pedido, { alTexto: (t) => trozos.push(t), senal: control().signal })).toEqual({ cortada: false });
    expect(trozos).toEqual(["ok"]);
  });
});
