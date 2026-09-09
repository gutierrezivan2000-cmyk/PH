import { describe, it, expect } from "vitest";
import { construirExcel, construirWord, construirPdf, nombreSeguro } from "./agent-files";
import { ejecutarHerramienta, HERRAMIENTAS_ARCHIVO } from "./agent-tools";

const firma = (b: Buffer) => b.subarray(0, 4).toString("hex");
const ZIP = "504b0304"; // xlsx y docx son zips
const PDF = "25504446"; // %PDF

describe("archivos que genera el agente", () => {
  it("la hoja de cálculo es un xlsx real y conserva los datos", async () => {
    const a = await construirExcel("Presupuesto 2026", [
      { nombre: "Presupuesto", filas: [["Rubro", "Valor"], ["Vigilancia", 48000000]] },
    ]);
    expect(firma(a.buffer)).toBe(ZIP);
    expect(a.nombre).toBe("Presupuesto-2026.xlsx");

    const XLSX = await import("xlsx");
    const libro = XLSX.read(a.buffer, { type: "buffer" });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 });
    expect(filas[0]).toEqual(["Rubro", "Valor"]);
    // El número debe quedar como NÚMERO, o Excel no puede sumarlo.
    expect(filas[1]).toEqual(["Vigilancia", 48000000]);
  });

  it("respeta el límite de 31 caracteres de Excel en el nombre de la hoja", async () => {
    const a = await construirExcel("x", [
      { nombre: "Un nombre larguísimo de pestaña que Excel no admite", filas: [["a"]] },
    ]);
    const XLSX = await import("xlsx");
    const libro = XLSX.read(a.buffer, { type: "buffer" });
    expect(libro.SheetNames[0].length).toBeLessThanOrEqual(31);
  });

  it("el documento de Word lleva dentro el texto y la tabla", async () => {
    const a = await construirWord("Acta", "Acta de Asamblea", [
      { titulo: "Orden del día", parrafos: ["- Verificación del quórum"] },
      { titulo: "Votación", tabla: [["Punto", "A favor"], ["Presupuesto", "82%"]] },
    ]);
    expect(firma(a.buffer)).toBe(ZIP);
    const { default: JSZip } = await import("jszip").catch(() => ({ default: null }) as never);
    if (JSZip) {
      const zip = await JSZip.loadAsync(a.buffer);
      const xml = await zip.file("word/document.xml")!.async("string");
      for (const t of ["Acta de Asamblea", "Verificación del quórum", "A favor", "82%"]) {
        expect(xml).toContain(t);
      }
    }
  });

  it("el PDF es un PDF de verdad", async () => {
    const a = await construirPdf("Informe", "Informe de Gestión", [
      { titulo: "Resumen", parrafos: ["La cartera cerró en $18.450.000."] },
    ]);
    expect(firma(a.buffer)).toBe(PDF);
    expect(a.nombre).toBe("Informe.pdf");
  });

  it("sanea el nombre del archivo, que viaja en una cabecera", () => {
    expect(nombreSeguro('acta/../../etc/passwd', "pdf")).not.toContain("/");
    expect(nombreSeguro('reporte "marzo"', "xlsx")).toBe("reporte-marzo.xlsx");
    expect(nombreSeguro("", "docx")).toBe("documento.docx");
    expect(nombreSeguro("Presupuesto.xlsx", "xlsx")).toBe("Presupuesto.xlsx");
  });
});

describe("herramientas ofrecidas al modelo", () => {
  it("son tres y describen cuándo usarlas", () => {
    expect(HERRAMIENTAS_ARCHIVO.map((h) => h.name).sort()).toEqual([
      "generar_documento_word", "generar_hoja_de_calculo", "generar_pdf",
    ]);
    for (const h of HERRAMIENTAS_ARCHIVO) expect(h.description!.length).toBeGreaterThan(80);
  });

  it("una llamada sin datos devuelve un error legible en vez de un archivo vacío", async () => {
    const r = await ejecutarHerramienta("generar_hoja_de_calculo", { nombre: "x", hojas: [] });
    expect(r.archivo).toBeUndefined();
    expect(r.error).toMatch(/fila/i);
  });

  it("una herramienta inventada no revienta la conversación", async () => {
    const r = await ejecutarHerramienta("borrar_base_de_datos", {});
    expect(r.error).toMatch(/desconocida/i);
  });

  it("genera de verdad desde la entrada del modelo", async () => {
    const r = await ejecutarHerramienta("generar_hoja_de_calculo", {
      nombre: "Cartera",
      hojas: [{ nombre: "Cartera", filas: [["Apto", "Saldo"], ["101", 350000]] }],
    });
    expect(r.error).toBeUndefined();
    expect(r.archivo!.mime).toContain("spreadsheetml");
  });
});
