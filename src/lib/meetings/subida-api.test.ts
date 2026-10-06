import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const crearMultipart = vi.fn();
const subirParte = vi.fn();
const completarMultipart = vi.fn();
vi.mock("@vercel/blob/client", () => ({
  createMultipartUpload: (...a: unknown[]) => crearMultipart(...a),
  uploadPart: (...a: unknown[]) => subirParte(...a),
  completeMultipartUpload: (...a: unknown[]) => completarMultipart(...a),
}));

import { clasificarErrorBlob, crearApiSimulada, crearApiSubida } from "./subida-api";
import { ErrorSubida, errorDeAborto } from "./subida-reanudable";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 300, status, json: async () => cuerpo }) as Response;
const senal = () => new AbortController().signal;

beforeEach(() => {
  fetchMock.mockReset();
  crearMultipart.mockReset();
  subirParte.mockReset();
  completarMultipart.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("clasificarErrorBlob (con los mensajes reales del SDK de Vercel Blob)", () => {
  const tipo = (mensaje: string) => {
    const e = clasificarErrorBlob(new Error(mensaje));
    return e instanceof ErrorSubida ? e.tipo : "otro";
  };

  it("permiso vencido → token (se renueva)", () => {
    expect(tipo("Vercel Blob: Client token has expired.")).toBe("token");
    expect(tipo("Client token has expired.")).toBe("token");
    expect(tipo("Vercel Blob: Access denied, please provide a valid token for this resource.")).toBe("token");
  });
  it("sin remedio → fatal, con un mensaje para la persona (no el texto en inglés)", () => {
    for (const m of [
      "Vercel Blob: Content type mismatch, application/pdf is not allowed.",
      "Vercel Blob: File is too large, the file length cannot be greater than 1000.",
      "Vercel Blob: This store does not exist.",
      "Vercel Blob: This store has been suspended.",
      'Vercel Blob: The "pathname" does not match the token payload.',
    ]) {
      const e = clasificarErrorBlob(new Error(m)) as ErrorSubida;
      expect(e.tipo, m).toBe("fatal");
      expect(e.message, m).not.toMatch(/Vercel Blob|store|token payload/);
    }
  });
  it("la subida ya no es válida (bad request del servicio, upload inexistente) → caducada (se empieza de nuevo)", () => {
    expect(tipo("Vercel Blob: Invalid part etag")).toBe("caducada");
    expect(tipo("Vercel Blob: Bad request")).toBe("caducada");
    expect(tipo("NoSuchUpload: the upload id does not exist")).toBe("caducada");
    expect(tipo("multipart upload not found")).toBe("caducada");
  });
  it("red, saturación y errores desconocidos → transitorio (se reintenta)", () => {
    for (const m of [
      "Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "Unknown error, please visit https://vercel.com/help.",
      "The blob service is currently not available. Please try again.",
      "Too many requests please lower the number of concurrent requests",
    ]) expect(tipo(m), m).toBe("transitorio");
  });
  it("deja pasar tal cual los abortos nuestros y los ErrorSubida ya clasificados", () => {
    const aborto = errorDeAborto();
    expect(clasificarErrorBlob(aborto)).toBe(aborto);
    const sdk = new Error("Vercel Blob: The request was aborted.");
    expect(clasificarErrorBlob(sdk)).toBe(sdk);
    const ya = new ErrorSubida("x", "fatal");
    expect(clasificarErrorBlob(ya)).toBe(ya);
  });
  it("lo que no es un Error (texto, undefined) no rompe: pasajero", () => {
    expect((clasificarErrorBlob("algo raro") as ErrorSubida).tipo).toBe("transitorio");
    expect((clasificarErrorBlob(undefined) as ErrorSubida).tipo).toBe("transitorio");
  });
});

describe("pedirToken", () => {
  const datos = { nombre: "a.m4a", tamano: 10, tipo: "audio/mp4" };
  it("devuelve el permiso del servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { token: "t", pathname: "meetings/m/fuentes/aaaaaaaa-a.m4a", contentType: "audio/mp4", partSize: 16777216 }));
    expect(await crearApiSubida("m1").pedirToken(datos, senal())).toMatchObject({ token: "t", partSize: 16777216 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/meetings/m1/upload-token");
    expect(JSON.parse(init.body)).toEqual(datos);
  });
  it("un 4xx es un rechazo definitivo con el mensaje del servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(409, { error: "Esta reunión ya no admite más archivos." }));
    const e = (await crearApiSubida("m1").pedirToken(datos, senal()).catch((x) => x)) as ErrorSubida;
    expect([e.tipo, e.message]).toEqual(["fatal", "Esta reunión ya no admite más archivos."]);
  });
  it("un 5xx, un 429 o la red caída se reintentan", async () => {
    for (const status of [500, 502, 503, 429, 408]) {
      fetchMock.mockResolvedValueOnce(respuesta(status, null));
      expect(((await crearApiSubida("m1").pedirToken(datos, senal()).catch((x) => x)) as ErrorSubida).tipo, String(status)).toBe("transitorio");
    }
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(((await crearApiSubida("m1").pedirToken(datos, senal()).catch((x) => x)) as ErrorSubida).tipo).toBe("transitorio");
  });
  it("sin sesión (401): fatal con un mensaje que dice qué hacer", async () => {
    fetchMock.mockResolvedValue(respuesta(401, { error: "No autorizado" }));
    const e = (await crearApiSubida("m1").pedirToken(datos, senal()).catch((x) => x)) as ErrorSubida;
    expect(e.tipo).toBe("fatal");
    expect(e.message).toMatch(/Vuelve a iniciar sesión/);
  });
  it("si la señal se activa, es un aborto (no un fallo de red)", async () => {
    const c = new AbortController();
    fetchMock.mockImplementation(async () => { c.abort(); throw new DOMException("x", "AbortError"); });
    const e = await crearApiSubida("m1").pedirToken(datos, c.signal).catch((x) => x);
    expect(e.name).toBe("AbortError");
  });
  it("una respuesta 200 incompleta no se acepta", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { demo: true }));
    expect(await crearApiSubida("m1").pedirToken(datos, senal()).catch((x) => x)).toBeInstanceOf(ErrorSubida);
  });
});

