export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for long AI generation

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkUsageLimits } from "@/lib/usage";
import { consolidateFiles } from "@/lib/parsers";
import { runGenerationPipeline } from "@/lib/ai/pipeline";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { generatePptx, parseMarkdownToSlides } from "@/lib/documents/pptx-generator";
import { put } from "@vercel/blob";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Check subscription
  const subscription = await db.subscription.findUnique({
    where: { userId: session.user.id },
  });

  if (subscription?.status !== "active") {
    return NextResponse.json(
      { error: "Necesitas una suscripci\u00f3n activa para generar documentos." },
      { status: 403 }
    );
  }

  // Check usage limits
  const usage = await checkUsageLimits(session.user.id);
  if (!usage.allowed) {
    return NextResponse.json({ error: usage.reason }, { status: 429 });
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

  // Verify property belongs to user
  const property = await db.property.findFirst({
    where: { id: propertyId, userId: session.user.id },
  });

  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  // Create generation record
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
    // Parse and consolidate files
    const consolidatedContent = await consolidateFiles(files, additionalText ?? undefined);

    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const period = `${monthNames[month - 1]} ${year}`;

    // Run AI pipeline
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

    // Generate PDF for informe
    if (result.informeText) {
      const informeHtml = generatePdfHtml({
        title: "Informe de Gesti\u00f3n",
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

      // Generate PPTX presentation
      const slidesData = parseMarkdownToSlides(result.informeText, property.name, period);
      const pptxBuffer = await generatePptx(slidesData);
      const pptxBlob = await put(
        `generations/${generation.id}/presentacion.pptx`,
        pptxBuffer,
        { access: "public", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
      );
      outputFiles.presentacionPptx = pptxBlob.url;
    }

    // Generate PDF for acta
    if (result.actaText) {
      const actaHtml = generatePdfHtml({
        title: "Acta",
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

    // Update generation as completed
    await db.generation.update({
      where: { id: generation.id },
      data: {
        status: "completed",
        outputFiles,
        completedAt: new Date(),
      },
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
      { error: "Error al generar documentos", details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
