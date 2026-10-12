// Resident reglamento assistant — pulls the property's reglamento/manual text
// so the AI can answer residents' questions from it. Text is extracted from
// the stored documents once and cached on PropertyDocument.extractedText.

import { blobEsDeLaCopropiedad } from "@/lib/documento-propiedad";

const MAX_TOTAL_CHARS = 45000; // keep the prompt within budget

// Leer un documento por primera vez gasta IA (fotos, PDF escaneado) y lo paga la administración desde una pregunta de un residente
// (endpoint público). Se acota: hasta 8 documentos, hasta 3 sin leer por llamada (los demás se leen en las siguientes preguntas,
// porque el texto se guarda), nada de audios y nada de archivos de más de 15 MB. Un reglamento real es uno o dos documentos.
const MAX_DOCUMENTOS = 8;
const MAX_LECTURAS_NUEVAS_POR_LLAMADA = 3;
const MAX_BYTES_DE_DOCUMENTO = 15 * 1024 * 1024;

/**
 * Los lectores de archivos no lanzan cuando fallan: devuelven un marcador entre corchetes («[Imagen: foto.jpg — error al
 * analizar: …]»). Eso NO es el reglamento: no se guarda ni se le entrega a la IA, o la copropiedad se quedaría respondiendo
 * «el reglamento no menciona ese punto» hasta que el administrador vuelva a subir el archivo.
 */
const MARCADOR_DE_FALLO = /^\[[^\]]*—\s*(error al analizar|no se pudo|error al procesar|analisis visual no disponible|formato no soportado)/i;
export const esLecturaFallida = (texto: string): boolean => MARCADOR_DE_FALLO.test(texto.trim());

/** La copropiedad a la que pertenece el documento y quien la administra: de ahí sale la prueba de que el archivo es suyo. */
interface DuenoDelDocumento {
  propertyId: string;
  userId: string | null | undefined;
}

/** Fetch a (possibly private) blob into a Buffer. Tries a plain fetch, then
 *  a token-authenticated one. Returns null if unreachable. */
async function fetchBlob(url: string, dueno: DuenoDelDocumento): Promise<Buffer | null> {
  // NUNCA mandar la credencial del almacenamiento a un host ajeno. El segundo
  // intento lleva `Authorization: Bearer <BLOB_READ_WRITE_TOKEN>`, y esta `url`
  // sale de PropertyDocument, que hasta ahora aceptaba cualquier cadena del
  // cuerpo de la petición: bastaba guardar `http://servidor-del-atacante/x.pdf`
  // y pedir el asistente del portal (endpoint público) para que el token de
  // escritura del blob saliera del servidor. Reproducido con un servidor
  // trampa: recibía `Bearer vercel_blob_rw_...`.
  const { isAllowedBlobUrl } = await import("@/lib/blob-url");
  if (!isAllowedBlobUrl(url)) return null;
  // Y tampoco con la credencial del servidor un archivo que no es de esta copropiedad: bastaba que una fila apuntara al blob de
  // otra cuenta para que el asistente del portal (público) lo leyera y se lo contara a un residente. Es la misma comprobación
  // con la que getReglamentoText descarta el documento antes de llegar aquí; se repite por si otro llamador usa esta función.
  if (!blobEsDeLaCopropiedad(url, dueno.propertyId, dueno.userId)) return null;

  const attempts: RequestInit[] = [{}];
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) attempts.push({ headers: { authorization: `Bearer ${token}` } });
  for (const init of attempts) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Returns the concatenated reglamento/manual text for a property, extracting
 * and caching it on first use. Returns "" when nothing is available.
 */
export async function getReglamentoText(propertyId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const docs = await db.propertyDocument.findMany({
    where: { propertyId, type: { in: ["reglamento_interno", "manual_convivencia", "otro"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      url: true,
      mimeType: true,
      size: true,
      extractedText: true,
      property: { select: { userId: true } },
    },
  });
  if (docs.length === 0) return "";

  // Solo se usan los documentos cuyo archivo es de esta copropiedad (ver documento-propiedad). Los demás se tratan como si no
  // existieran —tampoco su texto ya guardado, que salió de ese archivo— y se avisa en el registro; nunca se tumba la respuesta.
  // Se descartan ANTES de recortar la lista para que no le quiten el lugar a los documentos buenos.
  const propios = docs.filter((doc) => {
    if (blobEsDeLaCopropiedad(doc.url, propertyId, doc.property?.userId)) return true;
    console.warn(`[reglamento] documento omitido: su archivo no pertenece a la copropiedad (documento ${doc.id}, copropiedad ${propertyId})`);
    return false;
  });

  const parts: string[] = [];
  let total = 0;
  let lecturasNuevas = 0;
  const { detectFileType } = await import("@/lib/parsers");

  for (const doc of propios.slice(0, MAX_DOCUMENTOS)) {
    if (total >= MAX_TOTAL_CHARS) break;

    // Un texto guardado que en realidad es un marcador de fallo (de antes de este arreglo) se vuelve a leer.
    let text = doc.extractedText && !esLecturaFallida(doc.extractedText) ? doc.extractedText : "";
    if (!text) {
      // Un audio o un archivo enorme no es un reglamento que valga la pena leer aquí.
      if (detectFileType(doc.name, doc.mimeType || "") === "audio" || doc.size > MAX_BYTES_DE_DOCUMENTO) continue;
      if (lecturasNuevas >= MAX_LECTURAS_NUEVAS_POR_LLAMADA) continue;
      lecturasNuevas++;
      const buf = await fetchBlob(doc.url, { propertyId, userId: doc.property?.userId });
      if (!buf) continue;
      try {
        const { parseFile } = await import("@/lib/parsers");
        const file = new File([new Uint8Array(buf)], doc.name, { type: doc.mimeType || "application/octet-stream" });
        const parsed = await parseFile(file);
        text = (parsed.text || "").trim();
        if (esLecturaFallida(text)) text = "";
      } catch {
        text = "";
      }
      // Cache whatever we got (even empty avoids re-fetching a bad file, but we
      // only cache non-trivial text so a transient failure can retry later).
      if (text.length > 20) {
        await db.propertyDocument.update({ where: { id: doc.id }, data: { extractedText: text.slice(0, 200000) } }).catch(() => {});
      }
    }

    if (text.length > 20) {
      const remaining = MAX_TOTAL_CHARS - total;
      const chunk = text.slice(0, remaining);
      parts.push(`--- ${doc.name} ---\n${chunk}`);
      total += chunk.length;
    }
  }

  return parts.join("\n\n");
}
