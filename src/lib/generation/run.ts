import { db } from "@/lib/db";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { parseMarkdownToSlides } from "@/lib/documents/slide-parser";
import { STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt } from "@/lib/ai/strategos";
import { GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt } from "@/lib/ai/grammateus";

export type BlobFileRef = { url: string; name: string; type: string; size: number };

// Cap the consolidated file content fed to Sonnet. ~150k chars ≈ 40k tokens —
// covers any legitimate month of documents and bounds worst-case cost.
const MAX_CONTENT_CHARS = 150_000;

// Only ever read from Vercel Blob hosts — the url originates from a request
// body, so without this an attacker could point it at an internal endpoint.
export function isAllowedBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Fetch a private blob URL and turn it into a File for the parsers. */
export async function blobRefToFile(ref: BlobFileRef): Promise<File> {
  if (!isAllowedBlobUrl(ref.url)) {
    throw new Error(`Origen de archivo no permitido para "${ref.name}"`);
  }
  const { get } = await import("@vercel/blob");
  const result = await get(ref.url, { access: "private" }).catch(() => null);
  let buffer: ArrayBuffer;
  if (result) {
    buffer = await new Response(result.stream).arrayBuffer();
  } else {
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`No se pudo descargar el archivo "${ref.name}" (${res.status})`);
    buffer = await res.arrayBuffer();
  }
  return new File([buffer], ref.name, { type: ref.type || "application/octet-stream" });
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
}

/**
 * The core document-generation worker: parse the property's files → run the AI
 * (Strategos informe + Grammateus acta) → render + upload documents → mark the
 * Generation row completed (or failed). Shared by the single-generation route
 * (/api/generate/full) and the enterprise batch worker (/api/cron/process-batch).
 * Assumes the Generation row already exists (status processing/pending).
 */
export async function runGeneration(p: RunGenerationParams): Promise<void> {
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

    // Fetch each blob from storage and parse it.
    const fileContents: { name: string; text: string }[] = [];
    for (const ref of p.blobFiles) {
      try {
        const file = await blobRefToFile(ref);
        if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
          fileContents.push({ name: file.name, text: await file.text() });
        } else {
          const { consolidateFiles } = await import("@/lib/parsers");
          const parsed = await consolidateFiles([file]);
          fileContents.push({ name: file.name, text: parsed });
        }
      } catch (e) {
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

    await updateProgress(10);

    const { generateWithAssistant } = await import("@/lib/ai-client");
    let informeText: string | undefined;
    let actaText: string | undefined;
    let totalTokens = 0;

    const needInforme = p.includeInforme || p.includePptx;
    const informePromise = needInforme
      ? generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt(p.propertyName, p.month, p.year, consolidatedContent))
      : null;
    const actaPromise = p.includeActa
      ? generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt(p.propertyName, p.month, p.year, consolidatedContent))
      : null;

    await updateProgress(25);
    const [informeResult, actaResult] = await Promise.all([informePromise, actaPromise]);
    if (informeResult) { informeText = informeResult.text; totalTokens += informeResult.tokensUsed; }
    if (actaResult) { actaText = actaResult.text; totalTokens += actaResult.tokensUsed; }

    await updateProgress(60);

    const informeHtml = (informeText && p.includeInforme) ? generatePdfHtml({
      title: "Informe de Gestion", propertyName: p.propertyName, period, content: informeText, type: "informe",
    }) : null;
    const actaHtml = actaText ? generatePdfHtml({
      title: "Acta de Reunion", propertyName: p.propertyName, period, content: actaText, type: "acta",
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

    const costUsd = totalTokens * 0.000009;
    await db.generation.update({
      where: { id: p.generationId },
      data: { status: "completed", progress: 100, outputFiles: blobUrls, tokensUsed: totalTokens, costUsd, completedAt: new Date() },
    });

    try {
      const { recordUsage } = await import("@/lib/usage");
      await recordUsage(p.userId, totalTokens, costUsd, "generacion");
    } catch (e) {
      console.error("[runGeneration] Usage recording failed:", e);
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
