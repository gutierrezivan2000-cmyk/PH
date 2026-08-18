import { parseFile, detectFileType } from "@/lib/parsers";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_EXTRACTED_CHARS = 20000; // limit to keep prompt size reasonable

/**
 * Los adjuntos son URLs que manda el CLIENTE y el servidor las descarga: sin
 * filtro, esto es un SSRF. La lista blanca la aplica `blobRefToFile`
 * (src/lib/generation/run.ts), que además hace la descarga autenticada del
 * blob privado. Se reutiliza en vez de mantener aquí una copia que pueda
 * divergir de aquella.
 */

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
    // Los adjuntos del chat se suben con access "private" (ver
    // asistente/[agentId]/page.tsx), así que su URL NO se puede descargar con
    // un fetch anónimo: la petición fallaba y el modelo solo recibía el texto
    // "[no se pudo descargar]" — es decir, ningún adjunto del asistente se
    // llegaba a leer nunca. blobRefToFile ya hace el `get` autenticado.
    const { blobRefToFile } = await import("@/lib/generation/run");
    const file = await blobRefToFile({
      url: att.url,
      name: att.name,
      type: att.type,
      size: att.size,
    });
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
