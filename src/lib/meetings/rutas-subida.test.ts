import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, head, del, generarToken } = vi.hoisted(() => ({
  auth: vi.fn(),
  fake: { db: null as unknown },
  head: vi.fn(),
  del: vi.fn(),
  generarToken: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@vercel/blob", () => ({ head: (...a: unknown[]) => head(...a), del: (...a: unknown[]) => del(...a) }));
vi.mock("@vercel/blob/client", () => ({ generateClientTokenFromReadWriteToken: (...a: unknown[]) => generarToken(...a) }));

import { POST as procesar } from "@/app/api/meetings/[id]/process/route";
import { DELETE as quitarFuente } from "@/app/api/meetings/[id]/sources/[sourceId]/route";
import { POST as registrarFuente } from "@/app/api/meetings/[id]/sources/route";
import { POST as pedirToken } from "@/app/api/meetings/[id]/upload-token/route";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { MAX_FUENTE_BYTES, MAX_FUENTES_POR_REUNION, PARTE_SUBIDA_BYTES } from "./tipos";

let db: DbFalsa;
const ID = "mreunion1";
const URL_BLOB = "https://abc123.private.blob.vercel-storage.com";

const pedir = (cuerpo?: unknown, metodo = "POST") =>
  new NextRequest("http://localhost/api/x", { method: metodo, ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } } : {}) });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const json = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });

const sesion = (id = "u1") => auth.mockResolvedValue({ user: { id, email: `${id}@x.com`, role: "admin" } });
const nuevaReunion = (extra: Record<string, unknown> = {}) =>
  db.meeting.create({ data: { id: ID, userId: "u1", propertyId: "c1", type: "consejo", title: "R", status: "borrador", errorMessage: null, ...extra } });
