export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";

// Demo-mode imports (lightweight, no heavy native deps)
import {
  DEMO_USER,
  createGeneration,
  updateGeneration,
  getPropertyById,
  checkUsageLimitDemo,
  saveFileBuffers,
} from "@/lib/demo-store";
import { getMockInforme, getMockActa } from "@/lib/mock-ai";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { parseMarkdownToSlides } from "@/lib/documents/slide-parser";
import { STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt } from "@/lib/ai/strategos";
import { GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt } from "@/lib/ai/grammateus";

const IS_DEMO = process.env.DEMO_MODE === "true";

type BlobFileRef = { url: string; name: string; type: string; size: number };

// Only ever read from Vercel Blob hosts. The url comes from the request body,
// so without this an attacker could point it at an internal/metadata endpoint
// and have the server fetch it (SSRF) and feed the bytes into the AI prompt.
function isAllowedBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Fetch a private blob URL and turn it into a File suitable for the parsers. */
async function blobRefToFile(ref: BlobFileRef): Promise<File> {
  if (!isAllowedBlobUrl(ref.url)) {
    throw new Error(`Origen de archivo no permitido para "${ref.name}"`);
  }
  const { get } = await import("@vercel/blob");
  const result = await get(ref.url, { access: "private" }).catch(() => null);
  let buffer: ArrayBuffer;
  if (result) {
    buffer = await new Response(result.stream).arrayBuffer();
  } else {
    // Fallback fetch — safe now that the host is allowlisted above.
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`No se pudo descargar el archivo "${ref.name}" (${res.status})`);
    buffer = await res.arrayBuffer();
  }
  return new File([buffer], ref.name, { type: ref.type || "application/octet-stream" });
}

// Cap the consolidated file content fed to Sonnet. ~150k chars ≈ 40k tokens —
// covers any legitimate month of documents and bounds the worst-case cost of a
// single generation (input is sent to two parallel Sonnet calls).
const MAX_CONTENT_CHARS = 150_000;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (IS_DEMO) {
      return handleDemo(req);
    }

    const user = session.user!;
    return handleProduction(req, {
      user: { id: user.id!, email: user.email, name: user.name, image: user.image },
    });
  } catch (error) {
    console.error("[generate/full] Unhandled error:", error);
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: `Error interno del servidor: ${msg}` },
      { status: 500 }
    );
  }
}

