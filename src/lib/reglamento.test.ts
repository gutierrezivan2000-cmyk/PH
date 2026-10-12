import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, parsers } = vi.hoisted(() => ({
  db: { propertyDocument: { findMany: vi.fn(), update: vi.fn() } },
  parsers: { detectFileType: vi.fn(), parseFile: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/parsers", () => parsers);

import { esLecturaFallida, getReglamentoText } from "./reglamento";

describe("esLecturaFallida: un marcador de error no es el reglamento", () => {
  it("reconoce los marcadores que devuelven los lectores cuando fallan", () => {
    expect(esLecturaFallida("[Imagen: reglamento.jpg — error al analizar: 529 Overloaded]")).toBe(true);
    expect(esLecturaFallida("[Imagen: foto.png — analisis visual no disponible (configura ANTHROPIC_API_KEY)]")).toBe(true);
    expect(esLecturaFallida("[Imagen: foto.heic — formato no soportado para analisis visual (image/heic)]")).toBe(true);
    expect(esLecturaFallida("[Archivo: manual.pdf — no se pudo procesar: PDF dañado]")).toBe(true);
    expect(esLecturaFallida("  [Archivo: x.docx — Error al procesar: vacío]  ")).toBe(true);
  });

  it("no confunde un reglamento real, ni un análisis de imagen que sí salió bien", () => {
    expect(esLecturaFallida("ARTÍCULO 1. Los residentes deben respetar el horario de silencio.")).toBe(false);
    expect(esLecturaFallida("[Análisis de imagen: reglamento.jpg]\nArtículo 2. Las mascotas deben ir con correa.")).toBe(false);
    expect(esLecturaFallida("")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════
   getReglamentoText: solo se lee el archivo que es de la copropiedad
   ════════════════════════════════════════════════════════════════════ */

const HOST = "https://abc123.private.blob.vercel-storage.com";
const ADMIN = "cmadmin1111111111aa";
const OTRO = "cmotro22222222222bb";
const PROP = "cmprop1111111111aa";
const OTRA_PROP = "cmprop9999999999zz";
const TEXTO = "ARTÍCULO 1. Los residentes deben respetar el horario de silencio.";

const propio = (n: string) => `${HOST}/subidas/${ADMIN}/property-docs/${PROP}/${n}-AbC123.pdf`;
const legado = (n: string) => `${HOST}/property-docs/${PROP}/1700000-${n}-AbC123.pdf`;
const ajeno = (n: string) => `${HOST}/subidas/${OTRO}/agent-files/${n}-AbC123.pdf`;

const fila = (id: string, url: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `${id}.pdf`,
  url,
  mimeType: "application/pdf",
  size: 1000,
  extractedText: null,
  property: { userId: ADMIN },
  ...extra,
});

let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_token_de_prueba");
  fetchSimulado = vi.fn().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("fetch", fetchSimulado);
  db.propertyDocument.findMany.mockReset().mockResolvedValue([]);
  db.propertyDocument.update.mockReset().mockResolvedValue({});
  parsers.detectFileType.mockReset().mockReturnValue("pdf");
  parsers.parseFile.mockReset().mockResolvedValue({ text: TEXTO });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getReglamentoText: de quién es el archivo", () => {
  it("lee el documento que subió el administrador y guarda el texto", async () => {
    db.propertyDocument.findMany.mockResolvedValue([fila("d1", propio("reglamento"))]);
    const texto = await getReglamentoText(PROP);
    expect(texto).toBe(`--- d1.pdf ---\n${TEXTO}`);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(db.propertyDocument.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { extractedText: TEXTO } });
  });

  it("lee un documento de antes de que el dueño fuera parte de la ruta (property-docs/<esta copropiedad>/…)", async () => {
    db.propertyDocument.findMany.mockResolvedValue([fila("d1", legado("reglamento"))]);
    expect(await getReglamentoText(PROP)).toContain(TEXTO);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it("un documento cuyo archivo es de OTRA cuenta se omite: no se descarga, no se lee y se avisa en el registro", async () => {
    db.propertyDocument.findMany.mockResolvedValue([fila("d1", ajeno("secreto"))]);
    expect(await getReglamentoText(PROP)).toBe("");
    expect(fetchSimulado).not.toHaveBeenCalled(); // ni siquiera con la credencial del almacenamiento
    expect(parsers.parseFile).not.toHaveBeenCalled();
    expect(db.propertyDocument.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[reglamento] documento omitido"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("d1"));
  });

  it("su texto ya guardado tampoco se entrega: salió de un archivo que no es de la copropiedad", async () => {
    db.propertyDocument.findMany.mockResolvedValue([fila("d1", ajeno("secreto"), { extractedText: "CONTENIDO CONFIDENCIAL DE OTRA CUENTA, bastante largo" })]);
    expect(await getReglamentoText(PROP)).toBe("");
  });

  it("el texto ya guardado de un documento propio se usa sin volver a descargar", async () => {
    db.propertyDocument.findMany.mockResolvedValue([fila("d1", propio("reglamento"), { extractedText: TEXTO })]);
    expect(await getReglamentoText(PROP)).toBe(`--- d1.pdf ---\n${TEXTO}`);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("los documentos ajenos no tumban la respuesta: se sigue con los buenos, en su orden", async () => {
    db.propertyDocument.findMany.mockResolvedValue([
      fila("d1", ajeno("a")),
      fila("d2", propio("b")),
      fila("d3", `${HOST}/property-docs/${OTRA_PROP}/1700000-c.pdf`),
      fila("d4", legado("d")),
    ]);
    parsers.parseFile.mockResolvedValueOnce({ text: `${TEXTO} (b)` }).mockResolvedValueOnce({ text: `${TEXTO} (d)` });
    const texto = await getReglamentoText(PROP);
    expect(texto).toBe(`--- d2.pdf ---\n${TEXTO} (b)\n\n--- d4.pdf ---\n${TEXTO} (d)`);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("los ajenos no les quitan el lugar a los buenos (ni en el tope de documentos ni en el de lecturas nuevas)", async () => {
    const ajenos = Array.from({ length: 9 }, (_, i) => fila(`x${i}`, ajeno(`x${i}`)));
    db.propertyDocument.findMany.mockResolvedValue([...ajenos, fila("bueno", propio("bueno"))]);
    expect(await getReglamentoText(PROP)).toContain("--- bueno.pdf ---");
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it("la credencial del almacenamiento solo viaja para un archivo que es de la copropiedad", async () => {
    fetchSimulado.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.headers ? new Response(new Uint8Array([1])) : new Response("no", { status: 403 })
    );
    db.propertyDocument.findMany.mockResolvedValue([fila("d1", ajeno("secreto")), fila("d2", propio("b"))]);
    await getReglamentoText(PROP);
    // Un solo documento llegó a descargarse (el propio) y ahí sí se reintenta con credencial; del ajeno no salió nada.
    const urls = fetchSimulado.mock.calls.map((c) => c[0]);
    expect(urls.every((u) => u === propio("b"))).toBe(true);
    expect(urls).not.toContain(ajeno("secreto"));
  });

  it("sin administrador conocido en la fila solo valen los archivos de la carpeta de antes de esta copropiedad", async () => {
    db.propertyDocument.findMany.mockResolvedValue([
      fila("d1", propio("a"), { property: null }),
      fila("d2", legado("b"), { property: null }),
    ]);
    const texto = await getReglamentoText(PROP);
    expect(texto).not.toContain("--- d1.pdf ---");
    expect(texto).toContain("--- d2.pdf ---");
  });

  it("un host que no es del almacenamiento sigue sin descargarse (aunque la ruta parezca la correcta)", async () => {
    db.propertyDocument.findMany.mockResolvedValue([
      fila("d1", `https://servidor-del-atacante.example/subidas/${ADMIN}/a.pdf`),
      fila("d2", `http://servidor-del-atacante.example/property-docs/${PROP}/a.pdf`),
    ]);
    expect(await getReglamentoText(PROP)).toBe("");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it.each([
    ["recorrido hacia la carpeta de otro", `${HOST}/subidas/${ADMIN}/../${OTRO}/a.pdf`],
    ["recorrido codificado", `${HOST}/subidas/${ADMIN}/%2e%2e/${OTRO}/a.pdf`],
    ["recorrido por la carpeta de antes", `${HOST}/property-docs/${PROP}/../${OTRA_PROP}/a.pdf`],
    ["insumos mensuales", `${HOST}/monthly/${PROP}/2026-5/1700000-a.pdf`],
    ["carpeta general sin dueño", `${HOST}/uploads/1700000-a.pdf`],
  ])("se omite el documento con %s", async (_caso, url) => {
    db.propertyDocument.findMany.mockResolvedValue([fila("d1", url)]);
    expect(await getReglamentoText(PROP)).toBe("");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("pide a la base también el administrador de la copropiedad (de ahí sale la prueba del dueño)", async () => {
    await getReglamentoText(PROP);
    const arg = db.propertyDocument.findMany.mock.calls[0][0];
    expect(arg.where.propertyId).toBe(PROP);
    expect(arg.select.property).toEqual({ select: { userId: true } });
  });

  it("sin documentos devuelve vacío", async () => {
    expect(await getReglamentoText(PROP)).toBe("");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});
