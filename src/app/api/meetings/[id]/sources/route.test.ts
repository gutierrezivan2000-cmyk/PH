import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ head: vi.fn(), leer: vi.fn(), db: null as unknown }));
vi.mock("@/lib/db", () => ({ get db() { return m.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/meetings/acceso", () => ({
  exigirVisible: async () => ({ ctx: { userId: "u1", demo: false } }),
  reunionDelUsuario: async () => ({ status: "borrador" }),
}));
vi.mock("@vercel/blob", () => ({ head: (...a: unknown[]) => m.head(...a) }));
vi.mock("@/lib/meetings/almacen-blob", () => ({ almacenBlob: () => ({ leer: (...a: unknown[]) => m.leer(...a) }) }));

import { POST } from "./route";

const ID = "mreunion1";
const PATH = `meetings/${ID}/fuentes/aaaaaaa1-a.mp3`;
const URL_BLOB = "https://abc123.private.blob.vercel-storage.com";
const creada = vi.fn();

const flujo = (bytes: Uint8Array) => ({
  flujo: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }),
  desde: 0, hasta: bytes.length - 1, total: bytes.length,
});
const texto = (s: string) => new TextEncoder().encode(s);
const registrar = () =>
  POST(
    new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `${URL_BLOB}/${PATH}`, pathname: PATH, nombre: "a.mp3", tamano: 5000, tipo: "audio/mpeg" }),
    }),
    { params: Promise.resolve({ id: ID }) },
  );

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  creada.mockReset().mockImplementation(async ({ data }) => ({ id: "s1", ...data, createdAt: new Date(), updatedAt: new Date() }));
  m.head.mockReset().mockResolvedValue({ size: 5000 });
  m.leer.mockReset();
  m.db = {
    meetingSource: {
      findFirst: async () => null,
      count: async () => 0,
      aggregate: async () => ({ _max: { idx: null } }),
      create: creada,
    },
    meeting: { updateMany: async () => ({ count: 1 }) },
  };
});

describe("POST /api/meetings/[id]/sources: contenido del archivo", () => {
  it("rechaza (400) un texto disfrazado de audio, p. ej. una lista HLS, y no registra nada", async () => {
    m.leer.mockResolvedValue(flujo(texto("#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttp://127.0.0.1:8080/x\n#EXT-X-ENDLIST\n")));
    const r = await registrar();
    expect(r.status).toBe(400);
    expect(creada).not.toHaveBeenCalled();
  });

  it("rechaza un MPD de DASH, HTML o un archivo diminuto", async () => {
    for (const t of ['<?xml version="1.0"?><MPD>............', "<html><body>hola</body></html>", "abc"]) {
      m.leer.mockResolvedValue(flujo(texto(t)));
      expect((await registrar()).status, t).toBe(400);
    }
    expect(creada).not.toHaveBeenCalled();
  });

  it("solo lee los primeros bytes del archivo", async () => {
    m.leer.mockResolvedValue(flujo(texto("ID3\x03\x00\x00\x00\x00\x00\x00\x00\x00")));
    await registrar();
    expect(m.leer).toHaveBeenCalledWith(`${URL_BLOB}/${PATH}`, { rango: { desde: 0, hasta: 4095 } });
  });

  it("si no se puede leer el archivo: 400 y nada se registra", async () => {
    m.leer.mockRejectedValue(new Error("no existe"));
    expect((await registrar()).status).toBe(400);
    expect(creada).not.toHaveBeenCalled();
  });

  const validos: [string, Uint8Array][] = [
    ["mp3 con ID3", texto("ID3\x03\x00\x00\x00\x00\x00\x00\x00\x00")],
    ["mp3 sin etiqueta", new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])],
    ["aac ADTS", new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0, 0, 0, 0, 0])],
    ["m4a / mp4", new Uint8Array([0, 0, 0, 0x20, ...texto("ftypM4A "), 0, 0, 0, 0])],
    ["wav", texto("RIFF\x24\x00\x00\x00WAVEfmt ")],
    ["ogg", texto("OggS\x00\x02\x00\x00\x00\x00\x00\x00")],
    ["flac", texto("fLaC\x00\x00\x00\x22\x00\x00\x00\x00")],
    ["webm", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])],
  ];
  for (const [nombre, bytes] of validos) {
    it(`acepta ${nombre}`, async () => {
      m.leer.mockResolvedValue(flujo(bytes));
      const r = await registrar();
      expect(r.status).toBe(201);
      expect(creada).toHaveBeenCalledTimes(1);
    });
  }
});
