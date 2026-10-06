import { describe, expect, it, vi } from "vitest";
import { ErrorGrabacion } from "./grabadora";
import { crearApiGrabacion, errorDeRespuesta } from "./grabadora-api";

type Llamada = { url: string; init: RequestInit };

/** `fetch` de mentira: devuelve las respuestas en orden y guarda lo que se le pidió. */
function fetchFalso(...respuestas: Array<{ status: number; json?: unknown } | Error | "colgar">) {
  const llamadas: Llamada[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    const r = respuestas.shift();
    if (r === undefined) throw new Error("Sin más respuestas preparadas");
    if (r instanceof Error) throw r;
    if (r === "colgar") {
      return new Promise<Response>((_res, rechazar) => {
        init?.signal?.addEventListener("abort", () => rechazar(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, llamadas };
}

const senal = () => new AbortController().signal;
const rechazo = async (p: Promise<unknown>) => p.then(() => null, (e) => e as Error);

describe("errorDeRespuesta", () => {
  it("un 401 pide volver a iniciar sesión y no se reintenta solo", () => {
    const e = errorDeRespuesta({ status: 401, json: null }, "x");
    expect(e).toMatchObject({ tipo: "fatal", message: expect.stringMatching(/sesión terminó/) });
  });
  it("408, 429 y 5xx son del momento; el resto es definitivo y usa el mensaje del servidor", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) expect(errorDeRespuesta({ status, json: { error: "x" } }, "p").tipo, String(status)).toBe("transitorio");
    for (const status of [400, 403, 404, 409, 413, 415, 422]) expect(errorDeRespuesta({ status, json: { error: "x" } }, "p").tipo, String(status)).toBe("fatal");
    expect(errorDeRespuesta({ status: 409, json: { error: "Esta reunión ya no admite más audio." } }, "p").message).toBe("Esta reunión ya no admite más audio.");
    expect(errorDeRespuesta({ status: 500, json: null }, "mensaje por defecto").message).toBe("mensaje por defecto");
  });
});

describe("subirParte", () => {
  const parte = { session: 2, seq: 7, durMs: 29_999.6, mime: "audio/webm;codecs=opus", cuerpo: new Blob([new Uint8Array(10)]) };

  it("manda el audio como cuerpo y los datos en cabeceras", async () => {
    const { fetchFn, llamadas } = fetchFalso({ status: 200, json: { ok: true } });
    await crearApiGrabacion("m1", fetchFn).subirParte(parte, senal());
    expect(llamadas[0].url).toBe("/api/meetings/m1/live");
    expect(llamadas[0].init.method).toBe("POST");
    expect(llamadas[0].init.headers).toEqual({ "Content-Type": "audio/webm;codecs=opus", "X-Sesion": "2", "X-Secuencia": "7", "X-Duracion-Ms": "30000" });
    expect(llamadas[0].init.body).toBe(parte.cuerpo);
  });

  it("un corte de red es pasajero", async () => {
    const { fetchFn } = fetchFalso(new TypeError("Failed to fetch"));
    expect(await rechazo(crearApiGrabacion("m1", fetchFn).subirParte(parte, senal()))).toMatchObject({ tipo: "transitorio" });
  });

  it("un error del servidor es pasajero y un rechazo es definitivo", async () => {
    const api = (r: { status: number; json?: unknown }) => crearApiGrabacion("m1", fetchFalso(r).fetchFn);
    expect(await rechazo(api({ status: 503 }).subirParte(parte, senal()))).toMatchObject({ tipo: "transitorio" });
    const e = await rechazo(api({ status: 409, json: { error: "Antes de grabar, confirma que avisaste a los asistentes." } }).subirParte(parte, senal()));
    expect(e).toBeInstanceOf(ErrorGrabacion);
    expect(e).toMatchObject({ tipo: "fatal", message: "Antes de grabar, confirma que avisaste a los asistentes." });
  });

  it("la reunión con un id raro viaja codificada en la ruta", async () => {
    const { fetchFn, llamadas } = fetchFalso({ status: 200 });
    await crearApiGrabacion("a/b c", fetchFn).subirParte(parte, senal());
    expect(llamadas[0].url).toBe("/api/meetings/a%2Fb%20c/live");
  });

  it("salir sin esperar corta la petición con un aborto, no con un error de red", async () => {
    const { fetchFn } = fetchFalso("colgar");
    const control = new AbortController();
    const pendiente = rechazo(crearApiGrabacion("m1", fetchFn).subirParte(parte, control.signal));
    control.abort();
    expect(await pendiente).toMatchObject({ name: "AbortError" });
    expect(await rechazo(crearApiGrabacion("m1", fetchFalso().fetchFn).subirParte(parte, control.signal))).toMatchObject({ name: "AbortError" });
  });

  it("una petición que no avanza se corta como pasajera tras el tiempo máximo", async () => {
    vi.useFakeTimers();
    try {
      const { fetchFn } = fetchFalso("colgar");
      const pendiente = rechazo(crearApiGrabacion("m1", fetchFn).subirParte(parte, senal()));
      await vi.advanceTimersByTimeAsync(90_000);
      expect(await pendiente).toMatchObject({ tipo: "transitorio", message: expect.stringMatching(/demasiado lenta/) });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("nuevaSesion", () => {
  it("devuelve el número y el punto de la reunión donde empieza", async () => {
    const { fetchFn, llamadas } = fetchFalso({ status: 200, json: { session: 3, offsetMs: 61_000 } });
    expect(await crearApiGrabacion("m1", fetchFn).nuevaSesion()).toEqual({ session: 3, offsetMs: 61_000 });
    expect(llamadas[0].url).toBe("/api/meetings/m1/live/sesion");
  });
  it("una respuesta rara o un rechazo es un error (el motor usará un número local)", async () => {
    expect(await rechazo(crearApiGrabacion("m1", fetchFalso({ status: 200, json: { session: "x" } }).fetchFn).nuevaSesion())).toBeInstanceOf(Error);
    expect(await rechazo(crearApiGrabacion("m1", fetchFalso({ status: 409, json: { error: "Falta la constancia." } }).fetchFn).nuevaSesion())).toMatchObject({ tipo: "fatal" });
  });
});

describe("marcar", () => {
  const marca = { id: "marca-1-1", atMs: 61_000, kind: "tema", note: null };
  it("acepta 200 y 201", async () => {
    for (const status of [200, 201]) {
      const { fetchFn, llamadas } = fetchFalso({ status, json: { marker: {} } });
      await crearApiGrabacion("m1", fetchFn).marcar(marca, senal());
      expect(llamadas[0].url).toBe("/api/meetings/m1/markers");
      expect(JSON.parse(llamadas[0].init.body as string)).toEqual(marca);
    }
  });
  it("un 400 es definitivo (se descarta la marca) y un 500 se reintenta", async () => {
    expect(await rechazo(crearApiGrabacion("m1", fetchFalso({ status: 400, json: { error: "Tipo no válido" } }).fetchFn).marcar(marca, senal()))).toMatchObject({ tipo: "fatal" });
    expect(await rechazo(crearApiGrabacion("m1", fetchFalso({ status: 500 }).fetchFn).marcar(marca, senal()))).toMatchObject({ tipo: "transitorio" });
  });
});

describe("cerrar", () => {
  const sesiones = [{ session: 1, ultimaSecuencia: 3, mimeType: "audio/webm", duracionMs: 118_000 }];

  it("200: devuelve el estado que dice el servidor", async () => {
    const { fetchFn, llamadas } = fetchFalso({ status: 200, json: { status: "en_cola" } });
    expect(await crearApiGrabacion("m1", fetchFn).cerrar({ sesiones }, senal())).toEqual({ ok: true, status: "en_cola" });
    expect(llamadas[0].url).toBe("/api/meetings/m1/process");
    expect(JSON.parse(llamadas[0].init.body as string)).toEqual({ sesiones });
  });

  it("409 con partes faltantes: las devuelve (sin inventar las que no cuadran)", async () => {
    const { fetchFn } = fetchFalso({ status: 409, json: { error: "Faltan partes", faltan: [{ session: 1, seq: 2 }, { session: "x" }, null, { session: 1, seq: 5 }] } });
    expect(await crearApiGrabacion("m1", fetchFn).cerrar({ sesiones }, senal())).toEqual({ ok: false, faltan: [{ session: 1, seq: 2 }, { session: 1, seq: 5 }] });
  });

  it("otros errores: 409 sin faltantes y 400 son definitivos; 503 y la red caída son pasajeros", async () => {
    const api = (r: { status: number; json?: unknown } | Error) => crearApiGrabacion("m1", fetchFalso(r).fetchFn);
    expect(await rechazo(api({ status: 409, json: { error: "Esta reunión ya no admite más audio." } }).cerrar({ sesiones }, senal()))).toMatchObject({ tipo: "fatal" });
    expect(await rechazo(api({ status: 409, json: { faltan: [] } }).cerrar({ sesiones }, senal()))).toMatchObject({ tipo: "fatal" });
    expect(await rechazo(api({ status: 400, json: { error: "Sube al menos un archivo" } }).cerrar({ sesiones }, senal()))).toMatchObject({ tipo: "fatal" });
    expect(await rechazo(api({ status: 503 }).cerrar({ sesiones }, senal()))).toMatchObject({ tipo: "transitorio" });
    expect(await rechazo(api(new TypeError("Failed to fetch")).cerrar({ sesiones }, senal()))).toMatchObject({ tipo: "transitorio" });
  });
});