const pathnameDe = (n: string) => `meetings/${ID}/fuentes/${n}-consejo.m4a`;
const cuerpoFuente = (n = "aaaaaaa1", extra: Record<string, unknown> = {}) => ({
  url: `${URL_BLOB}/${pathnameDe(n)}`, pathname: pathnameDe(n), nombre: "consejo.m4a", tamano: 5000, tipo: "audio/mp4", ...extra,
});

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  head.mockReset();
  del.mockReset();
  generarToken.mockReset();
  generarToken.mockResolvedValue("token-de-cliente");
  del.mockResolvedValue(undefined);
  vi.stubEnv("DEMO_MODE", "false");
  sesion();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST upload-token", () => {
  const pedido = { nombre: "Reunión consejo.m4a", tamano: 64_000_000, tipo: "audio/mp4" };

  it("emite un token para UNA ruta de esta reunión, con su tipo, por un día, y pasa la reunión a «Subiendo»", async () => {
    await nuevaReunion();
    const antes = Date.now();
    const { status, cuerpo } = await json(await pedirToken(pedir(pedido), ctx({ id: ID })));
    expect(status).toBe(200);
    expect(cuerpo.token).toBe("token-de-cliente");
    expect(cuerpo.pathname).toMatch(new RegExp(`^meetings/${ID}/fuentes/[a-z0-9]{8}-Reunion-consejo\\.m4a$`));
    expect(cuerpo).toMatchObject({ contentType: "audio/mp4", partSize: PARTE_SUBIDA_BYTES });

    const args = generarToken.mock.calls[0][0];
    expect(args).toMatchObject({ pathname: cuerpo.pathname, allowedContentTypes: ["audio/mp4"], maximumSizeInBytes: MAX_FUENTE_BYTES, addRandomSuffix: false, allowOverwrite: true });
    expect(args.validUntil).toBeGreaterThanOrEqual(antes + 24 * 3_600_000 - 1000);
    expect(args.validUntil).toBeLessThanOrEqual(Date.now() + 24 * 3_600_000 + 1000);
    expect(db.meeting.filas[0].status).toBe("subiendo");
  });

  it("al reanudar devuelve la MISMA ruta (token nuevo, mismo archivo)", async () => {
    await nuevaReunion({ status: "subiendo" });
    const pathname = pathnameDe("abcd1234");
    const { cuerpo } = await json(await pedirToken(pedir({ ...pedido, pathname }), ctx({ id: ID })));
    expect(cuerpo.pathname).toBe(pathname);
    expect(generarToken.mock.calls[0][0].pathname).toBe(pathname);
  });

  it("no emite tokens para rutas ajenas, de otra carpeta o con «..» (400, sin llamar a Blob)", async () => {
    await nuevaReunion();
    for (const pathname of ["meetings/otra/fuentes/aaaaaaaa-x.m4a", `meetings/${ID}/audio.mp3`, `meetings/${ID}/fuentes/../../x`, "x"]) {
      const r = await json(await pedirToken(pedir({ ...pedido, pathname }), ctx({ id: ID })));
      expect(r.status, pathname).toBe(400);
    }
    expect(generarToken).not.toHaveBeenCalled();
  });

  it("rechaza lo que no es audio/video, el tamaño absurdo y los cuerpos rotos", async () => {
    await nuevaReunion();
    for (const cuerpo of [{ ...pedido, nombre: "acta.pdf" }, { ...pedido, tamano: 0 }, { ...pedido, tamano: MAX_FUENTE_BYTES + 1 }, {}]) {
      expect((await pedirToken(pedir(cuerpo), ctx({ id: ID }))).status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect((await pedirToken(new NextRequest("http://localhost/x", { method: "POST", body: "no json" }), ctx({ id: ID }))).status).toBe(400);
    expect(generarToken).not.toHaveBeenCalled();
  });

  it("una reunión de otro usuario o inexistente: 404, y sin token", async () => {
    await nuevaReunion({ userId: "otro" });
    expect((await pedirToken(pedir(pedido), ctx({ id: ID }))).status).toBe(404);
    expect((await pedirToken(pedir(pedido), ctx({ id: "no-existe" }))).status).toBe(404);
    expect(generarToken).not.toHaveBeenCalled();
  });

  it("si la reunión ya se procesa o está lista: 409", async () => {
    for (const status of ["en_cola", "procesando", "lista", "sin_cupo"]) {
      db.meeting.filas.length = 0;
      await nuevaReunion({ status });
      expect((await pedirToken(pedir(pedido), ctx({ id: ID }))).status, status).toBe(409);
    }
    expect(generarToken).not.toHaveBeenCalled();
  });

  it("respeta el tope de archivos por reunión", async () => {
    await nuevaReunion({ status: "subiendo" });
    for (let n = 0; n < MAX_FUENTES_POR_REUNION; n++) await db.meetingSource.create({ data: { meetingId: ID, idx: n, pathname: `p${n}` } });
    const r = await json(await pedirToken(pedir(pedido), ctx({ id: ID })));
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/Máximo 60 archivos/);
  });

  it("una reunión con error vuelve a «Subiendo» y se limpia su mensaje", async () => {
    await nuevaReunion({ status: "error", errorMessage: "falló" });
    await pedirToken(pedir(pedido), ctx({ id: ID }));
    expect(db.meeting.filas[0]).toMatchObject({ status: "subiendo", errorMessage: null });
  });

  it("si Blob falla al emitir el token, un 500 con mensaje claro y la reunión no cambia de estado", async () => {
    await nuevaReunion();
    generarToken.mockRejectedValue(new Error("BLOB_READ_WRITE_TOKEN missing"));
    const r = await json(await pedirToken(pedir(pedido), ctx({ id: ID })));
    expect(r.status).toBe(500);
    expect(r.cuerpo.error).toMatch(/No pudimos preparar la subida/);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(db.meeting.filas[0].status).toBe("borrador");
  });
});

