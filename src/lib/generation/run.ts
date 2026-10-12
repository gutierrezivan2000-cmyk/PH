import { db } from "@/lib/db";
import { TIPOS } from "@/lib/consumo/funciones";
import { conConsumo } from "@/lib/consumo/registrar";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { parseMarkdownToSlides } from "@/lib/documents/slide-parser";
import { STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt } from "@/lib/ai/strategos";
import { GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt } from "@/lib/ai/grammateus";
import { registrarEvento } from "@/lib/agentes/eventos";
import { blobAutorizado, primerBlobAjeno } from "@/lib/blob-owner";
import { borrarBlobsPropios } from "@/lib/blob-owner-server";
import { limiteBytesPara } from "@/lib/upload-limits";

export type BlobFileRef = { url: string; name: string; type: string; size: number };

/**
 * Un archivo que no es de quien lo manda. Se distingue del resto de fallos de
 * lectura porque no se degrada a «no se pudo procesar» y se sigue con los
 * demás: una referencia ajena significa que alguien se saltó la validación, y
 * lo prudente es no generar nada.
 */
export class BlobAjenoError extends Error {
  constructor(nombre: unknown) {
    const n = typeof nombre === "string" && nombre ? ` "${nombre.slice(0, 80)}"` : "";
    super(
      `El archivo${n} no pertenece a tu cuenta, así que no se generó el documento. ` +
        `Quítalo de la lista y vuelve a subirlo desde esta aplicación.`
    );
    this.name = "BlobAjenoError";
  }
}

/** Quién puede usar un blob: el usuario (o sus ids) y, para insumos mensuales de antes, la copropiedad ya verificada. */
export interface DuenoDeBlob {
  userId: string | readonly string[];
  propertyId?: string;
}

// Cap the consolidated file content fed to Sonnet. ~150k chars ≈ 40k tokens —
// covers any legitimate month of documents and bounds worst-case cost.
const MAX_CONTENT_CHARS = 150_000;

// Only ever read from Vercel Blob hosts — the url originates from a request
// body, so without this an attacker could point it at an internal endpoint.
export { isAllowedBlobUrl } from "@/lib/blob-url";
import { isAllowedBlobUrl } from "@/lib/blob-url";

/**
 * Fetch a private blob URL and turn it into a File for the parsers.
 *
 * Con `dueno` se comprueba además que el blob sea de ese usuario (ruta
 * `subidas/<id>/…`, ver lib/blob-owner) y, si no, lanza BlobAjenoError ANTES de
 * pedir nada al almacenamiento. Sin `dueno` solo se valida el host: es para el
 * llamador que ya comprobó la pertenencia de la lista completa (ver
 * parse-attachment). Todo lo que se lee a partir de una URL que mandó el
 * navegador debe pasar `dueno`.
 */
export async function blobRefToFile(ref: BlobFileRef, dueno?: DuenoDeBlob, opciones?: { maxBytes?: number }): Promise<File> {
  if (!isAllowedBlobUrl(ref.url)) {
    throw new Error(`Origen de archivo no permitido para "${ref.name}"`);
  }
  if (dueno && !blobAutorizado(ref.url, dueno.userId, { propertyId: dueno.propertyId })) {
    throw new BlobAjenoError(ref.name);
  }
  // El tamaño que declara el cliente no vale: el tope se aplica al tamaño REAL de lo descargado
  // (por tipo: audio o documento, igual que al subir), para que un tamaño declarado pequeño no
  // permita colar un archivo enorme que luego se transcriba o parsee entero.
  const tope = Math.min(limiteBytesPara(ref.name), opciones?.maxBytes ?? Infinity);
  const { get } = await import("@vercel/blob");
  const result = await get(ref.url, { access: "private" }).catch(() => null);
  let buffer: ArrayBuffer;
  if (result) {
    if (!result.stream) throw new Error(`No se pudo leer el archivo "${ref.name}"`);
    buffer = await leerConTope(result.stream, tope, ref.name);
  } else {
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`No se pudo descargar el archivo "${ref.name}" (${res.status})`);
    const declarado = Number(res.headers?.get("content-length"));
    if (Number.isFinite(declarado) && declarado > tope) throw archivoMuyGrande(ref.name, tope);
    buffer = res.body ? await leerConTope(res.body, tope, ref.name) : await res.arrayBuffer();
    if (buffer.byteLength > tope) throw archivoMuyGrande(ref.name, tope);
  }
  return new File([buffer], ref.name, { type: ref.type || "application/octet-stream" });
}

function archivoMuyGrande(nombre: string, tope: number): Error {
  return new Error(`El archivo "${nombre}" supera el límite de ${Math.round(tope / (1024 * 1024))} MB`);
}

