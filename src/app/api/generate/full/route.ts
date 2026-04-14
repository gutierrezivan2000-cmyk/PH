export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
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
  const formData = await req.formData();
  const propertyId = formData.get("propertyId") as string;
  const month = parseInt(formData.get("month") as string);
  const year = parseInt(formData.get("year") as string);
  const type = (formData.get("type") as string) || "full";
  const additionalText = formData.get("additionalText") as string | null;
  const files = formData.getAll("files") as File[];

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

    let informeText: string;
    let actaText: string;
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

      if (type === "informe" || type === "full") {
        const prompt = buildStrategosPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, prompt);
        informeText = result.text;
        tokensUsed += result.tokensUsed;
      } else {
        informeText = "";
      }

      if (type === "acta" || type === "full") {
        const prompt = buildGrammatusPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, prompt);
        actaText = result.text;
        tokensUsed += result.tokensUsed;
      } else {
        actaText = "";
      }
    } else {
      informeText = (type === "informe" || type === "full") ? getMockInforme(property.name, month, year) : "";
      actaText = (type === "acta" || type === "full") ? getMockActa(property.name, month, year) : "";
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
    if (informeText) {
      try {
        const slidesData = parseMarkdownToSlides(informeText, property.name, period);
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        pptxBuffer = await generatePptx(slidesData);
      } catch {
        // PPTX generation failed — skip it silently
      }
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

// ── PRODUCTION MODE (simplified with step-by-step timing) ────────────────────
async function handleProduction(req: NextRequest, session: { user: { id: string; email?: string | null; name?: string | null; image?: string | null } }) {
  const timing: Record<string, number> = {};
  const t0 = Date.now();

  // Step 1: Import DB
  let db: Awaited<typeof import("@/lib/db")>["db"];
  try {
    const t = Date.now();
    ({ db } = await import("@/lib/db"));
    timing.dbImport = Date.now() - t;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error DB import: ${msg.slice(0, 200)}` }, { status: 500 });
  }

  // Step 2: Ensure user exists (reuse session from POST, no second auth() call)
  let dbUserId = session.user.id;
  try {
    const t = Date.now();
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
    timing.userSync = Date.now() - t;
  } catch (e) {
    console.error("[generate/full] User sync error:", e);
    timing.userSync = -1;
  }

  // Step 3: Parse form data
  const t3 = Date.now();
  const formData = await req.formData();
  const propertyId = formData.get("propertyId") as string;
  const month = parseInt(formData.get("month") as string);
  const year = parseInt(formData.get("year") as string);
  const additionalText = formData.get("additionalText") as string | null;
  const type = (formData.get("type") as string) || "full";
  const files = formData.getAll("files") as File[];
  timing.formParse = Date.now() - t3;

  if (!propertyId || !month || !year) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  // Step 4: Find property
  const t4 = Date.now();
  const property = await db.property.findFirst({ where: { id: propertyId, userId: dbUserId } });
  timing.findProperty = Date.now() - t4;

  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  // Step 5: Create generation record
  const t5 = Date.now();
  const generation = await db.generation.create({
    data: {
      userId: dbUserId,
      propertyId,
      type,
      month,
      year,
      inputFiles: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      inputText: additionalText,
    },
  });
  timing.createGeneration = Date.now() - t5;

  try {
    // Step 6: Parse files
    const t6 = Date.now();
    let consolidatedContent = additionalText?.trim() || "";
    if (files.length > 0) {
      try {
        const { consolidateFiles } = await import("@/lib/parsers");
        consolidatedContent = await consolidateFiles(files, additionalText ?? undefined);
      } catch (e) {
        console.error("[generate/full] Parser error:", e);
        // Continue with just the text
      }
    }
    timing.parseFiles = Date.now() - t6;

    const monthNames = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${monthNames[month - 1]} ${year}`;

    // Step 7: AI Generation — directly, no pipeline module
    const t7 = Date.now();
    const { generateWithAssistant } = await import("@/lib/ai-client");

    let informeText: string | undefined;
    let actaText: string | undefined;
    let totalTokens = 0;

    // Run in parallel
    const informePromise = (type === "informe" || type === "full")
      ? generateWithAssistant(
          STRATEGOS_SYSTEM_PROMPT,
          buildStrategosPrompt(property.name, month, year, consolidatedContent)
        )
      : null;

    const actaPromise = (type === "acta" || type === "full")
      ? generateWithAssistant(
          GRAMMATEUS_SYSTEM_PROMPT,
          buildGrammatusPrompt(property.name, month, year, consolidatedContent)
        )
      : null;

    const [informeResult, actaResult] = await Promise.all([informePromise, actaPromise]);

    if (informeResult) {
      informeText = informeResult.text;
      totalTokens += informeResult.tokensUsed;
    }
    if (actaResult) {
      actaText = actaResult.text;
      totalTokens += actaResult.tokensUsed;
    }
    timing.aiGeneration = Date.now() - t7;

    // Step 8: Generate HTML documents
    const t8 = Date.now();
    const outputFiles: Record<string, string> = {};

    const { put } = await import("@vercel/blob");

    if (informeText) {
      const informeHtml = generatePdfHtml({
        title: "Informe de Gestion",
        propertyName: property.name,
        period,
        content: informeText,
        type: "informe",
      });
      const informeBlob = await put(
        `generations/${generation.id}/informe.html`,
        informeHtml,
        { access: "private", contentType: "text/html" }
      );
      outputFiles.informeHtml = informeBlob.url;
    }

    if (actaText) {
      const actaHtml = generatePdfHtml({
        title: "Acta de Reunion",
        propertyName: property.name,
        period,
        content: actaText,
        type: "acta",
      });
      const actaBlob = await put(
        `generations/${generation.id}/acta.html`,
        actaHtml,
        { access: "private", contentType: "text/html" }
      );
      outputFiles.actaHtml = actaBlob.url;
    }

    // PPTX — skip for now to save time, add back later
    if (informeText) {
      try {
        const slidesData = parseMarkdownToSlides(informeText, property.name, period);
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        const pptxBuffer = await generatePptx(slidesData);
        const pptxBlob = await put(
          `generations/${generation.id}/presentacion.pptx`,
          pptxBuffer,
          { access: "private", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
        );
        outputFiles.presentacionPptx = pptxBlob.url;
      } catch {
        // PPTX failed — skip
      }
    }
    timing.docsAndUpload = Date.now() - t8;

    // Step 9: Update DB
    const t9 = Date.now();
    const costUsd = totalTokens * 0.000003; // Haiku pricing
    await db.generation.update({
      where: { id: generation.id },
      data: { status: "completed", outputFiles, tokensUsed: totalTokens, costUsd, completedAt: new Date() },
    });
    timing.dbUpdate = Date.now() - t9;

    timing.total = Date.now() - t0;

    return NextResponse.json({
      id: generation.id,
      status: "completed",
      outputFiles,
      tokensUsed: totalTokens,
      costUsd,
      timing, // Include timing for debugging
    });
  } catch (error) {
    timing.total = Date.now() - t0;
    const errMsg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[generate/full] Error:", errMsg, "timing:", timing);

    try {
      await db.generation.update({
        where: { id: generation.id },
        data: { status: "failed", errorMessage: errMsg },
      });
    } catch { /* ignore */ }

    return NextResponse.json(
      { error: `Error al generar: ${errMsg.slice(0, 300)}`, timing },
      { status: 500 }
    );
  }
}
