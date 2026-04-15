export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseMarkdownToSlides } from "@/lib/documents/slide-parser";

/**
 * Dedicated PPTX generation endpoint.
 * Reads the saved informe markdown from Vercel Blob and generates a PPTX.
 * This runs in a regular request handler (NOT after()), so it's fully reliable.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { generationId } = await req.json();
    if (!generationId) {
      return NextResponse.json({ error: "generationId requerido" }, { status: 400 });
    }

    const IS_DEMO = process.env.DEMO_MODE === "true";

    let outputFiles: Record<string, string> | null = null;
    let propertyName = "";
    let month = 0;
    let year = 0;

    if (IS_DEMO) {
      const { getGenerationById, DEMO_USER } = await import("@/lib/demo-store");
      const gen = getGenerationById(generationId, DEMO_USER.id);
      if (!gen) {
        return NextResponse.json({ error: "Generacion no encontrada" }, { status: 404 });
      }
      outputFiles = gen.outputFiles as Record<string, string> | null;
      propertyName = (gen.property as { name: string })?.name || "Propiedad";
      month = gen.month;
      year = gen.year;
    } else {
      const { db } = await import("@/lib/db");
      const gen = await db.generation.findFirst({
        where: { id: generationId, userId: session.user.id },
        include: { property: true },
      });
      if (!gen) {
        return NextResponse.json({ error: "Generacion no encontrada" }, { status: 404 });
      }
      outputFiles = gen.outputFiles as Record<string, string> | null;
      propertyName = gen.property.name;
      month = gen.month;
      year = gen.year;
    }

    // Check if PPTX already exists
    if (outputFiles?.presentacionPptx) {
      return NextResponse.json({ url: `/api/download/${generationId}/pptx`, alreadyExists: true });
    }

    // Get the saved informe markdown
    const markdownUrl = outputFiles?.informeMarkdown;
    if (!markdownUrl) {
      return NextResponse.json({ error: "No hay informe disponible para generar la presentacion" }, { status: 400 });
    }

    // Fetch the markdown content from private blob
    console.log(`[generate/pptx] Fetching markdown from: ${markdownUrl}`);
    const { get } = await import("@vercel/blob");
    const mdBlob = await get(markdownUrl, { access: "private" });
    if (!mdBlob) {
      return NextResponse.json({ error: "No se pudo leer el informe guardado" }, { status: 500 });
    }
    const informeText = await new Response(mdBlob.stream).text();
    console.log(`[generate/pptx] Markdown fetched: ${informeText.length} chars`);

    // Generate period string
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const period = `${monthNames[month - 1]} ${year}`;

    // Parse slides
    const slidesData = parseMarkdownToSlides(informeText, propertyName, period);
    console.log(`[generate/pptx] Parsed ${slidesData.slides.length} slides`);

    // Generate PPTX
    const { generatePptx } = await import("@/lib/documents/pptx-generator");
    const pptxBuffer = await generatePptx(slidesData);
    console.log(`[generate/pptx] Generated ${pptxBuffer.length} bytes`);

    // Upload to Blob
    const { put } = await import("@vercel/blob");
    const pptxBlob = await put(
      `generations/${generationId}/presentacion.pptx`,
      pptxBuffer,
      { access: "private", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
    );
    console.log(`[generate/pptx] Uploaded to: ${pptxBlob.url}`);

    // Update the generation record with the PPTX URL
    if (!IS_DEMO) {
      try {
        const { db } = await import("@/lib/db");
        const gen = await db.generation.findUnique({ where: { id: generationId } });
        const existingFiles = (gen?.outputFiles as Record<string, string>) || {};
        await db.generation.update({
          where: { id: generationId },
          data: {
            outputFiles: { ...existingFiles, presentacionPptx: pptxBlob.url },
          },
        });
      } catch (e) {
        console.error("[generate/pptx] DB update failed:", e);
      }
    }

    return NextResponse.json({
      url: `/api/download/${generationId}/pptx`,
      directUrl: pptxBlob.url,
      size: pptxBuffer.length,
      slides: slidesData.slides.length,
    });
  } catch (e) {
    console.error("[generate/pptx] Error:", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: `Error al generar presentacion: ${msg}` }, { status: 500 });
  }
}
