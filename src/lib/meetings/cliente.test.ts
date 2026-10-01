import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorApi, actualizarReunion, crearPersona, crearReunion, eliminarReunion, listarPersonas, listarReuniones, obtenerReunion } from "./cliente";

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
