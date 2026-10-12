import { parseFile, detectFileType } from "@/lib/parsers";
import { blobAutorizado } from "@/lib/blob-owner";
// Solo el tipo: run.ts arrastra la base de datos y la IA, y este módulo la carga bajo demanda (ver más abajo).
import type { DuenoDeBlob } from "@/lib/generation/run";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
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

/**
 * ¿Este adjunto se va a transcribir? Es la misma decisión que toma `parseAttachment` (misma detección de tipo y el mismo tope de
 * tamaño), para que el tope de minutos de audio cuente exactamente lo que se transcribe y nada más.
 */
export function seTranscribe(att: Pick<AttachmentInput, "name" | "type" | "size">): boolean {
  return detectFileType(att.name, att.type) === "audio" && att.size <= MAX_FILE_BYTES;
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
 *
 * `dueno` es quien envía el adjunto (ver DuenoDeBlob en generation/run). Con él, el archivo se lee SOLO si es suyo
 * (ruta `subidas/<su id>/…`): así la comprobación no depende de que quien llama ya hubiera validado la lista. Un adjunto
 * ajeno no se descarga y tampoco se devuelve como imagen (su URL no llega al consumidor); queda un marcador de texto y se
 * sigue con los demás. Sin `dueno` solo rige la lista blanca de hosts de `blobRefToFile`: es para el llamador que ya
 * comprobó la pertenencia. Todo adjunto que venga del navegador debe pasarlo.
 */
export async function parseAttachment(
  att: AttachmentInput,
  dueno?: DuenoDeBlob
): Promise<ParsedAttachment> {
  // Antes de cualquier otra decisión (incluida la de «es una imagen»: esa rama devuelve la URL tal cual).
  if (dueno && !blobAutorizado(att.url, dueno.userId, { propertyId: dueno.propertyId })) {
    console.warn(`[parseAttachment] adjunto que no es de quien lo envía: se omite ("${String(att.name).slice(0, 80)}")`);
    return {
      name: att.name,
      type: att.type,
      isImage: false,
      url: att.url,
      text: `[Archivo ${att.name}: no pertenece a tu cuenta, así que no se leyó. Vuelve a subirlo desde esta pantalla.]`,
    };
  }

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
    const file = await blobRefToFile(
      {
        url: att.url,
        name: att.name,
        type: att.type,
        size: att.size,
      },
      dueno
    );
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
  attachments: AttachmentInput[],
  dueno?: DuenoDeBlob
): Promise<ParsedAttachment[]> {
  // Función flecha y no `.map(parseAttachment)`: map pasaría el índice como segundo argumento, que ahora es el dueño.
  return Promise.all(attachments.map((att) => parseAttachment(att, dueno)));
}
