// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

export async function parsePdfFile(buffer: Buffer, filename: string): Promise<string> {
  const data = await pdfParse(buffer);
  return `[Contenido de PDF: ${filename}]\n${data.text}`;
}
