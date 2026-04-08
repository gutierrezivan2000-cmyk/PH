import mammoth from "mammoth";

export async function parseDocxFile(buffer: Buffer, filename: string): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return `[Contenido de documento: ${filename}]\n${result.value}`;
}
