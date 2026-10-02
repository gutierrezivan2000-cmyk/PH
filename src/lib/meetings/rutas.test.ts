import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("db tocada: ¿falta la rama demo o la puerta de acceso?"); } }),
}));

import { POST as registrarParte } from "@/app/api/meetings/[id]/live/route";
import { POST as nuevaSesion } from "@/app/api/meetings/[id]/live/sesion/route";
import { POST as marcar } from "@/app/api/meetings/[id]/markers/route";
import { POST as procesar } from "@/app/api/meetings/[id]/process/route";
import { DELETE as quitarFuente } from "@/app/api/meetings/[id]/sources/[sourceId]/route";
import { POST as registrarFuente } from "@/app/api/meetings/[id]/sources/route";
import { POST as pedirToken } from "@/app/api/meetings/[id]/upload-token/route";
import { DELETE as eliminarPersona, PATCH as editarPersona } from "@/app/api/properties/[propertyId]/people/[personId]/route";
import { GET as listarPersonas, POST as crearPersona } from "@/app/api/properties/[propertyId]/people/route";
import { DELETE as eliminarReunion, GET as leerReunion, PATCH as editarReunion } from "@/app/api/meetings/[id]/route";
import { GET as listarReuniones, POST as crearReunion } from "@/app/api/meetings/route";
import { reiniciarDemoReuniones } from "./demo";

const URL_BASE = "http://localhost/api";
const pedir = (ruta: string, metodo = "GET", cuerpo?: unknown) =>
  new NextRequest(`${URL_BASE}${ruta}`, {
    method: metodo,
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } } : {}),
  });
/** Una parte de la grabadora: cuerpo binario y datos en cabeceras. */
const pedirParte = (opciones: { session?: number | string; seq?: number | string; durMs?: number | string; bytes?: number; tipo?: string } = {}) => {
  const { session = 1, seq = 0, durMs = 30_000, bytes = 1000, tipo = "audio/webm;codecs=opus" } = opciones;
  return new NextRequest(`${URL_BASE}/meetings/x/live`, {
    method: "POST",
    body: new Uint8Array(bytes),
    headers: { "content-type": tipo, "x-sesion": String(session), "x-secuencia": String(seq), "x-duracion-ms": String(durMs) },
  });
};
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });

const sesionDemo = () => auth.mockResolvedValue({ user: { id: "x", email: "demo@phgestion.app", role: "user" } });

beforeEach(() => {
  auth.mockReset();
  reiniciarDemoReuniones();
  vi.stubEnv("DEMO_MODE", "true");
  sesionDemo();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/meetings", () => {
  it("lista las 5 reuniones del demo, la más reciente primero", async () => {
    const { status, cuerpo } = await json(await listarReuniones(pedir("/meetings")));
    expect(status).toBe(200);
    expect(cuerpo.items).toHaveLength(5);
    const fechas: string[] = cuerpo.items.map((r: { date: string }) => r.date);
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });
  it("filtra por copropiedad", async () => {
    const { cuerpo } = await json(await listarReuniones(pedir("/meetings?propertyId=prop-demo-002")));
    expect(cuerpo.items).toHaveLength(2);
    expect(cuerpo.items.every((r: { propertyId: string }) => r.propertyId === "prop-demo-002")).toBe(true);
  });
});

describe("POST /api/meetings", () => {
  it("crea un borrador con el título sugerido", async () => {
    const { status, cuerpo } = await json(await crearReunion(pedir("/meetings", "POST", { propertyId: "prop-demo-001" })));
    expect(status).toBe(201);
    expect(cuerpo.meeting).toMatchObject({ status: "borrador", type: "consejo", propertyName: "Conjunto Residencial Los Pinos" });
    expect(cuerpo.meeting.title).toMatch(/^Reunión de consejo — \d{1,2} de \p{L}+$/u);
  });
  it("limpia el título y respeta tipo y fecha", async () => {
    const { status, cuerpo } = await json(
      await crearReunion(pedir("/meetings", "POST", { propertyId: "prop-demo-002", type: "comite", title: "  Comité   de convivencia ", date: "2026-11-05T19:00:00-05:00" })),
    );
    expect(status).toBe(201);
    expect(cuerpo.meeting).toMatchObject({ title: "Comité de convivencia", type: "comite", date: "2026-11-06T00:00:00.000Z" });
  });
  it("rechaza datos inválidos con un mensaje en español", async () => {
    for (const [body, patron] of [
      [{}, /copropiedad/],
      [{ propertyId: "prop-demo-001", type: "fiesta" }, /tipo/],
      [{ propertyId: "prop-demo-001", date: "mañana" }, /fecha/],
      [{ propertyId: "prop-demo-001", title: "x".repeat(200) }, /título/],
    ] as const) {
      const { status, cuerpo } = await json(await crearReunion(pedir("/meetings", "POST", body)));
      expect(status, JSON.stringify(body)).toBe(400);
      expect(cuerpo.error).toMatch(patron);
    }
  });
  it("una copropiedad que no es del usuario: 404", async () => {
    const { status } = await json(await crearReunion(pedir("/meetings", "POST", { propertyId: "ajena" })));
    expect(status).toBe(404);
  });
  it("un cuerpo que no es JSON no rompe: 400", async () => {
    const req = new NextRequest(`${URL_BASE}/meetings`, { method: "POST", body: "no es json" });
    expect((await crearReunion(req)).status).toBe(400);
  });
});

