import * as XLSX from "xlsx";

export async function parseSpreadsheet(buffer: Buffer | ArrayBuffer, filename: string): Promise<string> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const results: string[] = [`[Datos de hoja de cálculo: ${filename}]`];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_csv(sheet);
    results.push(`\n--- Hoja: ${sheetName} ---\n${data}`);
  }

  return results.join("\n");
}
