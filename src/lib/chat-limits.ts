/**
 * Topes de adjuntos del chat de agentes, compartidos entre la pantalla y la
 * ruta para que el mensaje que ve el usuario y el límite que aplica el
 * servidor no puedan contradecirse (decían 3,5 MB y rechazaban a 3,7 MB).
 */

// En base64 una imagen crece ~33%, así que 3,5 MB en crudo se queda por debajo
// del máximo de 5 MB por imagen que acepta la API de Anthropic.
export const MAX_IMAGE_BYTES = 3_500_000;
export const MAX_IMAGE_MB_LABEL = "3,5 MB";

/** Formatos de imagen que acepta la API de Anthropic. */
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export const IMAGE_MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const isImageMediaType = (t: string): t is ImageMediaType =>
  (IMAGE_MEDIA_TYPES as string[]).includes(t);
