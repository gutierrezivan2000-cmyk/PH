export async function parsePdfFile(buffer: Buffer, filename: string): Promise<string> {
  try {
    // pdf-parse@1.1.1 — works in serverless without canvas/DOMMatrix
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return `[Contenido de PDF: ${filename}]\n${data.text}`;
  } catch (error) {
    console.error(`[parsePdfFile] Failed to parse ${filename}:`, error);
    return `[PDF: ${filename} — no se pudo extraer el texto]`;
  }
}
