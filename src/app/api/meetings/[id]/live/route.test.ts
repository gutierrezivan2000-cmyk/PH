import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  put: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  reunion: vi.fn(),
  demo: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { meetingLivePart: { upsert: (...a: unknown[]) => m.upsert(...a) }, meeting: { updateMany: (...a: unknown[]) => m.updateMany(...a) } } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/meetings/acceso", () => ({
  exigirVisible: async () => ({ ctx: { userId: "u1", demo: false } }),
  reunionDelUsuario: (...a: unknown[]) => m.reunion(...a),
}));
vi.mock("@/lib/meetings/demo", () => ({ demoRegistrarParteViva: (...a: unknown[]) => m.demo(...a) }));
vi.mock("@vercel/blob", () => ({ put: (...a: unknown[]) => m.put(...a) }));

import { POST } from "./route";

const EBML = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81];
const MP4 = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
const HLS = [...new TextEncoder().encode("#EXTM3U\n#EXT-X-VERSION:3\n")];

const enviar = (bytes: number[], seq = 0, tipo = "audio/webm;codecs=opus") =>
  POST(
    new Request("http://localhost/api/meetings/reunion12345678901/live", {
      method: "POST",
      headers: { "content-type": tipo, "x-sesion": "1", "x-secuencia": String(seq), "x-duracion-ms": "30000" },
      body: new Uint8Array(bytes),
    }) as never,
    { params: Promise.resolve({ id: "reunion12345678901" }) },
  );

beforeEach(() => {
  m.put.mockReset().mockResolvedValue({ url: "https://blob/x" });
  m.upsert.mockReset().mockResolvedValue({});
  m.updateMany.mockReset().mockResolvedValue({ count: 1 });
  m.demo.mockReset();
  m.reunion.mockReset().mockResolvedValue({ status: "borrador", consentAt: new Date() });
});

describe("POST /api/meetings/[id]/live: firma de la primera parte", () => {
  it("la parte 0 con cabecera webm (EBML) se guarda", async () => {
    const r = await enviar(EBML);
    expect(r.status).toBe(200);
    expect(m.put).toHaveBeenCalledTimes(1);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("la parte 0 de Safari (mp4 con ftyp) también se guarda", async () => {
    expect((await enviar(MP4, 0, "audio/mp4")).status).toBe(200);
    expect(m.put).toHaveBeenCalledTimes(1);
  });

  it("la parte 0 que es una lista HLS o texto se rechaza con 400, sin tocar el almacén ni la base", async () => {
    const r = await enviar(HLS);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/no parece un audio válido/);
    expect(m.put).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("las partes siguientes son continuación sin cabecera: no se les exige firma", async () => {
    const r = await enviar([0x1f, 0x43, 0xb6, 0x75, 1, 2, 3, 4, 5, 6, 7, 8], 3);
    expect(r.status).toBe(200);
    expect(m.put).toHaveBeenCalledTimes(1);
  });
});
