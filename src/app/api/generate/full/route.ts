export const runtime = "nodejs";
export const maxDuration = 300;

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
  // Top-level try-catch to ensure we ALWAYS return a JSON response
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (IS_DEMO) {
      return handleDemo(req);
    }

    return handleProduction(req, session.user.id);
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

    // Check if real AI key is available (Anthropic Claude)
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const hasRealAI = !!anthropicKey && !anthropicKey.includes("placeholder") && anthropicKey.length > 10;

    let informeText: string;
    let actaText: string;
    let tokensUsed = 0;

    if (hasRealAI && (files.length > 0 || additionalText?.trim())) {
      // ── REAL AI: parse files and generate with OpenAI ──
      const textParts: string[] = [];
      if (additionalText?.trim()) {
        textParts.push(`[Informacion del administrador]\n${additionalText}`);
      }
      for (const file of files) {
        try {
          if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
            textParts.push(`[Archivo: ${file.name}]\n${await file.text()}`);
          } else {
            // Dynamic import of parsers only when needed (avoids module-level crash)
            const { consolidateFiles } = await import("@/lib/parsers");
            const parsed = await consolidateFiles([file]);
            textParts.push(parsed);
          }
        } catch {
          textParts.push(`[Archivo: ${file.name} — no se pudo procesar]`);
        }
      }

      const content = textParts.join("\n\n---\n\n");

      // Dynamic import of AI client only when needed
      const { generateWithAssistant } = await import("@/lib/ai-client");

      // Generate informe with AI
      if (type === "informe" || type === "full") {
        const prompt = buildStrategosPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, prompt);
        informeText = result.text;
        tokensUsed += result.tokensUsed;
      } else {
        informeText = "";
      }

      // Generate acta with AI
      if (type === "acta" || type === "full") {
        const prompt = buildGrammatusPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, prompt);
        actaText = result.text;
        tokensUsed += result.tokensUsed;
      } else {
        actaText = "";
      }
    } else {
      // ── MOCK: use pre-built content ──
      informeText = (type === "informe" || type === "full") ? getMockInforme(property.name, month, year) : "";
      actaText = (type === "acta" || type === "full") ? getMockActa(property.name, month, year) : "";
      tokensUsed = 13840;
    }

    // Generate HTML documents
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

    // PPTX generation — optional, uses dynamic import to avoid crashing
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

// ── PRODUCTION MODE ───────────────────────────────────────────────────────────
async function handleProduction(req: NextRequest, userId: string) {
  // Dynamic imports for production-only heavy dependencies
  const { db } = await import("@/lib/db");
  const { checkUsageLimits } = await import("@/lib/usage");
  const { consolidateFiles } = await import("@/lib/parsers");
  const { runGenerationPipeline } = await import("@/lib/ai/pipeline");
  const { put } = await import("@vercel/blob");

  const subscription = await db.subscription.findUnique({
    where: { userId },
  });

  if (subscription?.status !== "active") {
    return NextResponse.json(
      { error: "Necesitas una suscripcion activa para generar documentos." },
      { status: 403 }
    );
  }

  const usageCheck = await checkUsageLimits(userId);
  if (!usageCheck.allowed) {
    return NextResponse.json({ error: usageCheck.reason }, { status: 429 });
  }

  const formData = await req.formData();
  const propertyId = formData.get("propertyId") as string;
  const month = parseInt(formData.get("month") as string);
  const year = parseInt(formData.get("year") as string);
  const additionalText = formData.get("additionalText") as string | null;
  const type = (formData.get("type") as string) || "full";
  const files = formData.getAll("files") as File[];

  if (!propertyId || !month || !year) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: propertyId, month, year" },
      { status: 400 }
    );
  }

  const property = await db.property.findFirst({
    where: { id: propertyId, userId },
  });

  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const generation = await db.generation.create({
    data: {
      userId,
      propertyId,
      type,
      month,
      year,
      inputFiles: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      inputText: additionalText,
    },
  });

  try {
    const consolidatedContent = await consolidateFiles(files, additionalText ?? undefined);

    const monthNames = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${monthNames[month - 1]} ${year}`;

    const result = await runGenerationPipeline({
      generationId: generation.id,
      userId,
      propertyName: property.name,
      month,
      year,
      consolidatedContent,
      type: type as "informe" | "acta" | "full",
    });

    const outputFiles: Record<string, string> = {};

    if (result.informeText) {
      const informeHtml = generatePdfHtml({
        title: "Informe de Gestion",
        propertyName: property.name,
        period,
        content: result.informeText,
        type: "informe",
      });
      const informeBlob = await put(
        `generations/${generation.id}/informe.html`,
        informeHtml,
        { access: "public", contentType: "text/html" }
      );
      outputFiles.informeHtml = informeBlob.url;

      try {
        const slidesData = parseMarkdownToSlides(result.informeText, property.name, period);
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        const pptxBuffer = await generatePptx(slidesData);
        const pptxBlob = await put(
          `generations/${generation.id}/presentacion.pptx`,
          pptxBuffer,
          {
            access: "public",
            contentType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }
        );
        outputFiles.presentacionPptx = pptxBlob.url;
      } catch {
        // PPTX generation failed — skip it
      }
    }

    if (result.actaText) {
      const actaHtml = generatePdfHtml({
        title: "Acta de Reunion",
        propertyName: property.name,
        period,
        content: result.actaText,
        type: "acta",
      });
      const actaBlob = await put(
        `generations/${generation.id}/acta.html`,
        actaHtml,
        { access: "public", contentType: "text/html" }
      );
      outputFiles.actaHtml = actaBlob.url;
    }

    await db.generation.update({
      where: { id: generation.id },
      data: { status: "completed", outputFiles, completedAt: new Date() },
    });

    return NextResponse.json({
      id: generation.id,
      status: "completed",
      outputFiles,
      tokensUsed: result.totalTokens,
      costUsd: result.totalCost,
    });
  } catch (error) {
    await db.generation.update({
      where: { id: generation.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Error desconocido",
      },
    });
    return NextResponse.json(
      { error: "Error al generar documentos" },
      { status: 500 }
    );
  }
}
