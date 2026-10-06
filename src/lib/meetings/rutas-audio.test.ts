/** La ruta del audio: rangos de verdad contra un almacén en carpeta, pertenencia, errores del almacén y el demo. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake } = vi.hoisted(() => ({ auth: vi.fn(), fake: { db: null as unknown, almacen: null as unknown } }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/meetings/almacen-blob", () => ({ almacenBlob: () => fake.almacen }));

import { GET, HEAD } from "@/app/api/meetings/[id]/audio/route";
import { ErrorAlmacen, type Almacen } from "./almacen";
import { AlmacenLocal } from "./almacen-local";
import { bytesDeAudioDemo } from "./audio-demo";
import { MAX_BYTES_POR_RESPUESTA } from "./audio-http";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { reiniciarDemoReuniones } from "./demo";

const ID = "mreunion1";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const pedir = (rango?: string, metodo = "GET") =>
  new NextRequest(`http://localhost/api/meetings/${ID}/audio`, { method: metodo, ...(rango ? { headers: { range: rango } } : {}) });
const bytesDe = async (r: Response) => Buffer.from(await r.arrayBuffer());

/** Un archivo cuyo byte i vale i % 251: cualquier trozo mal cortado se nota. */
const archivo = (n: number) => Buffer.from(Array.from({ length: n }, (_, i) => i % 251));

let carpeta: string;
let almacen: AlmacenLocal;
let db: DbFalsa;
let url: string;

beforeAll(() => {
  carpeta = mkdtempSync(join(tmpdir(), "rutas-audio-"));
});
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

async function sembrar(bytes: Buffer, extra: Record<string, unknown> = {}) {
  const subido = await almacen.subir(`meetings/${ID}/audio.mp3`, bytes, "audio/mpeg");
  url = subido.url;
  await db.meeting.create({ data: { id: ID, userId: "u1", title: "Consejo", date: new Date("2026-09-12T00:00:00Z"), status: "lista", durationMs: 1000, audioUrl: url, ...extra } });
}