// ── DEMO MODE ────────────────────────────────────────────────────────────────
async function handleDemo(req: NextRequest) {
  const body = await req.json();
  const propertyId = body.propertyId as string;
  const month = parseInt(String(body.month));
  const year = parseInt(String(body.year));
  const type = (body.type as string) || "custom";
  const demoIncludeInforme = body.includeInforme !== false;
  const demoIncludeActa = body.includeActa === true;
  const demoIncludePptx = body.includePptx === true;
  const additionalText = (body.additionalText as string | undefined) ?? null;
  const blobFiles: BlobFileRef[] = Array.isArray(body.blobFiles) ? body.blobFiles : [];
  const files: File[] = [];
  for (const ref of blobFiles) {
    try {
      files.push(await blobRefToFile(ref));
    } catch (e) {
      console.error("[generate/full] Demo blob fetch failed:", e);
    }
  }

  if (!propertyId || !month || !year) {
    return NextResponse.json(
      { error: "Faltan campos: propertyId, month, year" },
      { status: 400 }
    );
  }

  const property = getPropertyById(propertyId, DEMO_USER.id);
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const usageCheck = checkUsageLimitDemo(DEMO_USER.id);
  if (!usageCheck.allowed) {
    return NextResponse.json({ error: usageCheck.reason }, { status: 429 });
  }

  const generation = createGeneration({
    userId: DEMO_USER.id,
    propertyId,
    type,
    status: "processing",
    month,
    year,
    inputFiles: files.map((f) => ({ name: f.name, type: f.type })),
    inputText: additionalText,
    outputFiles: null,
    tokensUsed: 0,
    costUsd: 0,
    errorMessage: null,
    property,
  });

  try {
    const months = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${months[month - 1]} ${year}`;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const hasRealAI = !!anthropicKey && !anthropicKey.includes("placeholder") && anthropicKey.length > 10;

    const needInforme = demoIncludeInforme || demoIncludePptx;
    let informeText = "";
    let actaText = "";
    let tokensUsed = 0;

    if (hasRealAI && (files.length > 0 || additionalText?.trim())) {
      const textParts: string[] = [];
      if (additionalText?.trim()) {
        textParts.push(`[Informacion del administrador]\n${additionalText}`);
      }
      for (const file of files) {
        try {
          if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
            textParts.push(`[Archivo: ${file.name}]\n${await file.text()}`);
          } else {
            const { consolidateFiles } = await import("@/lib/parsers");
            const parsed = await consolidateFiles([file]);
            textParts.push(parsed);
          }
        } catch {
          textParts.push(`[Archivo: ${file.name} — no se pudo procesar]`);
        }
      }

      const content = textParts.join("\n\n---\n\n");
      const { generateWithAssistant } = await import("@/lib/ai-client");

      if (needInforme) {
        const prompt = buildStrategosPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, prompt);
        informeText = result.text;
        tokensUsed += result.tokensUsed;
      }

      if (demoIncludeActa) {
        const prompt = buildGrammatusPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, prompt);
        actaText = result.text;
        tokensUsed += result.tokensUsed;
      }
    } else {
      informeText = needInforme ? getMockInforme(property.name, month, year) : "";
      actaText = demoIncludeActa ? getMockActa(property.name, month, year) : "";
      tokensUsed = 13840;
    }

    const informeHtml = informeText ? generatePdfHtml({
      title: "Informe de Gestion",
      propertyName: property.name,
      period,
      content: informeText,
      type: "informe",
    }) : undefined;

    const actaHtml = actaText ? generatePdfHtml({
      title: "Acta de Reunion",
      propertyName: property.name,
      period,
      content: actaText,
      type: "acta",
    }) : undefined;

    let pptxBuffer: Buffer | undefined;
    if (informeText && demoIncludePptx) {
      try {
        console.log(`[generate/full] Demo PPTX: informeText length = ${informeText.length}`);
        console.log(`[generate/full] Demo PPTX: first 300 chars:\n${informeText.substring(0, 300)}`);
        const slidesData = parseMarkdownToSlides(informeText, property.name, period);
        console.log(`[generate/full] Demo PPTX: parsed ${slidesData.slides.length} slides`);
        if (slidesData.slides.length > 0) {
          console.log(`[generate/full] Demo PPTX: slide titles: ${slidesData.slides.map(s => s.title).join(" | ")}`);
        }
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        pptxBuffer = await generatePptx(slidesData);
        console.log(`[generate/full] Demo PPTX: generated ${pptxBuffer.length} bytes`);
      } catch (e) {
        console.error("[generate/full] Demo PPTX generation error:", e instanceof Error ? e.stack : String(e));
      }
    } else {
      console.log("[generate/full] Demo PPTX: skipped — no informeText");
    }

    saveFileBuffers(generation.id, {
      informeHtml,
      actaHtml,
      presentacionPptx: pptxBuffer,
    });

    const fileParams = `?p=${encodeURIComponent(property.name)}&m=${month}&y=${year}`;
    const outputFiles: Record<string, string> = {};
    if (informeHtml) outputFiles.informeHtml = `/api/demo/files/${generation.id}/informe${fileParams}`;
    if (actaHtml) outputFiles.actaHtml = `/api/demo/files/${generation.id}/acta${fileParams}`;
    if (pptxBuffer) outputFiles.presentacionPptx = `/api/demo/files/${generation.id}/pptx${fileParams}`;

    // Analyze acta for missing legal requirements
    if (actaText && hasRealAI) {
      try {
        const { analyzeActaRequirements } = await import("@/lib/ai/acta-requirements");
        const requirements = await analyzeActaRequirements(actaText);
        outputFiles.actaRequirements = JSON.stringify(requirements);
      } catch (e) {
        console.error("[generate/full] Demo acta requirements analysis failed:", e);
      }
    }

    const costUsd = hasRealAI ? tokensUsed * 0.000015 : 0.19;

    updateGeneration(generation.id, {
      status: "completed",
      outputFiles,
      tokensUsed,
      costUsd,
      completedAt: new Date(),
    });

    return NextResponse.json({
      id: generation.id,
      status: "completed",
      outputFiles,
      tokensUsed,
      costUsd,
      month,
      year,
      type,
      property: { name: property.name },
      createdAt: generation.createdAt.toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[generate/full] Demo generation error:", error);
    const msg = error instanceof Error ? error.message : "Error desconocido";
    updateGeneration(generation.id, { status: "failed", errorMessage: msg });
    return NextResponse.json({ error: `Error al generar: ${msg}` }, { status: 500 });
  }
}

// ── PRODUCTION MODE — background processing with after() ─────────────────────
async function handleProduction(req: NextRequest, session: { user: { id: string; email?: string | null; name?: string | null; image?: string | null } }) {
  // Step 1: Import DB
  let db: Awaited<typeof import("@/lib/db")>["db"];
  try {
    ({ db } = await import("@/lib/db"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error DB: ${msg.slice(0, 200)}` }, { status: 500 });
  }

  // Step 2: Ensure user exists
  let dbUserId = session.user.id;
  try {
    if (session.user.email) {
      const existing = await db.user.findUnique({ where: { email: session.user.email } });
      if (existing) {
        dbUserId = existing.id;
      } else {
        const created = await db.user.create({
          data: { email: session.user.email, name: session.user.name, image: session.user.image },
        });
        dbUserId = created.id;
      }
    }
  } catch (e) {
    console.error("[generate/full] User sync error:", e);
  }

  // Step 3: Parse JSON body with blob URL references
  let body: {
    propertyId?: string;
    month?: number | string;
    year?: number | string;
    type?: string;
    includeInforme?: boolean;
    includeActa?: boolean;
    includePptx?: boolean;
    additionalText?: string | null;
    blobFiles?: BlobFileRef[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo invalido. Se esperaba JSON con blobFiles." },
      { status: 400 }
    );
  }

  const propertyId = body.propertyId ?? "";
  const month = parseInt(String(body.month ?? ""));
  const year = parseInt(String(body.year ?? ""));
  const additionalText = body.additionalText ?? null;
  const type = body.type || "custom";
  const includeInforme = body.includeInforme !== false;
  const includeActa = body.includeActa === true;
  const includePptx = body.includePptx === true;
  const blobFiles: BlobFileRef[] = Array.isArray(body.blobFiles) ? body.blobFiles : [];

  if (!propertyId || !month || !year) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  // Cap files per generation (safety net beyond the 25 MB/file upload cap).
  if (blobFiles.length > 20) {
    return NextResponse.json(
      { error: "Máximo 20 archivos por generación." },
      { status: 400 }
    );
  }

  // Step 4: Check usage limits
  try {
    const { checkUsageLimits } = await import("@/lib/usage");
    const usageCheck = await checkUsageLimits(dbUserId);
    if (!usageCheck.allowed) {
      return NextResponse.json({
        error: usageCheck.reason,
        dailyUsed: usageCheck.dailyUsed,
        monthlyUsed: usageCheck.monthlyUsed,
      }, { status: 429 });
    }
  } catch (e) {
    console.error("[generate/full] Usage check failed:", e);
  }

  // Step 5: Find property
  const property = await db.property.findFirst({ where: { id: propertyId, userId: dbUserId } });
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  // Step 6: Create generation record with "processing" status
  const generation = await db.generation.create({
    data: {
      userId: dbUserId,
      propertyId,
      type,
      status: "processing",
      month,
      year,
      inputFiles: blobFiles.map((f) => ({ name: f.name, type: f.type, size: f.size, url: f.url })),
      inputText: additionalText,
    },
  });

  // ═══ RESPOND IMMEDIATELY — client gets redirected to results page ═══
  // The heavy AI work happens in after() below
  // Helper to update progress in DB
  const updateProgress = async (progress: number, status?: string) => {
    try {
      await db.generation.update({
        where: { id: generation.id },
        data: { progress, ...(status ? { status } : {}) },
      });
    } catch { /* ignore progress update failures */ }
  };

  after(async () => {
    try {
      console.log(`[generate/full] Background: starting generation ${generation.id}`);
      await updateProgress(5);

      // Fetch each blob from storage and parse it
      const fileContents: { name: string; text: string }[] = [];
      for (const ref of blobFiles) {
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
          console.error(`[generate/full] Failed to parse ${ref.name}:`, msg);
          fileContents.push({ name: ref.name, text: `[Archivo: ${ref.name} — no se pudo procesar: ${msg}]` });
        }
      }

      // Build consolidated content from parsed files
      const textParts: string[] = [];
      const transcriptionParts: string[] = [];
      if (additionalText?.trim()) {
        textParts.push(`[Informacion del administrador]\n${additionalText}`);
      }
      for (const fc of fileContents) {
        textParts.push(`[Archivo: ${fc.name}]\n${fc.text}`);
        if (fc.text.startsWith("[Transcripción de audio:") || fc.text.startsWith("[Análisis de imagen:")) {
          transcriptionParts.push(fc.text);
        }
      }
      let consolidatedContent = textParts.join("\n\n---\n\n") || "[No se proporcionaron archivos ni texto adicional]";
      if (consolidatedContent.length > MAX_CONTENT_CHARS) {
        consolidatedContent =
          consolidatedContent.slice(0, MAX_CONTENT_CHARS) +
          "\n\n[Contenido truncado por límite de tamaño]";
      }

      console.log(`[generate/full] Consolidated content: ${consolidatedContent.length} chars from ${fileContents.length} files`);
      console.log(`[generate/full] Content preview (first 500 chars):\n${consolidatedContent.substring(0, 500)}`);

      const monthNames = [
        "Enero","Febrero","Marzo","Abril","Mayo","Junio",
        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
      ];
      const period = `${monthNames[month - 1]} ${year}`;

      await updateProgress(10);

      // AI Generation — parallel
      const { generateWithAssistant } = await import("@/lib/ai-client");

      let informeText: string | undefined;
      let actaText: string | undefined;
      let totalTokens = 0;

      const needInforme = includeInforme || includePptx;

      const informePromise = needInforme
        ? generateWithAssistant(
            STRATEGOS_SYSTEM_PROMPT,
            buildStrategosPrompt(property.name, month, year, consolidatedContent)
          )
        : null;

      const actaPromise = includeActa
        ? generateWithAssistant(
            GRAMMATEUS_SYSTEM_PROMPT,
            buildGrammatusPrompt(property.name, month, year, consolidatedContent)
          )
        : null;

      await updateProgress(25);

      const [informeResult, actaResult] = await Promise.all([informePromise, actaPromise]);

      if (informeResult) {
        informeText = informeResult.text;
        totalTokens += informeResult.tokensUsed;
      }
      if (actaResult) {
        actaText = actaResult.text;
        totalTokens += actaResult.tokensUsed;
      }

      await updateProgress(60);

      // Generate documents — only produce HTML for documents the user requested
      const informeHtml = (informeText && includeInforme) ? generatePdfHtml({
        title: "Informe de Gestion",
        propertyName: property.name,
        period,
        content: informeText,
        type: "informe",
      }) : null;

      const actaHtml = actaText ? generatePdfHtml({
        title: "Acta de Reunion",
        propertyName: property.name,
        period,
        content: actaText,
        type: "acta",
      }) : null;

      await updateProgress(70);

      // Upload to Blob in parallel
      const { put } = await import("@vercel/blob");
      const blobUrls: Record<string, string> = {};
      const uploadPromises: Promise<void>[] = [];

      if (informeHtml) {
        uploadPromises.push(
          put(`generations/${generation.id}/informe.html`, informeHtml, { access: "private", contentType: "text/html" })
            .then((blob) => { blobUrls.informeHtml = blob.url; })
        );
      }

      if (actaHtml) {
        uploadPromises.push(
          put(`generations/${generation.id}/acta.html`, actaHtml, { access: "private", contentType: "text/html" })
            .then((blob) => { blobUrls.actaHtml = blob.url; })
        );
      }

      // Save transcription/image analysis so user can verify the parsed data
      if (transcriptionParts.length > 0) {
        const transcriptionContent = transcriptionParts.join("\n\n---\n\n");
        uploadPromises.push(
          put(`generations/${generation.id}/transcripcion.txt`, transcriptionContent, { access: "private", contentType: "text/plain; charset=utf-8" })
            .then((blob) => { blobUrls.transcripcion = blob.url; })
        );
      }

      // Save raw informe markdown for PPTX generation and future corrections
      if (informeText && (includeInforme || includePptx)) {
        uploadPromises.push(
          put(`generations/${generation.id}/informe.md`, informeText, { access: "private", contentType: "text/markdown" })
            .then((blob) => { blobUrls.informeMarkdown = blob.url; })
        );
      }

      // Save raw acta markdown for future corrections
      if (actaText) {
        uploadPromises.push(
          put(`generations/${generation.id}/acta.md`, actaText, { access: "private", contentType: "text/markdown" })
            .then((blob) => { blobUrls.actaMarkdown = blob.url; })
        );
      }

      await Promise.all(uploadPromises);

      // Analyze acta for missing legal requirements
      if (actaText) {
        try {
          const { analyzeActaRequirements } = await import("@/lib/ai/acta-requirements");
          const requirements = await analyzeActaRequirements(actaText);
          blobUrls.actaRequirements = JSON.stringify(requirements);
        } catch (e) {
          console.error("[generate/full] Acta requirements analysis failed:", e);
        }
      }

      // Best-effort PPTX in after() — if this fails, client can trigger /api/generate/pptx
      if (informeText && includePptx) {
        try {
          console.log("[generate/full] PPTX: starting...");
          const slidesData = parseMarkdownToSlides(informeText, property.name, period);
          console.log(`[generate/full] PPTX: ${slidesData.slides.length} slides parsed`);
          const { generatePptx } = await import("@/lib/documents/pptx-generator");
          const pptxBuffer = await generatePptx(slidesData);
          console.log(`[generate/full] PPTX: ${pptxBuffer.length} bytes`);
          const pptxBlob = await put(
            `generations/${generation.id}/presentacion.pptx`,
            pptxBuffer,
            { access: "private", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
          );
          blobUrls.presentacionPptx = pptxBlob.url;
          console.log(`[generate/full] PPTX: uploaded OK`);
        } catch (e) {
          console.error("[generate/full] PPTX failed in after(), client will use /api/generate/pptx:", e instanceof Error ? e.message : String(e));
        }
      }

      // Remember whether the user asked for a PPTX, so the results page only
      // regenerates it when it was requested (and the background attempt failed).
      if (includePptx) {
        blobUrls.pptxRequested = "1";
      }

      await updateProgress(90);

      // Update DB with completed status
      const costUsd = totalTokens * 0.000009;
      await db.generation.update({
        where: { id: generation.id },
        data: {
          status: "completed",
          progress: 100,
          outputFiles: blobUrls,
          tokensUsed: totalTokens,
          costUsd,
          completedAt: new Date(),
        },
      });

      // Record usage
      try {
        const { recordUsage } = await import("@/lib/usage");
        await recordUsage(dbUserId, totalTokens, costUsd, "generacion");
      } catch (e) {
        console.error("[generate/full] Usage recording failed:", e);
      }

      console.log(`[generate/full] Background: completed ${generation.id} (${totalTokens} tokens, $${costUsd.toFixed(4)})`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Error desconocido";
      console.error(`[generate/full] Background error for ${generation.id}:`, errMsg);

      try {
        await db.generation.update({
          where: { id: generation.id },
          data: { status: "failed", progress: 0, errorMessage: errMsg },
        });
      } catch { /* ignore */ }
    }
  });

  // Return immediately with the generation ID — client will poll for status
  return NextResponse.json({
    id: generation.id,
    status: "processing",
    month,
    year,
    type,
    property: { name: property.name },
  });
}
