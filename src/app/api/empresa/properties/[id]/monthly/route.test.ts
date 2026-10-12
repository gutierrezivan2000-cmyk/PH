import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, del, elite } = vi.hoisted(() => ({
  db: {
    property: { findFirst: vi.fn() },
    propertyMonthlyData: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyDocument: { findMany: vi.fn() },
  },
  del: vi.fn(),
  elite: { actual: null as { userId: string } | null },
}));
vi.mock("@/lib/elite-auth", () => ({ requireElite: async () => elite.actual }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@vercel/blob", () => ({ del: (...a: unknown[]) => del(...a) }));

import { PUT } from "./route";
import { MENSAJE_BLOB_AJENO } from "@/lib/blob-owner";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const PROP = "cmprop1111111111aa";
const archivo = (url: string, name = "insumo.pdf") => ({ name, url, type: "application/pdf", size: 1000 });
const propio = (n: string) => archivo(`${HOST}/subidas/${U1}/monthly/${PROP}/2026-5/${n}-AbC123.pdf`, `${n}.pdf`);
const ajeno = (n: string) => archivo(`${HOST}/subidas/${U2}/monthly/other/2026-5/${n}-AbC123.pdf`, `${n}.pdf`);
const legado = (n: string, prop = PROP) => archivo(`${HOST}/monthly/${prop}/2026-5/1700000-${n}-AbC123.pdf`, `${n}.pdf`);

const guardar = (files: unknown) =>
  PUT(
    new Request(`http://localhost:3000/api/empresa/properties/${PROP}/monthly`, {
      method: "PUT",
      body: JSON.stringify({ month: 5, year: 2026, files, additionalText: "nota" }),
    }) as never,
    { params: Promise.resolve({ id: PROP }) }
  );

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  elite.actual = { userId: U1 };
  for (const m of [db.property.findFirst, db.propertyMonthlyData.findUnique, db.propertyMonthlyData.upsert, db.propertyDocument.findMany, del]) m.mockReset();
  db.property.findFirst.mockResolvedValue({ id: PROP });
  db.propertyMonthlyData.findUnique.mockResolvedValue({ files: [] });
  db.propertyMonthlyData.upsert.mockResolvedValue({});
  db.propertyDocument.findMany.mockResolvedValue([]);
  del.mockResolvedValue(undefined);
});

describe("PUT /api/empresa/properties/[id]/monthly: dueño de los insumos", () => {
  it("guarda los insumos propios", async () => {
    const r = await guardar([propio("a"), propio("b")]);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, count: 2 });
    expect(db.propertyMonthlyData.upsert).toHaveBeenCalledTimes(1);
    expect(db.propertyMonthlyData.upsert.mock.calls[0][0].update.files).toEqual([propio("a"), propio("b")]);
  });

  it("RECHAZA (403) un insumo de otro usuario y no guarda nada", async () => {
    const r = await guardar([propio("a"), ajeno("secreto")]);
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe(MENSAJE_BLOB_AJENO);
    expect(db.propertyMonthlyData.upsert).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("rechaza los trucos de ruta hacia la carpeta de otro", async () => {
    for (const url of [
      `${HOST}/subidas/${U1}/../${U2}/monthly/x/a.pdf`,
      `${HOST}/subidas/${U1}/%2e%2e/${U2}/a.pdf`,
      `${HOST}/subidas/${U2}/a.pdf?/subidas/${U1}/`,
      `${HOST}/uploads/1700000-acta.pdf`,
      `${HOST}/monthly/otra-propiedad/2026-5/a.pdf`,
      `${HOST}/monthly/${PROP}/../otra-propiedad/a.pdf`,
    ]) {
      expect((await guardar([archivo(url)])).status, url).toBe(403);
    }
    expect(db.propertyMonthlyData.upsert).not.toHaveBeenCalled();
  });

  it("un host que no es del almacenamiento sigue respondiendo 400 con el mensaje de siempre", async () => {
    const r = await guardar([archivo("https://servidor-del-atacante.example/subidas/" + U1 + "/a.pdf")]);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("Archivo con origen no permitido.");
  });

  it("los insumos de antes (monthly/<esta copropiedad>/) se pueden volver a enviar al guardar la lista", async () => {
    const r = await guardar([legado("viejo"), propio("nuevo")]);
    expect(r.status).toBe(200);
    expect(db.propertyMonthlyData.upsert).toHaveBeenCalledTimes(1);
  });

  it("...pero los de otra copropiedad no", async () => {
    expect((await guardar([legado("viejo", "otra-propiedad")])).status).toBe(403);
  });

  it("al quitar un insumo borra el blob propio", async () => {
    db.propertyMonthlyData.findUnique.mockResolvedValue({ files: [propio("a"), propio("b")] });
    const r = await guardar([propio("a")]);
    expect(r.status).toBe(200);
    expect(del).toHaveBeenCalledWith([propio("b").url]);
  });

  it("NUNCA borra un blob ajeno que quedó en la lista guardada (URL pegada antes de este cambio)", async () => {
    db.propertyMonthlyData.findUnique.mockResolvedValue({ files: [propio("a"), ajeno("pegado"), legado("de-otra", "otra-propiedad")] });
    const r = await guardar([]);
    expect(r.status).toBe(200);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith([propio("a").url]);
  });

  it("borra el insumo de antes de ESTA copropiedad, pero no si es documento de la copropiedad", async () => {
    db.propertyMonthlyData.findUnique.mockResolvedValue({ files: [legado("viejo"), propio("reglamento")] });
    db.propertyDocument.findMany.mockResolvedValue([{ url: propio("reglamento").url }]);
    const r = await guardar([]);
    expect(r.status).toBe(200);
    expect(del).toHaveBeenCalledWith([legado("viejo").url]);
  });

  it("una copropiedad ajena responde 404 sin tocar los archivos", async () => {
    db.property.findFirst.mockResolvedValue(null);
    expect((await guardar([propio("a")])).status).toBe(404);
    expect(db.propertyMonthlyData.upsert).not.toHaveBeenCalled();
  });

  it("sin acceso Elite responde 403", async () => {
    elite.actual = null;
    expect((await guardar([propio("a")])).status).toBe(403);
    expect(db.propertyMonthlyData.upsert).not.toHaveBeenCalled();
  });
});