describe("/api/meetings/[id]", () => {
  it("GET trae el detalle completo y NUNCA una URL de Blob", async () => {
    const { status, cuerpo } = await json(await leerReunion(pedir("/meetings/reunion-demo-001"), ctx({ id: "reunion-demo-001" })));
    expect(status).toBe(200);
    expect(cuerpo.digest.decisiones).toHaveLength(3);
    expect(cuerpo.speakers).toHaveLength(5);
    expect(JSON.stringify(cuerpo)).not.toMatch(/blob\.vercel-storage|audioUrl|transcriptUrl|pathname/);
  });
  it("GET de una que no existe: 404", async () => {
    expect((await leerReunion(pedir("/meetings/x"), ctx({ id: "x" }))).status).toBe(404);
  });
  it("PATCH cambia título, tipo y deja la constancia; el estado no se toca", async () => {
    const { status, cuerpo } = await json(
      await editarReunion(pedir("/meetings/reunion-demo-003", "PATCH", { title: " Nuevo ", type: "otra", consentAt: "now" }), ctx({ id: "reunion-demo-003" })),
    );
    expect(status).toBe(200);
    expect(cuerpo.meeting).toMatchObject({ title: "Nuevo", type: "otra", status: "borrador" });
    const det = await json(await leerReunion(pedir("/meetings/reunion-demo-003"), ctx({ id: "reunion-demo-003" })));
    expect(det.cuerpo.meeting.consentAt).not.toBeNull();
  });
  it("PATCH no deja cambiar el estado ni otros campos, ni vaciar el título", async () => {
    for (const body of [{ status: "lista" }, { userId: "otro" }, {}, { title: "  " }]) {
      const r = await editarReunion(pedir("/meetings/reunion-demo-003", "PATCH", body), ctx({ id: "reunion-demo-003" }));
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
  });
  it("PATCH y DELETE de una que no existe: 404", async () => {
    expect((await editarReunion(pedir("/meetings/x", "PATCH", { title: "a" }), ctx({ id: "x" }))).status).toBe(404);
    expect((await eliminarReunion(pedir("/meetings/x", "DELETE"), ctx({ id: "x" }))).status).toBe(404);
  });
  it("DELETE la borra, y no se puede borrar dos veces", async () => {
    expect((await eliminarReunion(pedir("/meetings/reunion-demo-003", "DELETE"), ctx({ id: "reunion-demo-003" }))).status).toBe(200);
    expect((await leerReunion(pedir("/meetings/reunion-demo-003"), ctx({ id: "reunion-demo-003" }))).status).toBe(404);
    expect((await eliminarReunion(pedir("/meetings/reunion-demo-003", "DELETE"), ctx({ id: "reunion-demo-003" }))).status).toBe(404);
  });
});

describe("personas de la copropiedad", () => {
  const raiz = ctx({ propertyId: "prop-demo-001" });
  it("lista las del demo, por nombre", async () => {
    const { status, cuerpo } = await json(await listarPersonas(pedir("/properties/prop-demo-001/people"), raiz));
    expect(status).toBe(200);
    expect(cuerpo.items).toHaveLength(6);
    expect(cuerpo.items[0].name).toBe("Andrés Gómez");
  });
  it("crea (201), y el mismo nombre en otras mayúsculas devuelve la misma persona (200)", async () => {
    const a = await json(await crearPersona(pedir("/properties/prop-demo-001/people", "POST", { name: "Zoe Vargas", role: "consejero" }), raiz));
    expect(a.status).toBe(201);
    const b = await json(await crearPersona(pedir("/properties/prop-demo-001/people", "POST", { name: "zoe vargas" }), raiz));
    expect(b.status).toBe(200);
    expect(b.cuerpo.person.id).toBe(a.cuerpo.person.id);
  });
  it("valida nombre y rol; copropiedad ajena: 404", async () => {
    expect((await crearPersona(pedir("/properties/prop-demo-001/people", "POST", { name: "A" }), raiz)).status).toBe(400);
    expect((await crearPersona(pedir("/properties/prop-demo-001/people", "POST", { name: "Ana", role: "rey" }), raiz)).status).toBe(400);
    expect((await crearPersona(pedir("/properties/ajena/people", "POST", { name: "Ana" }), ctx({ propertyId: "ajena" }))).status).toBe(404);
    expect((await listarPersonas(pedir("/properties/ajena/people"), ctx({ propertyId: "ajena" }))).status).toBe(404);
  });
  it("edita y elimina, solo desde su propia copropiedad", async () => {
    const { cuerpo } = await json(await crearPersona(pedir("/properties/prop-demo-001/people", "POST", { name: "Ana Mora" }), raiz));
    const id = cuerpo.person.id;
    const propia = ctx({ propertyId: "prop-demo-001", personId: id });
    const ajena = ctx({ propertyId: "prop-demo-002", personId: id });
    expect((await editarPersona(pedir("/x", "PATCH", { role: "contador" }), propia)).status).toBe(200);
    expect((await editarPersona(pedir("/x", "PATCH", { role: "contador" }), ajena)).status).toBe(404);
    expect((await editarPersona(pedir("/x", "PATCH", {}), propia)).status).toBe(400);
    expect((await eliminarPersona(pedir("/x", "DELETE"), ajena)).status).toBe(404);
    expect((await eliminarPersona(pedir("/x", "DELETE"), propia)).status).toBe(200);
    expect((await eliminarPersona(pedir("/x", "DELETE"), propia)).status).toBe(404);
  });
});

describe("subida de una grabación en demo: token → registro → procesar", () => {
  const ID = "reunion-demo-003"; // borrador
  const nombre = "consejo.m4a";
  const pathname = `meetings/${ID}/fuentes/abcd1234-consejo.m4a`;

  it("recorre el flujo completo y la reunión termina «en cola» con su archivo", async () => {
    const tok = await json(await pedirToken(pedir(`/meetings/${ID}/upload-token`, "POST", { nombre, tamano: 64_000_000, tipo: "audio/mp4" }), ctx({ id: ID })));
    expect(tok.status).toBe(200);
    expect(tok.cuerpo).toMatchObject({ demo: true, token: "demo", contentType: "audio/mp4", partSize: 16 * 1024 * 1024 });
    expect(tok.cuerpo.pathname).toMatch(new RegExp(`^meetings/${ID}/fuentes/[a-z0-9]{8}-consejo\\.m4a$`));
    expect((await json(await leerReunion(pedir(`/meetings/${ID}`), ctx({ id: ID })))).cuerpo.meeting.status).toBe("subiendo");

    const body = { url: `https://demo.private.blob.vercel-storage.com/${pathname}`, pathname, nombre, tamano: 64_000_000, tipo: "audio/mp4" };
    const reg = await json(await registrarFuente(pedir(`/meetings/${ID}/sources`, "POST", body), ctx({ id: ID })));
    expect(reg.status).toBe(201);
    expect(reg.cuerpo.source).toMatchObject({ name: nombre, sizeBytes: 64_000_000, status: "recibida", idx: 0 });
    expect((await registrarFuente(pedir(`/meetings/${ID}/sources`, "POST", body), ctx({ id: ID }))).status).toBe(200);

    const proc = await json(await procesar(pedir(`/meetings/${ID}/process`, "POST"), ctx({ id: ID })));
    expect(proc).toEqual({ status: 200, cuerpo: { status: "en_cola" } });
    const det = (await json(await leerReunion(pedir(`/meetings/${ID}`), ctx({ id: ID })))).cuerpo;
    expect(det.meeting.status).toBe("en_cola");
    expect(det.sources).toHaveLength(1);
    // Cerrada la captura, ya no entran archivos.
    expect((await pedirToken(pedir(`/meetings/${ID}/upload-token`, "POST", { nombre, tamano: 10, tipo: "audio/mp4" }), ctx({ id: ID }))).status).toBe(409);
  });

  it("procesar sin archivos es un 400 claro", async () => {
    const r = await json(await procesar(pedir(`/meetings/${ID}/process`, "POST"), ctx({ id: ID })));
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/al menos un archivo/);
  });

  it("quitar un archivo lo borra y la reunión vuelve a borrador", async () => {
    const tok = await json(await pedirToken(pedir("/x", "POST", { nombre, tamano: 10, tipo: "audio/mp4" }), ctx({ id: ID })));
    const body = { url: `https://demo.private.blob.vercel-storage.com/${tok.cuerpo.pathname}`, pathname: tok.cuerpo.pathname, nombre, tamano: 10, tipo: "audio/mp4" };
    const reg = await json(await registrarFuente(pedir("/x", "POST", body), ctx({ id: ID })));
    expect((await quitarFuente(pedir("/x", "DELETE"), ctx({ id: ID, sourceId: reg.cuerpo.source.id }))).status).toBe(200);
    expect((await json(await leerReunion(pedir("/x"), ctx({ id: ID })))).cuerpo.meeting.status).toBe("borrador");
  });

  it("rechaza rutas ajenas y archivos que no son grabaciones, también en demo", async () => {
    const mal = [
      { nombre: "acta.pdf", tamano: 10, tipo: "application/pdf" },
      { nombre, tamano: 10, tipo: "audio/mp4", pathname: "meetings/otra/fuentes/abcd1234-x.m4a" },
    ];
    for (const c of mal) expect((await pedirToken(pedir("/x", "POST", c), ctx({ id: ID }))).status).toBe(400);
    const sin = await registrarFuente(pedir("/x", "POST", { url: "https://x.com/a", pathname, nombre, tamano: 10, tipo: "audio/mp4" }), ctx({ id: ID }));
    expect(sin.status).toBe(400);
  });
});