/** Lee el flujo completo, pero lo corta (sin seguir descargando) en cuanto pasa del tope. */
async function leerConTope(stream: ReadableStream<Uint8Array>, tope: number, nombre: string): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > tope) {
      await reader.cancel().catch(() => {});
      throw archivoMuyGrande(nombre, tope);
    }
    partes.push(value);
  }
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const parte of partes) {
    salida.set(parte, pos);
    pos += parte.byteLength;
  }
  return salida.buffer;
}

export interface RunGenerationParams {
  generationId: string;
  userId: string;
  propertyName: string;
  month: number;
  year: number;
  blobFiles: BlobFileRef[];
  additionalText: string | null;
  includeInforme: boolean;
  includeActa: boolean;
  includePptx: boolean;
  /**
   * Delete the raw input blobs after a successful generation. True for one-off
   * generations (the file was a throwaway upload); false for enterprise batch,
   * where the files live in per-property monthly staging and may be reused.
   */
  cleanupInputs?: boolean;
  /**
   * Otros ids con los que el usuario pudo subir los archivos. La sesión y la
   * base de datos pueden traer ids distintos para la misma persona (sesión
   * vieja que se resuelve por correo): el token de subida usó el de la sesión.
   */
  idsDeSubida?: string[];
}

/**
 * ¿De quién se aceptan los insumos de esta generación? Casi siempre basta el id
 * del usuario. Solo si algún insumo no lleva su prefijo (insumos mensuales
 * guardados antes de que el dueño fuera parte de la ruta) se consulta la
 * copropiedad de ESTA generación: la ruta `monthly/<propertyId>/` la prueba.
 */
async function duenoDeLosInsumos(p: RunGenerationParams): Promise<DuenoDeBlob> {
  const ids = [...new Set([p.userId, ...(p.idsDeSubida ?? [])])];
  if (p.blobFiles.every((r) => blobAutorizado(r?.url, ids))) return { userId: ids };
  const g = await db.generation
    .findUnique({ where: { id: p.generationId }, select: { userId: true, propertyId: true } })
    .catch(() => null);
  return { userId: ids, propertyId: g && g.userId === p.userId ? g.propertyId : undefined };
}

/**
 * The core document-generation worker: parse the property's files → run the AI
 * (Strategos informe + Grammateus acta) → render + upload documents → mark the
 * Generation row completed (or failed). Shared by the single-generation route
 * (/api/generate/full) and the enterprise batch worker (/api/cron/process-batch).
 * Assumes the Generation row already exists (status processing/pending).
 */
export async function runGeneration(p: RunGenerationParams): Promise<void> {
  // Todo lo que se haga con IA adentro (redactar, leer imágenes, transcribir audios, revisar el acta) se carga a esta
  // persona y a esta generación: así se sabe cuánto costó cada una.
  return conConsumo({ userId: p.userId, ref: { tipo: "generacion", id: p.generationId } }, () => ejecutarGeneracion(p));
}

