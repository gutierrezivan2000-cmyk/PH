import { parseAudioFile } from "./audio";
import { parseSpreadsheet } from "./spreadsheet";
import { parsePdfFile } from "./pdf";
import { parseDocxFile } from "./docx";

export type FileType = "audio" | "spreadsheet" | "pdf" | "docx" | "image" | "text" | "unknown";

export function detectFileType(filename: string, mimeType: string): FileType {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (mimeType.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "webm"].includes(ext ?? "")) {
    return "audio";
  }
  if (["xlsx", "xls", "csv"].includes(ext ?? "") || mimeType.includes("spreadsheet")) {
    return "spreadsheet";
  }
  if (ext === "pdf" || mimeType === "application/pdf") {
    return "pdf";
  }
  if (ext === "docx" || mimeType.includes("wordprocessingml")) {
    return "docx";
  }
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("text/") || ext === "txt") {
    return "text";
  }
  return "unknown";
}

export async function parseFile(
  file: File
): Promise<{ text: string; type: FileType }> {
  const fileType = detectFileType(file.name, file.type);
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (fileType) {
    case "audio":
      return { text: await parseAudioFile(file), type: fileType };
    case "spreadsheet":
      return { text: await parseSpreadsheet(buffer, file.name), type: fileType };
    case "pdf":
      return { text: await parsePdfFile(buffer, file.name), type: fileType };
    case "docx":
      return { text: await parseDocxFile(buffer, file.name), type: fileType };
    case "text": {
      const text = await file.text();
      return { text: `[Archivo de texto: ${file.name}]\n${text}`, type: fileType };
    }
    case "image":
      // Images are handled separately via OpenAI Vision
      return { text: `[Imagen: ${file.name}]`, type: fileType };
    default:
      return { text: `[Archivo no soportado: ${file.name}]`, type: fileType };
  }
}

export async function consolidateFiles(files: File[], additionalText?: string): Promise<string> {
  const parts: string[] = [];

  if (additionalText?.trim()) {
    parts.push(`[Texto adicional del administrador]\n${additionalText}`);
  }

  for (const file of files) {
    const { text } = await parseFile(file);
    parts.push(text);
  }

  return parts.join("\n\n---\n\n");
}
