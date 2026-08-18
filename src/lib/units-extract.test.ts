import { describe, it, expect } from "vitest";
import { chunkRowsForExtraction, salvageJsonArray, dedupeByLabel } from "./units-extract";

describe("chunkRowsForExtraction", () => {
  const header = "Apto,Propietario,Correo,Coef,Cuota";
  const sheet = (n: number) =>
    [header, ...Array.from({ length: n }, (_, i) => `Apto ${101 + i},Persona ${i},p${i}@x.com,1.2,350000`)].join("\n");

  it("deja un archivo pequeño en un solo trozo", () => {
    const chunks = chunkRowsForExtraction(sheet(10));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].rows).toBe(10);
  });

  it("trocea 400 filas y no pierde ninguna", () => {
    const chunks = chunkRowsForExtraction(sheet(400), { maxLines: 120 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.reduce((s, c) => s + c.rows, 0)).toBe(400);
  });

  it("repite el encabezado en cada trozo", () => {
    const chunks = chunkRowsForExtraction(sheet(400), { maxLines: 120 });
    for (const c of chunks) expect(c.text.startsWith(header)).toBe(true);
  });

  it("nunca parte una fila por la mitad", () => {
    const chunks = chunkRowsForExtraction(sheet(50), { maxLines: 7 });
    const filas = chunks.flatMap((c) => c.text.split("\n").slice(1));
    for (const f of filas) expect(f).toMatch(/^Apto \d+,Persona \d+,p\d+@x\.com,1\.2,350000$/);
  });

  it("corta por caracteres cuando las filas son anchas", () => {
    const ancha = (i: number) => `Apto ${i},` + "x".repeat(900);
    const raw = [header, ...Array.from({ length: 30 }, (_, i) => ancha(i))].join("\n");
    const chunks = chunkRowsForExtraction(raw, { maxLines: 120, maxChars: 3000 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(3000 + header.length + 10);
  });

  it("aísla una línea gigante en vez de arrastrar el trozo entero", () => {
    const raw = [header, "Apto 1,ok", "Apto 2," + "y".repeat(5000), "Apto 3,ok"].join("\n");
    const chunks = chunkRowsForExtraction(raw, { maxChars: 1000 });
    expect(chunks.length).toBe(3);
  });

  it("devuelve vacío con texto vacío y descarta líneas en blanco", () => {
    expect(chunkRowsForExtraction("")).toEqual([]);
    expect(chunkRowsForExtraction("   \n\n  ")).toEqual([]);
    expect(chunkRowsForExtraction([header, "", "Apto 1,a", "", "Apto 2,b"].join("\n"))[0].rows).toBe(2);
  });
});

describe("salvageJsonArray", () => {
  it("lee un arreglo completo sin marcar truncamiento", () => {
    const r = salvageJsonArray('[{"label":"Apto 101"},{"label":"Apto 102"}]');
    expect(r?.truncated).toBe(false);
    expect(r?.rows).toHaveLength(2);
  });

  it("ignora prosa y cercas de markdown alrededor", () => {
    const r = salvageJsonArray('Claro:\n```json\n[{"label":"Apto 1"}]\n```\nEso es todo.');
    expect(r?.rows).toHaveLength(1);
  });

  it("rescata una respuesta cortada a mitad de objeto", () => {
    const cortada = '[{"label":"Apto 101","email":"a@x.com"},{"label":"Apto 102"},{"label":"Apto 10';
    const r = salvageJsonArray(cortada);
    expect(r?.truncated).toBe(true);
    expect(r?.rows).toHaveLength(2);
  });

  it("rescata aunque la cadena partida contenga una llave de cierre", () => {
    const cortada = '[{"label":"Apto 1"},{"label":"Bloque } norte';
    const r = salvageJsonArray(cortada);
    expect(r?.truncated).toBe(true);
    expect(r?.rows).toHaveLength(1);
  });

  it("devuelve null cuando no hay nada que rescatar", () => {
    expect(salvageJsonArray("No encontré ningún listado de unidades.")).toBeNull();
    expect(salvageJsonArray("")).toBeNull();
    expect(salvageJsonArray('[{"label":')).toBeNull();
  });

  it("acepta el arreglo vacío que el prompt pide cuando no hay unidades", () => {
    const r = salvageJsonArray("[]");
    expect(r?.rows).toEqual([]);
    expect(r?.truncated).toBe(false);
  });
});

describe("dedupeByLabel", () => {
  it("descarta repetidos ignorando mayúsculas y espacios", () => {
    const out = dedupeByLabel([
      { label: "Apto 101" },
      { label: "  apto   101 " },
      { label: "Apto 102" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("conserva la primera aparición", () => {
    const out = dedupeByLabel([
      { label: "Apto 101", email: "primero@x.com" },
      { label: "Apto 101", email: "segundo@x.com" },
    ] as { label: string; email: string }[]);
    expect(out[0].email).toBe("primero@x.com");
  });

  it("descarta etiquetas vacías", () => {
    expect(dedupeByLabel([{ label: "  " }, { label: "Apto 1" }])).toHaveLength(1);
  });
});
