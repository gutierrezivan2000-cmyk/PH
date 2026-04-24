import { parseFile, detectFileType } from "@/lib/parsers";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_EXTRACTED_CHARS = 20000; // limit to keep prompt size reasonable

export interface AttachmentInput {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface ParsedAttachment {
  name: string;
  type: string;
  text: string;
  isImage: boolean;
  url: string;
}

/**
 * Downloads an attachment from a URL (Vercel Blob) and parses its content.
 * Images are returned with their URL for direct multimodal consumption.
 * Documents, spreadsheets, PDFs, audio, and text are extracted to text.
 */
export async function parseAttachment(
  att: AttachmentInput
): Promise<ParsedAttachment> {
  const fileType = detectFileType(att.name, att.type);

  if (fileType === "image") {
    return { name: att.name, type: att.type, text: "", isImage: true, url: att.url };
  }

  if (att.size > MAX_FILE_BYTES) {
    return {
      name: att.name,
      type: att.type,
      isImage: false,
      url: att.url,
      text: `[Archivo ${att.name}: demasiado grande para analizar (${(att.size / 1024 / 1024).toFixed(1)}MB, max 10MB)]`,
    };
  }

  try {
    const res = await fetch(att.url);
    if (!res.ok) {
      return {
        name: att.name,
        type: att.type,
        isImage: false,
        url: att.url,
        text: `[Archivo ${att.name}: no se pudo descargar (${res.status})]`,
      };
    }
    const blob = await res.blob();
    const file = new File([blob], att.name, { type: att.type || blob.type });
    const { text } = await parseFile(file);
    const truncated =
      text.length > MAX_EXTRACTED_CHARS
        ? text.slice(0, MAX_EXTRACTED_CHARS) +
          `\n\n[...contenido truncado — archivo original ${text.length} caracteres]`
        : text;
    return {
      name: att.name,
      type: att.type,
      isImage: false,
      url: att.url,
      text: truncated,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[parseAttachment] Error parsing ${att.name}:`, msg);
    return {
      name: att.name,
      type: att.type,
      isImage: false,
      url: att.url,
      text: `[Archivo ${att.name}: error al procesar (${msg})]`,
    };
  }
}

export async function parseAttachments(
  attachments: AttachmentInput[]
): Promise<ParsedAttachment[]> {
  return Promise.all(attachments.map(parseAttachment));
}