describe("grabadora en vivo (demo): sesión → partes → marcas → cierre", () => {
  const ID = "reunion-demo-003"; // borrador
  const raiz = ctx({ id: ID });
  const consentir = () => editarReunion(pedir(`/meetings/${ID}`, "PATCH", { consentAt: "now" }), raiz);
  const detalle = async () => (await json(await leerReunion(pedir(`/meetings/${ID}`), raiz))).cuerpo;
  const cerrar = async (sesiones?: unknown) =>
    json(await procesar(pedir(`/meetings/${ID}/process`, "POST", sesiones === undefined ? undefined : { sesiones }), raiz));

  it("sin la constancia de aviso a los asistentes no se reserva sesión ni se recibe audio (409)", async () => {
    const a = await json(await nuevaSesion(pedir("/x", "POST"), raiz));
    expect(a.status).toBe(409);
    expect(a.cuerpo.error).toMatch(/avisaste a los asistentes/);
    expect((await registrarParte(pedirParte(), raiz)).status).toBe(409);
    expect((await detalle()).meeting.status).toBe("borrador");
  });

  it("recorre el flujo completo y la reunión termina «en cola» con su grabación como fuente", async () => {
    await consentir();
    expect(await json(await nuevaSesion(pedir("/x", "POST"), raiz))).toEqual({ status: 200, cuerpo: { session: 1, offsetMs: 0 } });

    for (const seq of [0, 1, 2]) expect((await registrarParte(pedirParte({ seq }), raiz)).status, `parte ${seq}`).toBe(200);
    expect((await registrarParte(pedirParte({ seq: 1, durMs: 31_000 }), raiz)).status).toBe(200); // reenviar no duplica
    let det = await detalle();
    expect(det.meeting.status).toBe("grabando");
    expect(det.live).toMatchObject({ sesiones: 1, partes: 3, durMs: 91_000 });
    expect(new Date(det.live.ultimaParteEn).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const m1 = await json(await marcar(pedir("/x", "POST", { id: "marca-abc123", atMs: 61_000, kind: "tema", note: "  Presupuesto   2026 " }), raiz));
    expect(m1).toMatchObject({ status: 201, cuerpo: { marker: { atMs: 61_000, kind: "tema", note: "Presupuesto 2026" } } });
    expect((await marcar(pedir("/x", "POST", { id: "marca-abc123", atMs: 61_000, kind: "tema" }), raiz)).status).toBe(200); // misma marca
    expect((await detalle()).markers).toHaveLength(1);

    // El dispositivo dice que su última parte fue la 4, pero al servidor solo llegaron la 0, 1 y 2.
    const faltan = await cerrar([{ session: 1, ultimaSecuencia: 4, mimeType: "audio/webm;codecs=opus", duracionMs: 148_000 }]);
    expect(faltan.status).toBe(409);
    expect(faltan.cuerpo.faltan).toEqual([{ session: 1, seq: 3 }, { session: 1, seq: 4 }]);
    expect((await detalle()).meeting.status).toBe("grabando");

    for (const seq of [3, 4]) await registrarParte(pedirParte({ seq, durMs: 29_000 }), raiz);
    const ok = await cerrar([{ session: 1, ultimaSecuencia: 4, mimeType: "audio/webm;codecs=opus", duracionMs: 148_000 }]);
    expect(ok).toEqual({ status: 200, cuerpo: { status: "en_cola" } });

    det = await detalle();
    expect(det.meeting.status).toBe("en_cola");
    expect(det.live).toBeNull();
    expect(det.sources).toEqual([
      expect.objectContaining({ kind: "grabacion", name: "Grabación en la app", sizeBytes: 5000, durationMs: 148_000, status: "recibida", idx: 0 }),
    ]);

    // Cerrada la captura, ya no entra más audio y cerrar de nuevo no duplica nada.
    expect((await registrarParte(pedirParte({ seq: 5 }), raiz)).status).toBe(409);
    expect((await nuevaSesion(pedir("/x", "POST"), raiz)).status).toBe(409);
    expect(await cerrar()).toEqual({ status: 200, cuerpo: { status: "en_cola" } });
    expect((await detalle()).sources).toHaveLength(1);
  });

  it("una segunda sesión empieza donde terminó la primera, aunque no se haya cerrado", async () => {
    await consentir();
    await nuevaSesion(pedir("/x", "POST"), raiz);
    for (const seq of [0, 1]) await registrarParte(pedirParte({ seq, durMs: 30_000 }), raiz);
    expect((await json(await nuevaSesion(pedir("/x", "POST"), raiz))).cuerpo).toEqual({ session: 2, offsetMs: 60_000 });
    await registrarParte(pedirParte({ session: 2, seq: 0, durMs: 10_000 }), raiz);
    expect((await json(await nuevaSesion(pedir("/x", "POST"), raiz))).cuerpo).toEqual({ session: 3, offsetMs: 70_000 });
  });

  it("cerrar sin declarar sesiones usa lo que haya recibido el servidor (un dispositivo perdido)", async () => {
    await consentir();
    for (const session of [1, 2]) for (const seq of [0, 1]) await registrarParte(pedirParte({ session, seq }), raiz);
    expect((await cerrar()).cuerpo).toEqual({ status: "en_cola" });
    const det = await detalle();
    expect(det.sources.map((f: { name: string }) => f.name)).toEqual(["Grabación en la app — sesión 1", "Grabación en la app — sesión 2"]);
  });

  it("procesar sin audio ni archivos sigue siendo un 400 claro", async () => {
    await consentir();
    const r = await cerrar([]);
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/al menos un archivo/);
  });

  it("rechaza cabeceras y cuerpos inválidos de una parte", async () => {
    await consentir();
    const malas: Array<[Parameters<typeof pedirParte>[0], RegExp]> = [
      [{ tipo: "text/plain" }, /tipo de audio/],
      [{ tipo: "audio/mpeg" }, /tipo de audio/],
      [{ session: 0 }, /sesión/],
      [{ session: "abc" }, /sesión/],
      [{ session: 999 }, /sesión/],
      [{ seq: -1 }, /parte/],
      [{ seq: 1e6 }, /parte/],
      [{ durMs: 0 }, /duración/],
      [{ durMs: 99_999_999 }, /duración/],
      [{ bytes: 0 }, /vacía/],
    ];
    for (const [opciones, patron] of malas) {
      const r = await json(await registrarParte(pedirParte(opciones), raiz));
      expect(r.status, JSON.stringify(opciones)).toBe(400);
      expect(r.cuerpo.error, JSON.stringify(opciones)).toMatch(patron);
    }
    const grande = await registrarParte(pedirParte({ bytes: 2 * 1024 * 1024 + 1 }), raiz);
    expect(grande.status).toBe(413);
    expect((await detalle()).meeting.status).toBe("borrador"); // nada de eso la pasó a «grabando»
  });

  it("rechaza marcas y cierres inválidos", async () => {
    await consentir();
    for (const body of [{}, { atMs: 1, kind: "fiesta" }, { atMs: -1, kind: "tema" }, { atMs: 1.5, kind: "tema" }, { atMs: 1, kind: "nota", note: "x".repeat(400) }, { id: "a b", atMs: 1, kind: "tema" }]) {
      expect((await marcar(pedir("/x", "POST", body), raiz)).status, JSON.stringify(body)).toBe(400);
    }
    for (const sesiones of ["x", [1], [{ session: 1 }], [{ session: 1, ultimaSecuencia: 0, mimeType: "audio/mpeg", duracionMs: 1 }], [{ session: 1, ultimaSecuencia: 0, mimeType: "audio/webm", duracionMs: 1 }, { session: 1, ultimaSecuencia: 0, mimeType: "audio/webm", duracionMs: 1 }]]) {
      expect((await cerrar(sesiones)).status, JSON.stringify(sesiones)).toBe(400);
    }
    const noJson = new NextRequest(`${URL_BASE}/meetings/x/process`, { method: "POST", body: "no es json" });
    expect((await procesar(noJson, raiz)).status).toBe(400);
  });

  it("una reunión que no existe: 404 en todas", async () => {
    const otra = ctx({ id: "no-existe" });
    await consentir();
    expect((await nuevaSesion(pedir("/x", "POST"), otra)).status).toBe(404);
    expect((await registrarParte(pedirParte(), otra)).status).toBe(404);
    expect((await marcar(pedir("/x", "POST", { atMs: 1, kind: "tema" }), otra)).status).toBe(404);
  });
});