describe("POST sources (registrar un archivo ya subido)", () => {
  it("lo registra con el tamaño del ALMACENAMIENTO, en orden, y deja la reunión «Subiendo»", async () => {
    await nuevaReunion();
    head.mockResolvedValue({ size: 5000 });
    const a = await json(await registrarFuente(pedir(cuerpoFuente("aaaaaaa1")), ctx({ id: ID })));
    const b = await json(await registrarFuente(pedir(cuerpoFuente("aaaaaaa2", { nombre: "parte2.m4a" })), ctx({ id: ID })));
    expect(a.status).toBe(201);
    expect(a.cuerpo.source).toMatchObject({ idx: 0, name: "consejo.m4a", sizeBytes: 5000, status: "recibida", kind: "archivo" });
    expect(b.cuerpo.source.idx).toBe(1);
    expect(head).toHaveBeenCalledWith(`${URL_BLOB}/${pathnameDe("aaaaaaa1")}`);
    expect(db.meeting.filas[0].status).toBe("subiendo");
    // Nunca se devuelve la URL privada.
    expect(JSON.stringify(a.cuerpo)).not.toMatch(/blob\.vercel-storage|pathname/);
  });

  it("es idempotente: si la respuesta se perdió y el cliente reintenta, no se duplica (200)", async () => {
    await nuevaReunion();
    head.mockResolvedValue({ size: 5000 });
    const primera = await json(await registrarFuente(pedir(cuerpoFuente()), ctx({ id: ID })));
    const segunda = await json(await registrarFuente(pedir(cuerpoFuente()), ctx({ id: ID })));
    expect(segunda.status).toBe(200);
    expect(segunda.cuerpo.source.id).toBe(primera.cuerpo.source.id);
    expect(db.meetingSource.filas.length).toBe(1);
    expect(head).toHaveBeenCalledTimes(1);
  });

  it("también cuando la reunión ya está en cola (el archivo ya estaba registrado)", async () => {
    await nuevaReunion({ status: "en_cola" });
    await db.meetingSource.create({ data: { meetingId: ID, idx: 0, pathname: pathnameDe("aaaaaaa1"), name: "consejo.m4a", kind: "archivo", sizeBytes: 5000, status: "recibida" } });
    expect((await registrarFuente(pedir(cuerpoFuente()), ctx({ id: ID }))).status).toBe(200);
    // Pero uno NUEVO ya no entra.
    expect((await registrarFuente(pedir(cuerpoFuente("aaaaaaa2")), ctx({ id: ID }))).status).toBe(409);
  });

  it("si el archivo no existe en el almacenamiento: 400, y nada se registra", async () => {
    await nuevaReunion();
    head.mockRejectedValue(new Error("BlobNotFoundError"));
    const r = await json(await registrarFuente(pedir(cuerpoFuente()), ctx({ id: ID })));
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/Vuelve a subirlo/);
    expect(db.meetingSource.filas.length).toBe(0);
  });

  it("si el tamaño guardado no coincide (subida incompleta): 409, y nada se registra", async () => {
    await nuevaReunion();
    head.mockResolvedValue({ size: 4999 });
    const r = await json(await registrarFuente(pedir(cuerpoFuente()), ctx({ id: ID })));
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toMatch(/no llegó completo/);
    expect(db.meetingSource.filas.length).toBe(0);
  });

  it("no consulta ni registra URLs o rutas que no son de esta reunión (400, sin tocar Blob)", async () => {
    await nuevaReunion();
    const casos = [
      cuerpoFuente("aaaaaaa1", { url: `https://servidor-del-atacante.com/${pathnameDe("aaaaaaa1")}` }),
      cuerpoFuente("aaaaaaa1", { pathname: "meetings/otra/fuentes/aaaaaaaa-x.m4a" }),
      cuerpoFuente("aaaaaaa1", { url: `${URL_BLOB}/${pathnameDe("zzzzzzz9")}` }),
      cuerpoFuente("aaaaaaa1", { nombre: "acta.pdf" }),
    ];
    for (const c of casos) expect((await registrarFuente(pedir(c), ctx({ id: ID }))).status, JSON.stringify(c)).toBe(400);
    expect(head).not.toHaveBeenCalled();
    expect(db.meetingSource.filas.length).toBe(0);
  });

  it("una reunión de otro usuario: 404", async () => {
    await nuevaReunion({ userId: "otro" });
    expect((await registrarFuente(pedir(cuerpoFuente()), ctx({ id: ID }))).status).toBe(404);
    expect(head).not.toHaveBeenCalled();
  });
});

