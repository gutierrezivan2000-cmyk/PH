import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { chunkRowsForExtraction, salvageJsonArray, dedupeByLabel } from "./units-extract";
import { parseSpreadsheet } from "./parsers/spreadsheet";

/** Excel de verdad, como el que sube un administrador. */
function libro(hojas: Record<string, (string | number)[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const COLUMNAS = ["Apto", "Propietario", "Correo", "Celular", "Coef", "Cuota"];
const filasDe = (n: number, desde = 101): (string | number)[][] =>
  Array.from({ length: n }, (_, i) => [`${desde + i}`, `Persona ${i}`, `p${i}@correo.com`, "3001234567", 1.25, 350000]);

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
    // Filas con la misma forma que el encabezado: se descartan las líneas en
    // blanco y el encabezado no cuenta como dato.
    const hoja = [header, "", "Apto 1,Ana,a@x.com,1.2,350000", "", "Apto 2,Beto,b@x.com,1.1,330000"].join("\n");
    expect(chunkRowsForExtraction(hoja)[0].rows).toBe(2);
  });
});

// Estas pruebas alimentan el troceador con la SALIDA LITERAL del parser, no
// con un CSV escrito a mano: el parser antepone un rótulo y un separador de
// hoja, así que la fila de columnas es la tercera línea. Tomar la primera como
// encabezado dejaba los trozos 2 en adelante sin nombres de columna y el
// modelo tenía que adivinar qué número era el coeficiente y cuál la cuota.
describe("chunkRowsForExtraction con la salida real del parser", () => {
  it("repite la fila de columnas en TODOS los trozos, no el rótulo del parser", async () => {
    const texto = await parseSpreadsheet(libro({ Hoja1: [COLUMNAS, ...filasDe(400)] }), "padron.xlsx");
    const chunks = chunkRowsForExtraction(texto, { maxLines: 120, maxChars: 20_000 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text).toContain("Apto,Propietario,Correo");
    }
  });

  it("no pierde ninguna unidad al trocear la hoja real", async () => {
    const texto = await parseSpreadsheet(libro({ Hoja1: [COLUMNAS, ...filasDe(400)] }), "padron.xlsx");
    const chunks = chunkRowsForExtraction(texto, { maxLines: 120, maxChars: 20_000 });
    expect(chunks.reduce((s, c) => s + c.rows, 0)).toBe(400);
    const cuerpo = chunks.flatMap((c) => c.text.split("\n").filter((l) => /^\d+,Persona /.test(l)));
    expect(new Set(cuerpo).size).toBe(400);
  });

  it("el rótulo del archivo va solo en el primer trozo", async () => {
    const texto = await parseSpreadsheet(libro({ Hoja1: [COLUMNAS, ...filasDe(400)] }), "padron.xlsx");
    const chunks = chunkRowsForExtraction(texto, { maxLines: 120, maxChars: 20_000 });
    const conRotulo = chunks.filter((c) => c.text.includes("[Datos de hoja de cálculo:"));
    expect(conRotulo).toHaveLength(1);
    expect(chunks[0].text).toContain("[Datos de hoja de cálculo: padron.xlsx]");
  });

  it("cada hoja lleva SUS columnas cuando el libro tiene varias", async () => {
    const texto = await parseSpreadsheet(
      libro({
        Unidades: [COLUMNAS, ...filasDe(150)],
        Saldos: [["Apto", "Saldo", "Mora"], ...Array.from({ length: 150 }, (_, i) => [`${101 + i}`, 120000, 2])],
      }),
      "padron.xlsx"
    );
    const chunks = chunkRowsForExtraction(texto, { maxLines: 120, maxChars: 20_000 });
    // Ningún trozo puede mezclar los encabezados de las dos hojas.
    for (const c of chunks) {
      const tieneUnidades = c.text.includes("Apto,Propietario,Correo");
      const tieneSaldos = c.text.includes("Apto,Saldo,Mora");
      expect(tieneUnidades && tieneSaldos).toBe(false);
    }
    expect(chunks.some((c) => c.text.includes("Apto,Propietario,Correo"))).toBe(true);
    expect(chunks.some((c) => c.text.includes("Apto,Saldo,Mora"))).toBe(true);
  });

  it("en texto corrido no inventa encabezado ni descarta la primera línea", () => {
    const pdf = ["[Contenido de PDF: censo.pdf]", "Apartamento 101 - Juan Pérez - 3001112233", "Apartamento 102 - Ana Ruiz - 3002223344", "Apartamento 103 - Luis Gómez - 3003334455"].join("\n");
    const chunks = chunkRowsForExtraction(pdf, { maxLines: 2 });
    const datos = chunks.flatMap((c) => c.text.split("\n").filter((l) => l.startsWith("Apartamento")));
    expect(new Set(datos).size).toBe(3);
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