async function ejecutarGeneracion(p: RunGenerationParams): Promise<void> {
  const updateProgress = async (progress: number, status?: string) => {
    try {
      await db.generation.update({
        where: { id: p.generationId },
        data: { progress, ...(status ? { status } : {}) },
      });
    } catch { /* ignore progress update failures */ }
  };

  try {
    await updateProgress(5, "processing");

    // Antes de leer nada: todos los insumos deben ser de esta persona. Una referencia ajena aborta la generación
    // completa (no se degrada a «no se pudo procesar»): significa que alguien se saltó la validación de la ruta.
    const dueno = await duenoDeLosInsumos(p);
    const ajeno = primerBlobAjeno(p.blobFiles, dueno.userId, { propertyId: dueno.propertyId });
    if (ajeno) throw new BlobAjenoError(ajeno.name);

    // Fetch each blob from storage and parse it.
    const fileContents: { name: string; text: string }[] = [];
    for (const ref of p.blobFiles) {
      try {
        const file = await blobRefToFile(ref, dueno);
        if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
          fileContents.push({ name: file.name, text: await file.text() });
        } else {
          const { consolidateFiles } = await import("@/lib/parsers");
          const parsed = await consolidateFiles([file]);
          fileContents.push({ name: file.name, text: parsed });
        }
      } catch (e) {
        // Sin cupo de audio no se redacta con la mitad de los archivos: se falla diciendo el motivo (no el genérico «no se pudo leer»).
        if (e instanceof Error && e.name === "CupoDeAudioAgotado") throw e;
        const msg = e instanceof Error ? e.message : String(e);
        fileContents.push({ name: ref.name, text: `[Archivo: ${ref.name} — no se pudo procesar: ${msg}]` });
      }
    }

    const textParts: string[] = [];
    const transcriptionParts: string[] = [];
    if (p.additionalText?.trim()) {
      textParts.push(`[Informacion del administrador]\n${p.additionalText}`);
    }
    for (const fc of fileContents) {
      textParts.push(`[Archivo: ${fc.name}]\n${fc.text}`);
      if (fc.text.startsWith("[Transcripción de audio:") || fc.text.startsWith("[Análisis de imagen:")) {
        transcriptionParts.push(fc.text);
      }
    }
    let consolidatedContent = textParts.join("\n\n---\n\n") || "[No se proporcionaron archivos ni texto adicional]";
    if (consolidatedContent.length > MAX_CONTENT_CHARS) {
      consolidatedContent = consolidatedContent.slice(0, MAX_CONTENT_CHARS) + "\n\n[Contenido truncado por límite de tamaño]";
    }

    const monthNames = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${monthNames[p.month - 1]} ${p.year}`;

    // ── No se redacta sobre la nada ─────────────────────────────────────
    // Cuando un archivo no se puede leer (una transcripción que falla, un PDF
    // escaneado, un blob ilegible) los parsers devuelven un MARCADOR de error
    // como si fuera contenido. Eso entraba al prompt tal cual y el modelo
    // redactaba igual: salía un acta completa —con asistentes, quórum y
    // decisiones inventados— marcada como «completada» y lista para descargar.
    // Un acta es un documento legal: es preferible fallar y decirlo.
    const MARCADOR_FALLO = /—\s*(no se pudo procesar|Error al procesar)/i;
    const ilegibles = fileContents.filter((f) => MARCADOR_FALLO.test(f.text)).map((f) => f.name);
    const utiles = fileContents.filter(
      (f) => !MARCADOR_FALLO.test(f.text) && f.text.replace(/\[[^\]]*\]/g, "").trim().length > 40
    );
    const textoDelAdmin = (p.additionalText || "").trim();

    if (p.blobFiles.length > 0 && utiles.length === 0 && textoDelAdmin.length < 80) {
      throw new Error(
        `No se pudo leer ninguno de los archivos subidos (${ilegibles.join(", ")}). ` +
          `No se generó el documento para no redactarlo sin información. ` +
          `Revisa que el audio no esté dañado o sube la transcripción como archivo de texto.`
      );
    }

    // Un ACTA se redacta desde lo que ocurrió en la reunión. Si la grabación no
    // se pudo transcribir y el administrador no escribió lo sucedido, no hay
    // acta que redactar: solo quedaría inventarla.
    if (p.includeActa && transcriptionParts.length === 0 && ilegibles.length > 0 && textoDelAdmin.length < 200) {
      throw new Error(
        `La grabación no se pudo transcribir (${ilegibles.join(", ")}), así que no hay de dónde ` +
          `redactar el acta. Vuelve a subir el audio, o pega lo ocurrido en «Información adicional».`
      );
    }

    await updateProgress(10);

    const { generateWithAssistant } = await import("@/lib/ai-client");
    let informeText: string | undefined;
    let actaText: string | undefined;
    let totalTokens = 0;
    let costUsd = 0;

    const needInforme = p.includeInforme || p.includePptx;
    const informePromise = needInforme
      ? generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt(p.propertyName, p.month, p.year, consolidatedContent), undefined, { consumo: { tipo: TIPOS.informe } })
      : null;
    const actaPromise = p.includeActa
      ? generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt(p.propertyName, p.month, p.year, consolidatedContent), undefined, { consumo: { tipo: TIPOS.acta } })
      : null;

    await updateProgress(25);
    const [informeResult, actaResult] = await Promise.all([informePromise, actaPromise]);
    if (informeResult) { informeText = informeResult.text; totalTokens += informeResult.tokensUsed; costUsd += informeResult.costUsd; }
    if (actaResult) { actaText = actaResult.text; totalTokens += actaResult.tokensUsed; costUsd += actaResult.costUsd; }

    await updateProgress(60);

    // Per-administrator branding shown on the documents.
    const brandUser = await db.user
      .findUnique({ where: { id: p.userId }, select: { company: true, logoUrl: true, brandColor: true } })
      .catch(() => null);
    const branding = {
      companyName: brandUser?.company ?? null,
      logoUrl: brandUser?.logoUrl ?? null,
      brandColor: brandUser?.brandColor ?? null,
    };

    const informeHtml = (informeText && p.includeInforme) ? generatePdfHtml({
      title: "Informe de Gestion", propertyName: p.propertyName, period, content: informeText, type: "informe", ...branding,
    }) : null;
    const actaHtml = actaText ? generatePdfHtml({
      title: "Acta de Reunion", propertyName: p.propertyName, period, content: actaText, type: "acta", ...branding,
    }) : null;

    await updateProgress(70);

    const { put } = await import("@vercel/blob");
    const blobUrls: Record<string, string> = {};
    const uploadPromises: Promise<void>[] = [];

    if (informeHtml) {
      uploadPromises.push(put(`generations/${p.generationId}/informe.html`, informeHtml, { access: "private", contentType: "text/html" }).then((b) => { blobUrls.informeHtml = b.url; }));
    }
    if (actaHtml) {
      uploadPromises.push(put(`generations/${p.generationId}/acta.html`, actaHtml, { access: "private", contentType: "text/html" }).then((b) => { blobUrls.actaHtml = b.url; }));
    }
    if (transcriptionParts.length > 0) {
      const transcriptionContent = transcriptionParts.join("\n\n---\n\n");
      uploadPromises.push(put(`generations/${p.generationId}/transcripcion.txt`, transcriptionContent, { access: "private", contentType: "text/plain; charset=utf-8" }).then((b) => { blobUrls.transcripcion = b.url; }));
    }
    if (informeText && (p.includeInforme || p.includePptx)) {
      uploadPromises.push(put(`generations/${p.generationId}/informe.md`, informeText, { access: "private", contentType: "text/markdown" }).then((b) => { blobUrls.informeMarkdown = b.url; }));
    }
    if (actaText) {
      uploadPromises.push(put(`generations/${p.generationId}/acta.md`, actaText, { access: "private", contentType: "text/markdown" }).then((b) => { blobUrls.actaMarkdown = b.url; }));
    }
    await Promise.all(uploadPromises);

    if (actaText) {
      try {
        const { analyzeActaRequirements } = await import("@/lib/ai/acta-requirements");
        const requirements = await analyzeActaRequirements(actaText);
        blobUrls.actaRequirements = JSON.stringify(requirements);
      } catch (e) {
        console.error("[runGeneration] Acta requirements analysis failed:", e);
      }
    }

    if (informeText && p.includePptx) {
      try {
        const slidesData = parseMarkdownToSlides(informeText, p.propertyName, period);
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        const pptxBuffer = await generatePptx(slidesData);
        const pptxBlob = await put(
          `generations/${p.generationId}/presentacion.pptx`,
          pptxBuffer,
          { access: "private", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
        );
        blobUrls.presentacionPptx = pptxBlob.url;
      } catch (e) {
        console.error("[runGeneration] PPTX failed:", e instanceof Error ? e.message : String(e));
      }
    }
    if (p.includePptx) blobUrls.pptxRequested = "1";

    await updateProgress(90);

    // El costo de la redacción (informe y acta) con el precio real de cada llamada; cada llamada ya dejó su registro de consumo
    // (también las lecturas de imágenes, los audios y la revisión del acta, que se suman en el panel por generación).
    const terminada = await db.generation.update({
      where: { id: p.generationId },
      data: { status: "completed", progress: 100, outputFiles: blobUrls, tokensUsed: totalTokens, costUsd, completedAt: new Date() },
    });

    const generados = [p.includeInforme && "informe", p.includeActa && "acta", p.includePptx && "presentación"].filter(Boolean).join(", ");
    await registrarEvento({
      userId: p.userId,
      propertyId: terminada?.propertyId,
      modulo: "generacion",
      accion: "documento_generado",
      resumen: `Documentos generados (${generados || terminada?.type}) de ${period}`,
      refType: "Generation",
      refId: p.generationId,
    });

    // Free the raw input blobs — their parsed content is already in the output
    // document, and they're never shown again. Bounds Blob storage growth.
    // Solo los que son de este usuario y no están registrados como documento de la copropiedad
    // (si el administrador reutilizó el reglamento como insumo, el documento no puede quedarse sin archivo).
    if (p.cleanupInputs && p.blobFiles.length > 0) {
      await borrarBlobsPropios(
        p.blobFiles.map((f) => f?.url),
        dueno.userId,
        { propertyId: dueno.propertyId, etiqueta: "runGeneration" }
      );
    }

    console.log(`[runGeneration] completed ${p.generationId} (${totalTokens} tokens, $${costUsd.toFixed(4)})`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Error desconocido";
    console.error(`[runGeneration] error for ${p.generationId}:`, errMsg);
    try {
      await db.generation.update({
        where: { id: p.generationId },
        data: { status: "failed", progress: 0, errorMessage: errMsg },
      });
    } catch { /* ignore */ }
  }
}
