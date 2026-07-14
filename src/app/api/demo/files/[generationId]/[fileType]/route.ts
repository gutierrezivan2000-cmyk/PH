export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFileBuffers } from "@/lib/demo-store";
import { getMockInforme, getMockActa } from "@/lib/mock-ai";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { parseMarkdownToSlides } from "@/lib/documents/slide-parser";

// Pre-baked content for seeded historical generations
const SEEDED_CONTENT: Record<string, { month: number; year: number }> = {
  "gen-demo-feb-001": { month: 2, year: 2026 },
  "gen-demo-jan-001": { month: 1, year: 2026 },
};

const PROPERTY_NAME = "Conjunto Residencial Los Pinos";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string; fileType: string }> }
) {
  // Demo-only: this route builds PDFs/PPTX from query params with no auth, so
  // in production it would be an unauthenticated compute sink. 404 when off.
  if (!IS_DEMO) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const { generationId, fileType } = await params;

  // Try live buffers first (from a just-completed generation in same invocation)
  let buffers = getFileBuffers(generationId);

  // Resolve property name, month, year — from seeded data or query params
  let propertyName: string | null = null;
  let month: number | null = null;
  let year: number | null = null;

  if (SEEDED_CONTENT[generationId]) {
    propertyName = PROPERTY_NAME;
    month = SEEDED_CONTENT[generationId].month;
    year = SEEDED_CONTENT[generationId].year;
  } else {
    // Query params encode the property info for cross-invocation regeneration
    const sp = req.nextUrl.searchParams;
    propertyName = sp.get("p");
    month = sp.has("m") ? parseInt(sp.get("m")!) : null;
    year = sp.has("y") ? parseInt(sp.get("y")!) : null;
  }

  // Generate on-the-fly when buffers aren't available but we have the metadata
  if (!buffers && propertyName && month && year) {
    const months = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${months[month - 1]} ${year}`;
    const informeText = getMockInforme(propertyName, month, year);
    const actaText = getMockActa(propertyName, month, year);

    let pptxBuffer: Buffer | undefined;
    if (fileType === "pptx") {
      try {
        const slidesData = parseMarkdownToSlides(informeText, propertyName, period);
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        pptxBuffer = await generatePptx(slidesData);
      } catch {
        // PPTX generation failed
      }
    }

    buffers = {
      informeHtml: generatePdfHtml({
        title: "Informe de Gestion",
        propertyName,
        period,
        content: informeText,
        type: "informe",
      }),
      actaHtml: generatePdfHtml({
        title: "Acta de Reunion",
        propertyName,
        period,
        content: actaText,
        type: "acta",
      }),
      presentacionPptx: pptxBuffer,
    };
  }

  if (!buffers) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  if (fileType === "informe" && buffers.informeHtml) {
    return new NextResponse(buffers.informeHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (fileType === "acta" && buffers.actaHtml) {
    return new NextResponse(buffers.actaHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (fileType === "pptx") {
    let pptx = buffers.presentacionPptx;
    if (!pptx && buffers.informeHtml) {
      // Generate PPTX on the fly from HTML isn't possible, but we can re-generate
      // This path is reached when the buffer was created without PPTX
    }
    if (pptx) {
      return new NextResponse(pptx.buffer as ArrayBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename="presentacion-${generationId}.pptx"`,
        },
      });
    }
  }

  return NextResponse.json({ error: "Tipo de archivo no valido" }, { status: 400 });
}