describe("registrar", () => {
  const datos = { url: "https://x.blob.vercel-storage.com/a", pathname: "meetings/m/fuentes/aaaaaaaa-a.m4a", nombre: "a.m4a", tamano: 10, tipo: "audio/mp4" };
  it("acepta 201 (nuevo) y 200 (ya estaba registrado)", async () => {
    for (const status of [200, 201]) {
      fetchMock.mockResolvedValueOnce(respuesta(status, { source: {} }));
      await expect(crearApiSubida("m1").registrar(datos, senal())).resolves.toBeUndefined();
    }
  });
  it("«Vuelve a subirlo» (no existe o no llegó completo) → se empieza de nuevo", async () => {
    for (const [status, error] of [[400, "No encontramos el archivo en el almacenamiento. Vuelve a subirlo."], [409, "El archivo no llegó completo. Vuelve a subirlo."]] as const) {
      fetchMock.mockResolvedValueOnce(respuesta(status, { error }));
      expect(((await crearApiSubida("m1").registrar(datos, senal()).catch((x) => x)) as ErrorSubida).tipo, error).toBe("caducada");
    }
  });
  it("otros rechazos son definitivos y los fallos del servidor se reintentan", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, { error: "Esta reunión ya no admite más archivos: se está procesando o ya está lista." }));
    expect(((await crearApiSubida("m1").registrar(datos, senal()).catch((x) => x)) as ErrorSubida).tipo).toBe("fatal");
    fetchMock.mockResolvedValueOnce(respuesta(500, { error: "No pudimos registrar el archivo. Inténtalo de nuevo." }));
    expect(((await crearApiSubida("m1").registrar(datos, senal()).catch((x) => x)) as ErrorSubida).tipo).toBe("transitorio");
  });
});

