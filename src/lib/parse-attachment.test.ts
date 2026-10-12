/**
 * Lectura de adjuntos con dueño: un adjunto que no es de quien lo envía no se descarga, no se lee y no se devuelve como
 * imagen, aunque quien llama no haya validado la lista.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { blobRefToFile, parseFile } = vi.hoisted(() => ({
  blobRefToFile: vi.fn(),
  parseFile: vi.fn(),
}));
vi.mock("@/lib/generation/run", () => ({ blobRefToFile }));
vi.mock("@/lib/parsers", () => ({
  // Mismo criterio que el real para lo que usan estas pruebas: por tipo MIME o por extensión.
  detectFileType: (name: string, mime: string) =>
    mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : name.endsWith(".pdf") ? "pdf" : "text",
  parseFile,
}));

import { parseAttachment, parseAttachments, type AttachmentInput } from "./parse-attachment";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";
const PROP = "cmprop1111111111aa";

const adjunto = (url: string, name = "acta.pdf", type = "application/pdf", size = 1000): AttachmentInput => ({ name, url, type, size });
const propio = (name = "acta.pdf", type = "application/pdf") => adjunto(`${HOST}/subidas/${U1}/agent-files/${name}-AbC123`, name, type);
const ajeno = (name = "secreto.pdf", type = "application/pdf") => adjunto(`${HOST}/subidas/${U2}/agent-files/${name}-AbC123`, name, type);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  blobRefToFile.mockReset().mockImplementation(async (ref: { name: string }) => new File(["x"], ref.name));
  parseFile.mockReset().mockResolvedValue({ text: "contenido del acta" });
});

describe("parseAttachment con dueño", () => {
  it("lee un adjunto propio y reenvía el dueño a blobRefToFile", async () => {
    const att = propio();
    const r = await parseAttachment(att, { userId: U1 });
    expect(r).toMatchObject({ name: "acta.pdf", isImage: false, text: "contenido del acta", url: att.url });
    expect(blobRefToFile).toHaveBeenCalledTimes(1);
    expect(blobRefToFile).toHaveBeenCalledWith({ url: att.url, name: "acta.pdf", type: "application/pdf", size: 1000 }, { userId: U1 });
  });

  it("un adjunto de otra persona NO se descarga ni se lee: queda un marcador y no se lanza", async () => {
    const att = ajeno();
    const r = await parseAttachment(att, { userId: U1 });
    expect(blobRefToFile).not.toHaveBeenCalled();
    expect(parseFile).not.toHaveBeenCalled();
    expect(r.isImage).toBe(false);
    expect(r.text).toMatch(/no pertenece a tu cuenta/);
    expect(r.text).not.toContain("contenido");
  });

  it("una imagen ajena tampoco se devuelve como imagen (su URL no llega al consumidor)", async () => {
    const r = await parseAttachment(ajeno("foto.png", "image/png"), { userId: U1 });
    expect(r.isImage).toBe(false);
    expect(r.text).toMatch(/no pertenece a tu cuenta/);
    expect(blobRefToFile).not.toHaveBeenCalled();
  });

  it("una imagen propia se devuelve como imagen, sin descargarla", async () => {
    const att = propio("foto.png", "image/png");
    const r = await parseAttachment(att, { userId: U1 });
    expect(r).toEqual({ name: "foto.png", type: "image/png", text: "", isImage: true, url: att.url });
    expect(blobRefToFile).not.toHaveBeenCalled();
  });

  it("un adjunto ajeno demasiado grande se trata como ajeno, no como «demasiado grande»", async () => {
    const r = await parseAttachment({ ...ajeno(), size: 50 * 1024 * 1024 }, { userId: U1 });
    expect(r.text).toMatch(/no pertenece a tu cuenta/);
    expect(r.text).not.toMatch(/demasiado grande/);
  });

  it.each([
    ["ruta anterior sin dueño", `${HOST}/agent-files/1700000-acta.pdf`],
    ["recorrido hacia la carpeta de otro", `${HOST}/subidas/${U1}/../${U2}/acta.pdf`],
    ["recorrido codificado", `${HOST}/subidas/${U1}/%2e%2e/${U2}/acta.pdf`],
    ["consulta que imita la ruta", `${HOST}/subidas/${U2}/acta.pdf?x=/subidas/${U1}/a.pdf`],
    ["host ajeno con la ruta correcta", `https://servidor-del-atacante.example/subidas/${U1}/acta.pdf`],
    ["URL interna", "http://169.254.169.254/latest/meta-data/"],
    ["URL vacía", ""],
  ])("rechaza: %s", async (_caso, url) => {
    const r = await parseAttachment(adjunto(url), { userId: U1 });
    expect(r.text).toMatch(/no pertenece a tu cuenta/);
    expect(blobRefToFile).not.toHaveBeenCalled();
  });

  it("acepta cualquiera de los ids del usuario cuando se pasan varios", async () => {
    const r = await parseAttachment(ajeno(), { userId: [U1, U2] });
    expect(r.text).toBe("contenido del acta");
    expect(blobRefToFile).toHaveBeenCalledTimes(1);
  });

  it("los insumos mensuales de antes solo valen con la copropiedad verificada", async () => {
    const legado = adjunto(`${HOST}/monthly/${PROP}/2026-5/1700000-acta-AbC123.pdf`);
    expect((await parseAttachment(legado, { userId: U1 })).text).toMatch(/no pertenece a tu cuenta/);
    expect((await parseAttachment(legado, { userId: U1, propertyId: "otra-propiedad" })).text).toMatch(/no pertenece a tu cuenta/);
    expect(blobRefToFile).not.toHaveBeenCalled();
    expect((await parseAttachment(legado, { userId: U1, propertyId: PROP })).text).toBe("contenido del acta");
    expect(blobRefToFile).toHaveBeenCalledTimes(1);
  });

  it("si blobRefToFile rechaza por su cuenta (dueño distinto), el fallo no se propaga: queda como error al procesar", async () => {
    blobRefToFile.mockRejectedValueOnce(new Error("El archivo no pertenece a tu cuenta"));
    const r = await parseAttachment(propio(), { userId: U1 });
    expect(r.text).toMatch(/error al procesar/);
  });

  it("sin dueño se comporta como antes (compatibilidad): lee lo que blobRefToFile acepte y no pasa dueño", async () => {
    const att = ajeno();
    const r = await parseAttachment(att);
    expect(r.text).toBe("contenido del acta");
    expect(blobRefToFile).toHaveBeenCalledWith({ url: att.url, name: att.name, type: att.type, size: att.size }, undefined);
  });
});

/**
 * Estas pruebas dejan UN solo adjunto propio por lista a propósito: parseAttachment carga run.ts bajo demanda y vitest, con
 * varias importaciones dinámicas simultáneas del mismo módulo simulado, deja escapar las posteriores al módulo real (en
 * producción Node comparte una sola importación). Los ajenos no llegan a esa importación, así que no cuentan.
 */
