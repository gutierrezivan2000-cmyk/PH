export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkUsageLimits } from "@/lib/usage";
import { consolidateFiles } from "@/lib/parsers";
import { runGenerationPipeline } from "@/lib/ai/pipeline";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { generatePptx, parseMarkdownToSlides } from "@/lib/documents/pptx-generator";
import { put } from "@vercel/blob";

// Demo-mode imports
import {
  DEMO_USER,
  createGeneration,
  updateGeneration,
  getPropertyById,
  checkUsageLimitDemo,
  saveFileBuffers,
} from "@/lib/demo-store";
import { getMockInforme, getMockActa, simulateProcessingDelay } from "@/lib/mock-ai";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ── DEMO MODE ────────────────────────────────────────────────────────────
  if (IS_DEMO) {
    const formData = await req.formData();
    const propertyId = formData.get("propertyId") as string;
    const month = parseInt(formData.get("month") as string);
    const year = parseInt(formData.get("year") as string);
    const type = (formData.get("type") as string) || "full";

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
      inputFiles: [],
      inputText: null,
      outputFiles: null,
      tokensUsed: 0,
      costUsd: 0,
      errorMessage: null,
      property,
    });

    // Run in background — return generation ID immediately for polling
    (async () => {
      await simulateProcessingDelay(5000);

      const months = [
        "Enero","Febrero","Marzo","Abril","Mayo","Junio",
        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
      ];
      const period = `${months[month - 1]} ${year}`;

      const informeText = getMockInforme(property.name, month, year);
      const actaText = getMockActa(property.name, month, year);

      const informeHtml = generatePdfHtml({
        title: "Informe de Gestion",
        propertyName: property.name,
        period,
        content: informeText,
        type: "informe",
      });

      const actaHtml = generatePdfHtml({
        title: "Acta de Reunion",
        propertyName: property.name,
        period,
        content: actaText,
        type: "acta",
      });

      const slidesData = parseMarkdownToSlides(informeText, property.name, period);
      const pptxBuffer = await generatePptx(slidesData);

      saveFileBuffers(generation.id, {
        informeHtml,
        actaHtml,
        presentacionPptx: pptxBuffer,
      });

      const outputFiles = {
        informeHtml: `/api/demo/files/${generation.id}/informe`,
        actaHtml: `/api/demo/files/${generation.id}/acta`,
        presentacionPptx: `/api/demo/files/${generation.id}/pptx`,
      };

      updateGeneration(generation.id, {
        status: "completed",
        outputFiles,
        tokensUsed: 13840,
        costUsd: 0.19,
        completedAt: new Date(),
      });
    })();

    return NextResponse.json({ id: generation.id, status: "processing" });
  }

  // ── PRODUCTION MODE ───────────────────────────────────────────────────────
  const subscription = await db.subscription.findUnique({
    where: { userId: session.user.id },
  });

  if (subscription?.status !== "active") {
    return NextResponse.json(
      { error: "Necesitas una suscripcion activa para generar documentos." },
      { status: 403 }
    );
  }

  const usageCheck = await checkUsageLimits(session.user.id);
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
    where: { id: propertyId, userId: session.user.id },
  });

  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const generation = await db.generation.create({
    data: {
      userId: session.user.id,
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
      userId: session.user.id,
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

      const slidesData = parseMarkdownToSlides(result.informeText, property.name, period);
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