describe("Blob (partes)", () => {
  const base = { pathname: "meetings/m/fuentes/aaaaaaaa-a.m4a", token: "tok", contentType: "audio/mp4" };
  it("crea la subida PRIVADA con el permiso y la señal", async () => {
    crearMultipart.mockResolvedValue({ key: "k", uploadId: "u" });
    const s = senal();
    expect(await crearApiSubida("m1").crearMultipart(base, s)).toEqual({ key: "k", uploadId: "u" });
    expect(crearMultipart).toHaveBeenCalledWith(base.pathname, { access: "private", token: "tok", contentType: "audio/mp4", abortSignal: s });
  });
  it("sube cada parte con su número, avisa del avance y devuelve etag y número", async () => {
    subirParte.mockImplementation(async (_p, _c, o) => { o.onUploadProgress({ loaded: 5, total: 10, percentage: 50 }); return { etag: "e7", partNumber: 7 }; });
    const avances: number[] = [];
    const cuerpo = new Blob([new Uint8Array(10)]);
    const r = await crearApiSubida("m1").subirParte({ ...base, key: "k", uploadId: "u", numero: 7, cuerpo, alProgreso: (b) => avances.push(b) }, senal());
    expect(r).toEqual({ etag: "e7", partNumber: 7 });
    expect(avances).toEqual([5]);
    expect(subirParte.mock.calls[0][2]).toMatchObject({ access: "private", token: "tok", key: "k", uploadId: "u", partNumber: 7 });
  });
  it("completa con las partes ordenadas como llegan y devuelve la URL y la ruta", async () => {
    completarMultipart.mockResolvedValue({ url: "https://x/y", pathname: "p", extra: 1 });
    const partes = [{ etag: "a", partNumber: 1 }, { etag: "b", partNumber: 2 }];
    expect(await crearApiSubida("m1").completar({ ...base, key: "k", uploadId: "u", partes }, senal())).toEqual({ url: "https://x/y", pathname: "p" });
    expect(completarMultipart.mock.calls[0][1]).toBe(partes);
  });
  it("traduce los fallos del SDK", async () => {
    subirParte.mockRejectedValue(new Error("Vercel Blob: Client token has expired."));
    const e = (await crearApiSubida("m1").subirParte({ ...base, key: "k", uploadId: "u", numero: 1, cuerpo: new Blob([]), alProgreso: () => {} }, senal()).catch((x) => x)) as ErrorSubida;
    expect(e.tipo).toBe("token");
    completarMultipart.mockRejectedValue(new Error("Vercel Blob: Invalid part"));
    const c = (await crearApiSubida("m1").completar({ ...base, key: "k", uploadId: "u", partes: [] }, senal()).catch((x) => x)) as ErrorSubida;
    expect(c.tipo).toBe("caducada");
  });
});

describe("API simulada del demo", () => {
  it("la subida «tarda» según el tamaño, avisa del avance y se puede cortar", async () => {
    vi.useFakeTimers();
    const api = crearApiSimulada("m1", 16 * 1024 * 1024); // 16 MB/s
    const avances: number[] = [];
    const cuerpo = { size: 16 * 1024 * 1024 } as Blob;
    const p = api.subirParte({ pathname: "x", token: "demo", key: "k", uploadId: "u", numero: 3, cuerpo, contentType: "audio/mp4", alProgreso: (b) => avances.push(b) }, senal());
    await vi.advanceTimersByTimeAsync(1100);
    expect(await p).toEqual({ etag: "demo-etag-3", partNumber: 3 });
    expect(avances).toHaveLength(8);
    expect(avances[avances.length - 1]).toBe(16 * 1024 * 1024);

    const c = new AbortController();
    const q = api.subirParte({ pathname: "x", token: "demo", key: "k", uploadId: "u", numero: 1, cuerpo, contentType: "audio/mp4", alProgreso: () => {} }, c.signal);
    await vi.advanceTimersByTimeAsync(300);
    c.abort();
    await expect(q).rejects.toMatchObject({ name: "AbortError" });
  });
  it("crear y completar son locales; token y registro van al servidor", async () => {
    const api = crearApiSimulada("m1");
    expect((await api.crearMultipart({ pathname: "p", token: "t", contentType: "x" }, senal())).uploadId).toMatch(/^demo-up-/);
    expect(await api.completar({ pathname: "meetings/m1/fuentes/a", token: "t", key: "k", uploadId: "u", partes: [], contentType: "x" }, senal()))
      .toEqual({ url: "https://demo.private.blob.vercel-storage.com/meetings/m1/fuentes/a", pathname: "meetings/m1/fuentes/a" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(respuesta(200, { token: "demo", pathname: "p", contentType: "x", partSize: 1, demo: true }));
    await api.pedirToken({ nombre: "a.mp3", tamano: 1, tipo: "audio/mpeg" }, senal());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/meetings/m1/upload-token");
  });
});