/* ════════════════════════════════════════════════════════════════════
   La bandera del piloto cierra TODAS las rutas
   ════════════════════════════════════════════════════════════════════ */

const TODAS: Array<[string, () => Promise<Response>]> = [
  ["GET /meetings", () => listarReuniones(pedir("/meetings"))],
  ["POST /meetings", () => crearReunion(pedir("/meetings", "POST", { propertyId: "p" }))],
  ["GET /meetings/[id]", () => leerReunion(pedir("/meetings/a"), ctx({ id: "a" }))],
  ["PATCH /meetings/[id]", () => editarReunion(pedir("/meetings/a", "PATCH", { title: "x" }), ctx({ id: "a" }))],
  ["DELETE /meetings/[id]", () => eliminarReunion(pedir("/meetings/a", "DELETE"), ctx({ id: "a" }))],
  ["GET people", () => listarPersonas(pedir("/p"), ctx({ propertyId: "p" }))],
  ["POST people", () => crearPersona(pedir("/p", "POST", { name: "Ana" }), ctx({ propertyId: "p" }))],
  ["PATCH person", () => editarPersona(pedir("/p", "PATCH", { name: "Ana" }), ctx({ propertyId: "p", personId: "q" }))],
  ["DELETE person", () => eliminarPersona(pedir("/p", "DELETE"), ctx({ propertyId: "p", personId: "q" }))],
  ["POST upload-token", () => pedirToken(pedir("/m", "POST", { nombre: "a.mp3", tamano: 10, tipo: "audio/mpeg" }), ctx({ id: "a" }))],
  ["POST sources", () => registrarFuente(pedir("/m", "POST", {}), ctx({ id: "a" }))],
  ["DELETE source", () => quitarFuente(pedir("/m", "DELETE"), ctx({ id: "a", sourceId: "s" }))],
  ["POST process", () => procesar(pedir("/m", "POST"), ctx({ id: "a" }))],
  ["POST live/sesion", () => nuevaSesion(pedir("/m", "POST"), ctx({ id: "a" }))],
  ["POST live", () => registrarParte(pedirParte(), ctx({ id: "a" }))],
  ["POST markers", () => marcar(pedir("/m", "POST", { atMs: 1, kind: "tema" }), ctx({ id: "a" }))],
];

describe("piloto: ninguna ruta responde a quien no debe (y ninguna toca la base de datos antes de decidirlo)", () => {
  beforeEach(() => vi.stubEnv("DEMO_MODE", "false"));

  it.each(TODAS)("%s → 401 sin sesión", async (_n, llamar) => {
    auth.mockResolvedValue(null);
    expect((await llamar()).status).toBe(401);
  });
  it.each(TODAS)("%s → 404 para una cuenta normal", async (_n, llamar) => {
    auth.mockResolvedValue({ user: { id: "u1", email: "ana@x.com", role: "user" } });
    const r = await llamar();
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "No encontrado" });
  });
});