beforeEach(() => {
  almacen = new AlmacenLocal(join(carpeta, Math.random().toString(36).slice(2)));
  fake.almacen = almacen;
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  vi.stubEnv("DEMO_MODE", "false");
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com", role: "admin" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET audio (con base de datos y almacén)", () => {
  it("sin Range: 200 con todo el archivo y las cabeceras que Safari exige", async () => {
    const datos = archivo(3000);
    await sembrar(datos);
    const r = await GET(pedir(), ctx());
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("content-length")).toBe("3000");
    expect(r.headers.get("content-range")).toBeNull();
    expect((await bytesDe(r)).equals(datos)).toBe(true);
  });

  it("el primer sondeo de Safari («bytes=0-1») es un 206 de dos bytes", async () => {
    const datos = archivo(3000);
    await sembrar(datos);
    const r = await GET(pedir("bytes=0-1"), ctx());
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-1/3000");
    expect(r.headers.get("content-length")).toBe("2");
    expect((await bytesDe(r)).equals(datos.subarray(0, 2))).toBe(true);
  });

  it("un rango del medio, uno abierto hasta el final y los últimos n bytes traen justo esos bytes", async () => {
    const datos = archivo(3000);
    await sembrar(datos);

    const medio = await GET(pedir("bytes=1000-1999"), ctx());
    expect(medio.status).toBe(206);
    expect(medio.headers.get("content-range")).toBe("bytes 1000-1999/3000");
    expect((await bytesDe(medio)).equals(datos.subarray(1000, 2000))).toBe(true);

    const final = await GET(pedir("bytes=2990-"), ctx());
    expect(final.headers.get("content-range")).toBe("bytes 2990-2999/3000");
    expect(final.headers.get("content-length")).toBe("10");
    expect((await bytesDe(final)).equals(datos.subarray(2990))).toBe(true);

    const ultimos = await GET(pedir("bytes=-100"), ctx());
    expect(ultimos.headers.get("content-range")).toBe("bytes 2900-2999/3000");
    expect((await bytesDe(ultimos)).equals(datos.subarray(2900))).toBe(true);
  });

  it("lee del almacén solo el rango pedido, nunca el archivo entero", async () => {
    await sembrar(archivo(3000));
    await bytesDe(await GET(pedir("bytes=500-599"), ctx()));
    expect(almacen.lecturas).toEqual([{ url, desde: 500, hasta: 599 }]);
  });

  it("pedir más allá del final: 416 con el tamaño del archivo y sin cuerpo", async () => {
    await sembrar(archivo(3000));
    const r = await GET(pedir("bytes=3000-"), ctx());
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */3000");
    expect((await bytesDe(r)).byteLength).toBe(0);
    expect(almacen.lecturas).toEqual([]);
  });

  it("un «hasta el final» no pasa de 4 MiB por respuesta: el navegador pide el resto aparte", async () => {
    const total = MAX_BYTES_POR_RESPUESTA + 1_000_000;
    const datos = archivo(total);
    await sembrar(datos);
    const r = await GET(pedir("bytes=0-"), ctx());
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 0-${MAX_BYTES_POR_RESPUESTA - 1}/${total}`);
    expect(r.headers.get("content-length")).toBe(String(MAX_BYTES_POR_RESPUESTA));
    const cuerpo = await bytesDe(r);
    expect(cuerpo.byteLength).toBe(MAX_BYTES_POR_RESPUESTA);
    expect(cuerpo.equals(datos.subarray(0, MAX_BYTES_POR_RESPUESTA))).toBe(true);

    const resto = await GET(pedir(`bytes=${MAX_BYTES_POR_RESPUESTA}-`), ctx());
    expect(resto.headers.get("content-range")).toBe(`bytes ${MAX_BYTES_POR_RESPUESTA}-${total - 1}/${total}`);
    expect((await bytesDe(resto)).equals(datos.subarray(MAX_BYTES_POR_RESPUESTA))).toBe(true);
  });

  it("HEAD dice lo mismo que GET pero no manda cuerpo ni toca el contenido", async () => {
    await sembrar(archivo(3000));
    const r = await HEAD(pedir("bytes=10-19", "HEAD"), ctx());
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 10-19/3000");
    expect(r.headers.get("content-length")).toBe("10");
    expect((await bytesDe(r)).byteLength).toBe(0);
    expect(almacen.lecturas).toEqual([]);
  });

  it("nunca entrega la URL del almacenamiento", async () => {
    await sembrar(archivo(100));
    const r = await GET(pedir("bytes=0-9"), ctx());
    const todo = JSON.stringify([...r.headers.entries()]);
    expect(todo).not.toMatch(/local:\/\/|blob\.vercel-storage|meetings\//);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("cache-control")).toMatch(/^private,/);
  });

  it("una reunión de otra persona o que no existe: 404; sin audio todavía: 404 con el motivo", async () => {
    await sembrar(archivo(100), { userId: "otra" });
    expect((await GET(pedir(), ctx())).status).toBe(404);
    expect((await GET(pedir(), ctx("no-existe"))).status).toBe(404);

    db = crearDbFalsa();
    fake.db = db;
    await db.meeting.create({ data: { id: ID, userId: "u1", title: "Sin audio", date: new Date(), status: "borrador" } });
    const r = await GET(pedir(), ctx());
    expect(r.status).toBe(404);
    expect((await r.json()).error).toMatch(/no tiene audio/);
  });

  it("si el archivo ya no está en el almacén: 404 que lo dice", async () => {
    await sembrar(archivo(100));
    await almacen.borrar([url]);
    const r = await GET(pedir("bytes=0-9"), ctx());
    expect(r.status).toBe(404);
    expect((await r.json()).error).toMatch(/ya no está disponible/);
  });

  it("un fallo pasajero del almacén: 503 con Retry-After; uno sin arreglo: 500", async () => {
    await sembrar(archivo(100));
    const roto = (tipo: ErrorAlmacen["tipo"]): Almacen => ({
      ...almacen, subir: almacen.subir.bind(almacen), subirFlujo: almacen.subirFlujo.bind(almacen), leer: almacen.leer.bind(almacen),
      listar: almacen.listar.bind(almacen), borrar: almacen.borrar.bind(almacen),
      tamano: async () => { throw new ErrorAlmacen("se cayó", tipo); },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fake.almacen = roto("transitorio");
      const a = await GET(pedir(), ctx());
      expect(a.status).toBe(503);
      expect(a.headers.get("retry-after")).toBe("5");
      fake.almacen = roto("fatal");
      expect((await GET(pedir(), ctx())).status).toBe(500);
    } finally {
      error.mockRestore();
    }
  });

  it("el rango es de la reunión pedida: otra persona con la misma URL no la lee", async () => {
    await sembrar(archivo(100));
    auth.mockResolvedValue({ user: { id: "u2", email: "u2@x.com", role: "admin" } });
    expect((await GET(pedir("bytes=0-9"), ctx())).status).toBe(404);
    expect(almacen.lecturas).toEqual([]);
  });
});

describe("GET audio (demo)", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    auth.mockResolvedValue({ user: { id: "x", email: "demo@phgestion.app", role: "user" } });
    reiniciarDemoReuniones();
  });

  it("la reunión del demo sirve un MP3 en silencio de la duración de la reunión, por rangos", async () => {
    const total = bytesDeAudioDemo(8_040_000);
    const r = await GET(pedir("bytes=0-1"), ctx("reunion-demo-001"));
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 0-1/${total}`);
    expect([...(await bytesDe(r))]).toEqual([0xff, 0xf3]);

    const medio = await GET(pedir(`bytes=${144 * 1000}-${144 * 1000 + 3}`), ctx("reunion-demo-001"));
    expect([...(await bytesDe(medio))]).toEqual([0xff, 0xf3, 0x48, 0xc4]);

    const fuera = await GET(pedir(`bytes=${total}-`), ctx("reunion-demo-001"));
    expect(fuera.status).toBe(416);
  });

  it("sin Range en el demo: 200 con el tamaño total", async () => {
    const r = await HEAD(pedir(undefined, "HEAD"), ctx("reunion-demo-001"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-length")).toBe(String(bytesDeAudioDemo(8_040_000)));
  });

  it("una reunión del demo que no tiene audio, o que no existe: 404", async () => {
    expect((await GET(pedir("bytes=0-1"), ctx("reunion-demo-003"))).status).toBe(404); // borrador
    expect((await GET(pedir("bytes=0-1"), ctx("no-existe"))).status).toBe(404);
  });
});