describe("DELETE sources/[sourceId]", () => {
  const crear = async (n: number) => db.meetingSource.create({ data: { meetingId: ID, idx: n, pathname: pathnameDe(`aaaaaaa${n}`), url: `${URL_BLOB}/${pathnameDe(`aaaaaaa${n}`)}`, name: `p${n}.m4a`, status: "recibida" } });

  it("borra el original, quita la fila y renumera", async () => {
    await nuevaReunion({ status: "subiendo" });
    const a = await crear(0);
    await crear(1);
    await crear(2);
    const r = await json(await quitarFuente(pedir(undefined, "DELETE"), ctx({ id: ID, sourceId: a.id as string })));
    expect(r.status).toBe(200);
    expect(del).toHaveBeenCalledWith(a.url);
    expect(db.meetingSource.filas.map((f) => f.idx)).toEqual([0, 1]);
    expect(db.meetingSource.filas.map((f) => f.name)).toEqual(["p1.m4a", "p2.m4a"]);
    expect(db.meeting.filas[0].status).toBe("subiendo");
  });

  it("al quitar el último, la reunión vuelve a borrador", async () => {
    await nuevaReunion({ status: "subiendo" });
    const a = await crear(0);
    await quitarFuente(pedir(undefined, "DELETE"), ctx({ id: ID, sourceId: a.id as string }));
    expect(db.meeting.filas[0].status).toBe("borrador");
  });

  it("si Blob no puede borrar el original, la fila se CONSERVA (502) para reintentar", async () => {
    await nuevaReunion({ status: "subiendo" });
    const a = await crear(0);
    del.mockRejectedValue(new Error("blob caído"));
    const r = await json(await quitarFuente(pedir(undefined, "DELETE"), ctx({ id: ID, sourceId: a.id as string })));
    expect(r.status).toBe(502);
    expect(db.meetingSource.filas.length).toBe(1);
  });

  it("no se quitan archivos de una reunión que ya se procesa; ni de otra reunión; ni inexistentes", async () => {
    await nuevaReunion({ status: "en_cola" });
    const a = await crear(0);
    expect((await quitarFuente(pedir(undefined, "DELETE"), ctx({ id: ID, sourceId: a.id as string }))).status).toBe(409);
    expect(del).not.toHaveBeenCalled();

    db.meeting.filas[0].status = "borrador";
    expect((await quitarFuente(pedir(undefined, "DELETE"), ctx({ id: ID, sourceId: "no-existe" }))).status).toBe(404);
    db.meeting.filas[0].userId = "otro";
    expect((await quitarFuente(pedir(undefined, "DELETE"), ctx({ id: ID, sourceId: a.id as string }))).status).toBe(404);
  });
});

describe("POST process", () => {
  const fuente = (status = "recibida") => db.meetingSource.create({ data: { meetingId: ID, idx: 0, pathname: pathnameDe("aaaaaaa1"), status } });

  it("sin archivos: 400", async () => {
    await nuevaReunion();
    const r = await json(await procesar(pedir(), ctx({ id: ID })));
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/al menos un archivo/);
    expect(db.meeting.filas[0].status).toBe("borrador");
  });

  it("con un archivo en preparación: 409", async () => {
    await nuevaReunion({ status: "subiendo" });
    await fuente("subiendo");
    expect((await procesar(pedir(), ctx({ id: ID }))).status).toBe(409);
    expect(db.meeting.filas[0].status).toBe("subiendo");
  });

  it("con todo recibido: «en cola», sin error ni progreso previos", async () => {
    await nuevaReunion({ status: "error", errorMessage: "falló antes", progress: 40, stage: "transcribiendo" });
    await fuente();
    const r = await json(await procesar(pedir(), ctx({ id: ID })));
    expect(r).toEqual({ status: 200, cuerpo: { status: "en_cola" } });
    expect(db.meeting.filas[0]).toMatchObject({ status: "en_cola", errorMessage: null, progress: 0, stage: null });
  });

  it("es idempotente: en cola, procesando o lista devuelve su estado sin tocar nada", async () => {
    for (const status of ["en_cola", "procesando", "lista"]) {
      db.meeting.filas.length = 0;
      await nuevaReunion({ status, progress: 33 });
      const r = await json(await procesar(pedir(), ctx({ id: ID })));
      expect(r, status).toEqual({ status: 200, cuerpo: { status } });
      expect(db.meeting.filas[0].progress).toBe(33);
    }
  });

  it("una reunión de otro usuario o inexistente: 404; sin cupo: 409", async () => {
    await nuevaReunion({ userId: "otro" });
    expect((await procesar(pedir(), ctx({ id: ID }))).status).toBe(404);
    expect((await procesar(pedir(), ctx({ id: "no-existe" }))).status).toBe(404);
    db.meeting.filas[0].userId = "u1";
    db.meeting.filas[0].status = "sin_cupo";
    expect((await procesar(pedir(), ctx({ id: ID }))).status).toBe(409);
  });
});