describe("parseAttachments con dueño", () => {
  it("lee el propio y marca los ajenos, sin que uno tumbe a los demás", async () => {
    const lista = [ajeno("a.pdf"), propio("b.pdf"), ajeno("c.pdf")];
    const r = await parseAttachments(lista, { userId: U1 });
    expect(r.map((p) => p.name)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    expect(r.map((p) => p.text)).toEqual([
      expect.stringMatching(/no pertenece a tu cuenta/),
      "contenido del acta",
      expect.stringMatching(/no pertenece a tu cuenta/),
    ]);
    expect(blobRefToFile).toHaveBeenCalledTimes(1);
    expect(blobRefToFile.mock.calls[0][0].url).toBe(lista[1].url);
    expect(blobRefToFile.mock.calls[0][1]).toEqual({ userId: U1 });
  });

  it("pasa el dueño a CADA adjunto: .map(parseAttachment) le colaría el índice como dueño y dejaría pasar al ajeno de la posición 0", async () => {
    const r = await parseAttachments([ajeno("a.pdf"), ajeno("b.pdf")], { userId: U1 });
    expect(r.every((p) => /no pertenece a tu cuenta/.test(p.text))).toBe(true);
    expect(blobRefToFile).not.toHaveBeenCalled();
  });

  it("sin dueño el adjunto no recibe ninguno (ni el índice del map)", async () => {
    await parseAttachments([propio("a.pdf")]);
    expect(blobRefToFile.mock.calls[0][1]).toBeUndefined();
  });

  it("una lista vacía devuelve una lista vacía", async () => {
    expect(await parseAttachments([], { userId: U1 })).toEqual([]);
  });
});
